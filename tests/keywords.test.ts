import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import { KEYWORD_LETTERS, MAX_KEYWORD_NO, buildShareLink, keywordInfo, parseKeywordNo } from '@/lib/game/keywords';
import { normalizeWord } from '@/lib/game/vietnamese';
import { loadExclusionConfig } from '../scripts/keyword-exclusions';

describe('mục từ nào làm được từ khóa', () => {
  test('từ ghép viết thường, 4–12 chữ cái', () => {
    expect(keywordInfo('vũ trụ')?.word).toBe('vũ trụ');
    expect(keywordInfo('hoà bình')?.word).toBe('hòa bình'); // chuẩn hoá về kiểu dấu cũ
    expect(keywordInfo('  tổ  chức ')?.word).toBe('tổ chức');
    expect(keywordInfo('ba ba')?.word).toBe('ba ba'); // 4 chữ cái: vừa đủ
  });

  test('từ đơn, quá ngắn, quá dài', () => {
    expect(keywordInfo('nhà')).toBeNull();
    expect(keywordInfo('ô ô')).toBeNull(); // 2 chữ cái
    expect(keywordInfo('ba ơ')).toBeNull(); // 3 chữ cái
    expect(keywordInfo('thương thương')?.cells).toHaveLength(KEYWORD_LETTERS.max); // 12 chữ cái: vừa đủ
    expect(keywordInfo('nghiêng thương')).toBeNull(); // 13 chữ cái
    expect(keywordInfo('nghiêng nghiêng')).toBeNull(); // 14 chữ cái
  });

  test('loại tên riêng, từ viết hoa, gạch nối, chữ số, chữ ngoài bảng chữ cái', () => {
    expect(keywordInfo('Hà Nội')).toBeNull();
    expect(keywordInfo('Vũ trụ')).toBeNull();
    expect(keywordInfo('TP HCM')).toBeNull();
    expect(keywordInfo('mơ-mộng hão')).toBeNull();
    expect(keywordInfo('xe 2 bánh')).toBeNull();
    expect(keywordInfo('wifi miễn phí')).toBeNull();
    expect(keywordInfo('')).toBeNull();
  });
});

describe('đọc số thứ tự từ khóa (?id=...)', () => {
  test('số nguyên dương 1–10 chữ số', () => {
    expect(parseKeywordNo('300')).toBe(300);
    expect(parseKeywordNo('1')).toBe(1);
    expect(parseKeywordNo('007')).toBe(7);
    expect(parseKeywordNo(String(MAX_KEYWORD_NO))).toBe(MAX_KEYWORD_NO);
  });

  test('còn lại là null: 0, âm, thập phân, chữ, rỗng, quá lớn, không phải chuỗi', () => {
    for (const bad of ['0', '000', '-1', '1.5', '1e3', '+5', ' 5', '5 ', 'abc', '12abc', '', String(MAX_KEYWORD_NO + 1), '99999999999']) {
      expect(parseKeywordNo(bad), JSON.stringify(bad)).toBeNull();
    }
    for (const bad of [undefined, null, 300, ['300'], {}]) expect(parseKeywordNo(bad)).toBeNull();
  });
});

describe('link chia sẻ từ khóa', () => {
  test('dạng <origin>/?id=N, bỏ dấu / thừa ở cuối origin', () => {
    expect(buildShareLink('https://doanchu.pqv.workers.dev', 300)).toBe('https://doanchu.pqv.workers.dev/?id=300');
    expect(buildShareLink('http://localhost:3000/', 1)).toBe('http://localhost:3000/?id=1');
  });

  test('link tạo ra luôn được trang đọc lại đúng số (cùng định dạng ?id= với parseKeywordNo)', () => {
    for (const no of [1, 7, 300, 36362, MAX_KEYWORD_NO]) {
      const url = new URL(buildShareLink('https://example.com', no));
      expect([url.pathname, parseKeywordNo(url.searchParams.get('id'))]).toEqual(['/', no]);
    }
  });
});

describe('data/keywords.json', () => {
  const file = JSON.parse(fs.readFileSync('data/keywords.json', 'utf8')) as {
    meta: { excluded: Record<string, number> };
    words: string[];
    excluded: Record<string, string>;
  };
  const { words, excluded } = file;
  const wordSet = new Set(words);
  const config = loadExclusionConfig('data/keyword-exclusions.json');
  const auxiliaryList = fs.readFileSync('data/keyword-auxiliary-candidates.txt', 'utf8').trim().split('\n');

  test('mọi từ đều hợp lệ làm từ khóa, không trùng', () => {
    expect(new Set(words).size).toBe(words.length);
    const bad = words.filter((w) => keywordInfo(w)?.word !== normalizeWord(w));
    expect(bad.slice(0, 10)).toEqual([]);
  });

  test('có đủ từ để chơi lâu dài và có các từ ví dụ trong requirement (trừ "con gà", từ điển không có từ này)', () => {
    expect(words.length).toBeGreaterThan(30000);
    for (const w of ['xe máy', 'tương tác', 'hỗn chiến', 'vũ trụ']) expect(words, w).toContain(w);
  });

  test('từ bị loại không còn trong từ khóa; số lượng theo lý do khớp meta', () => {
    expect(words.length).toBeLessThan(40709); // trước khi có danh sách loại trừ là 40.709 từ
    expect(Object.keys(excluded).filter((w) => wordSet.has(w))).toEqual([]);
    const byReason: Record<string, number> = { auxiliary: 0, proper_noun: 0, manual: 0 };
    for (const reason of Object.values(excluded)) byReason[reason]++;
    expect(Object.keys(byReason)).toEqual(['auxiliary', 'proper_noun', 'manual']); // không có lý do lạ
    expect(byReason).toEqual(file.meta.excluded);
  });

  test('danh từ riêng và từ phụ trợ quen thuộc bị loại; từ thường được giữ', () => {
    for (const w of ['hà nội', 'việt nam', 'sài gòn', 'hồ chí minh', 'bắc kinh', 'đà nẵng', 'liên hợp quốc']) expect(excluded[w], w).toBe('proper_noun');
    for (const w of ['đời nào', 'may ra', 'lẽ ra', 'nhìn chung']) expect(excluded[w], w).toBe('auxiliary');
    for (const w of ['nhà nước', 'con người', 'tháng chín', 'đông nam', 'uyên ương']) expect(wordSet.has(w), w).toBe(true);
  });

  test('danh sách keep được giữ, exclude bị loại với lý do manual', () => {
    for (const w of config.keep) expect(wordSet.has(w), `keep: ${w}`).toBe(true);
    for (const w of config.exclude) expect(excluded[w], `exclude: ${w}`).toBe('manual');
  });

  test('keyword-auxiliary-candidates.txt: từ khóa còn lại có nghĩa X chưa bị loại (X của Wiktionary)', () => {
    expect(auxiliaryList.length).toBeGreaterThan(0);
    expect(new Set(auxiliaryList).size).toBe(auxiliaryList.length);
    expect(auxiliaryList.filter((w) => !wordSet.has(w))).toEqual([]); // đều là từ khóa, không có từ đã bị loại
    for (const w of ['nhẵn bóng', 'hữu danh']) expect(auxiliaryList, w).toContain(w);
  });
});
