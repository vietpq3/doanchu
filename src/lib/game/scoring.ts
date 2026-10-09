import { VOWELS, baseOf } from './vietnamese';

/**
 * Luật màu (vị trí tính trên toàn bộ ô chữ, không tính dấu cách):
 *   correct (xanh lá)    đúng chữ, đúng dấu, đúng vị trí
 *   present (vàng)       đúng chữ, đúng dấu, sai vị trí
 *   tone    (xanh dương) đúng nguyên âm nhưng sai dấu thanh, bất kể vị trí
 *   absent  (xám)        còn lại
 */
export type Status = 'correct' | 'present' | 'tone' | 'absent';

const STATUS_RANK: Record<Status, number> = { absent: 0, tone: 1, present: 2, correct: 3 };

export interface ScoredRow {
  cells: string[];
  statuses: Status[];
}

/**
 * Chấm một lượt đoán. Chữ trùng: chấm lần lượt xanh lá -> vàng -> xanh dương;
 * mỗi ô của từ khóa chỉ được "dùng" một lần (giống Wordle).
 */
export function scoreGuess(guessCells: string[], answerCells: string[]): Status[] {
  const n = answerCells.length;
  if (guessCells.length !== n) throw new Error('Số ô của lượt đoán không khớp từ khóa');
  const result: Status[] = new Array(n).fill('absent');
  const used: boolean[] = new Array(n).fill(false);
  const findUnused = (pred: (c: string) => boolean) => {
    for (let j = 0; j < n; j++) if (!used[j] && pred(answerCells[j])) return j;
    return -1;
  };

  for (let i = 0; i < n; i++) {
    if (guessCells[i] === answerCells[i]) { result[i] = 'correct'; used[i] = true; }
  }
  for (let i = 0; i < n; i++) {
    if (result[i] !== 'absent') continue;
    const j = findUnused((c) => c === guessCells[i]);
    if (j >= 0) { result[i] = 'present'; used[j] = true; }
  }
  for (let i = 0; i < n; i++) {
    if (result[i] !== 'absent') continue;
    const base = baseOf(guessCells[i]);
    if (!base || !VOWELS.has(base)) continue;
    const sameVowel = (c: string) => baseOf(c) === base;
    const j = !used[i] && sameVowel(answerCells[i]) ? i : findUnused(sameVowel);
    if (j >= 0) { result[i] = 'tone'; used[j] = true; }
  }
  return result;
}

/**
 * Màu cho bảng chữ cái: mỗi chữ cái (a, ă, â... tính riêng, bỏ qua dấu thanh) lấy trạng thái
 * tốt nhất trong các ô đã đoán. Thông tin chính xác vẫn nằm trên ô chữ.
 */
export function letterStatuses(rows: ScoredRow[]): Record<string, Status> {
  const map: Record<string, Status> = {};
  for (const row of rows) {
    row.cells.forEach((cell, i) => {
      const base = baseOf(cell);
      if (!base) return;
      const st = row.statuses[i];
      if (!(base in map) || STATUS_RANK[st] > STATUS_RANK[map[base]]) map[base] = st;
    });
  }
  return map;
}
