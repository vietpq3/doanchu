/*
 * Danh sách từ bị xóa hẳn khỏi CSDL (data/word-blocklist.txt): thô tục, xúc phạm, tình dục...
 * export-keywords.ts bỏ các từ này khỏi bộ từ khóa; seed-supabase.ts không nạp và xóa chúng khỏi bảng words.
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalizeWord } from '../src/lib/game/vietnamese';

export const BLOCKLIST_PATH = path.resolve('data/word-blocklist.txt');

/** Đọc danh sách (bỏ dòng trống và dòng chú thích #), chuẩn hoá kiểu dấu như bảng words. */
export function loadBlocklist(file = BLOCKLIST_PATH): Set<string> {
  const words = new Set<string>();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const word = normalizeWord(text);
    if (!word) throw new Error(`${path.relative(process.cwd(), file)}: "${text}" không phải từ hợp lệ`);
    words.add(word);
  }
  return words;
}
