import type { NextRequest } from 'next/server';
import { submitGuess } from '@/lib/server/games';
import { errorResponse, gameResponse, readJson } from '@/lib/server/http';

/**
 * Gửi một lượt đoán. Body: { guess: "chữ trong ô nhập" }.
 * Server kiểm tra và chấm màu (xem submitGuess); trả trạng thái ván mới, hoặc { error, message }.
 */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/games/[id]/guesses'>) {
  try {
    const { id } = await ctx.params;
    const body = await readJson(req);
    return gameResponse(await submitGuess(id, body.guess));
  } catch (err) {
    return errorResponse(err);
  }
}
