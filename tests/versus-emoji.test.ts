import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { VERSUS } from '@/lib/versus/config';
import { EMOJI_BY_CODE, emojiCode, findEmojiQuery, insertEmoji, isEmojiOnly, normalizeQuery, parseChatText, searchEmoji, VOZ_EMOJI } from '@/lib/versus/emoji';

const DIR = join(__dirname, '..', 'public', 'emoji', 'voz');
const emoji = (code: string) => EMOJI_BY_CODE.get(code)!;
/** tin -> dạng ngắn để so: chữ giữ nguyên, emoji thành [mã chuẩn] */
const show = (text: string) => parseChatText(text).map((s) => (s.type === 'text' ? s.text : `[${s.emoji.code}]`)).join('');
const codes = (q: string, recent: string[] = []) => searchEmoji(q, recent).map((s) => s.emoji.code);

describe('bộ emoji voz (popopo của voz.vn)', () => {
  test('54 emoji, mã chuẩn là tên file, mỗi emoji có ảnh 1x và 2x trong public/emoji/voz, mọi file ở đó đều được dùng', () => {
    expect(VOZ_EMOJI).toHaveLength(54);
    expect(new Set(VOZ_EMOJI.map((e) => e.code)).size).toBe(54);
    for (const e of VOZ_EMOJI) {
      expect(e.code).toMatch(/^[a-z0-9_]+$/);
      expect([e.file, e.file2x]).toEqual([`${e.code}.png`, `${e.code}_x2.png`]);
      for (const f of [e.file, e.file2x]) expect(existsSync(join(DIR, f)), f).toBe(true);
    }
    expect(readdirSync(DIR).sort()).toEqual(VOZ_EMOJI.flatMap((e) => [e.file, e.file2x]).sort());
    for (const code of ['beauty', 'boss', 'beat_brick', 'byebye', 'beated', 'cold', 'extreme_sexy_girl']) expect(EMOJI_BY_CODE.has(code), code).toBe(true);
  });

  test('ảnh là PNG; kích thước trong bảng đúng với ảnh 1x, ảnh 2x gấp đôi', () => {
    const size = (f: string) => {
      const png = readFileSync(join(DIR, f));
      expect(png.subarray(1, 4).toString(), f).toBe('PNG');
      return [png.readUInt32BE(16), png.readUInt32BE(20)];
    };
    for (const e of VOZ_EMOJI) {
      expect(size(e.file), e.file).toEqual([e.width, e.height]);
      expect(size(e.file2x), e.file2x).toEqual([e.width * 2, e.height * 2]);
    }
  });

  test('không mã nào (chuẩn hay cũ) trỏ tới hai emoji khác nhau', () => {
    const owner = new Map<string, string>();
    for (const e of VOZ_EMOJI) {
      for (const c of [emojiCode(e), ...e.aliases.map((a) => a.replace(/^:([a-z0-9_]+):$/i, '::$1::'))].map((c) => c.toLowerCase())) {
        expect(owner.get(c) ?? e.code, c).toBe(e.code);
        owner.set(c, e.code);
      }
    }
  });
});

describe('hiện emoji trong tin chat', () => {
  test('mã là "::tên::"', () => {
    expect(emojiCode(emoji('beauty'))).toBe('::beauty::');
  });

  test('mã chuẩn và mã cũ dạng chữ (gõ "::sogood::") hiện thành ảnh ở bất kỳ đâu, không phân biệt hoa thường', () => {
    expect(show('chào ::beauty:: nhé')).toBe('chào [beauty] nhé');
    expect(show('::beauty::::boss::')).toBe('[beauty][boss]');
    expect(show('hay quá::Beauty::')).toBe('hay quá[beauty]');
    expect(show('::sogood:: ::chaymau:: ::nosebleed:: ::brick::')).toBe('[feel_good] [nosebleed] [nosebleed] [beat_brick]');
    expect(show(':::beauty:::')).toBe(':[beauty]:');
  });

  test('mã một dấu hai chấm kiểu cũ (":beauty:", đến v1.3.14) giữ nguyên chữ', () => {
    expect(show(':beauty: :sogood: :boss:')).toBe(':beauty: :sogood: :boss:');
    expect(show(':beauty::')).toBe(':beauty::');
  });

  test('mã không có thì giữ nguyên chữ; "::" đóng của mã lạ vẫn mở được mã kế tiếp', () => {
    expect(show('::foo:: và 10::30 và a::b')).toBe('::foo:: và 10::30 và a::b');
    expect(show('::hug:: ::lmao:: ::sos::')).toBe('::hug:: ::lmao:: ::sos::'); // có ở bộ Off cũ nhưng không có ở voz.vn
    expect(show('::abc::beauty::')).toBe('::abc[beauty]');
    expect(show('::beauty')).toBe('::beauty');
  });

  test('mã cũ dạng ký hiệu chỉ thành ảnh khi đứng riêng (như voz ngày trước)', () => {
    expect(show(':) :D :d :(( :* :"> :-s :-S')).toBe('[smile] [big_smile] [big_smile] [cry] [sweet_kiss] [embarrassed] [confuse] [confuse]');
    expect(show('haha:) :)) :((( =)) :v :p ^:)^ -_-')).toBe('haha:) :)) :((( =)) :v :p ^:)^ -_-');
  });

  test('giữ nguyên khoảng trắng và chữ có dấu', () => {
    expect(show('  Việt   Nam ::boss::  ')).toBe('  Việt   Nam [boss]  ');
    expect(parseChatText('a ::boss:: b')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'emoji', emoji: emoji('boss'), source: '::boss::' },
      { type: 'text', text: ' b' },
    ]);
  });

  test('tin chỉ có emoji (1–5 cái) thì hiện không có nền', () => {
    expect(isEmojiOnly(parseChatText('::beauty::'))).toBe(true);
    expect(isEmojiOnly(parseChatText(' ::beauty:: ::boss:: :) '))).toBe(true);
    expect(isEmojiOnly(parseChatText('::go:: '.repeat(6)))).toBe(false);
    expect(isEmojiOnly(parseChatText('::beauty:: đẹp'))).toBe(false);
    expect(isEmojiOnly(parseChatText('đẹp'))).toBe(false);
  });
});

describe('gõ "::" để mở bảng emoji', () => {
  test('bỏ dấu tiếng Việt khi so (bộ gõ Telex biến ::sexy thành ::sẽy, ::boss thành ::bó)', () => {
    expect(normalizeQuery('sẽy')).toBe('sey');
    expect(normalizeQuery('Bó')).toBe('bo');
    expect(normalizeQuery('đẹp')).toBe('dep');
    expect(normalizeQuery('BEA_1')).toBe('bea_1');
    expect(normalizeQuery(')')).toBe('');
  });

  test('mới gõ "::" (đầu tin, sau dấu cách hay dính chữ) thì mở bảng với chữ tìm rỗng; gõ tiếp thì thành chữ tìm', () => {
    expect(findEmojiQuery('::', 2)).toEqual({ start: 0, end: 2, query: '' });
    expect(findEmojiQuery('::b', 3)).toEqual({ start: 0, end: 3, query: 'b' });
    expect(findEmojiQuery('chào ::bea', 10)).toEqual({ start: 5, end: 10, query: 'bea' });
    expect(findEmojiQuery('chào::bea', 9)).toEqual({ start: 4, end: 9, query: 'bea' });
    expect(findEmojiQuery('chào ::bea nhé', 10)).toEqual({ start: 5, end: 10, query: 'bea' }); // con trỏ ở giữa tin
    expect(findEmojiQuery('::Bó', 4)).toEqual({ start: 0, end: 4, query: 'bo' }); // Telex
  });

  test('một dấu ":" (":bea", ":v", ":)", "10:30") không mở bảng', () => {
    expect(findEmojiQuery(':', 1)).toBeNull();
    expect(findEmojiQuery(':bea', 4)).toBeNull();
    expect(findEmojiQuery(':v', 2)).toBeNull();
    expect(findEmojiQuery(':)', 2)).toBeNull();
    expect(findEmojiQuery('10:30', 5)).toBeNull();
    expect(findEmojiQuery(':::', 3)).toBeNull();
  });

  test('"::" đóng một mã thì bảng đóng; "::" ngay sau mã đã đóng (dù mã lạ) lại mở mã mới, như parseChatText', () => {
    expect(findEmojiQuery('::beauty::', 10)).toBeNull();
    expect(findEmojiQuery('::abc::', 7)).toBeNull();
    expect(findEmojiQuery('::abc::bea', 10)).toBeNull(); // parseChatText: "::abc::bea" không có mã nào
    expect(findEmojiQuery('::beauty::::bo', 14)).toEqual({ start: 10, end: 14, query: 'bo' });
    expect(findEmojiQuery('::::bo', 6)).toEqual({ start: 2, end: 6, query: 'bo' });
  });

  test('không mở bảng: có dấu ":" lẻ hay ký hiệu sau "::", đã gõ dấu cách, con trỏ nằm giữa "::"', () => {
    expect(findEmojiQuery('::be:a', 6)).toBeNull();
    expect(findEmojiQuery('::)', 3)).toBeNull();
    expect(findEmojiQuery('::bea ', 6)).toBeNull();
    expect(findEmojiQuery('a::b', 2)).toBeNull();
  });

  test('mọi emoji khớp, gần khớp nhất trước: trùng > bắt đầu bằng > một chữ bắt đầu bằng > chứa > có đủ chữ theo thứ tự', () => {
    expect(codes('beauty')[0]).toBe('beauty');
    expect(codes('bea')[0]).toBe('beauty');
    expect(codes('b').length).toBeGreaterThan(3); // không còn giới hạn 3 gợi ý
    expect(codes('brick')[0]).toBe('beat_brick'); // mã cũ ::brick::
    expect(codes('smil')).toEqual(['smile', 'big_smile']); // "smile" bắt đầu bằng; "big_smile" có chữ "smile"
    expect(codes('sey')).toContain('sexy_girl'); // gõ ::sexy bằng Telex
    expect(codes('zzz')).toEqual([]);
    expect(codes('')).toEqual([]);
  });

  test('khớp theo mã cũ thì kèm mã cũ (gõ theo kiểu "::chữ::") để người chơi biết vì sao khớp', () => {
    expect(searchEmoji('chaym')[0]).toEqual({ emoji: emoji('nosebleed'), alias: '::chaymau::' });
    expect(searchEmoji('beauty')[0]).toEqual({ emoji: emoji('beauty'), alias: null });
  });

  test('mã cũ dạng ký hiệu chỉ tính khi gõ trùng hẳn: "::d" ra Big Smile đầu tiên', () => {
    expect(codes('d')[0]).toBe('big_smile');
    expect(searchEmoji('d')[0].alias).toBe(':D');
    expect(codes('s')[0]).toBe('confuse'); // :-s
  });

  test('cùng mức khớp thì emoji dùng gần đây đứng trước', () => {
    expect(codes('b')[0]).not.toBe('beat_brick');
    expect(codes('b', ['beat_brick'])[0]).toBe('beat_brick');
    expect(codes('bea', ['beat_brick'])[0]).toBe('beat_brick'); // cùng "bắt đầu bằng bea" với beauty
    expect(codes('smile', ['big_smile'])[0]).toBe('smile'); // nhưng khớp gần hơn (trùng hẳn) vẫn thắng
  });
});

describe('chèn mã emoji vào ô nhập', () => {
  test('thay đoạn "::x" đang gõ, thêm dấu cách sau để gõ tiếp (và trước, nếu dính chữ)', () => {
    expect(insertEmoji('chào ::bea', 5, 10, emoji('beauty'))).toEqual({ value: 'chào ::beauty:: ', caret: 16 });
    expect(insertEmoji('::bea nhé', 0, 5, emoji('beauty'))).toEqual({ value: '::beauty:: nhé', caret: 11 });
    expect(insertEmoji('::', 0, 2, emoji('boss'))).toEqual({ value: '::boss:: ', caret: 9 });
    expect(insertEmoji('chào::bea', 4, 9, emoji('beauty'))).toEqual({ value: 'chào ::beauty:: ', caret: 16 });
  });

  test('chèn ở chỗ con trỏ (bảng emoji): thêm dấu cách trước nếu dính chữ', () => {
    expect(insertEmoji('hay', 3, 3, emoji('boss'))).toEqual({ value: 'hay ::boss:: ', caret: 13 });
    expect(insertEmoji('', 0, 0, emoji('boss'))).toEqual({ value: '::boss:: ', caret: 9 });
    expect(insertEmoji('ab', 1, 1, emoji('go'))).toEqual({ value: 'a ::go:: b', caret: 9 });
  });

  test('mã vừa chèn hiện thành ảnh và không mở lại bảng', () => {
    const { value, caret } = insertEmoji('chào ::bea', 5, 10, emoji('beauty'))!;
    expect(show(value)).toBe('chào [beauty] ');
    expect(findEmojiQuery(value, caret)).toBeNull();
    expect(findEmojiQuery(value, caret - 1)).toBeNull();
  });

  test(`không chèn nếu tin sẽ dài quá ${VERSUS.chatMax} ký tự`, () => {
    const fits = VERSUS.chatMax - ' ::go:: '.length;
    expect(insertEmoji('x'.repeat(fits + 1), fits + 1, fits + 1, emoji('go'))).toBeNull();
    expect(insertEmoji('x'.repeat(fits), fits, fits, emoji('go'))).toEqual({ value: 'x'.repeat(fits) + ' ::go:: ', caret: VERSUS.chatMax });
  });
});
