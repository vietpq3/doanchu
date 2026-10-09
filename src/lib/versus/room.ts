/**
 * Máy trạng thái của một phòng đấu theo nhóm (docs/versus-v2.md). Hàm/lớp thuần: không I/O, không đồng hồ riêng
 * (mọi phương thức nhận `now`), nên test được bằng đồng hồ giả. Durable Object (worker/room-do.ts) chỉ là vỏ mỏng:
 * chuyển tin nhắn WebSocket thành lời gọi ở đây, lưu `state` (JSON) và đặt alarm theo `nextWakeAt()`.
 *
 * Các pha: idle (chờ) → countdown (đếm ngược Start) → starting (đã khóa bàn, đang chọn từ khóa, bất đồng bộ)
 *          → playing (đang đấu) → locked (ván vừa xong, phòng khóa vài giây) → idle.
 */
import { evaluateGuess } from '../game/guess';
import type { Status } from '../game/scoring';
import { wordInfo } from '../game/vietnamese';
import { roomName, VERSUS } from './config';
import { sanitizeName } from './protocol';
import type { EndReason, GameView, LastResult, MatchPlayerStatus, Phase, RoomView } from './protocol';

export interface RoomPlayer {
  id: string;
  name: string;
  /** ô đang ngồi ở Bàn chơi; null = ở Sảnh chờ */
  seat: number | null;
  joinedAt: number;
  /** đang mất kết nối giữa ván, chờ nối lại (chỉ xảy ra khi đang đấu) */
  disconnectedAt: number | null;
}

export interface MatchPlayer {
  id: string;
  name: string;
  guesses: { word: string; cells: string[]; statuses: Status[] }[];
  status: MatchPlayerStatus;
}

export interface Match {
  /** đáp án: CHỈ nằm ở server */
  answer: string;
  structure: number[];
  startedAt: number;
  endsAt: number;
  players: MatchPlayer[];
  finished: { winnerId: string | null; winnerName: string | null; endedAt: number; reason: EndReason } | null;
}

/** Toàn bộ trạng thái của phòng, serialize được sang JSON để lưu trong Durable Object. */
export interface RoomState {
  roomId: number;
  phase: Phase;
  players: RoomPlayer[];
  countdownEndsAt: number | null;
  lockedUntil: number | null;
  match: Match | null;
  lastResult: LastResult | null;
  /** chỉ dùng khi server bật REVIEW_MODE: từ khóa chọn sẵn cho ván sắp bắt đầu */
  reviewWord: string | null;
}

export type ActionError =
  | 'bad_name' | 'room_full' | 'unknown_player' | 'table_locked' | 'already_seated' | 'bad_seat' | 'seat_taken'
  | 'not_seated' | 'not_enough_players' | 'already_counting' | 'room_busy' | 'no_game' | 'not_in_match' | 'already_done'
  | 'bad_request' | 'invalid_chars' | 'incomplete' | 'wrong_structure';

export type ActionResult = { ok: true } | { ok: false; code: ActionError; message: string };

const ok: ActionResult = { ok: true };
const fail = (code: ActionError, message: string): ActionResult => ({ ok: false, code, message });

export interface RoomSummary {
  id: number;
  name: string;
  /** tổng số người trong phòng */
  players: number;
  status: 'waiting' | 'playing';
}

/** Tên chưa ai dùng trong phòng: trùng thì thêm hậu tố " (2)", " (3)"... (không phân biệt hoa thường). */
function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = Array.from(base).slice(0, VERSUS.nameMax - suffix.length).join('').trimEnd() + suffix;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export class RoomMachine {
  constructor(public state: RoomState) {}

  static create(roomId: number): RoomMachine {
    return new RoomMachine({ roomId, phase: 'idle', players: [], countdownEndsAt: null, lockedUntil: null, match: null, lastResult: null, reviewWord: null });
  }

  // ---------- truy vấn ----------

  private find(id: string): RoomPlayer | undefined {
    return this.state.players.find((p) => p.id === id);
  }

  private seated(): RoomPlayer[] {
    return this.state.players.filter((p) => p.seat !== null).sort((a, b) => a.seat! - b.seat!);
  }

  private get activeMatch(): Match | null {
    const m = this.state.match;
    return m && !m.finished ? m : null;
  }

  has(id: string): boolean {
    return this.find(id) !== undefined;
  }

  get isEmpty(): boolean {
    return this.state.players.length === 0;
  }

  summary(): RoomSummary {
    const s = this.state;
    return { id: s.roomId, name: roomName(s.roomId), players: s.players.length, status: s.phase === 'playing' || s.phase === 'starting' ? 'playing' : 'waiting' };
  }

  // ---------- kết nối ----------

  /** Người chơi vào phòng (hoặc nối lại). Người mới vào Sảnh chờ; Sảnh chờ đã đủ thì từ chối. */
  connect(id: string, rawName: unknown, now: number): ActionResult {
    const existing = this.find(id);
    if (existing) {
      existing.disconnectedAt = null;
      return ok;
    }
    const base = sanitizeName(rawName);
    if (!base) return fail('bad_name', 'Hãy nhập tên của bạn');
    if (this.state.players.filter((p) => p.seat === null).length >= VERSUS.lobbyMax) return fail('room_full', 'Phòng đã đầy');
    const taken = new Set(this.state.players.map((p) => p.name.toLowerCase()));
    this.state.players.push({ id, name: uniqueName(base, taken), seat: null, joinedAt: now, disconnectedAt: null });
    return ok;
  }

  /**
   * Mất kết nối (đóng tab...). Ở Sảnh chờ/Bàn chơi: rời phòng ngay. Đang trong ván: chờ nối lại
   * VERSUS.reconnectGraceMs rồi mới coi là rời (tải lại trang không mất ván).
   */
  disconnect(id: string, now: number): void {
    const p = this.find(id);
    if (!p) return;
    const inMatch = this.activeMatch?.players.some((mp) => mp.id === id && mp.status === 'playing');
    if (inMatch) p.disconnectedAt = now;
    else this.removePlayer(id, now);
  }

  /** Rời phòng chủ động (nút Rời phòng): luôn rời ngay, kể cả đang trong ván. */
  leave(id: string, now: number): void {
    this.removePlayer(id, now);
  }

  /**
   * Sau khi Durable Object khởi động lại (deploy, bị đuổi khỏi bộ nhớ): ai không còn kết nối thì xử lý như mất kết nối;
   * pha `starting` (đang chọn từ khóa, bất đồng bộ) đã mất theo tiến trình cũ nên hủy để bàn không kẹt mãi.
   */
  reconcile(connectedIds: ReadonlySet<string>, now: number): void {
    for (const p of [...this.state.players]) if (!connectedIds.has(p.id)) this.disconnect(p.id, now);
    this.failStart();
  }

  private removePlayer(id: string, now: number): void {
    const idx = this.state.players.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const [p] = this.state.players.splice(idx, 1);
    const match = this.activeMatch;
    const mp = match?.players.find((x) => x.id === id);
    if (mp && mp.status === 'playing') mp.status = 'left';
    if (this.state.phase === 'countdown' && p.seat !== null) this.cancelCountdown();
    this.checkEnd(now);
  }

  // ---------- Bàn chơi ----------

  sit(id: string, seat: number): ActionResult {
    const p = this.find(id);
    if (!p) return fail('unknown_player', 'Bạn chưa ở trong phòng');
    if (this.state.phase !== 'idle' && this.state.phase !== 'countdown') return fail('table_locked', 'Bàn chơi đang bị khóa');
    if (p.seat !== null) return fail('already_seated', 'Bạn đang ngồi ở bàn rồi');
    if (!Number.isInteger(seat) || seat < 0 || seat >= VERSUS.seats) return fail('bad_seat', 'Ô không hợp lệ');
    if (this.state.players.some((x) => x.seat === seat)) return fail('seat_taken', 'Ô này đã có người');
    p.seat = seat;
    this.cancelCountdown(); // đổi số người ở bàn: hủy đếm ngược (nếu đang đếm)
    return ok;
  }

  stand(id: string): ActionResult {
    const p = this.find(id);
    if (!p) return fail('unknown_player', 'Bạn chưa ở trong phòng');
    if (this.state.phase !== 'idle' && this.state.phase !== 'countdown') return fail('table_locked', 'Bàn chơi đang bị khóa');
    if (p.seat === null) return fail('not_seated', 'Bạn đang ở sảnh chờ');
    p.seat = null;
    this.cancelCountdown();
    return ok;
  }

  private cancelCountdown(): void {
    if (this.state.phase !== 'countdown') return;
    this.state.phase = 'idle';
    this.state.countdownEndsAt = null;
    this.state.reviewWord = null;
  }

  /** Bấm Start: ai đang ngồi bàn cũng bấm được khi có từ 2 người trở lên. Bắt đầu đếm ngược. */
  start(id: string, now: number, reviewWord?: string): ActionResult {
    const p = this.find(id);
    if (!p) return fail('unknown_player', 'Bạn chưa ở trong phòng');
    const phase = this.state.phase;
    if (phase === 'countdown') return fail('already_counting', 'Đang đếm ngược');
    if (phase !== 'idle') return fail('room_busy', 'Phòng đang bận, hãy đợi');
    if (p.seat === null) return fail('not_seated', 'Hãy ngồi vào bàn chơi trước');
    if (this.seated().length < VERSUS.minPlayersToStart) return fail('not_enough_players', 'Cần ít nhất 2 người ở bàn chơi');
    this.state.phase = 'countdown';
    this.state.countdownEndsAt = now + VERSUS.countdownMs;
    this.state.reviewWord = reviewWord ?? null;
    return ok;
  }

  // ---------- thời gian ----------

  /**
   * Xử lý mọi mốc thời gian đã tới hạn (gọi khi alarm kêu). `needAnswer`: đếm ngược đã xong, bàn đã khóa;
   * caller phải chọn từ khóa rồi gọi beginMatch() (hoặc failStart() nếu không chọn được).
   */
  tick(now: number): { needAnswer: boolean; reviewWord: string | null } {
    const s = this.state;
    let needAnswer = false;
    if (s.phase === 'countdown' && s.countdownEndsAt !== null && now >= s.countdownEndsAt) {
      if (this.seated().length >= VERSUS.minPlayersToStart) {
        s.phase = 'starting';
        s.countdownEndsAt = null;
        needAnswer = true;
      } else {
        this.cancelCountdown();
      }
    }
    if (this.activeMatch) {
      for (const p of [...s.players]) {
        if (p.disconnectedAt !== null && now - p.disconnectedAt >= VERSUS.reconnectGraceMs) this.removePlayer(p.id, now);
      }
      const match = this.activeMatch;
      if (match && now >= match.endsAt) this.finish(null, 'timeout', now);
    }
    if (s.phase === 'locked' && s.lockedUntil !== null && now >= s.lockedUntil) {
      s.phase = 'idle';
      s.lockedUntil = null;
      s.match = null;
    }
    return { needAnswer, reviewWord: s.reviewWord };
  }

  /** Thời điểm sớm nhất cần được đánh thức (để đặt alarm); null = không cần. */
  nextWakeAt(): number | null {
    const s = this.state;
    const times: number[] = [];
    if (s.phase === 'countdown' && s.countdownEndsAt !== null) times.push(s.countdownEndsAt);
    if (s.phase === 'locked' && s.lockedUntil !== null) times.push(s.lockedUntil);
    const match = this.activeMatch;
    if (s.phase === 'playing' && match) {
      times.push(match.endsAt);
      for (const p of s.players) if (p.disconnectedAt !== null) times.push(p.disconnectedAt + VERSUS.reconnectGraceMs);
    }
    return times.length ? Math.min(...times) : null;
  }

  // ---------- ván đấu ----------

  /** Bắt đầu ván với từ khóa `answer` (sau tick() báo needAnswer). Trả về false (và hủy) nếu không bắt đầu được. */
  beginMatch(answer: string, now: number): boolean {
    const s = this.state;
    if (s.phase !== 'starting') return false;
    const info = wordInfo(answer);
    const seated = this.seated();
    if (!info || seated.length < VERSUS.minPlayersToStart) {
      this.failStart();
      return false;
    }
    s.phase = 'playing';
    s.reviewWord = null;
    s.match = {
      answer: info.word,
      structure: info.structure,
      startedAt: now,
      endsAt: now + VERSUS.matchMaxMs,
      players: seated.map((p) => ({ id: p.id, name: p.name, guesses: [], status: 'playing' as const })),
      finished: null,
    };
    return true;
  }

  /** Không chọn được từ khóa: hủy ván, mở lại bàn. */
  failStart(): void {
    if (this.state.phase !== 'starting') return;
    this.state.phase = 'idle';
    this.state.reviewWord = null;
  }

  /** Một lượt đoán. Lượt không hợp lệ trả về lỗi và không mất lượt. */
  guess(id: string, raw: unknown, now: number): ActionResult {
    const match = this.activeMatch;
    if (this.state.phase !== 'playing' || !match) return fail('no_game', 'Chưa có ván nào đang diễn ra');
    const mp = match.players.find((p) => p.id === id);
    if (!mp || mp.status === 'left') return fail('not_in_match', 'Bạn không tham gia ván này');
    if (mp.status !== 'playing') return fail('already_done', 'Bạn đã hết lượt đoán');
    const result = evaluateGuess(raw, match.answer);
    if (!result.ok) return fail(result.code, result.message);
    mp.guesses.push({ word: result.word, cells: result.cells, statuses: result.statuses });
    if (result.correct) {
      mp.status = 'won';
      this.finish(mp, 'won', now);
    } else {
      if (mp.guesses.length >= VERSUS.maxTurns) mp.status = 'out';
      this.checkEnd(now);
    }
    return ok;
  }

  /** Hết người còn đoán (mọi người hết lượt hoặc đã rời) thì ván kết thúc, không có người thắng. */
  private checkEnd(now: number): void {
    const match = this.activeMatch;
    if (this.state.phase === 'playing' && match && !match.players.some((p) => p.status === 'playing')) this.finish(null, 'exhausted', now);
  }

  /** Kết thúc ván: lưu kết quả, đưa mọi người về Sảnh chờ, bàn trống, khóa phòng vài giây. */
  private finish(winner: MatchPlayer | null, reason: EndReason, now: number): void {
    const s = this.state;
    const match = s.match;
    if (!match || match.finished) return;
    match.finished = { winnerId: winner?.id ?? null, winnerName: winner?.name ?? null, endedAt: now, reason };
    s.lastResult = { word: match.answer, winnerName: match.finished.winnerName, endedAt: now };
    s.phase = 'locked';
    s.lockedUntil = now + VERSUS.resultLockMs;
    s.countdownEndsAt = null;
    s.reviewWord = null;
    s.players = s.players.filter((p) => p.disconnectedAt === null); // đang chờ nối lại mà ván đã xong: coi như đã rời
    for (const p of s.players) p.seat = null;
    for (const mp of match.players) if (mp.status === 'playing' && !s.players.some((p) => p.id === mp.id)) mp.status = 'left';
  }

  // ---------- góc nhìn của từng người chơi ----------

  /** Trạng thái người chơi `id` được phép thấy; null nếu người đó không ở trong phòng. */
  viewFor(id: string, now: number): RoomView | null {
    const s = this.state;
    const me = this.find(id);
    if (!me) return null;
    const seats: (string | null)[] = Array.from({ length: VERSUS.seats }, () => null);
    for (const p of s.players) if (p.seat !== null) seats[p.seat] = p.name;

    let game: GameView | null = null;
    const match = s.match;
    const mp = match?.players.find((p) => p.id === id && p.status !== 'left');
    if (match && mp) {
      game = {
        structure: match.structure,
        maxTurns: VERSUS.maxTurns,
        startedAt: match.startedAt,
        endsAt: match.endsAt,
        yourRows: mp.guesses.map((g) => ({ cells: g.cells, statuses: g.statuses })),
        yourStatus: mp.status,
        players: match.players.map((p) => ({ name: p.name, turns: p.guesses.length, status: p.status, isYou: p.id === id })),
        result: match.finished
          ? { word: match.answer, winnerName: match.finished.winnerName, youWon: match.finished.winnerId === id, reason: match.finished.reason }
          : null,
      };
    }

    return {
      roomId: s.roomId,
      roomName: roomName(s.roomId),
      serverNow: now,
      phase: s.phase,
      youName: me.name,
      youSeat: me.seat,
      lobby: s.players.filter((p) => p.seat === null).sort((a, b) => a.joinedAt - b.joinedAt).map((p) => p.name),
      seats,
      canStart: s.phase === 'idle' && me.seat !== null && this.seated().length >= VERSUS.minPlayersToStart,
      countdownEndsAt: s.countdownEndsAt,
      lockedUntil: s.lockedUntil,
      lastResult: s.lastResult,
      game,
    };
  }
}
