import 'server-only';
import type { Difficulty, KeywordCounts } from '@/lib/game/difficulty';
import type { Status } from '@/lib/game/scoring';
import type { Definition } from '@/lib/game/types';
import { createSupabaseRepository } from './supabase-repository';

/** Một ván chơi lưu ở server. Từ khóa chỉ nằm ở đây. */
export interface GameRecord {
  id: string;
  answer: string;
  /** số thứ tự của từ khóa lúc tạo ván; null nếu không có */
  keywordNo: number | null;
  /** độ khó lúc tạo ván; null nếu từ khóa không chọn theo độ khó (chọn theo số #N, ván cũ) */
  difficulty: Difficulty | null;
  guesses: { word: string; statuses: Status[] }[];
  /** số lượt đã lưu trong CSDL lúc đọc; dùng để chặn ghi đè khi gửi trùng */
  turns: number;
  /** chỉ số các ô đã gợi ý (nút Hint), theo thứ tự gợi ý */
  hints: number[];
  /** số gợi ý đã lưu trong CSDL lúc đọc; dùng để chặn ghi đè khi gửi trùng */
  hintCount: number;
  over: boolean;
  won: boolean;
}

/** Truy cập dữ liệu. Bản chạy thật dùng Supabase; test dùng bản trong bộ nhớ. */
export interface Repository {
  /**
   * Từ khóa số `no` (1 đến tổng số từ khóa), hoặc khi bỏ trống `no` thì một từ ngẫu nhiên trong các từ có mức <= `difficulty`;
   * null nếu không có số đó.
   */
  pickKeyword(no?: number, difficulty?: Difficulty): Promise<{ word: string; no: number } | null>;
  /**
   * Số từ khóa của từng độ khó (từ khóa số 1 đến counts[d - 1]). Độ khó chưa có từ nào (chưa xếp mức) thì bằng tổng số từ khóa,
   * giống pick_keyword() bốc trong toàn bộ từ khóa.
   */
  keywordCounts(): Promise<KeywordCounts>;
  /** Tra một từ trong từ điển: null nếu không có từ; keywordNo là null nếu từ đó không phải từ khóa. */
  lookupWord(word: string): Promise<{ keywordNo: number | null } | null>;
  definitionsOf(word: string): Promise<Definition[]>;
  insertGame(answer: string, keywordNo: number | null, difficulty: Difficulty | null): Promise<GameRecord>;
  findGame(id: string): Promise<GameRecord | null>;
  /** Ghi lượt đoán, chỉ khi số lượt trong CSDL vẫn là game.turns (chặn gửi trùng); trả false nếu không ghi được. */
  saveGuesses(game: GameRecord): Promise<boolean>;
  /** Ghi gợi ý, chỉ khi số lượt và số gợi ý trong CSDL vẫn là game.turns, game.hintCount; trả false nếu không ghi được. */
  saveHints(game: GameRecord): Promise<boolean>;
  /** Xoá ván chưa đoán lượt nào sau 1 ngày, mọi ván sau ttlDays ngày. */
  purgeOldGames(ttlDays: number): Promise<void>;
}

let repository: Repository | null = null;

export function getRepository(): Repository {
  return (repository ??= createSupabaseRepository());
}

/** Chỉ dùng trong test. */
export function setRepositoryForTests(repo: Repository | null) {
  repository = repo;
}
