import { describe, expect, test } from 'vitest';
import type { GameView } from '@/lib/versus/protocol';
import { formatClock, summarizeResult } from '@/lib/versus/summary';

const row = { cells: ['v', 'ũ', 't', 'r', 'ụ'], statuses: ['correct', 'correct', 'correct', 'correct', 'correct'] } as GameView['yourRows'][number];
const result = (r: Partial<NonNullable<GameView['result']>>): GameView['result'] => ({ word: 'vũ trụ', definitions: [], winnerName: null, youWon: false, reason: 'exhausted', ...r });

describe('tóm tắt kết quả ván đấu theo nhóm', () => {
  test('ván chưa xong thì không có', () => {
    expect(summarizeResult({ result: null, yourRows: [], maxTurns: 6 })).toBeNull();
  });

  test('thắng (kèm số lượt), thua (kèm người thắng), không ai tìm ra', () => {
    expect(summarizeResult({ result: result({ youWon: true, winnerName: 'An', reason: 'won' }), yourRows: [row, row, row], maxTurns: 6 })).toBe('Bạn đã thắng sau 3/6 lượt!');
    expect(summarizeResult({ result: result({ winnerName: 'Bình', reason: 'won' }), yourRows: [row], maxTurns: 6 })).toBe('Bạn đã thua. Người thắng: Bình');
    expect(summarizeResult({ result: result({ reason: 'timeout' }), yourRows: [], maxTurns: 6 })).toBe('Không ai tìm ra từ khóa');
  });
});

describe('đồng hồ m:ss', () => {
  test('định dạng phút:giây, không âm', () => {
    expect([600, 581, 60, 59, 9, 0, -3].map(formatClock)).toEqual(['10:00', '9:41', '1:00', '0:59', '0:09', '0:00', '0:00']);
  });
});
