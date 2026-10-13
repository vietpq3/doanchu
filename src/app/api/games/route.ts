import type { NextRequest } from 'next/server';
import { DEFAULT_DIFFICULTY, DIFFICULTY_COOKIE, parseDifficulty } from '@/lib/game/difficulty';
import { createGame } from '@/lib/server/games';
import { errorResponse, gameResponse, readJson } from '@/lib/server/http';

/**
 * Tạo ván mới (nút Chơi lại khi hết ván, nút New game khi đang chơi).
 * Body: {} — từ khóa ngẫu nhiên theo độ khó (chọn ở menu, mặc định Thường); { number } — đúng từ khóa số `number`
 * (người chơi tự chọn, trong khoảng số của độ khó đó); hoặc { word } để chọn sẵn từ khóa khi REVIEW_MODE=1.
 * Độ khó: `difficulty` (1–3) trong body nếu có (ứng dụng di động, không có cookie), không thì cookie dc_difficulty (trang web).
 * { number, anyDifficulty: true } (ứng dụng di động mở link chia sẻ /solo?id=N): mọi số từ 1 đến tổng số từ khóa, như GET /api/games/start.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    const word = typeof body.word === 'string' ? body.word : undefined;
    const difficulty = parseDifficulty(body.difficulty) ?? parseDifficulty(req.cookies.get(DIFFICULTY_COOKIE)?.value) ?? DEFAULT_DIFFICULTY;
    const anyDifficulty = body.anyDifficulty === true && body.number !== undefined;
    return gameResponse(await createGame({ word, number: body.number, difficulty: anyDifficulty ? undefined : difficulty }), 201);
  } catch (err) {
    return errorResponse(err);
  }
}
