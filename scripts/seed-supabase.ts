/*
 * Trích xuất từ điển offline (SQLite nguồn) rồi nạp vào bảng `words` trên Supabase.
 *   - mọi từ ghép tiếng Việt (>= 2 âm tiết) trong từ điển, chuẩn hoá theo kiểu dấu của game
 *   - giải nghĩa tiếng Việt của từng từ: ưu tiên nguồn TVTD (Từ điển tiếng Việt), chỉ dùng nguồn khác
 *     khi TVTD không có; bỏ trùng; đặt lại dấu theo kiểu dấu của game
 *   - is_keyword = true cho các từ trong data/keywords.json; excluded_reason = lý do với các từ đủ điều kiện nhưng
 *     bị loại (từ phụ trợ, danh từ riêng...: mục `excluded` trong data/keywords.json, xem npm run keywords)
 *   - rồi đánh số thứ tự từ khóa (#1..#N, cột keyword_no) bằng hàm renumber_keywords() trong CSDL,
 *     theo thứ tự cột word; thêm/bớt từ khóa thì số của các từ phía sau dịch theo
 *
 * Chạy:  npm run db:seed              (cần SUPABASE_URL và SUPABASE_SECRET_KEY trong .dev.vars)
 *        npm run db:seed -- --dry-run (chỉ trích xuất ra var/words.jsonl, không ghi lên Supabase)
 * Chạy lại an toàn (upsert theo khóa `word`). Đổi kiểu dấu (DEFAULT_STYLE) thì chạy lại script này.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { Definition } from '../src/lib/game/types';
import './env';
import { normalizeWord } from '../src/lib/game/vietnamese';
import { displayedSenses, loadSenses, openDictionary } from './dictionary-source';

const KEYWORDS_PATH = path.resolve('data/keywords.json');
const OUT_PATH = path.resolve('var/words.jsonl');
const BATCH_SIZE = 1000;
const dryRun = process.argv.includes('--dry-run');

const POS_LABELS: Record<string, string> = {
  A: 'Tính từ', C: 'Liên từ', D: 'Phó từ', E: 'Giới từ', I: 'Tình thái từ', M: 'Lượng từ', N: 'Danh từ',
  O: 'Thán từ', P: 'Đại từ', R: 'Trạng từ', S: 'Từ đặc biệt', V: 'Động từ', X: 'Từ phụ trợ', Z: 'Hậu tố',
};

interface WordRow { word: string; definitions: Definition[]; is_keyword: boolean; excluded_reason: string | null }

function extract(): WordRow[] {
  const { words, senses } = loadSenses(openDictionary());
  const file = JSON.parse(fs.readFileSync(KEYWORDS_PATH, 'utf8')) as { words: string[]; excluded?: Record<string, string> };
  const keywords = new Set(file.words.map((w) => normalizeWord(w)));
  const excluded = new Map(Object.entries(file.excluded ?? {}).map(([w, reason]) => [normalizeWord(w), reason]));

  return [...words].sort().map((word) => ({
    word,
    definitions: displayedSenses(senses.get(word) ?? []).map((s) => {
      const def: Definition = { pos: POS_LABELS[s.pos ?? ''] ?? '', text: s.text };
      if (s.example) def.example = s.example;
      return def;
    }),
    is_keyword: keywords.has(word),
    excluded_reason: excluded.get(word) ?? null,
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
  if (!dryRun) await upload(rows);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
