import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import type { Sense } from '../scripts/dictionary-source';
import {
  createClassifier, describesLocation, loadExclusionConfig, parseExclusionConfig, scanCapitalization, type ExclusionConfig,
} from '../scripts/keyword-exclusions';

const CONFIG_PATH = 'data/keyword-exclusions.json';
const rawConfig = () => JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
type RawConfig = ReturnType<typeof rawConfig>;
/** Cấu hình mặc định của dự án, sửa một vài tuỳ chọn cho từng test. */
function config(change: (c: ExclusionConfig) => void = () => {}): ExclusionConfig {
  const c = parseExclusionConfig(rawConfig());
  c.keep = [];
  c.exclude = [];
  change(c);
  return c;
}
const sense = (source: string, pos: string | null, subPos: string | null, text = 'nghĩa'): Sense => ({ source, pos, subPos, text });

describe('cấu hình loại trừ', () => {
  test('file data/keyword-exclusions.json hợp lệ', () => {
    const c = loadExclusionConfig(CONFIG_PATH);
    expect(c.auxiliary.sources).toContain('TVTD');
    expect(c.auxiliary.sources).not.toContain('Wiktionary'); // X của Wiktionary chỉ là "chưa phân loại"
  });

  test('tuỳ chọn lạ, thiếu, sai kiểu đều báo lỗi (gõ nhầm tên không âm thầm mất tác dụng)', () => {
    const bad = (change: (c: RawConfig) => void) => { const c = rawConfig(); change(c); return () => parseExclusionConfig(c); };
    expect(bad((c) => { c.properNouns.nounOnly = true; })).toThrow(/không có tuỳ chọn "nounOnly"/);
    expect(bad((c) => { delete c.properNouns.capitalized; })).toThrow(/thiếu tuỳ chọn "capitalized"/);
    expect(bad((c) => { c.extra = 1; })).toThrow(/không có tuỳ chọn "extra"/);
    expect(bad((c) => { c.auxiliary.enabled = 'yes'; })).toThrow(/true hoặc false/);
    expect(bad((c) => { c.auxiliary.match = 'some'; })).toThrow(/"any" hoặc "all"/);
    expect(bad((c) => { c.auxiliary.sources = []; })).not.toThrow(); // rỗng nghĩa là không nguồn nào được tính
    expect(bad((c) => { c.auxiliary.sources = [1]; })).toThrow(/danh sách chuỗi/);
    expect(bad((c) => { c.properNouns.capitalized.minCount = 0; })).toThrow(/số >= 1/);
  });

  test('exclude/keep: chuẩn hoá kiểu dấu, bỏ trùng, chỉ nhận từ ghép, không trùng nhau', () => {
    const c = rawConfig();
    c.keep = ['hoà bình', 'hòa bình', ' Vũ  trụ '];
    expect(parseExclusionConfig(c).keep).toEqual(['hòa bình', 'vũ trụ']);
    c.keep = ['nhà'];
    expect(() => parseExclusionConfig(c)).toThrow(/"nhà" không phải từ ghép/);
    c.keep = ['wifi nhà'];
    expect(() => parseExclusionConfig(c)).toThrow(/không phải từ ghép/);
    c.keep = ['vũ trụ'];
    c.exclude = ['vũ trụ'];
    expect(() => parseExclusionConfig(c)).toThrow(/không được chứa cùng một từ: vũ trụ/);
  });
});

describe('quét chữ hoa trong văn bản', () => {
  const targets = new Set(['hà nội', 'việt nam', 'trần hưng đạo', 'hòa bình']);

  test('đếm dạng viết hoa từng âm tiết và dạng chữ thường', () => {
    const counts = scanCapitalization([
      'Hà Nội là thủ đô của Việt Nam.',
      'Anh ấy đến hà nội hôm qua.',
      'Ông Trần Hưng Đạo là danh tướng.',
    ], targets);
    expect(counts.get('hà nội')).toEqual({ title: 1, lower: 1 });
    expect(counts.get('việt nam')).toEqual({ title: 1, lower: 0 });
    expect(counts.get('trần hưng đạo')).toEqual({ title: 1, lower: 0 });
    expect(counts.has('hòa bình')).toBe(false); // không xuất hiện thì không có trong kết quả
  });

  test('chữ hoa đầu câu ("Hà nội rất đẹp") và viết hoa toàn bộ không tính', () => {
    const counts = scanCapitalization(['Hà nội rất đẹp.', 'HÀ NỘI', 'hÀ nội'], targets);
    expect(counts.size).toBe(0);
  });

  test('kiểu dấu mới/cũ như nhau, và chữ không thuộc bảng chữ cái làm đứt cụm', () => {
    const counts = scanCapitalization(['Hoà Bình, hòa bình, Hòa-Bình, HÒA BÌNH'], targets);
    expect(counts.get('hòa bình')).toEqual({ title: 2, lower: 1 }); // "Hòa-Bình" vẫn là hai âm tiết liền nhau
  });
});

describe('nghĩa mô tả địa danh / dân tộc', () => {
  test.each([
    'Một xã thuộc huyện Thuận Châu, tỉnh Sơn La, Việt Nam.',
    'Một phường ở quận Hoàng Mai, Hà Nội, Việt Nam.',
    'Tên gọi các xã Việt Nam thuộc',
    'một tỉnh của Indonesia.',
    'Một thành phố trực thuộc Trung ương.',
    'Một tên gọi khác của dân tộc Sán Chay.',
    'T. Quảng Ngãi.',
    '[cũ] Một hồ ở Bắc Cực',
  ])('khớp: %s', (text) => expect(describesLocation(text)).toBe(true));

  test.each([
    'tên gọi chung các acid hữu cơ điều chế từ các hydrocarbon',
    'Tên gọi thông thường của các động vật linh trưởng',
    'Một nước biến khai cuộc trong cờ tướng.', // thường, cũng bắt đầu bằng "Một nước"
    'Một khu vực nằm trong công trình kiến trúc, mở hoặc làm bằng vật liệu trong suốt',
    'Một xã hội công bằng, dân chủ',
    'quạt máy',
    '',
  ])('không khớp: %s', (text) => expect(describesLocation(text)).toBe(false));
});

describe('phân loại một từ khóa ứng viên', () => {
  test('từ phụ trợ: chỉ nghĩa X do nguồn được liệt kê gắn', () => {
    const classify = createClassifier(config());
    expect(classify('đời nào', [sense('TVTD', 'X', 'X')], undefined)).toMatchObject({ reason: 'auxiliary' });
    expect(classify('đời nào', [sense('tudientv.com', 'X', 'X')], undefined)).toMatchObject({ reason: 'auxiliary' });
    expect(classify('nhẵn bóng', [sense('Wiktionary', 'X', null)], undefined)).toBeNull(); // X của Wiktionary: chưa phân loại
    expect(classify('xe máy', [sense('TVTD', 'N', 'Na')], undefined)).toBeNull();
  });

  test('auxiliary.match: any loại khi có một nghĩa X, all chỉ loại khi mọi nghĩa đều X', () => {
    const mixed = [sense('TVTD', 'N', 'Na'), sense('TVTD', 'X', 'X')];
    expect(createClassifier(config())('lẽ ra', mixed, undefined)).toMatchObject({ reason: 'auxiliary' });
    expect(createClassifier(config((c) => { c.auxiliary.match = 'all'; }))('lẽ ra', mixed, undefined)).toBeNull();
    expect(createClassifier(config((c) => { c.auxiliary.match = 'all'; }))('lẽ ra', [sense('TVTD', 'X', 'X')], undefined)).toMatchObject({ reason: 'auxiliary' });
  });

  test('thêm "Wiktionary" vào auxiliary.sources thì X của Wiktionary cũng bị loại; tắt auxiliary thì không loại gì', () => {
    const wiktionaryX = [sense('Wiktionary', 'X', null)];
    expect(createClassifier(config((c) => { c.auxiliary.sources.push('Wiktionary'); }))('hữu danh', wiktionaryX, undefined)).toMatchObject({ reason: 'auxiliary' });
    expect(createClassifier(config((c) => { c.auxiliary.enabled = false; }))('đời nào', [sense('TVTD', 'X', 'X')], undefined)).toBeNull();
  });

  test('danh từ riêng: nhãn Np, mẫu câu địa danh, chữ hoa trong văn bản', () => {
    const classify = createClassifier(config());
    expect(classify('sao kim', [sense('TVTD', 'N', 'Np', 'hành tinh thứ hai')], undefined)).toMatchObject({ reason: 'proper_noun' });
    expect(classify('an lư', [sense('Wiktionary', 'N', null, 'Một xã thuộc huyện Thủy Nguyên, tp. Hải Phòng, Việt Nam.')], undefined)).toMatchObject({ reason: 'proper_noun' });
    expect(classify('hà nội', [sense('Wiktionary', 'N', null, 'Thủ đô.')], { title: 270, lower: 0 })).toMatchObject({ reason: 'proper_noun' });
    expect(classify('nhà nước', [sense('Wiktionary', 'N', null, 'Tổ chức quyền lực.')], { title: 0, lower: 476 })).toBeNull();
  });

  test('nounsOnly: không có nghĩa danh từ thì không xét là danh từ riêng', () => {
    const verb = [sense('Wiktionary', 'V', null, 'Dẹp yên giặc giã.')];
    expect(createClassifier(config())('bình định', verb, { title: 83, lower: 13 })).toBeNull();
    expect(createClassifier(config((c) => { c.properNouns.nounsOnly = false; }))('bình định', verb, { title: 83, lower: 13 })).toMatchObject({ reason: 'proper_noun' });
  });

  test('ngưỡng chữ hoa: rộng (1,1) và chặt (2,3)', () => {
    const noun = [sense('Wiktionary', 'N', null, 'Người.')];
    const broad = createClassifier(config());
    expect(broad('a b', noun, { title: 1, lower: 0 })).toMatchObject({ reason: 'proper_noun' });
    expect(broad('a b', noun, { title: 2, lower: 2 })).toBeNull(); // phải viết hoa nhiều hơn chữ thường
    const strict = createClassifier(config((c) => { c.properNouns.capitalized.minCount = 2; c.properNouns.capitalized.minRatioOverLower = 3; }));
    expect(strict('a b', noun, { title: 1, lower: 0 })).toBeNull();
    expect(strict('a b', noun, { title: 2, lower: 1 })).toBeNull();
    expect(strict('a b', noun, { title: 3, lower: 1 })).toMatchObject({ reason: 'proper_noun' });
    expect(createClassifier(config((c) => { c.properNouns.capitalized.enabled = false; }))('a b', noun, { title: 9, lower: 0 })).toBeNull();
    expect(createClassifier(config((c) => { c.properNouns.enabled = false; }))('a b', [sense('TVTD', 'N', 'Np')], { title: 9, lower: 0 })).toBeNull();
  });

  test('thứ tự ưu tiên: keep > exclude > từ phụ trợ > danh từ riêng', () => {
    const both = [sense('TVTD', 'X', 'X'), sense('TVTD', 'N', 'Np')];
    expect(createClassifier(config())('đời nào', both, undefined)).toMatchObject({ reason: 'auxiliary' });
    expect(createClassifier(config((c) => { c.exclude = ['đời nào']; }))('đời nào', both, undefined)).toMatchObject({ reason: 'manual' });
    expect(createClassifier(config((c) => { c.keep = ['đời nào']; }))('đời nào', both, undefined)).toBeNull();
    expect(createClassifier(config((c) => { c.exclude = ['xe máy']; }))('xe máy', [sense('TVTD', 'N', 'Na')], undefined)).toMatchObject({ reason: 'manual', detail: 'trong danh sách exclude' });
  });
});
