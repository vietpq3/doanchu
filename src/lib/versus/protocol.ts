/**
 * Giao thức giữa trình duyệt và Durable Object của phòng (WebSocket, JSON), và các kiểu dữ liệu client được thấy.
 * Dùng chung cho worker và giao diện. Quy tắc quan trọng: RoomView KHÔNG BAO GIỜ chứa đáp án hay chữ của lượt đoán
 * người khác trước khi ván kết thúc (có test kiểm tra).
 */
import type { ScoredRow } from '../game/scoring';
import type { Definition } from '../game/types';
import { VERSUS } from './config';

export type Phase = 'idle' | 'countdown' | 'starting' | 'playing' | 'locked';

export type MatchPlayerStatus = 'playing' | 'won' | 'out' | 'left';

export type EndReason = 'won' | 'exhausted' | 'timeout';

export interface LastResult {
  word: string;
  /** null = không ai tìm ra */
  winnerName: string | null;
  endedAt: number;
  /** giải nghĩa từ khóa (rỗng nếu từ điển chưa có) */
  definitions: Definition[];
}

export interface GameView {
  structure: number[];
  maxTurns: number;
  startedAt: number;
  endsAt: number;
  /** các lượt đoán của chính bạn (chữ + màu) */
  yourRows: ScoredRow[];
  yourStatus: MatchPlayerStatus;
  /** mọi người trong ván: chỉ tên + số lượt đã đoán, không có chữ/màu */
  players: { name: string; turns: number; status: MatchPlayerStatus; isYou: boolean }[];
  /** có khi ván đã kết thúc */
  result: { word: string; definitions: Definition[]; winnerName: string | null; youWon: boolean; reason: EndReason } | null;
}

/** Trạng thái phòng mà một người chơi cụ thể được phép thấy. */
export interface RoomView {
  roomId: number;
  roomName: string;
  /** giờ của server, để client đếm ngược theo giờ server */
  serverNow: number;
  phase: Phase;
  youName: string;
  /** ô bạn đang ngồi ở Bàn chơi; null = đang ở Sảnh chờ */
  youSeat: number | null;
  /** tên những người ở Sảnh chờ */
  lobby: string[];
  /** tên người ở từng ô của Bàn chơi, null = ô trống */
  seats: (string | null)[];
  /** bạn đang ngồi bàn, phòng đang rảnh và có đủ người để bấm Start */
  canStart: boolean;
  countdownEndsAt: number | null;
  lockedUntil: number | null;
  lastResult: LastResult | null;
  /** chỉ có khi bạn là người tham gia ván đang diễn ra hoặc vừa kết thúc */
  game: GameView | null;
}

export type ClientMessage =
  | { type: 'sit'; seat: number }
  | { type: 'stand' }
  /** `word`: chọn sẵn từ khóa, chỉ có tác dụng khi server bật REVIEW_MODE (để kiểm thử) */
  | { type: 'start'; word?: string | undefined }
  | { type: 'leave' }
  | { type: 'guess'; guess: string };

export type ServerMessage =
  | { type: 'state'; view: RoomView }
  | { type: 'error'; code: string; message: string }
  /** một tab khác của cùng người chơi đã vào phòng: kết nối này bị thay thế */
  | { type: 'replaced' };

/** Tin nhắn WebSocket lớn hơn mức này bị bỏ qua. */
export const MAX_MESSAGE_CHARS = 512;

const PLAYER_ID = /^[A-Za-z0-9-]{8,64}$/;
export const isValidPlayerId = (v: unknown): v is string => typeof v === 'string' && PLAYER_ID.test(v);

/**
 * Chuẩn hoá tên người chơi: bỏ ký tự điều khiển, gộp khoảng trắng, cắt đầu/cuối và còn tối đa VERSUS.nameMax ký tự.
 * Trả về null nếu rỗng (tên phải non-blank). Tên hiển thị bằng React nên đã được escape; không lọc thêm.
 */
export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.normalize('NFC').replace(/[\p{C}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim();
  const name = Array.from(cleaned).slice(0, VERSUS.nameMax).join('').trim();
  return name || null;
}

/** Đọc một tin nhắn từ client; trả về null nếu sai định dạng. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_CHARS) return null;
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!msg || typeof msg !== 'object') return null;
  const m = msg as Record<string, unknown>;
  switch (m.type) {
    case 'sit':
      return typeof m.seat === 'number' && Number.isInteger(m.seat) && m.seat >= 0 && m.seat < VERSUS.seats ? { type: 'sit', seat: m.seat } : null;
    case 'stand':
      return { type: 'stand' };
    case 'start':
      return { type: 'start', ...(typeof m.word === 'string' ? { word: m.word } : {}) };
    case 'leave':
      return { type: 'leave' };
    case 'guess':
      return typeof m.guess === 'string' ? { type: 'guess', guess: m.guess } : null;
    default:
      return null;
  }
}
