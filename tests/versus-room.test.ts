import { describe, expect, test } from 'vitest';
import { VERSUS } from '@/lib/versus/config';
import { RoomMachine } from '@/lib/versus/room';

const T0 = 1_000_000;
const ANSWER = 'vũ trụ'; // cấu trúc [2, 3]
const WRONG = 'ba mơi'; // sai nhưng đúng cấu trúc [2, 3]

function join(m: RoomMachine, id: string, name = id, now = T0) {
  expect(m.connect(id, name, now)).toEqual({ ok: true });
}
/** hai người a, b ngồi bàn */
function twoAtTable(m = RoomMachine.create(1)) {
  join(m, 'a', 'An');
  join(m, 'b', 'Bình');
  expect(m.sit('a', 0)).toEqual({ ok: true });
  expect(m.sit('b', 1)).toEqual({ ok: true });
  return m;
}
/** bắt đầu ván: Start -> hết 5s -> chọn từ khóa. Trả về thời điểm ván bắt đầu. */
function startMatch(m: RoomMachine, answer = ANSWER, now = T0) {
  expect(m.start('a', now)).toEqual({ ok: true });
  const t = now + VERSUS.countdownMs;
  expect(m.tick(t).needAnswer).toBe(true);
  expect(m.beginMatch(answer, t)).toBe(true);
  return t;
}
const code = (r: { ok: boolean; code?: string }) => (r.ok ? 'ok' : r.code);
const view = (m: RoomMachine, id: string, now = T0) => m.viewFor(id, now)!;

describe('vào phòng', () => {
  test('người mới vào Sảnh chờ, tên được chuẩn hoá', () => {
    const m = RoomMachine.create(1);
    join(m, 'a', '  An   Nguyễn ');
    expect(view(m, 'a')).toMatchObject({ youName: 'An Nguyễn', youSeat: null, lobby: ['An Nguyễn'], phase: 'idle' });
  });

  test('tên trống bị từ chối; tên trùng tự thêm hậu tố, không phân biệt hoa thường', () => {
    const m = RoomMachine.create(1);
    expect(code(m.connect('a', '   ', T0))).toBe('bad_name');
    expect(m.has('a')).toBe(false);
    join(m, 'a', 'An');
    join(m, 'b', 'an');
    join(m, 'c', 'AN');
    expect([view(m, 'a').youName, view(m, 'b').youName, view(m, 'c').youName]).toEqual(['An', 'an (2)', 'AN (3)']);
    join(m, 'd', 'x'.repeat(20));
    join(m, 'e', 'x'.repeat(20));
    expect(view(m, 'e').youName).toHaveLength(VERSUS.nameMax);
    expect(view(m, 'e').youName.endsWith(' (2)')).toBe(true);
  });

  test('Sảnh chờ tối đa 10 người; người ngồi bàn không tính vào 10 (phòng tối đa 16)', () => {
    const m = RoomMachine.create(1);
    for (let i = 0; i < VERSUS.lobbyMax; i++) join(m, `p${i}`);
    expect(code(m.connect('extra', 'extra', T0))).toBe('room_full');
    for (let i = 0; i < VERSUS.seats; i++) expect(m.sit(`p${i}`, i)).toEqual({ ok: true });
    // sảnh còn 4 người, nhận thêm cho tới khi đủ 10 ở sảnh
    for (let i = 0; i < VERSUS.seats; i++) join(m, `q${i}`);
    expect(m.summary().players).toBe(VERSUS.lobbyMax + VERSUS.seats);
    expect(code(m.connect('extra', 'extra', T0))).toBe('room_full');
  });

  test('nối lại (cùng id) không bị tính là người mới và không bị chặn khi phòng đầy', () => {
    const m = RoomMachine.create(1);
    for (let i = 0; i < VERSUS.lobbyMax; i++) join(m, `p${i}`);
    expect(m.connect('p3', 'tên khác', T0)).toEqual({ ok: true });
    expect(view(m, 'p3').youName).toBe('p3');
    expect(m.summary().players).toBe(VERSUS.lobbyMax);
  });

  test('người chưa vào phòng thì không có view và không làm được gì', () => {
    const m = RoomMachine.create(1);
    expect(m.viewFor('ghost', T0)).toBeNull();
    expect(code(m.sit('ghost', 0))).toBe('unknown_player');
    expect(code(m.start('ghost', T0))).toBe('unknown_player');
  });
});

describe('Bàn chơi', () => {
  test('ngồi vào ô trống, đứng dậy về sảnh', () => {
    const m = RoomMachine.create(1);
    join(m, 'a', 'An');
    expect(m.sit('a', 2)).toEqual({ ok: true });
    expect(view(m, 'a')).toMatchObject({ youSeat: 2, lobby: [], seats: [null, null, 'An', null, null, null] });
    expect(m.stand('a')).toEqual({ ok: true });
    expect(view(m, 'a')).toMatchObject({ youSeat: null, lobby: ['An'], seats: Array(VERSUS.seats).fill(null) });
  });

  test('lỗi: ô đã có người, ô sai, đã ngồi rồi, chưa ngồi mà đứng dậy', () => {
    const m = RoomMachine.create(1);
    join(m, 'a');
    join(m, 'b');
    expect(m.sit('a', 0)).toEqual({ ok: true });
    expect(code(m.sit('b', 0))).toBe('seat_taken');
    expect(code(m.sit('b', VERSUS.seats))).toBe('bad_seat');
    expect(code(m.sit('b', -1))).toBe('bad_seat');
    expect(code(m.sit('a', 3))).toBe('already_seated');
    expect(code(m.stand('b'))).toBe('not_seated');
  });

  test('bàn đầy 6 người thì không còn ô trống', () => {
    const m = RoomMachine.create(1);
    for (let i = 0; i < VERSUS.seats + 1; i++) join(m, `p${i}`);
    for (let i = 0; i < VERSUS.seats; i++) expect(m.sit(`p${i}`, i)).toEqual({ ok: true });
    for (let seat = 0; seat < VERSUS.seats; seat++) expect(code(m.sit(`p${VERSUS.seats}`, seat))).toBe('seat_taken');
  });
});

describe('Start và đếm ngược', () => {
  test('cần từ 2 người ở bàn; chỉ người ngồi bàn bấm được', () => {
    const m = RoomMachine.create(1);
    join(m, 'a');
    join(m, 'b');
    join(m, 'c');
    m.sit('a', 0);
    expect(view(m, 'a').canStart).toBe(false);
    expect(code(m.start('a', T0))).toBe('not_enough_players');
    m.sit('b', 1);
    expect(view(m, 'a').canStart).toBe(true);
    expect(view(m, 'b').canStart).toBe(true);
    expect(view(m, 'c').canStart).toBe(false); // ở sảnh chỉ xem
    expect(code(m.start('c', T0))).toBe('not_seated');
    expect(code(m.start('b', T0))).toBe('ok'); // bất kỳ ai ở bàn đều bấm được
  });

  test('bấm Start đặt đếm ngược 5 giây; bấm lại khi đang đếm bị từ chối; canStart tắt', () => {
    const m = twoAtTable();
    expect(m.start('a', T0)).toEqual({ ok: true });
    expect(view(m, 'a')).toMatchObject({ phase: 'countdown', countdownEndsAt: T0 + 5000, canStart: false });
    expect(code(m.start('b', T0 + 1000))).toBe('already_counting');
    expect(m.nextWakeAt()).toBe(T0 + 5000);
  });

  test.each([
    ['có người ngồi thêm vào bàn', (m: RoomMachine) => { join(m, 'c', 'Chi', T0 + 1000); m.sit('c', 2); }],
    ['có người đứng dậy', (m: RoomMachine) => { m.stand('b'); }],
    ['có người rời phòng', (m: RoomMachine) => { m.leave('b', T0 + 1000); }],
    ['có người mất kết nối', (m: RoomMachine) => { m.disconnect('b', T0 + 1000); }],
  ])('đang đếm ngược mà %s thì dừng ngay và không có gì xảy ra nữa', (_name, change) => {
    const m = twoAtTable();
    m.start('a', T0);
    change(m);
    expect(view(m, 'a')).toMatchObject({ phase: 'idle', countdownEndsAt: null });
    expect(m.nextWakeAt()).toBeNull();
    expect(m.tick(T0 + 5000)).toEqual({ needAnswer: false, reviewWord: null });
    expect(view(m, 'a').phase).toBe('idle');
    expect(view(m, 'a').game).toBeNull();
  });

  test('sau khi bị hủy phải bấm Start lại mới đếm lại', () => {
    const m = twoAtTable();
    m.start('a', T0);
    join(m, 'c', 'Chi', T0 + 500);
    m.sit('c', 2); // hủy
    expect(m.start('c', T0 + 1000)).toEqual({ ok: true });
    expect(view(m, 'a').countdownEndsAt).toBe(T0 + 1000 + VERSUS.countdownMs);
  });

  test('người ở sảnh vào/ra không làm đổi đếm ngược (chỉ thay đổi số người ở BÀN mới hủy)', () => {
    const m = twoAtTable();
    m.start('a', T0);
    join(m, 'c', 'Chi', T0 + 1000);
    expect(view(m, 'a').phase).toBe('countdown');
    m.disconnect('c', T0 + 2000);
    expect(view(m, 'a').phase).toBe('countdown');
  });

  test('chưa tới 5 giây thì chưa bắt đầu; tới hạn thì khóa bàn và cần chọn từ khóa', () => {
    const m = twoAtTable();
    m.start('a', T0);
    expect(m.tick(T0 + 4999).needAnswer).toBe(false);
    expect(view(m, 'a').phase).toBe('countdown');
    expect(m.tick(T0 + 5000).needAnswer).toBe(true);
    expect(view(m, 'a').phase).toBe('starting');
    expect(code(m.sit('a', 3))).toBe('table_locked');
    expect(code(m.stand('a'))).toBe('table_locked');
    expect(code(m.start('b', T0 + 5000))).toBe('room_busy');
  });

  test('chọn từ khóa không được thì hủy ván, bàn mở lại', () => {
    const m = twoAtTable();
    m.start('a', T0);
    m.tick(T0 + 5000);
    m.failStart();
    expect(view(m, 'a')).toMatchObject({ phase: 'idle', youSeat: 0 });
    expect(m.beginMatch(ANSWER, T0 + 5000)).toBe(false); // không còn ở pha starting
  });

  test('trong lúc chọn từ khóa mà bàn còn dưới 2 người thì hủy ván', () => {
    const m = twoAtTable();
    m.start('a', T0);
    m.tick(T0 + 5000);
    m.disconnect('b', T0 + 5100);
    expect(m.beginMatch(ANSWER, T0 + 5200)).toBe(false);
    expect(view(m, 'a').phase).toBe('idle');
  });

  test('từ khóa chọn sẵn (REVIEW_MODE) đi theo lần Start và bị xóa khi hủy', () => {
    const m = twoAtTable();
    m.start('a', T0, 'vũ trụ');
    expect(m.tick(T0 + 5000)).toEqual({ needAnswer: true, reviewWord: 'vũ trụ' });
    const m2 = twoAtTable();
    m2.start('a', T0, 'vũ trụ');
    m2.stand('b');
    m2.start('a', T0 + 10); // hết người: không đủ 2
    expect(m2.state.reviewWord).toBeNull();
  });
});

describe('ván đấu', () => {
  test('bắt đầu: những người ở bàn vào ván với cùng một từ khóa, mỗi người chưa có lượt nào', () => {
    const m = twoAtTable();
    join(m, 'c', 'Chi');
    const t = startMatch(m);
    expect(view(m, 'a')).toMatchObject({ phase: 'playing', game: { structure: [2, 3], maxTurns: 6, startedAt: t, endsAt: t + VERSUS.matchMaxMs, yourRows: [], yourStatus: 'playing', result: null } });
    expect(view(m, 'a').game!.players).toEqual([
      { name: 'An', turns: 0, status: 'playing', isYou: true },
      { name: 'Bình', turns: 0, status: 'playing', isYou: false },
    ]);
    expect(view(m, 'c').game).toBeNull(); // người ở sảnh chỉ xem
    expect(view(m, 'c').seats.slice(0, 2)).toEqual(['An', 'Bình']);
  });

  test('lượt không hợp lệ bị từ chối và không mất lượt', () => {
    const m = twoAtTable();
    startMatch(m);
    expect(code(m.guess('a', 'ba', T0 + 6000))).toBe('incomplete');
    expect(code(m.guess('a', 'ba mơi chín', T0 + 6000))).toBe('wrong_structure');
    expect(code(m.guess('a', 'wa mơi', T0 + 6000))).toBe('invalid_chars');
    expect(code(m.guess('a', 42, T0 + 6000))).toBe('bad_request');
    expect(view(m, 'a').game!.players[0].turns).toBe(0);
    expect(m.guess('a', WRONG, T0 + 6000)).toEqual({ ok: true });
    expect(view(m, 'a').game).toMatchObject({ yourRows: [{ cells: ['b', 'a', 'm', 'ơ', 'i'], statuses: expect.any(Array) }] });
    expect(view(m, 'a').game!.players[0].turns).toBe(1);
    expect(view(m, 'b').game!.players[0]).toEqual({ name: 'An', turns: 1, status: 'playing', isYou: false });
  });

  test('chưa có ván / không tham gia ván thì không đoán được', () => {
    const m = twoAtTable();
    join(m, 'c', 'Chi');
    expect(code(m.guess('a', WRONG, T0))).toBe('no_game');
    startMatch(m);
    expect(code(m.guess('c', WRONG, T0 + 6000))).toBe('not_in_match');
    expect(code(m.guess('ghost', WRONG, T0 + 6000))).toBe('not_in_match');
  });

  test('người đoán đúng đầu tiên thắng: mọi người về Sảnh chờ, bàn trống, phòng khóa 10 giây', () => {
    const m = twoAtTable();
    join(m, 'c', 'Chi');
    const t = startMatch(m);
    m.guess('b', WRONG, t + 1000);
    expect(m.guess('a', ANSWER, t + 2000)).toEqual({ ok: true });
    const lockUntil = t + 2000 + VERSUS.resultLockMs;
    expect(view(m, 'a', t + 2000)).toMatchObject({ phase: 'locked', lockedUntil: lockUntil, youSeat: null, seats: Array(VERSUS.seats).fill(null) });
    expect(view(m, 'a').lobby.sort()).toEqual(['An', 'Bình', 'Chi']);
    expect(view(m, 'a').game!.result).toEqual({ word: ANSWER, winnerName: 'An', youWon: true, reason: 'won' });
    expect(view(m, 'b').game!.result).toEqual({ word: ANSWER, winnerName: 'An', youWon: false, reason: 'won' });
    expect(view(m, 'c').game).toBeNull();
    expect(view(m, 'c').lastResult).toEqual({ word: ANSWER, winnerName: 'An', endedAt: t + 2000 });
    expect(m.nextWakeAt()).toBe(lockUntil);
  });

  test('trong lúc phòng khóa không ngồi bàn, không Start, không đoán thêm được; hết 10s thì mở lại', () => {
    const m = twoAtTable();
    const t = startMatch(m);
    m.guess('a', ANSWER, t + 1000);
    expect(code(m.sit('a', 0))).toBe('table_locked');
    expect(code(m.start('a', t + 1000))).toBe('room_busy');
    expect(code(m.guess('b', WRONG, t + 1500))).toBe('no_game');
    m.tick(t + 1000 + VERSUS.resultLockMs - 1);
    expect(view(m, 'a').phase).toBe('locked');
    m.tick(t + 1000 + VERSUS.resultLockMs);
    expect(view(m, 'a')).toMatchObject({ phase: 'idle', lockedUntil: null, game: null });
    expect(view(m, 'a').lastResult?.winnerName).toBe('An'); // kết quả lượt trước còn đó cho tới lượt sau
    expect(m.sit('a', 0)).toEqual({ ok: true });
  });

  test('hết 6 lượt', () => {
    const m = twoAtTable();
    const t = startMatch(m);
    for (let i = 0; i < VERSUS.maxTurns; i++) m.guess('a', WRONG, t + 1000 + i);
    expect(view(m, 'a').game).toMatchObject({ yourStatus: 'out' });
    expect(code(m.guess('a', WRONG, t + 2000))).toBe('already_done');
    expect(view(m, 'a').phase).toBe('playing'); // b vẫn còn lượt: ván tiếp tục
  });

  test('mọi người hết 6 lượt mà không ai đúng: ván kết thúc, không có người thắng', () => {
    const m = twoAtTable();
    const t = startMatch(m);
    for (let i = 0; i < VERSUS.maxTurns; i++) {
      m.guess('a', WRONG, t + 1000 + i);
      m.guess('b', WRONG, t + 1000 + i);
    }
    expect(view(m, 'a')).toMatchObject({ phase: 'locked', game: { result: { word: ANSWER, winnerName: null, youWon: false, reason: 'exhausted' } } });
    expect(view(m, 'a').lastResult).toMatchObject({ word: ANSWER, winnerName: null });
  });

  test('một người rời giữa ván thì bị loại, người còn lại đoán tiếp (còn 1 người cũng không tự thắng)', () => {
    const m = twoAtTable();
    const t = startMatch(m);
    m.guess('a', WRONG, t + 1000);
    m.leave('b', t + 2000);
    expect(view(m, 'a').phase).toBe('playing');
    expect(view(m, 'a').game!.players.find((p) => p.name === 'Bình')!.status).toBe('left');
    expect(m.guess('a', WRONG, t + 3000)).toEqual({ ok: true });
    expect(view(m, 'a').phase).toBe('playing');
    for (let i = 0; i < VERSUS.maxTurns - 2; i++) m.guess('a', WRONG, t + 4000 + i);
    expect(view(m, 'a').game!.result).toMatchObject({ winnerName: null, reason: 'exhausted' }); // hết lượt, không ai thắng
  });

  test('tất cả cùng rời thì ván kết thúc không có người thắng', () => {
    const m = twoAtTable();
    join(m, 'c', 'Chi');
    const t = startMatch(m);
    m.leave('a', t + 1000);
    m.leave('b', t + 1500);
    expect(view(m, 'c')).toMatchObject({ phase: 'locked', lastResult: { word: ANSWER, winnerName: null } });
  });

  test('mất kết nối giữa ván: chờ 30 giây, nối lại trong hạn thì giữ nguyên ván', () => {
    const m = twoAtTable();
    const t = startMatch(m);
    m.guess('a', WRONG, t + 1000);
    m.disconnect('a', t + 2000);
    expect(m.has('a')).toBe(true);
    expect(m.nextWakeAt()).toBe(t + 2000 + VERSUS.reconnectGraceMs);
    m.tick(t + 2000 + VERSUS.reconnectGraceMs - 1);
    expect(m.connect('a', 'An', t + 20_000)).toEqual({ ok: true });
    expect(view(m, 'a').game!.yourRows).toHaveLength(1);
    m.tick(t + 60_000);
    expect(m.has('a')).toBe(true); // đã nối lại, không bị loại
    expect(m.nextWakeAt()).toBe(t + VERSUS.matchMaxMs);
  });

  test('mất kết nối quá 30 giây thì bị loại khỏi ván; nối lại sau đó là người mới ở sảnh', () => {
    const m = twoAtTable();
    const t = startMatch(m);
    m.disconnect('a', t + 2000);
    m.tick(t + 2000 + VERSUS.reconnectGraceMs);
    expect(m.has('a')).toBe(false);
    expect(view(m, 'b').game!.players.find((p) => p.name === 'An')!.status).toBe('left');
    expect(m.connect('a', 'An', t + 40_000)).toEqual({ ok: true });
    expect(view(m, 'a')).toMatchObject({ youSeat: null, game: null });
  });

  test('ván quá 10 phút thì kết thúc, không có người thắng', () => {
    const m = twoAtTable();
    const t = startMatch(m);
    m.guess('a', WRONG, t + 1000);
    m.tick(t + VERSUS.matchMaxMs - 1);
    expect(view(m, 'a').phase).toBe('playing');
    m.tick(t + VERSUS.matchMaxMs);
    expect(view(m, 'a')).toMatchObject({ phase: 'locked', game: { result: { winnerName: null, reason: 'timeout' } } });
  });

  test('người đang chờ nối lại mà ván vừa kết thúc thì coi như đã rời', () => {
    const m = twoAtTable();
    const t = startMatch(m);
    m.disconnect('b', t + 1000);
    m.guess('a', ANSWER, t + 2000);
    expect(m.has('b')).toBe(false);
    expect(view(m, 'a').game!.players.find((p) => p.name === 'Bình')!.status).toBe('left');
  });

  test('người vào phòng giữa ván vào Sảnh chờ và chỉ xem', () => {
    const m = twoAtTable();
    const t = startMatch(m);
    join(m, 'c', 'Chi', t + 1000);
    expect(view(m, 'c', t + 1000)).toMatchObject({ phase: 'playing', youSeat: null, game: null });
    expect(code(m.sit('c', 3))).toBe('table_locked');
    m.guess('a', ANSWER, t + 2000);
    expect(view(m, 'c').lastResult?.winnerName).toBe('An');
  });

  test('sau ván, người từ bàn về sảnh luôn được nhận dù sảnh có thể vượt 10; người mới vẫn bị chặn', () => {
    const m = RoomMachine.create(1);
    for (let i = 0; i < VERSUS.seats; i++) {
      join(m, `s${i}`);
      m.sit(`s${i}`, i);
    }
    for (let i = 0; i < VERSUS.lobbyMax; i++) join(m, `l${i}`);
    expect(m.start('s0', T0)).toEqual({ ok: true });
    m.tick(T0 + 5000);
    m.beginMatch(ANSWER, T0 + 5000);
    m.guess('s0', ANSWER, T0 + 6000);
    expect(view(m, 'l0').lobby).toHaveLength(VERSUS.seats + VERSUS.lobbyMax);
    expect(code(m.connect('late', 'late', T0 + 7000))).toBe('room_full');
  });
});

describe('khởi động lại Durable Object', () => {
  test('ai không còn kết nối: ở sảnh/bàn thì rời, đang trong ván thì chờ nối lại', () => {
    const m = twoAtTable();
    join(m, 'c', 'Chi');
    join(m, 'd', 'Dũng');
    const t = startMatch(m);
    m.reconcile(new Set(['b']), t + 1000); // a (đang đấu), c, d (ở sảnh) mất kết nối
    expect(m.has('a')).toBe(true);
    expect(m.has('c')).toBe(false);
    expect(m.has('d')).toBe(false);
    expect(m.state.players.find((p) => p.id === 'a')!.disconnectedAt).toBe(t + 1000);
    expect(m.state.players.find((p) => p.id === 'b')!.disconnectedAt).toBeNull();
  });
});

describe('khôi phục sau khi khởi động lại (tiếp)', () => {
  test('đang chọn từ khóa (starting) mà DO khởi động lại thì hủy, bàn mở lại', () => {
    const m = twoAtTable();
    m.start('a', T0);
    m.tick(T0 + 5000);
    expect(view(m, 'a').phase).toBe('starting');
    m.reconcile(new Set(['a', 'b']), T0 + 6000);
    expect(view(m, 'a')).toMatchObject({ phase: 'idle', youSeat: 0 });
  });

  test('sau khởi động lại giữa ván: mốc đánh thức gồm hạn chờ nối lại của người mất kết nối', () => {
    const m = twoAtTable();
    const t = startMatch(m);
    m.reconcile(new Set(['b']), t + 1000); // a mất kết nối
    expect(m.nextWakeAt()).toBe(t + 1000 + VERSUS.reconnectGraceMs);
    m.tick(t + 1000 + VERSUS.reconnectGraceMs);
    expect(m.has('a')).toBe(false); // hết hạn: bị loại, dù không có sự kiện nào khác xảy ra
  });
});

describe('nextWakeAt và tổng quan phòng', () => {
  test('mỗi pha có mốc đánh thức đúng', () => {
    const m = twoAtTable();
    expect(m.nextWakeAt()).toBeNull();
    m.start('a', T0);
    expect(m.nextWakeAt()).toBe(T0 + 5000);
    m.tick(T0 + 5000);
    expect(m.nextWakeAt()).toBeNull(); // đang chọn từ khóa (bất đồng bộ), không cần alarm
    m.beginMatch(ANSWER, T0 + 5100);
    expect(m.nextWakeAt()).toBe(T0 + 5100 + VERSUS.matchMaxMs);
    m.disconnect('a', T0 + 6000);
    expect(m.nextWakeAt()).toBe(T0 + 6000 + VERSUS.reconnectGraceMs);
  });

  test('summary: số người và trạng thái', () => {
    const m = RoomMachine.create(3);
    expect(m.summary()).toEqual({ id: 3, name: 'Room #3', players: 0, status: 'waiting' });
    expect(m.isEmpty).toBe(true);
    twoAtTable(m);
    expect(m.summary()).toEqual({ id: 3, name: 'Room #3', players: 2, status: 'waiting' });
    startMatch(m);
    expect(m.summary().status).toBe('playing');
  });
});

describe('không lộ thông tin trước khi ván kết thúc', () => {
  // View lưu chữ theo từng ô (["c","a","l","ơ","i"]) nên kiểm tra theo mảng ô và theo các chữ chỉ có trong đáp án "vũ trụ".
  const SECRET_GUESS = 'ca lơi'; // lượt đoán riêng của An, đối thủ không được thấy chữ
  const SECRET_CELLS = JSON.stringify(['c', 'a', 'l', 'ơ', 'i']);
  const ANSWER_CELLS = JSON.stringify(['v', 'ũ', 't', 'r', 'ụ']);
  const ANSWER_ONLY_LETTERS = ['ũ', 'ụ']; // không có trong WRONG ('ba mơi') hay SECRET_GUESS ('ca lơi')

  test('mọi view (người chơi, đối thủ, người xem) không chứa đáp án hay chữ của lượt đoán người khác', () => {
    const m = twoAtTable();
    join(m, 'c', 'Chi');
    const t = startMatch(m);
    m.guess('a', SECRET_GUESS, t + 1000);
    m.guess('b', WRONG, t + 2000);
    const json = (id: string) => JSON.stringify(view(m, id, t + 3000));
    for (const id of ['a', 'b', 'c']) {
      expect(json(id), `view của ${id}`).not.toContain(ANSWER);
      expect(json(id), `view của ${id}`).not.toContain(ANSWER_CELLS);
      for (const letter of ANSWER_ONLY_LETTERS) expect(json(id), `view của ${id} lộ chữ ${letter}`).not.toContain(letter);
    }
    expect(json('a')).toContain(SECRET_CELLS); // lượt đoán của chính mình thì thấy
    expect(json('b')).not.toContain(SECRET_CELLS); // đối thủ không thấy chữ của An
    expect(json('c')).not.toContain(SECRET_CELLS);
    expect(json('b')).toContain(JSON.stringify(['b', 'a', 'm', 'ơ', 'i'])); // nhưng thấy của chính mình
    expect(json('c')).not.toContain(JSON.stringify(['b', 'a', 'm', 'ơ', 'i']));
    // đối thủ chỉ thấy tên + số lượt + trạng thái
    expect(view(m, 'b', t + 3000).game!.players[0]).toEqual({ name: 'An', turns: 1, status: 'playing', isYou: false });
  });

  test('không lộ đáp án trong lúc đếm ngược/chọn từ khóa; chỉ lộ khi ván kết thúc', () => {
    const m = twoAtTable();
    m.start('a', T0, ANSWER);
    for (const letter of ANSWER_ONLY_LETTERS) expect(JSON.stringify(view(m, 'a'))).not.toContain(letter); // kể cả từ chọn sẵn (REVIEW_MODE) cũng không lộ
    m.tick(T0 + 5000);
    m.beginMatch(ANSWER, T0 + 5000);
    expect(JSON.stringify(view(m, 'b'))).not.toContain(ANSWER);
    m.guess('a', ANSWER, T0 + 6000);
    expect(JSON.stringify(view(m, 'b'))).toContain('vũ trụ');
  });

  test('phần lưu trong state có đáp án nhưng view thì không (state chỉ nằm trong Durable Object)', () => {
    const m = twoAtTable();
    startMatch(m);
    expect(JSON.stringify(m.state)).toContain(ANSWER);
    expect(JSON.stringify(view(m, 'a'))).not.toContain(ANSWER);
  });
});
