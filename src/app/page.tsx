import { cookies } from 'next/headers';
import GameScreen from '@/components/GameScreen';
import { config } from '@/lib/server/config';
import { createGame, getGame, GameError } from '@/lib/server/games';
import { GAME_COOKIE } from '@/lib/server/http';

/**
 * Trang chơi, render ở server: tiếp tục ván trong cookie (kể cả ván đã kết thúc), hoặc tạo ván mới.
 * Cookie chỉ được ghi trong Route Handler, nên ván mới tạo ở đây được ghi nhớ từ lượt đoán đầu tiên.
 */
export default async function Home({ searchParams }: PageProps<'/'>) {
  const [{ tu }, cookieStore] = await Promise.all([searchParams, cookies()]);

  let game = null;
  if (config.reviewMode && typeof tu === 'string') {
    try {
      game = await createGame({ word: tu });
    } catch (err) {
      if (!(err instanceof GameError)) throw err;
    }
  }
  game ??= (await getGame(cookieStore.get(GAME_COOKIE)?.value)) ?? (await createGame());

  return <GameScreen initialGame={game} />;
}
