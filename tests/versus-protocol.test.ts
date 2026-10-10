import { describe, expect, test } from 'vitest';
import { VERSUS, isRoomId, roomName } from '@/lib/versus/config';
import { createSyllableValidator, isValidSyllable } from '@/lib/versus/syllable';
import { MAX_MESSAGE_CHARS, isChatError, isValidPlayerId, parseClientMessage, sanitizeChat, sanitizeName } from '@/lib/versus/protocol';

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
    expect(parse({ type: 'chat', text: 'Chào cả nhà!' })).toEqual({ type: 'chat', text: 'Chào cả nhà!' });
  });

  test('tin chat dài nhất (kể cả toàn ký tự phải escape trong JSON, hay emoji) vẫn lọt giới hạn kích thước', () => {
    for (const ch of ['a', '"', '\\', '😀', 'ữ']) {
      const text = Array.from({ length: VERSUS.chatMax }, () => ch).join('');
      expect(parse({ type: 'chat', text }), ch).toEqual({ type: 'chat', text });
    }
  });

  test('sai định dạng thì null', () => {
    const bad = [
      'không phải json', '{', 'null', '[]', '42', '"sit"', '{}', { type: 'khác' }, { type: 'sit' }, { type: 'sit', seat: -1 },
      { type: 'sit', seat: VERSUS.seats }, { type: 'sit', seat: 1.5 }, { type: 'sit', seat: '1' }, { type: 'guess' }, { type: 'guess', guess: 5 },
      { type: 'chat' }, { type: 'chat', text: 5 }, { type: 'chat', text: ['a'] },
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

describe('tin chat', () => {
  test('cắt khoảng trắng, gộp khoảng trắng, giữ nguyên chữ có dấu, emoji và ký tự đặc biệt', () => {
    expect(sanitizeChat('  Chào   cả nhà!  ')).toBe('Chào cả nhà!');
    expect(sanitizeChat('<b>đậm</b> & "trích" 😀👍🏽')).toBe('<b>đậm</b> & "trích" 😀👍🏽');
  });

  test('tin trống/chỉ khoảng trắng/ký tự điều khiển/không phải chuỗi bị từ chối', () => {
    for (const bad of ['', '   ', '\n\t\r', '\u0000\u0007', '​﻿', null, undefined, 42, {}]) expect(sanitizeChat(bad), JSON.stringify(bad)).toBeNull();
  });

  test('xuống dòng, ký tự điều khiển và ký tự đảo chiều chữ thành dấu cách', () => {
    expect(sanitizeChat('dòng 1\ndòng 2\r\ndòng 3')).toBe('dòng 1 dòng 2 dòng 3');
    expect(sanitizeChat('a\u0000b‮cba⁦x')).toBe('a b cba x');
  });

  test('chuẩn hoá NFC: chữ có dấu gõ kiểu tổ hợp được gộp lại', () => {
    expect(sanitizeChat('Việt')).toBe('Việt');
  });

  test(`tối đa ${VERSUS.chatMax} ký tự (tính theo ký tự, không cắt giữa emoji)`, () => {
    expect(sanitizeChat('a'.repeat(500))).toBe('a'.repeat(VERSUS.chatMax));
    expect(Array.from(sanitizeChat('😀'.repeat(300))!)).toHaveLength(VERSUS.chatMax);
  });

  test('mã lỗi của chat có tiền tố riêng', () => {
    expect(isChatError('chat_rate_limited')).toBe(true);
    expect(isChatError('chat_empty')).toBe(true);
    expect(isChatError('invalid_word')).toBe(false);
  });
});

describe('âm tiết hợp lệ', () => {
  test('đúng cấu trúc tiếng Việt thì hợp lệ dù từ điển không có (vd tượi), kể cả đủ dạng nguyên âm/phụ âm/thanh', () => {
    const ok = ['tượi', 'tươi', 'a', 'ơ', 'gì', 'gìn', 'giêng', 'quyên', 'quýt', 'quỳnh', 'yêu', 'yên', 'lý', 'nghiêng', 'cơ', 'kê', 'ghi', 'nghĩ',
      'ngà', 'khuỷu', 'trường', 'thuyền', 'hoàng', 'xuân', 'việt', 'chiếc', 'bách', 'hợp', 'đắc', 'mạnh'];
    expect(ok.filter((s) => !isValidSyllable(s))).toEqual([]);
  });

  test('sai cấu trúc thì không hợp lệ (vd chiơ, aê, yiư)', () => {
    const bad = ['chiơ', 'aê', 'yiư', 'iên', 'xyz', 'qqq', 'ơư', 'wê', 'f', 'j', 'z', 'bcd', 'thhi', 'tac', 'tạcx', ''];
    expect(bad.filter(isValidSyllable)).toEqual([]);
  });

  test('chính tả bắt buộc: c/k, g/gh, ng/ngh', () => {
    const wrong = ['kơ', 'ka', 'ko', 'ci', 'cê', 'ce', 'ge', 'gê', 'ghơ', 'gha', 'nge', 'nghơ', 'ngha', 'ngi', 'ngae'];
    expect(wrong.filter(isValidSyllable)).toEqual([]);
    const right = ['cơ', 'ca', 'co', 'kê', 'ke', 'ki', 'ghe', 'ghê', 'ghi', 'nghe', 'nghi', 'nghê', 'ngơ', 'nga', 'ga', 'gu'];
    expect(right.filter((s) => !isValidSyllable(s))).toEqual([]);
  });

  test('vần kết thúc c/ch/p/t chỉ mang thanh sắc hoặc nặng', () => {
    for (const s of ['tác', 'tạc', 'ách', 'ạch', 'tập', 'tắp', 'mát', 'mạt']) expect(isValidSyllable(s), s).toBe(true);
    for (const s of ['tàc', 'tảc', 'tãc', 'tac', 'mèt', 'mẻt', 'mat', 'tàp']) expect(isValidSyllable(s), s).toBe(false);
  });

  test('hai dấu thanh trên một âm tiết thì không hợp lệ', () => {
    expect(isValidSyllable('tượ́i')).toBe(false);
  });
});

describe('kiểm tra từ đoán', () => {
  const valid = createSyllableValidator('gen\r\nku\nkhmer\n');

  test('mọi âm tiết hợp lệ thì từ hợp lệ, không cần có trong từ điển', () => {
    for (const w of ['vũ trụ', 'tượi a', 'con gà', 'hòa bình']) expect(valid(w), w).toBe(true);
  });

  test('chỉ cần một âm tiết sai là cả từ không hợp lệ', () => {
    for (const w of ['aê yiư', 'chiơ a', 'a chiơ', 'vũ chiơ trụ', 'aêơ yiư']) expect(valid(w), w).toBe(false);
  });

  test('âm tiết ngoại lệ trong danh sách (kể cả file \r\n) được nhận dù sai cấu trúc; khớp cả dòng, không khớp một phần', () => {
    for (const w of ['gen', 'ku a', 'khmer', 'a khmer ku']) expect(valid(w), w).toBe(true);
    expect(isValidSyllable('gen')).toBe(false); // gen: g + e vi phạm quy tắc, chỉ được nhận nhờ danh sách
    for (const w of ['ge', 'kh', 'khme', 'hmer', 'gen ku2']) expect(valid(w), w).toBe(false);
  });

  test('chuỗi rỗng, khoảng trắng thừa hoặc xuống dòng không hợp lệ', () => {
    for (const w of ['', ' ', 'a  a', ' a', 'a ', 'gen\nku']) expect(valid(w), JSON.stringify(w)).toBe(false);
  });
});
