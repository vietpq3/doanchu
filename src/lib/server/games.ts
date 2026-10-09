import 'server-only';
import { hintCandidates } from '@/lib/game/hints';
import { MAX_KEYWORD_NO } from '@/lib/game/keywords';
import { scoreGuess } from '@/lib/game/scoring';
import { normalizeWord, wordInfo } from '@/lib/game/vietnamese';
import type { ErrorCode, PublicGame } from '@/lib/game/types';
import { config } from './config';
import { randomIndex } from './random';
import { getRepository, type GameRecord } from './repository';

/** Lỗi nghiệp vụ, trả về trình duyệt kèm mã HTTP. */
export class GameError extends Error {
  constructor(public readonly status: number, public readonly code: ErrorCode, message: string) {
    super(message);
  }
}

const MAX_GUESS_LENGTH = 100;
const ID_PATTERN = /^[0-9a-f-]{36}$/;

/** Dọn ván cũ tối đa một lần mỗi giờ (mỗi tiến trình/isolate), chạy kèm khi tạo ván mới. */
let lastPurge = 0;
async function maybePurge() {
  const now = Date.now();
  if (now - lastPurge < 60 * 60 * 1000) return;
  lastPurge = now;
  try {
    await getRepository().purgeOldGames(config.gameTtlDays);
  } catch (err) {
    console.error(err); // dọn dẹp lỗi thì không chặn người chơi
  }
}

/**
 * Tạo ván mới với từ khóa ngẫu nhiên, hoặc đúng từ khóa số `number` (1 đến tổng số từ khóa) do người chơi chọn.
 * `word` (chọn sẵn từ khóa) chỉ dùng được khi REVIEW_MODE=1 và được ưu tiên hơn `number`.
 */
export async function createGame(opts: { word?: string; number?: unknown } = {}): Promise<PublicGame> {
  const repo = getRepository();
  let answer: string;
  let keywordNo: number | null;
  if (opts.word !== undefined) {
    if (!config.reviewMode) throw new GameError(403, 'review_disabled', 'Không được chọn sẵn từ khóa');
    const w = normalizeWord(String(opts.word).slice(0, MAX_GUESS_LENGTH));
    const found = w && w.includes(' ') ? await repo.lookupWord(w) : null;
    if (!w || !found) throw new GameError(400, 'unknown_word', 'Từ khóa không có trong từ điển');
    answer = w;
    keywordNo = found.keywordNo;
  } else {
    const no = opts.number;
    if (no !== undefined && (typeof no !== 'number' || !Number.isInteger(no) || no < 1 || no > MAX_KEYWORD_NO)) {
      throw new GameError(400, 'bad_request', 'Số từ khóa không hợp lệ');
    }
    const picked = await repo.pickKeyword(no);
    if (!picked) {
      if (no === undefined) throw new Error('Bộ từ khóa trống');
      throw new GameError(400, 'keyword_not_found', `Không có từ khóa số ${no}; chọn số từ 1 đến ${await repo.keywordCount()}`);
    }
    answer = picked.word;
    keywordNo = picked.no;
  }
  await maybePurge();
  return toPublic(await repo.insertGame(answer, keywordNo));
}

/** Ván đang lưu, hoặc null nếu id không hợp lệ / đã bị xoá. */
export async function getGame(id: string | undefined | null): Promise<PublicGame | null> {
  if (!id || !ID_PATTERN.test(id)) return null;
  const game = await getRepository().findGame(id);
  return game ? toPublic(game) : null;
}

/**
 * Kiểm tra một lượt đoán: ván còn hiệu lực, chưa kết thúc, chỉ chữ cái tiếng Việt, đủ chữ và đúng cấu trúc
 * ô chữ (để chấm được từng ô). KHÔNG kiểm tra từ có trong từ điển: đoán chuỗi chữ bất kỳ cũng được chấm.
 */
export async function submitGuess(id: string, raw: unknown): Promise<PublicGame> {
  const repo = getRepository();
  const game = ID_PATTERN.test(id) ? await repo.findGame(id) : null;
  if (!game) throw new GameError(404, 'game_not_found', 'Ván chơi không tồn tại hoặc đã hết hạn');
  if (game.over) throw new GameError(409, 'game_over', 'Ván đã kết thúc');
  if (typeof raw !== 'string' || raw.length > MAX_GUESS_LENGTH) throw new GameError(400, 'bad_request', 'Lượt đoán không hợp lệ');

  const text = raw.trim();
  const guess = text ? wordInfo(text) : null;
  if (text && !guess) throw new GameError(400, 'invalid_chars', 'Chỉ dùng chữ cái tiếng Việt');
  const answer = wordInfo(game.answer)!;
  if (!guess || guess.cells.length < answer.cells.length) throw new GameError(400, 'incomplete', 'Chưa đủ chữ cái');
  if (guess.structure.join() !== answer.structure.join()) throw new GameError(400, 'wrong_structure', 'Số chữ cái không khớp ô chữ');

  game.guesses.push({ word: guess.word, statuses: scoreGuess(guess.cells, answer.cells) });
  game.won = guess.word === answer.word;
  game.over = game.won || game.guesses.length >= config.maxTurns;
  if (!(await repo.saveGuesses(game))) {
    throw new GameError(409, 'game_over', 'Lượt đoán đã được ghi nhận, hãy tải lại trang');
  }
  return toPublic(game);
}

/**
 * Gợi ý một ô chữ (nút Hint): chọn ngẫu nhiên trong các ô chưa từng tô xanh lá và chưa được gợi ý.
 * Tối đa config.maxHints lần mỗi ván; không mất lượt đoán.
 */
export async function requestHint(id: string): Promise<PublicGame> {
  const repo = getRepository();
  const game = ID_PATTERN.test(id) ? await repo.findGame(id) : null;
  if (!game) throw new GameError(404, 'game_not_found', 'Ván chơi không tồn tại hoặc đã hết hạn');
  if (game.over) throw new GameError(409, 'game_over', 'Ván đã kết thúc');
  if (game.hints.length >= config.maxHints) throw new GameError(409, 'no_hints_left', `Đã dùng hết ${config.maxHints} lần gợi ý`);

  const candidates = hintCandidates(game.guesses, game.hints, wordInfo(game.answer)!.cells.length);
  if (!candidates.length) throw new GameError(409, 'no_hint_available', 'Không còn ô nào để gợi ý');

  game.hints.push(candidates[randomIndex(candidates.length)]);
  if (!(await repo.saveHints(game))) {
    throw new GameError(409, 'game_over', 'Ván vừa thay đổi, hãy thử lại');
  }
  return toPublic(game);
}

/** Trạng thái gửi xuống trình duyệt: từ khóa và giải nghĩa chỉ có khi ván đã kết thúc. */
async function toPublic(game: GameRecord): Promise<PublicGame> {
  const answer = wordInfo(game.answer)!;
  const pub: PublicGame = {
    id: game.id,
    structure: answer.structure,
    maxTurns: config.maxTurns,
    rows: game.guesses.map((g) => ({ cells: wordInfo(g.word)!.cells, statuses: g.statuses })),
    hints: game.hints.map((index) => ({ index, ch: answer.cells[index] })),
    maxHints: config.maxHints,
    keywordNo: game.keywordNo,
    keywordCount: await getRepository().keywordCount(),
    over: game.over,
    won: game.won,
  };
  if (game.over) {
    pub.answer = answer.word;
    pub.definitions = (await getRepository().definitionsOf(answer.word)).slice(0, config.maxDefinitions);
  }
  return pub;
}
