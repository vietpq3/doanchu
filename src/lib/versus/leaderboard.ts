/**
 * Leader Board (giao diện: "Bảng xếp hạng") của phòng đấu theo nhóm: số ván thắng của từng người (theo playerId), còn mãi chừng nào
 * phòng còn người; phòng không còn ai (liên tục VERSUS.leaderboardEmptyGraceMs) thì reset. Bảng chỉ gồm những người đang ở trong phòng
 * (người mới vào: 0 ván); số ván của người đã rời vẫn được nhớ (phòng còn người), vào lại thì có lại. Vương miện (hạng 1–3, cần ít nhất
 * 1 ván thắng) được tính lại mỗi khi có người vào/rời phòng hoặc có ván thắng; bằng số ván thì người đang giữ vương miện được giữ.
 * Hàm thuần, nhận `now` từ ngoài (test bằng đồng hồ giả). RoomMachine (room.ts) giữ dữ liệu trong trạng thái phòng.
 */
import { VERSUS } from './config';
import type { Medal } from './protocol';

/** Số ván thắng của một người. `id` là playerId: CHỈ nằm ở server, không bao giờ gửi xuống client. */
export interface ScoreEntry {
  id: string;
  /** tên lúc thắng gần nhất hoặc lúc vào phòng gần nhất */
  name: string;
  wins: number;
  /** thời điểm đạt số ván thắng hiện tại (bằng nhau thì ai đạt trước xếp trên) */
  at: number;
}

export interface RoomScores {
  entries: ScoreEntry[];
  /** playerId của những người đang giữ vương miện hạng 1, 2, 3 (theo thứ tự): dùng để giữ vương miện khi bằng số ván */
  crowns: string[];
  /** lúc phòng trở nên trống (người cuối cùng rời đi); null khi phòng có người */
  emptySince: number | null;
}

export const emptyScores = (): RoomScores => ({ entries: [], crowns: [], emptySince: null });

/**
 * Phòng đã trống liên tục từ VERSUS.leaderboardEmptyGraceMs trở lên thì reset (xét lúc có người vào). Ngắn hơn thì không: người chơi
 * một mình tải lại trang, hay deploy làm Durable Object khởi động lại (mọi người mất kết nối rồi nối lại ngay), không làm mất bảng.
 */
export const expired = (scores: RoomScores, now: number): boolean =>
  scores.emptySince !== null && now - scores.emptySince >= VERSUS.leaderboardEmptyGraceMs;

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
 */
export function standings(scores: RoomScores, players: readonly { id: string; name: string; joinedAt: number }[]): Standing[] {
  const byId = new Map(scores.entries.map((e) => [e.id, e] as const));
  const { crowns } = scores;
  const crownRank = (id: string) => (crowns.includes(id) ? crowns.indexOf(id) : crowns.length + 1);
  return players
    .map((p) => ({ id: p.id, name: p.name, joinedAt: p.joinedAt, wins: byId.get(p.id)?.wins ?? 0, at: byId.get(p.id)?.at ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => b.wins - a.wins || crownRank(a.id) - crownRank(b.id) || a.at - b.at || a.joinedAt - b.joinedAt)
    .map((r, i) => ({ id: r.id, name: r.name, wins: r.wins, medal: i < 3 && r.wins > 0 ? ((i + 1) as Medal) : null }));
}

/** Xếp hạng: nhiều ván thắng hơn xếp trên; bằng nhau thì ai đạt số đó trước xếp trên. */
export const ranked = (entries: readonly ScoreEntry[]): ScoreEntry[] => [...entries].sort((a, b) => b.wins - a.wins || a.at - b.at);

/** Ghi một ván thắng cho `id` (tạo mới nếu chưa có). Giữ tối đa VERSUS.leaderboardMax người, bỏ người thấp nhất. */
export function recordWin(scores: RoomScores, id: string, name: string, now: number): void {
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
