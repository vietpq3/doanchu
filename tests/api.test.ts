// Gọi thẳng Route Handler: lượt đoán được kiểm tra và chấm ở server.
// Dữ liệu dùng repository trong bộ nhớ (tests/memory-repository.ts), không gọi Supabase.
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, test } from 'vitest';
import * as createRoute from '@/app/api/games/route';
import * as guessRoute from '@/app/api/games/[id]/guesses/route';
import * as hintRoute from '@/app/api/games/[id]/hints/route';
import * as startRoute from '@/app/api/games/start/route';
import type { PublicGame } from '@/lib/game/types';
import { getGame } from '@/lib/server/games';
import { setRepositoryForTests } from '@/lib/server/repository';
import { createMemoryRepository } from './memory-repository';

let repo: ReturnType<typeof createMemoryRepository>;
beforeEach(() => {
  process.env.REVIEW_MODE = '1';
  repo = createMemoryRepository({
    'vũ trụ': { keyword: true, definitions: [{ pos: 'Danh từ', text: 'khoảng không gian vô cùng tận chứa các thiên hà' }] },
    'hòa bình': { keyword: true, definitions: [{ pos: 'Danh từ', text: 'tình trạng yên ổn, không có chiến tranh' }] },
    'con mèo': { definitions: [{ pos: 'Danh từ', text: 'thú nuôi bắt chuột' }] }, // có trong từ điển nhưng không phải từ khóa
  });
  setRepositoryForTests(repo);
});

const request = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

async function newGame(body: unknown = {}) {
  const res = await createRoute.POST(request('/api/games', body));
  return { status: res.status, cookie: res.headers.get('set-cookie'), game: (await res.json()) as PublicGame };
}
async function guess(id: string, text: unknown) {
  const res = await guessRoute.POST(request(`/api/games/${id}/guesses`, { guess: text }), { params: Promise.resolve({ id }) });
  return { status: res.status, body: await res.json() };
}

async function hint(id: string) {
  const res = await hintRoute.POST(request(`/api/games/${id}/hints`, {}), { params: Promise.resolve({ id }) });
  return { status: res.status, cookie: res.headers.get('set-cookie'), body: await res.json() };
}

describe('tạo ván', () => {
  test('không lộ từ khóa, ghi id ván vào cookie', async () => {
    const { status, cookie, game } = await newGame();
    expect(status).toBe(201);
    expect(game.answer).toBeUndefined();
    expect(game.definitions).toBeUndefined();
    expect(game.structure.length).toBeGreaterThanOrEqual(2);
    expect(game).toMatchObject({ hints: [], maxHints: 3 });
    expect(cookie).toContain(`dc_game=${game.id}`);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  test('chọn sẵn từ khóa chỉ được khi REVIEW_MODE=1', async () => {
    process.env.REVIEW_MODE = '0';
    expect((await newGame({ word: 'vũ trụ' })).status).toBe(403);
    process.env.REVIEW_MODE = '1';
    expect((await newGame({ word: 'không có từ này' })).status).toBe(400);
    expect((await newGame({ word: 'hoà bình' })).game.structure).toEqual([3, 4]);
  });
});

describe('kiểm tra lượt đoán ở server', () => {
  test('thiếu chữ, ký tự lạ, sai cấu trúc bị từ chối và không tính lượt', async () => {
    const { game } = await newGame({ word: 'vũ trụ' });
    expect((await guess(game.id, 'vũ tr')).body.error).toBe('incomplete');
    expect((await guess(game.id, '')).body.error).toBe('incomplete');
    expect((await guess(game.id, 'wũ trụ')).body.error).toBe('invalid_chars');
    expect((await guess(game.id, 'vũtrụ')).body.error).toBe('wrong_structure');
    expect((await guess(game.id, 42)).body.error).toBe('bad_request');
    expect(repo.games.get(game.id)!.turns).toBe(0);
  });

  test('không kiểm tra từ điển: chuỗi chữ không có nghĩa vẫn được chấm', async () => {
    const { game } = await newGame({ word: 'vũ trụ' });
    const res = await guess(game.id, 'vũ trừ');
    expect(res.status).toBe(200);
    // ừ (chữ ư) khác ụ (chữ u) nên xám
    expect(res.body.rows).toEqual([{ cells: ['v', 'ũ', 't', 'r', 'ừ'], statuses: ['correct', 'correct', 'correct', 'correct', 'absent'] }]);
    expect(res.body.answer).toBeUndefined();
  });

  test('thắng: trả từ khóa + giải nghĩa; sau đó không nhận thêm lượt', async () => {
    const { game } = await newGame({ word: 'hòa bình' });
    const win = await guess(game.id, 'hoà bình'); // gõ kiểu mới vẫn đúng
    expect(win.body).toMatchObject({ over: true, won: true, answer: 'hòa bình' });
    expect(win.body.definitions).toHaveLength(1);
    const again = await guess(game.id, 'hòa bình');
    expect([again.status, again.body.error]).toEqual([409, 'game_over']);
  });

  test('hết 6 lượt thì thua và công bố từ khóa', async () => {
    const { game } = await newGame({ word: 'hòa bình' });
    let last;
    for (const w of ['anh dũng', 'anh hùng', 'anh linh', 'anh minh', 'ban bạch', 'ban công']) last = await guess(game.id, w);
    expect(last!.body).toMatchObject({ over: true, won: false, answer: 'hòa bình' });
    expect(last!.body.rows).toHaveLength(6);
  });

  test('ván không tồn tại', async () => {
    const res = await guess('00000000-0000-0000-0000-000000000000', 'vũ trụ');
    expect([res.status, res.body.error]).toEqual([404, 'game_not_found']);
    expect((await guess('../../etc', 'vũ trụ')).status).toBe(404);
  });
});

describe('gợi ý (nút Hint)', () => {
  test('lộ đúng một chữ của ô được gợi ý, không lộ từ khóa, không mất lượt', async () => {
    const { game } = await newGame({ word: 'vũ trụ' });
    const res = await hint(game.id);
    expect(res.status).toBe(200);
    expect(res.cookie).toContain(`dc_game=${game.id}`);
    expect(res.body.answer).toBeUndefined();
    expect(res.body.hints).toHaveLength(1);
    const { index, ch } = res.body.hints[0];
    expect(ch).toBe(['v', 'ũ', 't', 'r', 'ụ'][index]);
    expect(res.body).toMatchObject({ maxHints: 3, rows: [], over: false });
    expect(repo.games.get(game.id)!.turns).toBe(0);
  });

  test('không gợi ý ô đã xanh lá', async () => {
    const { game } = await newGame({ word: 'vũ trụ' });
    await guess(game.id, 'vũ trừ'); // 4 ô đầu xanh lá, ô cuối (ụ) xám
    const res = await hint(game.id);
    expect(res.body.hints).toEqual([{ index: 4, ch: 'ụ' }]);
  });

  test('tối đa 3 lần mỗi ván, mỗi lần một ô khác nhau; lần thứ 4 bị từ chối', async () => {
    const { game } = await newGame({ word: 'hòa bình' });
    for (let i = 0; i < 3; i++) expect((await hint(game.id)).status).toBe(200);
    const fourth = await hint(game.id);
    expect([fourth.status, fourth.body.error]).toEqual([409, 'no_hints_left']);
    const got = await getGame(game.id);
    expect(got!.hints).toHaveLength(3);
    expect(new Set(got!.hints.map((h) => h.index)).size).toBe(3);
  });

  test('tải lại ván vẫn thấy các gợi ý đã dùng; ván mới bắt đầu lại từ 3 lần', async () => {
    const { game } = await newGame({ word: 'hòa bình' });
    await hint(game.id);
    expect((await getGame(game.id))!.hints).toHaveLength(1);
    expect((await newGame({ word: 'hòa bình' })).game.hints).toEqual([]);
  });

  test('hết ô để gợi ý thì từ chối, không tính lần dùng', async () => {
    const { game } = await newGame({ word: 'vũ trụ' });
    await guess(game.id, 'vũ trừ'); // xanh lá các ô 0-3
    await guess(game.id, 'xũ trụ'); // xanh lá các ô 1-4, chưa thắng
    const res = await hint(game.id);
    expect([res.status, res.body.error]).toEqual([409, 'no_hint_available']);
    expect(repo.games.get(game.id)!.hints).toEqual([]);
  });

  test('gửi nhiều gợi ý song song chỉ ghi nhận một', async () => {
    const { game } = await newGame({ word: 'hòa bình' });
    const results = await Promise.all([hint(game.id), hint(game.id), hint(game.id), hint(game.id)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(repo.games.get(game.id)!.hints).toHaveLength(1);
  });

  test('ván đã kết thúc hoặc không tồn tại thì từ chối', async () => {
    const { game } = await newGame({ word: 'vũ trụ' });
    await guess(game.id, 'vũ trụ');
    const over = await hint(game.id);
    expect([over.status, over.body.error]).toEqual([409, 'game_over']);
    const missing = await hint('00000000-0000-0000-0000-000000000000');
    expect([missing.status, missing.body.error]).toEqual([404, 'game_not_found']);
    expect((await hint('../../etc')).status).toBe(404);
  });
});

describe('số thứ tự từ khóa (#N)', () => {
  test('ván ngẫu nhiên có số thứ tự và tổng số từ khóa; số giữ nguyên qua các lượt và khi tải lại', async () => {
    const { game } = await newGame();
    expect(game.keywordCount).toBe(2);
    expect([1, 2]).toContain(game.keywordNo);
    const rows = await guess(game.id, 'b'.repeat(game.structure[0]) + ' ' + 'b'.repeat(game.structure[1]));
    expect(rows.body).toMatchObject({ keywordNo: game.keywordNo, keywordCount: 2 });
    expect((await hint(game.id)).body.keywordNo).toBe(game.keywordNo);
    expect(await getGame(game.id)).toMatchObject({ keywordNo: game.keywordNo, keywordCount: 2 });
  });

  test('chọn số: ra đúng từ khóa đó, lần nào cũng vậy', async () => {
    const first = await newGame({ number: 2 });
    expect(first.status).toBe(201);
    expect(first.game).toMatchObject({ keywordNo: 2, structure: [3, 4] });
    expect(first.cookie).toContain(`dc_game=${first.game.id}`);
    expect((await guess(first.game.id, 'hòa bình')).body.answer).toBe('hòa bình');

    const again = await newGame({ number: 2 });
    expect(again.game.id).not.toBe(first.game.id); // là ván mới
    expect(again.game).toMatchObject({ keywordNo: 2, structure: [3, 4], rows: [], over: false });

    const other = await newGame({ number: 1 });
    expect(other.game).toMatchObject({ keywordNo: 1, structure: [2, 3] });
    expect((await guess(other.game.id, 'vũ trụ')).body).toMatchObject({ won: true, answer: 'vũ trụ', keywordNo: 1 });
  });

  test('số không có trong bộ từ khóa: báo lỗi kèm khoảng được chọn, không tạo ván', async () => {
    const before = repo.games.size;
    const res = await createRoute.POST(request('/api/games', { number: 3 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'keyword_not_found', message: 'Không có từ khóa số 3; chọn số từ 1 đến 2' });
    expect(repo.games.size).toBe(before);
  });

  test('số không hợp lệ bị từ chối', async () => {
    for (const number of [0, -1, 1.5, '2', null, true, [1], 2 ** 31, 1e21]) {
      const res = await createRoute.POST(request('/api/games', { number }));
      expect([number, res.status, (await res.json()).error]).toEqual([number, 400, 'bad_request']);
    }
    expect(repo.games.size).toBe(0);
  });

  test('chọn sẵn từ khóa bằng word (REVIEW_MODE): có số nếu là từ khóa, không có số nếu chỉ là từ trong từ điển', async () => {
    expect((await newGame({ word: 'hoà bình' })).game.keywordNo).toBe(2);
    expect((await newGame({ word: 'con mèo' })).game.keywordNo).toBeNull();
  });
});

describe('GET /api/games/start?id=N (đích chuyển hướng của /?id=N)', () => {
  const start = async (query: string) => {
    const res = await startRoute.GET(new NextRequest(`http://localhost/api/games/start${query}`));
    return { status: res.status, location: res.headers.get('location'), cookie: res.headers.get('set-cookie'), cache: res.headers.get('cache-control') };
  };

  test('tạo ván mới với từ khóa số N, ghi cookie ván đó và chuyển về "/"', async () => {
    const res = await start('?id=2');
    expect([res.status, res.location, res.cache]).toEqual([303, '/', 'no-store']);
    expect(repo.games.size).toBe(1);
    const [created] = [...repo.games.values()];
    expect(created).toMatchObject({ answer: 'hòa bình', keywordNo: 2, over: false });
    expect(res.cookie).toContain(`dc_game=${created.id}`);
    expect(res.cookie).toMatch(/HttpOnly/i);
    // về tới "/" rồi tải lại: ván trong cookie được tiếp tục, vẫn là từ khóa số 2
    expect(await getGame(created.id)).toMatchObject({ keywordNo: 2, structure: [3, 4], rows: [] });
  });

  test('mỗi lần mở là một ván mới (kể cả cùng số), từ khóa vẫn như cũ', async () => {
    const a = await start('?id=1');
    const b = await start('?id=1');
    expect(repo.games.size).toBe(2);
    expect(a.cookie).not.toEqual(b.cookie);
    expect([...repo.games.values()].map((g) => [g.answer, g.keywordNo])).toEqual([['vũ trụ', 1], ['vũ trụ', 1]]);
  });

  test('id không hợp lệ hoặc không có từ khóa số đó: không tạo ván, không ghi cookie, về "/"', async () => {
    for (const query of ['', '?id=', '?id=abc', '?id=0', '?id=-1', '?id=1.5', '?id=99999999999', '?id=3', '?id=2147483647']) {
      const res = await start(query);
      expect([query, res.status, res.location, res.cookie]).toEqual([query, 303, '/', null]);
    }
    expect(repo.games.size).toBe(0);
  });
});

