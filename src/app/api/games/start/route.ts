import type { NextRequest } from 'next/server';
import { parseKeywordNo } from '@/lib/game/keywords';
import type { PublicGame } from '@/lib/game/types';
import { createGame, GameError } from '@/lib/server/games';
import { redirectResponse } from '@/lib/server/http';

/**
 * Bắt đầu ván mới với từ khóa số `id` rồi về trang chơi: GET /api/games/start?id=300.
 * Trang `/?id=300` chuyển hướng tới đây vì trang không ghi được cookie; ở đây ván được ghi nhớ ngay,
 * nên về tới "/" rồi tải lại trang vẫn chơi tiếp đúng ván đó.
 * `id` không hợp lệ hoặc không có từ khóa số đó thì không tạo ván: về "/" như bình thường (tiếp tục ván cũ hoặc ván ngẫu nhiên).
 */
export async function GET(req: NextRequest) {
  const no = parseKeywordNo(req.nextUrl.searchParams.get('id'));
  let game: PublicGame | undefined;
  if (no !== null) {
    try {
      game = await createGame({ number: no });
    } catch (err) {
      if (!(err instanceof GameError)) console.error(err); // lỗi máy chủ thì ghi log, vẫn đưa người chơi về trang chơi
    }
  }
  return redirectResponse('/', game);
}
