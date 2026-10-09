import type { Status } from './scoring';

/**
 * Các ô có thể gợi ý: ô chưa từng được tô xanh lá ở lượt đoán nào và chưa được gợi ý.
 * Chỉ số tính trên toàn bộ ô chữ (không tính dấu cách), bắt đầu từ 0.
 */
export function hintCandidates(rows: { statuses: Status[] }[], hinted: number[], total: number): number[] {
  const known = new Set(hinted);
  for (const row of rows) row.statuses.forEach((st, i) => { if (st === 'correct') known.add(i); });
  return Array.from({ length: total }, (_, i) => i).filter((i) => !known.has(i));
}

/** Ô thứ `index` nằm ở âm tiết nào, là chữ thứ mấy trong âm tiết đó (đếm từ 1). */
export function cellPosition(structure: number[], index: number): { syllable: number; letter: number } {
  let start = 0;
  for (let g = 0; g < structure.length; g++) {
    if (index < start + structure[g]) return { syllable: g + 1, letter: index - start + 1 };
    start += structure[g];
  }
  throw new RangeError(`Ô ${index} nằm ngoài ô chữ`);
}
