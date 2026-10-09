import type { NextRequest } from 'next/server';
import { requestHint } from '@/lib/server/games';
import { errorResponse, gameResponse } from '@/lib/server/http';

/**
 * Gợi ý một ô chữ (nút Hint), tối đa 3 lần mỗi ván. Không cần body.
 * Server chọn ngẫu nhiên một ô chưa từng tô xanh lá (xem requestHint); trả trạng thái ván mới, hoặc { error, message }.
 */
export async function POST(_req: NextRequest, ctx: RouteContext<'/api/games/[id]/hints'>) {
  try {
    const { id } = await ctx.params;
    return gameResponse(await requestHint(id));
  } catch (err) {
    return errorResponse(err);
  }
}
