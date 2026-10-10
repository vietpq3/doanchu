/*
 * Xuất các âm tiết "ngoại lệ" của từ điển -> data/syllables.txt (mỗi âm tiết một dòng, đã chuẩn hoá kiểu dấu, xếp theo bảng chữ cái).
 * Chạy: npm run syllables   (đọc DICTIONARY_DB_PATH, mặc định ../../database/minhqnd_dictionary.db)
 *
 * Kiểm tra từ đoán ở đấu theo nhóm (src/lib/versus/syllable.ts): âm tiết hợp lệ nếu đúng cấu trúc tiếng Việt, HOẶC nằm trong file này.
 * File chỉ chứa các âm tiết có trong từ điển mà quy tắc cấu trúc không nhận (từ mượn, tên riêng, phiên âm: gen, ku, khmer...), nên nhỏ
 * (vài trăm dòng). Bỏ những mục không có nguyên âm (vd `b`, `q`, `xhcn`) hoặc dài hơn 6 chữ cái (tên nước, thuật ngữ), vì để lọt thì
 * người chơi dùng chúng để loại trừ chữ cái. Chạy lại khi từ điển nguồn, kiểu dấu hoặc quy tắc trong syllable.ts đổi.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isValidSyllable } from '../src/lib/versus/syllable';
import { loadSenses, openDictionary } from './dictionary-source';

const OUT_PATH = path.resolve('data/syllables.txt');
const MAX_LETTERS = 6;
const HAS_VOWEL = /[aăâeêioôơuưy]/;

const { words } = loadSenses(openDictionary());
const all = new Set<string>();
for (const w of words) for (const s of w.split(' ')) all.add(s);

const exceptions = [...all].filter((s) => !isValidSyllable(s) && HAS_VOWEL.test(s) && Array.from(s).length <= MAX_LETTERS);
exceptions.sort((a, b) => a.localeCompare(b, 'vi'));
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, exceptions.join('\n') + '\n');
console.log(`Âm tiết: ${all.size} trong từ điển, ${exceptions.length} ngoại lệ -> ${path.relative(process.cwd(), OUT_PATH)}`);
