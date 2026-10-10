/**
 * Leader Board (giao diện: "Bảng xếp hạng") của phòng đấu theo nhóm: số ván thắng trong ngày của từng người (theo playerId), reset
 * lúc 00:00 giờ Việt Nam. Bảng chỉ gồm những người đang ở trong phòng (người mới vào: 0 ván); số ván của người đã rời vẫn được nhớ
 * trong ngày, vào lại thì có lại. Vương miện (hạng 1–3, cần ít nhất 1 ván thắng) được tính lại mỗi khi có người vào/rời phòng hoặc
 * có ván thắng; bằng số ván thì người đang giữ vương miện được giữ.
 * Hàm thuần, nhận `now` từ ngoài (test bằng đồng hồ giả). RoomMachine (room.ts) giữ dữ liệu trong trạng thái phòng.
 */
import { VERSUS } from './config';
import type { Medal } from './protocol';

const DAY_MS = 24 * 60 * 60_000;

/** Số ván thắng trong ngày của một người. `id` là playerId: CHỈ nằm ở server, không bao giờ gửi xuống client. */
export interface ScoreEntry {
  id: string;
  /** tên lúc thắng gần nhất hoặc lúc vào phòng gần nhất */
  name: string;
  wins: number;
  /** thời điểm đạt số ván thắng hiện tại (bằng nhau thì ai đạt trước xếp trên) */
  at: number;
}

export interface DailyScores {
  /** ngày (giờ Việt Nam) của các số liệu, dạng YYYY-MM-DD; '' = chưa có */
  day: string;
  entries: ScoreEntry[];
  /** playerId của những người đang giữ vương miện hạng 1, 2, 3 (theo thứ tự): dùng để giữ vương miện khi bằng số ván */
  crowns: string[];
}

/** Một dòng của bảng xếp hạng (ở server, còn playerId). */
export interface Standing {
  id: string;
  name: string;
  wins: number;
  /** hạng 1–3 có vương miện (cần ít nhất 1 ván thắng); null nếu không */
  medal: Medal | null;
}

/**
 * Bảng xếp hạng của những người đang ở trong phòng (`players`), mỗi người một dòng (chưa thắng ván nào: 0 ván). Xếp theo số ván
 * thắng; bằng nhau thì người đang giữ vương miện cao hơn xếp trên, rồi ai đạt số ván đó trước, rồi ai vào phòng trước.
 * `today` = false (số liệu là của ngày trước): mọi người 0 ván, không ai có vương miện.
 */
export function standings(scores: DailyScores, players: readonly { id: string; name: string; joinedAt: number }[], today: boolean): Standing[] {
  const byId = new Map(today ? scores.entries.map((e) => [e.id, e] as const) : []);
  const crowns = today ? scores.crowns : [];
  const crownRank = (id: string) => (crowns.includes(id) ? crowns.indexOf(id) : crowns.length + 1);
  return players
    .map((p) => ({ id: p.id, name: p.name, joinedAt: p.joinedAt, wins: byId.get(p.id)?.wins ?? 0, at: byId.get(p.id)?.at ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => b.wins - a.wins || crownRank(a.id) - crownRank(b.id) || a.at - b.at || a.joinedAt - b.joinedAt)
    .map((r, i) => ({ id: r.id, name: r.name, wins: r.wins, medal: i < 3 && r.wins > 0 ? ((i + 1) as Medal) : null }));
}

/** Ngày theo giờ Việt Nam của thời điểm `now`, dạng YYYY-MM-DD. */
export const dayKey = (now: number): string => new Date(now + VERSUS.leaderboardUtcOffsetMs).toISOString().slice(0, 10);

/** Thời điểm 00:00 (giờ Việt Nam) ngay sau ngày `day` (YYYY-MM-DD): lúc Leader Board của ngày đó hết hạn. */
export const endOfDay = (day: string): number => Date.parse(`${day}T00:00:00Z`) + DAY_MS - VERSUS.leaderboardUtcOffsetMs;

/** Xếp hạng: nhiều ván thắng hơn xếp trên; bằng nhau thì ai đạt số đó trước xếp trên. */
export const ranked = (entries: readonly ScoreEntry[]): ScoreEntry[] => [...entries].sort((a, b) => b.wins - a.wins || a.at - b.at);

/** Ghi một ván thắng cho `id` (tạo mới nếu chưa có). Giữ tối đa VERSUS.leaderboardMax người, bỏ người thấp nhất. */
export function recordWin(scores: DailyScores, id: string, name: string, now: number): void {
  let entry = scores.entries.find((e) => e.id === id);
  if (!entry) {
    entry = { id, name, wins: 0, at: now };
    scores.entries.push(entry);
  }
  entry.wins++;
  entry.at = now;
  entry.name = name;
  if (scores.entries.length > VERSUS.leaderboardMax) scores.entries = ranked(scores.entries).slice(0, VERSUS.leaderboardMax);
}
