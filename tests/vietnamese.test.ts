import { describe, expect, test } from 'vitest';
import { DEFAULT_STYLE, normalizeSyllable, normalizeWord, restyleText, wordInfo } from '@/lib/game/vietnamese';

describe('đặt dấu thanh', () => {
  test('mặc định kiểu cũ (òa, òe, úy)', () => {
    expect(DEFAULT_STYLE).toBe('old');
    const cases: Record<string, string> = {
      'hòa': 'hòa', 'hoà': 'hòa', 'khỏe': 'khỏe', 'khoẻ': 'khỏe', 'thúy': 'thúy', 'thuý': 'thúy', 'quà': 'quà', 'quý': 'quý',
      'gìn': 'gìn', 'già': 'già', 'giường': 'giường', 'được': 'được', 'toán': 'toán', 'hoàng': 'hoàng',
      'huỳnh': 'huỳnh', 'của': 'của', 'mía': 'mía', 'ngoài': 'ngoài', 'khuỷu': 'khuỷu', 'người': 'người',
      'tuổi': 'tuổi', 'thuở': 'thuở', 'quyết': 'quyết', 'giữ': 'giữ', 'giũa': 'giũa', 'mưa': 'mưa',
    };
    for (const [input, expected] of Object.entries(cases)) expect(normalizeSyllable(input), input).toBe(expected);
  });

  test('kiểu mới chỉ khác ở oa, oe, uy vần mở', () => {
    expect(normalizeSyllable('hòa', 'new')).toBe('hoà');
    expect(normalizeSyllable('thúy', 'new')).toBe('thuý');
    expect(normalizeSyllable('toán', 'new')).toBe('toán');
    expect(normalizeSyllable('quý', 'new')).toBe('quý');
  });

  test('đặt lại dấu trong giải nghĩa, giữ chữ hoa', () => {
    expect(restyleText('Đấu tranh vì hoà bình, sức khoẻ ~ Hoà thuận; QUÝ, HOÀ, toà nhà'))
      .toBe('Đấu tranh vì hòa bình, sức khỏe ~ Hòa thuận; QUÝ, HÒA, tòa nhà');
    expect(restyleText('website HĐND 2024')).toBe('website HĐND 2024');
  });
});

describe('chuẩn hoá từ và tách ô', () => {
  test('chuẩn hoá', () => {
    expect(normalizeWord('  Hoà   BÌNH ')).toBe('hòa bình');
    expect(normalizeWord('web site')).toBeNull(); // w không thuộc bảng chữ cái tiếng Việt
  });

  test('tách ô: mỗi chữ cái một ô, chữ ghép không gộp', () => {
    const info = wordInfo('tương tác')!;
    expect(info.structure).toEqual([5, 3]);
    expect(info.cells).toEqual(['t', 'ư', 'ơ', 'n', 'g', 't', 'á', 'c']);
  });
});
