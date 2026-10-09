import type { NextRequest } from 'next/server';
import { createGame } from '@/lib/server/games';
import { errorResponse, gameResponse, readJson } from '@/lib/server/http';

/**
 * Tạo ván mới (nút Chơi lại khi hết ván, nút New game khi đang chơi).
 * Body: {} — từ khóa ngẫu nhiên; { number } — đúng từ khóa số `number` (người chơi tự chọn);
 * hoặc { word } để chọn sẵn từ khóa khi REVIEW_MODE=1.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    const word = typeof body.word === 'string' ? body.word : undefined;
    return gameResponse(await createGame({ word, number: body.number }), 201);
  } catch (err) {
    return errorResponse(err);
  }
}
