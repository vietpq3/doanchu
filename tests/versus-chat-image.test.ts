import { describe, expect, test } from 'vitest';
import { chatImageUrl, isChatImageId, parseImageSize, sniffImageType } from '@/lib/versus/chatImage';

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((v) => (typeof v === 'string' ? Array.from(v, (c) => c.charCodeAt(0)) : [v])));

describe('nhận dạng ảnh theo các byte đầu', () => {
  test('PNG, JPEG, GIF, WebP', () => {
    expect(sniffImageType(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13))).toBe('image/png');
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16))).toBe('image/jpeg');
    expect(sniffImageType(bytes('GIF89a', 1, 0))).toBe('image/gif');
    expect(sniffImageType(bytes('GIF87a'))).toBe('image/gif');
    expect(sniffImageType(bytes('RIFF', 0x24, 0, 0, 0, 'WEBPVP8 '))).toBe('image/webp');
  });

  test('không phải ảnh được nhận (SVG, HTML, RIFF khác WebP, rỗng, cắt cụt) thì null', () => {
    expect(sniffImageType(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageType(bytes('<!DOCTYPE html><script>'))).toBeNull();
    expect(sniffImageType(bytes('RIFF', 0x24, 0, 0, 0, 'WAVEfmt '))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
    expect(sniffImageType(bytes(0x89, 'PN'))).toBeNull();
  });
});

describe('kích thước ảnh, id, đường dẫn', () => {
  test('kích thước: số nguyên 1..20000 (chuỗi từ header cũng được)', () => {
    expect(parseImageSize('1120', '1300')).toEqual({ width: 1120, height: 1300 });
    expect(parseImageSize(1, 20_000)).toEqual({ width: 1, height: 20_000 });
    for (const [w, h] of [[0, 10], [10, 20_001], ['1.5', '2'], [null, 5], ['abc', 5], [-1, 5]]) expect(parseImageSize(w, h), `${w}x${h}`).toBeNull();
  });

  test('id là UUID; đường dẫn theo phòng', () => {
    expect(isChatImageId('3f2b8c1e-9d4a-4c7b-8e2f-1a2b3c4d5e6f')).toBe(true);
    for (const bad of ['../state', 'img:abc', '3F2B8C1E-9D4A-4C7B-8E2F-1A2B3C4D5E6F', '', 42]) expect(isChatImageId(bad)).toBe(false);
    expect(chatImageUrl(3, 'abc')).toBe('/api/rooms/3/chat-images/abc');
  });
});
