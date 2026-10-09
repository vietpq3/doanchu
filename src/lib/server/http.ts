import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { ApiErrorBody, PublicGame } from '@/lib/game/types';
import { GameError } from './games';

/** Cookie giữ id ván đang chơi, để tải lại trang vẫn chơi tiếp. */
export const GAME_COOKIE = 'dc_game';
const GAME_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

function rememberGame(res: NextResponse, id: string) {
  res.cookies.set(GAME_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: GAME_COOKIE_MAX_AGE,
  });
}

/** Trả trạng thái ván và ghi nhớ ván đó trong cookie. */
export function gameResponse(game: PublicGame, status = 200): NextResponse<PublicGame> {
  const res = NextResponse.json(game, { status });
  rememberGame(res, game.id);
  return res;
}

/** Chuyển hướng (303) tới `location`, ghi nhớ `game` trong cookie nếu có. Không cache vì đã có tác dụng phụ (tạo ván). */
export function redirectResponse(location: string, game?: PublicGame): NextResponse {
  const res = new NextResponse(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } });
  if (game) rememberGame(res, game.id);
  return res;
}

export function errorResponse(err: unknown): NextResponse<ApiErrorBody> {
  if (err instanceof GameError) return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
  console.error(err);
  return NextResponse.json({ error: 'server_error', message: 'Lỗi máy chủ' }, { status: 500 });
}

/** Đọc body JSON; body rỗng -> {}; JSON hỏng -> lỗi 400. */
export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text) return {};
  try {
    const body = JSON.parse(text);
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch {
    /* rơi xuống lỗi bên dưới */
  }
  throw new GameError(400, 'bad_request', 'JSON không hợp lệ');
}
