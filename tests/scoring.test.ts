import { describe, expect, test } from 'vitest';
import { letterStatuses, scoreGuess } from '@/lib/game/scoring';
import { wordInfo } from '@/lib/game/vietnamese';

const cells = (w: string) => wordInfo(w)!.cells;
const score = (guess: string, answer: string) => scoreGuess(cells(guess), cells(answer));

describe('luật màu', () => {
  test('ví dụ trong requirement: ổ ở ô 2, đoán ộ ở ô 5 -> xanh dương', () => {
    expect(score('bỏ cuộc', 'tổ chức')).toEqual(['absent', 'absent', 'correct', 'absent', 'tone', 'correct']);
  });

  test('bốn màu', () => {
    expect(score('vũ trụ', 'vũ trụ')).toEqual(['correct', 'correct', 'correct', 'correct', 'correct']);
    expect(score('vụ mùa', 'vũ trụ')).toEqual(['correct', 'present', 'absent', 'tone', 'absent']);
    expect(score('tù vợt', 'vũ trụ')).toEqual(['present', 'tone', 'present', 'absent', 'absent']);
  });

  test('o và ô là hai chữ khác nhau, không phải sai dấu', () => {
    expect(scoreGuess(['o'], ['ô'])).toEqual(['absent']);
    expect(scoreGuess(['ộ'], ['ô'])).toEqual(['tone']);
  });

  test('chữ trùng: mỗi ô của từ khóa chỉ được dùng một lần', () => {
    expect(scoreGuess(['a', 'a', 'x'], ['b', 'a', 'c'])).toEqual(['absent', 'correct', 'absent']);
    expect(scoreGuess(['a', 'a', 'x'], ['a', 'c', 'a'])).toEqual(['correct', 'present', 'absent']);
    expect(scoreGuess(['à', 'b', 'á'], ['c', 'á', 'd'])).toEqual(['absent', 'absent', 'present']);
    expect(scoreGuess(['à', 'b', 'á'], ['c', 'á', 'a'])).toEqual(['tone', 'absent', 'present']);
    // kiểu dấu cũ: "hòa" có chữ a không dấu
    expect(score('anh hùng', 'hòa bình')).toEqual(['present', 'absent', 'present', 'present', 'absent', 'correct', 'absent']);
  });
});

test('màu bảng chữ cái theo chữ gốc (bỏ dấu thanh, ă/â/a tính riêng)', () => {
  const rows = [
    { cells: ['á', 'b', 'ô'], statuses: ['tone', 'absent', 'absent'] as const },
    { cells: ['à', 'đ', 'ồ'], statuses: ['correct', 'present', 'tone'] as const },
  ].map((r) => ({ cells: r.cells, statuses: [...r.statuses] }));
  expect(letterStatuses(rows)).toEqual({ a: 'correct', b: 'absent', 'ô': 'tone', 'đ': 'present' });
});
