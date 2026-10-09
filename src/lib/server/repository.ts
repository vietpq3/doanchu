import 'server-only';
import type { Status } from '@/lib/game/scoring';
import type { Definition } from '@/lib/game/types';
import { createSupabaseRepository } from './supabase-repository';

/** Một ván chơi lưu ở server. Từ khóa chỉ nằm ở đây. */
export interface GameRecord {
  id: string;
  answer: string;
  /** số thứ tự của từ khóa lúc tạo ván; null nếu không có */
  keywordNo: number | null;
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
  /** Từ khóa số `no` (1 đến keywordCount), hoặc một từ ngẫu nhiên khi bỏ trống `no`; null nếu không có số đó. */
  pickKeyword(no?: number): Promise<{ word: string; no: number } | null>;
  /** Tổng số từ khóa */
  keywordCount(): Promise<number>;
  /** Tra một từ trong từ điển: null nếu không có từ; keywordNo là null nếu từ đó không phải từ khóa. */
  lookupWord(word: string): Promise<{ keywordNo: number | null } | null>;
  definitionsOf(word: string): Promise<Definition[]>;
  insertGame(answer: string, keywordNo: number | null): Promise<GameRecord>;
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
