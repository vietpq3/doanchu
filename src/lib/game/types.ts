import type { ScoredRow } from './scoring';

/** Một nghĩa của từ, lấy từ từ điển (đã đặt lại dấu theo kiểu dấu của game). */
export interface Definition {
  /** từ loại, vd "Danh từ" */
  pos: string;
  text: string;
  example?: string;
}

export interface Hint {
  index: number;
  ch: string;
}

/**
 * Trạng thái ván chơi gửi xuống trình duyệt. Không có từ khóa cho tới khi ván kết thúc.
 */
export interface PublicGame {
  id: string;
  structure: number[];
  maxTurns: number;
  rows: ScoredRow[];
  /** các ô đã được gợi ý (nút Hint): chỉ số ô trên toàn bộ ô chữ và chữ đúng của ô đó */
  hints: Hint[];
  maxHints: number;
  /** số thứ tự của từ khóa (#N, 1 đến keywordCount); null nếu không có (ván cũ, hoặc từ không phải từ khóa) */
  keywordNo: number | null;
  /** tổng số từ khóa, để người chơi biết được chọn số nào */
  keywordCount: number;
  over: boolean;
  won: boolean;
  answer?: string;
  definitions?: Definition[];
}

export type ErrorCode =
  | 'bad_request'
  | 'game_not_found'
  | 'game_over'
  | 'no_hints_left'
  | 'no_hint_available'
  | 'invalid_chars'
  | 'incomplete'
  | 'wrong_structure'
  | 'review_disabled'
  | 'unknown_word'
  | 'keyword_not_found'
  | 'server_error';

export interface ApiErrorBody {
  error: ErrorCode;
  message: string;
}
