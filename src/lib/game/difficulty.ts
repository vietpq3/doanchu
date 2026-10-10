/**
 * Độ khó của ván: chọn từ khóa ngẫu nhiên trong các từ có mức <= độ khó (mức của từ: data/keyword-tiers.json, cột words.keyword_tier).
 * Từ khóa được đánh số theo mức trước (renumber_keywords()), nên độ khó d là các từ khóa số 1 đến KeywordCounts[d - 1]: hộp thoại
 * chọn số chỉ cho chọn trong khoảng đó; link chia sẻ /solo?id=N thì mở được mọi số.
 * Dùng chung cho server, worker (đấu theo nhóm) và giao diện.
 */
export type Difficulty = 1 | 2 | 3;

export const DEFAULT_DIFFICULTY: Difficulty = 1;

export const DIFFICULTIES: readonly { level: Difficulty; name: string; desc: string }[] = [
  { level: 1, name: 'Thường', desc: 'Từ thông dụng, quen thuộc' },
  { level: 2, name: 'Khó', desc: 'Thêm từ ít gặp, Hán Việt cũ, phương ngữ' },
  { level: 3, name: 'Rất khó', desc: 'Toàn bộ từ khóa, kể cả từ hiếm' },
];

/** Cookie lưu độ khó người chơi chọn (giao diện ghi, server đọc khi tạo ván Chơi đơn). */
export const DIFFICULTY_COOKIE = 'dc_difficulty';

/** 1, 2, 3 (số hoặc chuỗi) → độ khó; còn lại → null. */
export function parseDifficulty(v: unknown): Difficulty | null {
  const n = typeof v === 'string' && /^[1-3]$/.test(v) ? Number(v) : v;
  return n === 1 || n === 2 || n === 3 ? n : null;
}

export const difficultyName = (d: Difficulty): string => DIFFICULTIES[d - 1].name;

/**
 * Số từ khóa của từng độ khó: `counts[d - 1]` là số từ khóa của độ khó d. Từ khóa được đánh số theo mức trước (mức 1 rồi 2 rồi 3),
 * nên độ khó d gồm đúng các từ khóa số 1 đến counts[d - 1]; counts[2] là tổng số từ khóa.
 */
export type KeywordCounts = [number, number, number];
