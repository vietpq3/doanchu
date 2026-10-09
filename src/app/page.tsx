import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import GameScreen from '@/components/GameScreen';
import { parseKeywordNo } from '@/lib/game/keywords';
import { config } from '@/lib/server/config';
import { createGame, getGame, GameError } from '@/lib/server/games';
import { GAME_COOKIE } from '@/lib/server/http';

/**
 * Trang chơi, render ở server: tiếp tục ván trong cookie (kể cả ván đã kết thúc), hoặc tạo ván mới.
 * Cookie chỉ được ghi trong Route Handler, nên ván mới tạo ở đây được ghi nhớ từ lượt đoán đầu tiên.
 * `/?id=300` bắt đầu ván mới với từ khóa số 300: chuyển sang /api/games/start (tạo ván + ghi cookie) rồi về "/".
 */
export default async function Home({ searchParams }: PageProps<'/'>) {
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
  game ??= (await getGame(cookieStore.get(GAME_COOKIE)?.value)) ?? (await createGame());

  return <GameScreen initialGame={game} />;
}
