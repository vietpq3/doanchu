/*
 * Trích xuất từ điển offline (SQLite nguồn) rồi nạp vào bảng `words` trên Supabase.
 *   - mọi từ ghép tiếng Việt (>= 2 âm tiết) trong từ điển, chuẩn hoá theo kiểu dấu của game
 *   - giải nghĩa tiếng Việt của từng từ: ưu tiên nguồn TVTD (Từ điển tiếng Việt), chỉ dùng nguồn khác
 *     khi TVTD không có; bỏ trùng; đặt lại dấu theo kiểu dấu của game
 *   - is_keyword = true cho các từ trong data/keywords.json; excluded_reason = lý do với các từ đủ điều kiện nhưng
 *     bị loại (từ phụ trợ, danh từ riêng...: mục `excluded` trong data/keywords.json, xem npm run keywords)
 *   - keyword_tier = mức của từ trong data/keyword-tiers.json (1–3, dùng cho độ khó; null nếu chưa xếp mức = coi như mức 3)
 *   - bỏ qua các từ trong data/word-blocklist.txt và xóa chúng khỏi bảng words nếu đã có (từ thô tục...)
 *   - rồi đánh số thứ tự từ khóa (#1..#N, cột keyword_no) bằng hàm renumber_keywords() trong CSDL,
 *     theo thứ tự cột word; thêm/bớt từ khóa thì số của các từ phía sau dịch theo
 *
 * Chạy:  npm run db:seed              (cần SUPABASE_URL và SUPABASE_SECRET_KEY trong .dev.vars)
 *        npm run db:seed -- --dry-run (chỉ trích xuất ra var/words.jsonl, không ghi lên Supabase)
 * Chạy lại an toàn (upsert theo khóa `word`). Đổi kiểu dấu (DEFAULT_STYLE) thì chạy lại script này.
 * Cần các migration trong supabase/migrations (npm run db:migrate) chạy trước.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { Definition } from '../src/lib/game/types';
import './env';
import { normalizeWord } from '../src/lib/game/vietnamese';
import { displayedSenses, loadSenses, openDictionary } from './dictionary-source';
import { loadBlocklist } from './word-blocklist';

const KEYWORDS_PATH = path.resolve('data/keywords.json');
const TIERS_PATH = path.resolve('data/keyword-tiers.json');
const OUT_PATH = path.resolve('var/words.jsonl');
const BATCH_SIZE = 1000;
const dryRun = process.argv.includes('--dry-run');

const POS_LABELS: Record<string, string> = {
  A: 'Tính từ', C: 'Liên từ', D: 'Phó từ', E: 'Giới từ', I: 'Tình thái từ', M: 'Lượng từ', N: 'Danh từ',
  O: 'Thán từ', P: 'Đại từ', R: 'Trạng từ', S: 'Từ đặc biệt', V: 'Động từ', X: 'Từ phụ trợ', Z: 'Hậu tố',
};

interface WordRow {
  word: string;
  definitions: Definition[];
  is_keyword: boolean;
  excluded_reason: string | null;
  keyword_tier: number | null;
}

const blocklist = loadBlocklist();

function extract(): WordRow[] {
  const { words, senses } = loadSenses(openDictionary());
  const file = JSON.parse(fs.readFileSync(KEYWORDS_PATH, 'utf8')) as { words: string[]; excluded?: Record<string, string> };
  const keywords = new Set(file.words.map((w) => normalizeWord(w)));
  const excluded = new Map(Object.entries(file.excluded ?? {}).map(([w, reason]) => [normalizeWord(w), reason]));
  const { levels } = JSON.parse(fs.readFileSync(TIERS_PATH, 'utf8')) as { levels: Record<string, string[]> };
  const tiers = new Map(Object.entries(levels).flatMap(([tier, ws]) => ws.map((w) => [normalizeWord(w), Number(tier)] as const)));

  return [...words].filter((word) => !blocklist.has(word)).sort().map((word) => ({
    word,
    definitions: displayedSenses(senses.get(word) ?? []).map((s) => {
      const def: Definition = { pos: POS_LABELS[s.pos ?? ''] ?? '', text: s.text };
      if (s.example) def.example = s.example;
      return def;
    }),
    is_keyword: keywords.has(word),
    excluded_reason: excluded.get(word) ?? null,
    keyword_tier: tiers.get(word) ?? null,
  }));
}

async function upload(rows: WordRow[]) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SECRET_KEY (xem .dev.vars.example)');
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('words').upsert(batch, { onConflict: 'word' });
    if (error) throw new Error(`Lỗi khi nạp từ ${i + 1}–${i + batch.length}: ${error.message} (đã chạy npm run db:migrate chưa?)`);
    process.stdout.write(`\rĐã nạp ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} từ`);
  }
  process.stdout.write('\n');

  // từ trong danh sách xóa: bỏ khỏi bảng words (nếu đã nạp ở lần trước); ván cũ có đáp án này vẫn giữ (cột answer là text)
  const blocked = [...blocklist];
  let deleted = 0;
  for (let i = 0; i < blocked.length; i += 100) {
    const { count, error } = await supabase.from('words').delete({ count: 'exact' }).in('word', blocked.slice(i, i + 100));
    if (error) throw new Error(`Lỗi khi xóa từ trong danh sách xóa: ${error.message}`);
    deleted += count ?? 0;
  }
  console.log(`Đã xóa ${deleted} từ trong danh sách xóa (data/word-blocklist.txt: ${blocked.length} từ)`);

  // cần migration 20261009130000_keyword_no.sql (npm run db:migrate)
  const { data: numbered, error: renumberError } = await supabase.rpc('renumber_keywords');
  if (renumberError) throw new Error(`Lỗi khi đánh số từ khóa: ${renumberError.message} (đã chạy npm run db:migrate chưa?)`);
  console.log(`Đã đánh số ${numbered} từ khóa (#1..#${numbered})`);

  const [{ count: total, error: e1 }, { count: kw, error: e2 }] = await Promise.all([
    supabase.from('words').select('*', { count: 'exact', head: true }),
    supabase.from('words').select('*', { count: 'exact', head: true }).eq('is_keyword', true),
  ]);
  if (e1 || e2) throw new Error((e1 ?? e2)!.message);
  console.log(`Supabase: ${total} từ, ${kw} từ khóa`);
}

async function main() {
  const rows = extract();
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const withDefs = rows.filter((r) => r.definitions.length).length;
  console.log(`Trích xuất: ${rows.length} từ (${withDefs} từ có giải nghĩa tiếng Việt, ${rows.filter((r) => r.is_keyword).length} từ khóa, ${rows.filter((r) => r.excluded_reason).length} từ bị loại)`
    + ` -> ${path.relative(process.cwd(), OUT_PATH)} (${(fs.statSync(OUT_PATH).size / 1e6).toFixed(1)} MB)`);
  const byTier = [1, 2, 3, null].map((t) => rows.filter((r) => r.is_keyword && r.keyword_tier === t).length);
  console.log(`Mức từ khóa: mức 1 ${byTier[0]}, mức 2 ${byTier[1]}, mức 3 ${byTier[2]}, chưa xếp mức (coi như 3) ${byTier[3]}`);
  if (!dryRun) await upload(rows);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
