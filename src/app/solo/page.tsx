import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import GameScreen from '@/components/GameScreen';
import { DEFAULT_DIFFICULTY, DIFFICULTY_COOKIE, parseDifficulty } from '@/lib/game/difficulty';
import { parseKeywordNo } from '@/lib/game/keywords';
import { config } from '@/lib/server/config';
import { createGame, getGame, GameError } from '@/lib/server/games';
import { GAME_COOKIE } from '@/lib/server/http';

export const metadata: Metadata = { title: 'Chơi đơn · Đoán Chữ' };

/**
 * Trang Chơi đơn (/solo), render ở server: tiếp tục ván trong cookie (kể cả ván đã kết thúc), hoặc tạo ván mới theo độ khó
 * trong cookie (chọn ở menu). Ván trong cookie chưa đoán lượt nào mà khác độ khó đang chọn thì cũng tạo ván mới.
 * Cookie chỉ được ghi trong Route Handler, nên ván mới tạo ở đây được ghi nhớ từ lượt đoán đầu tiên.
 * `/solo?id=300` (link chia sẻ) bắt đầu ván mới với từ khóa số 300: chuyển sang /api/games/start (tạo ván + ghi cookie) rồi về "/solo".
 */
export default async function SoloPage({ searchParams }: PageProps<'/solo'>) {
  const [{ tu, id }, cookieStore] = await Promise.all([searchParams, cookies()]);

  const reviewWord = config.reviewMode && typeof tu === 'string';
  const keywordNo = parseKeywordNo(id);
  if (keywordNo !== null && !reviewWord) redirect(`/api/games/start?id=${keywordNo}`);

  let game = null;
  if (reviewWord) {
    try {
      game = await createGame({ word: tu });
    } catch (err) {
      if (!(err instanceof GameError)) throw err;
    }
  }
  if (!game) {
    const difficulty = parseDifficulty(cookieStore.get(DIFFICULTY_COOKIE)?.value) ?? DEFAULT_DIFFICULTY;
    const saved = await getGame(cookieStore.get(GAME_COOKIE)?.value);
    // Ván ngẫu nhiên chưa đoán lượt nào mà độ khó khác độ khó đang chọn (vừa đổi ở trang chủ): bỏ, tạo ván mới (không mất gì).
    const untouched = saved && !saved.over && saved.rows.length === 0 && saved.hints.length === 0;
    const stale = untouched && saved.difficulty !== null && saved.difficulty !== difficulty;
    game = saved && !stale ? saved : await createGame({ difficulty });
  }

  return <GameScreen initialGame={game} />;
}
