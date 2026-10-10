import type { Status } from './scoring';
import { scoreGuess } from './scoring';
import type { ErrorCode } from './types';
import { wordInfo } from './vietnamese';

/** Độ dài tối đa của một lượt đoán (hoặc từ khóa chọn sẵn) nhận từ người chơi. */
export const MAX_GUESS_LENGTH = 100;

export type GuessResult =
  | { ok: true; word: string; cells: string[]; statuses: Status[]; correct: boolean }
  | { ok: false; code: Extract<ErrorCode, 'bad_request' | 'invalid_chars' | 'incomplete' | 'wrong_structure'>; message: string };

/**
 * Kiểm tra và chấm một lượt đoán so với từ khóa `answerWord`. Dùng chung cho Chơi đơn (server Next) và đấu theo nhóm
 * (Durable Object): chỉ chữ cái tiếng Việt, đủ chữ và đúng cấu trúc ô chữ để chấm được từng ô.
 * KHÔNG kiểm tra từ có trong từ điển: chuỗi chữ bất kỳ cũng được chấm. Lượt không hợp lệ (ok: false) không mất lượt.
 */
export function evaluateGuess(raw: unknown, answerWord: string): GuessResult {
  if (typeof raw !== 'string' || raw.length > MAX_GUESS_LENGTH) return { ok: false, code: 'bad_request', message: 'Lượt đoán không hợp lệ' };
  const text = raw.trim();
  const guess = text ? wordInfo(text) : null;
  if (text && !guess) return { ok: false, code: 'invalid_chars', message: 'Chỉ dùng chữ cái tiếng Việt' };
  const answer = wordInfo(answerWord);
  if (!answer) throw new Error(`Từ khóa không hợp lệ: ${answerWord}`);
  if (!guess || guess.cells.length < answer.cells.length) return { ok: false, code: 'incomplete', message: 'Chưa đủ chữ cái' };
  if (guess.structure.join() !== answer.structure.join()) return { ok: false, code: 'wrong_structure', message: 'Số chữ cái không khớp ô chữ' };
  return { ok: true, word: guess.word, cells: guess.cells, statuses: scoreGuess(guess.cells, answer.cells), correct: guess.word === answer.word };
}
