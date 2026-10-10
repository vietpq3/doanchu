/** Chữ hiển thị kết quả và thời gian của ván đấu theo nhóm. Hàm thuần, dùng chung giao diện và ảnh chụp ô chữ. */
import type { GameView } from './protocol';

/** Một dòng tóm tắt kết quả ván của mình; null nếu ván chưa kết thúc. */
export function summarizeResult(game: Pick<GameView, 'result' | 'yourRows' | 'maxTurns'>): string | null {
  const result = game.result;
  if (!result) return null;
  if (result.youWon) return `Bạn đã thắng sau ${game.yourRows.length}/${game.maxTurns} lượt!`;
  if (result.winnerName) return `Bạn đã thua. Người thắng: ${result.winnerName}`;
  return 'Không ai tìm ra từ khóa';
}

/** Số giây -> "m:ss" (vd 581 -> "9:41"). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
