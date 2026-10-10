/*
 * Chọn bộ từ khóa từ từ điển offline -> data/keywords.json
 * Chạy: npm run keywords   (đọc DICTIONARY_DB_PATH, mặc định ../../database/minhqnd_dictionary.db)
 *
 * Từ khóa là TẤT CẢ mục từ thoả:
 *   - keywordInfo() trong src/lib/game/keywords.ts: từ ghép (>= 2 âm tiết) chỉ gồm chữ cái tiếng Việt,
 *     4–12 chữ cái
 *   - có giải nghĩa tiếng Việt (từ bất kỳ nguồn nào, giống bảng words) để hiện ở màn hình kết thúc
 *   - không bị loại bởi danh sách loại trừ data/keyword-exclusions.json (từ phụ trợ, danh từ riêng, danh sách tay;
 *     xem scripts/keyword-exclusions.ts)
 *   - không nằm trong data/word-blocklist.txt (từ thô tục... bị xóa hẳn khỏi CSDL, không có trong cả mục excluded)
 * Không cần từ phải thông dụng hay có nhiều từ cùng cấu trúc: lượt đoán không bị kiểm tra với từ điển.
 *
 * Kết quả:
 *   data/keywords.json                     words (từ khóa), excluded (từ bị loại và lý do)
 *   data/keyword-auxiliary-candidates.txt  từ khóa còn lại có nghĩa X từ nguồn chưa nằm trong auxiliary.sources
 *                                          (vd: X của Wiktionary): danh sách để cân nhắc loại sau
 *   var/keyword-exclusions-report.json     từng từ bị loại kèm bằng chứng, để duyệt (không commit)
 * Có thể sửa tay data/keywords.json; kiểu dấu không quan trọng vì server chuẩn hoá lại. Nhưng nên chỉnh
 * keyword-exclusions.json (exclude/keep) rồi chạy lại lệnh này thì bền hơn: lần sinh lại sau không làm mất sửa đổi.
 * Sau khi đổi, chạy npm run db:seed để cập nhật Supabase.
 */
import fs from 'node:fs';
import path from 'node:path';
import { KEYWORD_LETTERS, keywordInfo } from '../src/lib/game/keywords';
import { normalizeWord } from '../src/lib/game/vietnamese';
import { displayedSenses, iterateTexts, loadSenses, openDictionary } from './dictionary-source';
import { createClassifier, loadExclusionConfig, scanCapitalization, type ExclusionReason } from './keyword-exclusions';
import { loadBlocklist } from './word-blocklist';

const OUT_PATH = path.resolve('data/keywords.json');
const CONFIG_PATH = path.resolve('data/keyword-exclusions.json');
const AUXILIARY_LIST_PATH = path.resolve('data/keyword-auxiliary-candidates.txt');
const REPORT_PATH = path.resolve('var/keyword-exclusions-report.json');

const config = loadExclusionConfig(CONFIG_PATH);
const blocklist = loadBlocklist();
const db = openDictionary();
const byVietnamese = (a: string, b: string) => a.localeCompare(b, 'vi');

// 1. Mục từ đủ điều kiện về chữ nghĩa (các cách viết hoà/hòa gộp về một từ).
const eligible = new Set<string>();
let compounds = 0;
for (const { word } of db.prepare("SELECT word FROM words WHERE lang_code = 'vi'").iterate() as IterableIterator<{ word: string }>) {
  const n = normalizeWord(word);
  if (n?.includes(' ')) compounds++;
  const info = keywordInfo(word);
  if (info) eligible.add(info.word);
}

// 2. Từ nào có giải nghĩa tiếng Việt (cách gộp giống scripts/seed-supabase.ts).
const defined = new Set<string>();
const definedRows = db.prepare(`
  SELECT DISTINCT w.word
  FROM words w
  JOIN word_definitions wd ON wd.word_id = w.id
  JOIN definitions d ON d.id = wd.definition_id
  WHERE w.lang_code = 'vi' AND COALESCE(d.definition_lang, 'vi') = 'vi' AND TRIM(COALESCE(d.definition, '')) <> ''`).iterate() as IterableIterator<{ word: string }>;
for (const { word } of definedRows) {
  const n = normalizeWord(word);
  if (n) defined.add(n);
}

const candidates = [...eligible].filter((w) => defined.has(w) && !blocklist.has(w)).sort(byVietnamese);
const blocked = [...eligible].filter((w) => defined.has(w) && blocklist.has(w)).length;
const candidateSet = new Set(candidates);

// 3. Danh sách loại trừ: nghĩa hiển thị của từng ứng viên + quét chữ hoa trong toàn bộ văn bản của từ điển.
const { senses: allSenses } = loadSenses(db);
const displayed = new Map(candidates.map((w) => [w, displayedSenses(allSenses.get(w) ?? [])]));
const capitalization = config.properNouns.enabled && config.properNouns.capitalized.enabled
  ? scanCapitalization(iterateTexts(db), candidateSet)
  : new Map();
const classify = createClassifier(config);

for (const [list, name] of [[config.keep, 'keep'], [config.exclude, 'exclude']] as const) {
  for (const w of list) if (!candidateSet.has(w)) console.warn(`Cảnh báo: "${w}" trong ${name} không phải từ khóa ứng viên (không có trong từ điển, hoặc không đạt điều kiện chữ nghĩa/giải nghĩa)`);
}

const words: string[] = [];
const excluded: Record<string, ExclusionReason> = {};
const counts: Record<ExclusionReason, number> = { auxiliary: 0, proper_noun: 0, manual: 0 };
const report: { word: string; reason: ExclusionReason; detail: string; source: string; pos: string | null; subPos: string | null; firstSense: string }[] = [];
for (const word of candidates) {
  const senses = displayed.get(word)!;
  const verdict = classify(word, senses, capitalization.get(word));
  if (!verdict) {
    words.push(word);
    continue;
  }
  excluded[word] = verdict.reason;
  counts[verdict.reason]++;
  const first = senses[0];
  report.push({ word, ...verdict, source: first.source, pos: first.pos, subPos: first.subPos, firstSense: first.text.slice(0, 140) });
}

// 4. Từ khóa còn lại có nghĩa X từ nguồn chưa bị luật từ phụ trợ loại (vd: X của Wiktionary), để cân nhắc loại sau.
const aux = config.auxiliary;
const auxiliaryCandidates = words.filter((w) => displayed.get(w)!.some((s) => s.pos === aux.pos && !(aux.enabled && aux.sources.includes(s.source))));

const meta = {
  source: 'minhqnd/dictionary v2.0.0 (CC BY-SA 4.0)',
  generated: new Date().toISOString().slice(0, 10),
  criteria: `mọi từ ghép chỉ gồm chữ cái tiếng Việt, ${KEYWORD_LETTERS.min}–${KEYWORD_LETTERS.max} chữ cái, có giải nghĩa tiếng Việt, `
    + 'trừ các từ trong danh sách loại trừ (data/keyword-exclusions.json) và danh sách xóa (data/word-blocklist.txt)',
  candidates: candidates.length,
  blocked,
  excluded: counts,
};
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify({ meta, words, excluded }, null, 1) + '\n');
fs.writeFileSync(AUXILIARY_LIST_PATH, auxiliaryCandidates.join('\n') + '\n');
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify({ generated: meta.generated, config, counts, items: report }, null, 1) + '\n');

const rel = (p: string) => path.relative(process.cwd(), p);
console.log(`Từ khóa: ${words.length} (trong ${compounds} từ ghép của từ điển; ${candidates.length} từ đủ điều kiện chữ nghĩa và giải nghĩa, `
  + `đã bỏ ${blocked} từ trong danh sách xóa)`);
console.log(`Loại trừ: ${report.length} từ (từ phụ trợ ${counts.auxiliary}, danh từ riêng ${counts.proper_noun}, danh sách tay ${counts.manual})`);
console.log(`-> ${rel(OUT_PATH)}, ${rel(AUXILIARY_LIST_PATH)} (${auxiliaryCandidates.length} từ có nghĩa ${aux.pos} chưa loại), ${rel(REPORT_PATH)}`);
