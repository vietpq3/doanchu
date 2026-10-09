/*
 * Đọc từ điển offline (SQLite nguồn) cho các script: nạp Supabase (seed-supabase.ts) và chọn từ khóa (export-keywords.ts).
 * Hai script dùng chung luật chọn "nghĩa hiển thị" để từ khóa được phân loại đúng trên những nghĩa mà
 * người chơi sẽ thấy ở màn hình kết thúc.
 */
import path from 'node:path';
import Database from 'better-sqlite3';
import { normalizeWord, restyleText } from '../src/lib/game/vietnamese';

export const DICTIONARY_DB_PATH = path.resolve(process.env.DICTIONARY_DB_PATH ?? '../../database/minhqnd_dictionary.db');
/** Số nghĩa tối đa lưu cho mỗi từ */
export const MAX_DEFINITIONS = 8;

/** Một nghĩa của từ trong từ điển. `pos`/`subPos` là mã từ loại gốc của nguồn (vd: N / Np, X / X), không phải nhãn tiếng Việt. */
export interface Sense {
  /** tên nguồn: TVTD, Wiktionary, tudientv.com */
  source: string;
  pos: string | null;
  subPos: string | null;
  /** đã đặt lại dấu theo kiểu dấu của game */
  text: string;
  example?: string;
}

export function openDictionary(): Database.Database {
  return new Database(DICTIONARY_DB_PATH, { readonly: true, fileMustExist: true });
}

/**
 * Mọi từ ghép tiếng Việt (>= 2 âm tiết) của từ điển, đã chuẩn hoá (nhiều cách viết hoà/hòa gộp về một từ),
 * kèm các nghĩa tiếng Việt: TVTD xếp trước, rồi theo thứ tự trong từ điển.
 */
export function loadSenses(db: Database.Database): { words: Set<string>; senses: Map<string, Sense[]> } {
  const wordOf = new Map<number, string>();
  const words = new Set<string>();
  for (const { id, word } of db.prepare("SELECT id, word FROM words WHERE lang_code = 'vi'").iterate() as IterableIterator<{ id: number; word: string }>) {
    const n = normalizeWord(word);
    if (!n || !n.includes(' ')) continue;
    wordOf.set(id, n);
    words.add(n);
  }

  const senses = new Map<string, Sense[]>();
  const rows = db.prepare(`
    SELECT wd.word_id, d.pos, d.sub_pos, d.definition, wd.example, s.name AS source
    FROM word_definitions wd
    JOIN definitions d ON d.id = wd.definition_id
    JOIN sources s ON s.id = wd.source_id
    WHERE COALESCE(d.definition_lang, 'vi') = 'vi'
    ORDER BY CASE s.name WHEN 'TVTD' THEN 0 ELSE 1 END, wd.word_id, wd.id`).iterate() as IterableIterator<{
    word_id: number; pos: string | null; sub_pos: string | null; definition: string; example: string | null; source: string;
  }>;
  for (const r of rows) {
    const w = wordOf.get(r.word_id);
    if (!w) continue;
    const sense: Sense = { source: r.source, pos: r.pos, subPos: r.sub_pos, text: restyleText(r.definition.trim()) };
    if (r.example?.trim()) sense.example = restyleText(r.example.trim());
    const list = senses.get(w) ?? [];
    list.push(sense);
    senses.set(w, list);
  }
  return { words, senses };
}

/**
 * Các nghĩa của một từ sẽ hiển thị: nếu có nghĩa của TVTD thì chỉ dùng TVTD (nguồn khác chỉ khi TVTD không có),
 * bỏ nghĩa trùng, tối đa MAX_DEFINITIONS.
 */
export function displayedSenses(list: Sense[]): Sense[] {
  const hasTVTD = list.some((x) => x.source === 'TVTD');
  const out: Sense[] = [];
  for (const sense of list) {
    if (out.length >= MAX_DEFINITIONS) break;
    if (hasTVTD && sense.source !== 'TVTD') continue;
    if (!out.some((d) => d.text === sense.text)) out.push(sense);
  }
  return out;
}

/** Mọi đoạn văn bản tiếng Việt trong từ điển (giải nghĩa và ví dụ), giữ nguyên chữ hoa/thường: dùng để quét tên riêng. */
export function* iterateTexts(db: Database.Database): Generator<string> {
  const rows = db.prepare(`
    SELECT d.definition AS definition, wd.example AS example
    FROM word_definitions wd JOIN definitions d ON d.id = wd.definition_id
    WHERE COALESCE(d.definition_lang, 'vi') = 'vi'`).iterate() as IterableIterator<{ definition: string | null; example: string | null }>;
  for (const r of rows) {
    if (r.definition) yield r.definition;
    if (r.example) yield r.example;
  }
}
