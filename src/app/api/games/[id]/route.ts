import { NextResponse, type NextRequest } from 'next/server';
import { GameError, getGame } from '@/lib/server/games';
import { errorResponse } from '@/lib/server/http';

/**
 * Đọc trạng thái ván (ứng dụng di động mở lại app: tiếp tục ván đã lưu). Không đổi gì, không ghi cookie.
 * Từ khóa và giải nghĩa chỉ có khi ván đã kết thúc; ván không có hoặc đã bị dọn: 404 game_not_found.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<'/api/games/[id]'>) {
  try {
    const { id } = await ctx.params;
    const game = await getGame(id);
    if (!game) throw new GameError(404, 'game_not_found', 'Ván chơi không tồn tại hoặc đã hết hạn');
    return NextResponse.json(game, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}
