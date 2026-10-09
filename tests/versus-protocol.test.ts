import { describe, expect, test } from 'vitest';
import { VERSUS, isRoomId, roomName } from '@/lib/versus/config';
import { MAX_MESSAGE_CHARS, isValidPlayerId, parseClientMessage, sanitizeName } from '@/lib/versus/protocol';

describe('cấu hình', () => {
  test('5 room, tên Room #n, id hợp lệ chỉ 1..5', () => {
    expect(VERSUS.roomCount).toBe(5);
    expect(roomName(3)).toBe('Room #3');
    expect([0, 1, 5, 6, 1.5, NaN].map(isRoomId)).toEqual([false, true, true, false, false, false]);
  });
});

describe('tên người chơi', () => {
  test('cắt khoảng trắng, gộp khoảng trắng liên tiếp, giữ nguyên chữ có dấu', () => {
    expect(sanitizeName('  Nguyễn   Văn   An ')).toBe('Nguyễn Văn An');
    expect(sanitizeName('An')).toBe('An');
  });

  test('tên trống/chỉ khoảng trắng/ký tự điều khiển/không phải chuỗi bị từ chối', () => {
    for (const bad of ['', '   ', '\n\t', '\u0000\u0007', null, undefined, 42, {}]) expect(sanitizeName(bad), JSON.stringify(bad)).toBeNull();
  });

  test('tối đa 20 ký tự (tính theo ký tự, không cắt giữa emoji)', () => {
    expect(sanitizeName('a'.repeat(50))).toBe('a'.repeat(20));
    expect(Array.from(sanitizeName('😀'.repeat(30))!)).toHaveLength(20);
    expect(sanitizeName('a'.repeat(19) + ' ' + 'b'.repeat(10))).toBe('a'.repeat(19)); // không để lại khoảng trắng thừa ở cuối
  });

  test('ký tự điều khiển giữa tên được đổi thành dấu cách', () => {
    expect(sanitizeName('An\u0000Bình')).toBe('An Bình');
  });
});

describe('id người chơi', () => {
  test('8–64 ký tự chữ/số/gạch ngang', () => {
    expect(isValidPlayerId('3f2b8c1e-aaaa-4bbb-8ccc-1234567890ab')).toBe(true);
    for (const bad of ['', 'short', 'a'.repeat(65), 'có dấu 12345678', 'a b c d e f g', '../../etc/passwd', 123, null]) expect(isValidPlayerId(bad), String(bad)).toBe(false);
  });
});

describe('tin nhắn từ client', () => {
  const parse = (m: unknown) => parseClientMessage(typeof m === 'string' ? m : JSON.stringify(m));

  test('các lệnh hợp lệ', () => {
    expect(parse({ type: 'sit', seat: 0 })).toEqual({ type: 'sit', seat: 0 });
    expect(parse({ type: 'sit', seat: VERSUS.seats - 1 })).toEqual({ type: 'sit', seat: VERSUS.seats - 1 });
    expect(parse({ type: 'stand' })).toEqual({ type: 'stand' });
    expect(parse({ type: 'start' })).toEqual({ type: 'start' });
    expect(parse({ type: 'start', word: 'vũ trụ' })).toEqual({ type: 'start', word: 'vũ trụ' });
    expect(parse({ type: 'leave' })).toEqual({ type: 'leave' });
    expect(parse({ type: 'guess', guess: 'vũ trụ' })).toEqual({ type: 'guess', guess: 'vũ trụ' });
  });

  test('sai định dạng thì null', () => {
    const bad = [
      'không phải json', '{', 'null', '[]', '42', '"sit"', '{}', { type: 'khác' }, { type: 'sit' }, { type: 'sit', seat: -1 },
      { type: 'sit', seat: VERSUS.seats }, { type: 'sit', seat: 1.5 }, { type: 'sit', seat: '1' }, { type: 'guess' }, { type: 'guess', guess: 5 },
    ];
    for (const m of bad) expect(parse(m), JSON.stringify(m)).toBeNull();
    expect(parseClientMessage(123)).toBeNull();
    expect(parseClientMessage(undefined)).toBeNull();
  });

  test('tin quá dài bị bỏ qua', () => {
    expect(parse({ type: 'guess', guess: 'a'.repeat(MAX_MESSAGE_CHARS) })).toBeNull();
  });

  test('trường thừa/word không phải chuỗi không làm hỏng lệnh', () => {
    expect(parse({ type: 'start', word: 5 })).toEqual({ type: 'start' });
    expect(parse({ type: 'stand', extra: 1 })).toEqual({ type: 'stand' });
  });
});
