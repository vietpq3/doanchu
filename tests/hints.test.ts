import { describe, expect, test } from 'vitest';
import { cellPosition, hintCandidates } from '@/lib/game/hints';
import type { Status } from '@/lib/game/scoring';

const row = (s: string): { statuses: Status[] } => ({
  statuses: Array.from(s).map((c) => ({ g: 'correct', y: 'present', b: 'tone', x: 'absent' } as const)[c as 'g' | 'y' | 'b' | 'x']),
});

describe('ô có thể gợi ý', () => {
  test('chưa đoán gì: mọi ô', () => {
    expect(hintCandidates([], [], 5)).toEqual([0, 1, 2, 3, 4]);
  });

  test('bỏ ô đã từng xanh lá ở bất kỳ lượt nào; vàng, xanh dương, xám vẫn gợi ý được', () => {
    expect(hintCandidates([row('gyxbx'), row('xxgxx')], [], 5)).toEqual([1, 3, 4]);
  });

  test('bỏ ô đã gợi ý', () => {
    expect(hintCandidates([row('gxxxx')], [3], 5)).toEqual([1, 2, 4]);
  });

  test('mọi ô đã biết thì không còn ô nào', () => {
    expect(hintCandidates([row('ggxxx'), row('xxggx')], [4], 5)).toEqual([]);
  });
});

describe('vị trí ô trong ô chữ', () => {
  test('âm tiết và chữ thứ mấy (đếm từ 1)', () => {
    expect(cellPosition([2, 3], 0)).toEqual({ syllable: 1, letter: 1 });
    expect(cellPosition([2, 3], 1)).toEqual({ syllable: 1, letter: 2 });
    expect(cellPosition([2, 3], 2)).toEqual({ syllable: 2, letter: 1 });
    expect(cellPosition([2, 3], 4)).toEqual({ syllable: 2, letter: 3 });
  });

  test('ô nằm ngoài ô chữ thì báo lỗi', () => {
    expect(() => cellPosition([2, 3], 5)).toThrow(RangeError);
  });
});
