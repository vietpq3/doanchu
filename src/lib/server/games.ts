import 'server-only';
import { DEFAULT_DIFFICULTY, difficultyName, parseDifficulty, type Difficulty } from '@/lib/game/difficulty';
import { hintCandidates } from '@/lib/game/hints';
import { evaluateGuess, MAX_GUESS_LENGTH } from '@/lib/game/guess';
import { MAX_KEYWORD_NO } from '@/lib/game/keywords';
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
 * Tạo ván mới với từ khóa ngẫu nhiên theo độ khó `difficulty` (1–3; không hợp lệ hoặc bỏ trống thì dùng mặc định),
 * hoặc đúng từ khóa số `number` do người chơi chọn. Có `difficulty` thì số phải nằm trong khoảng của độ khó đó
 * (hộp thoại chọn số); không có (link chia sẻ /solo?id=N) thì được mọi số từ 1 đến tổng số từ khóa.
 * `word` (chọn sẵn từ khóa) chỉ dùng được khi REVIEW_MODE=1 và được ưu tiên hơn `number`.
 */
export async function createGame(opts: { word?: string; number?: unknown; difficulty?: unknown } = {}): Promise<PublicGame> {
  const repo = getRepository();
  let answer: string;
  let keywordNo: number | null;
  let difficulty: Difficulty | null = null;
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
    if (no === undefined) {
      difficulty = parseDifficulty(opts.difficulty) ?? DEFAULT_DIFFICULTY;
    } else if (opts.difficulty !== undefined) {
      // chọn số theo độ khó đang chọn: chỉ được các số của độ khó đó
      const d = parseDifficulty(opts.difficulty) ?? DEFAULT_DIFFICULTY;
      const max = (await repo.keywordCounts())[d - 1];
      if (no > max) throw new GameError(400, 'keyword_not_found', `Độ khó ${difficultyName(d)} có từ khóa số 1 đến ${max}; không có số ${no}`);
    }
    const picked = await repo.pickKeyword(no, difficulty ?? undefined);
    if (!picked) {
      if (no === undefined) throw new Error('Bộ từ khóa trống');
      throw new GameError(400, 'keyword_not_found', `Không có từ khóa số ${no}; chọn số từ 1 đến ${(await repo.keywordCounts())[2]}`);
    }
    answer = picked.word;
    keywordNo = picked.no;
  }
  await maybePurge();
  return toPublic(await repo.insertGame(answer, keywordNo, difficulty));
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
  const result = evaluateGuess(raw, game.answer);
  if (!result.ok) throw new GameError(400, result.code, result.message);

  game.guesses.push({ word: result.word, statuses: result.statuses });
  game.won = result.correct;
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
    difficulty: game.difficulty,
    keywordCounts: await getRepository().keywordCounts(),
    over: game.over,
    won: game.won,
  };
  if (game.over) {
    pub.answer = answer.word;
    pub.definitions = (await getRepository().definitionsOf(answer.word)).slice(0, config.maxDefinitions);
  }
  return pub;
}
