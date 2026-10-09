/*
 * Danh sách loại trừ từ khóa: những từ có trong từ điển nhưng không nên làm đáp án.
 * Cấu hình ở data/keyword-exclusions.json (xem README, mục "Bộ từ khóa"); scripts/export-keywords.ts áp dụng.
 *
 *   auxiliary    từ phụ trợ: nghĩa mang mã từ loại `pos` (X) do các nguồn trong `sources` gắn.
 *                X của Wiktionary chỉ là "chưa phân loại" nên mặc định không nằm trong `sources`.
 *   proper_noun  danh từ riêng. Từ điển lưu mọi mục từ bằng chữ thường nên không nhìn chữ hoa của mục từ được;
 *                dùng ba tín hiệu: nhãn Np của TVTD, mẫu câu giải nghĩa địa danh ("Một xã thuộc huyện..."),
 *                và quét văn bản (giải nghĩa + ví dụ) xem từ có hay xuất hiện dạng "Hà Nội" hơn "hà nội".
 *   manual       từ trong danh sách `exclude`.
 * Danh sách `keep` thắng mọi luật (chữa các nhầm lẫn, vd: từ thường trùng tên người).
 */
import fs from 'node:fs';
import { normalizeSyllable, normalizeWord } from '../src/lib/game/vietnamese';
import type { Sense } from './dictionary-source';

export type ExclusionReason = 'auxiliary' | 'proper_noun' | 'manual';

export interface ExclusionConfig {
  auxiliary: {
    enabled: boolean;
    /** mã từ loại của từ phụ trợ */
    pos: string;
    /** chỉ tính nghĩa do các nguồn này gắn (TVTD, tudientv.com, Wiktionary) */
    sources: string[];
    /** any: có một nghĩa như vậy là loại; all: mọi nghĩa hiển thị đều phải như vậy */
    match: 'any' | 'all';
  };
  properNouns: {
    enabled: boolean;
    /** chỉ xét từ có nghĩa danh từ (N) */
    nounsOnly: boolean;
    /** nghĩa mang nhãn Np của TVTD */
    dictionaryTag: boolean;
    /** nghĩa đầu là mẫu câu địa danh / dân tộc ("Một xã thuộc huyện...") */
    locationPattern: boolean;
    /**
     * Quét văn bản: `title` = số lần từ xuất hiện dạng viết hoa từng âm tiết ("Hà Nội"), `lower` = dạng chữ thường.
     * Loại khi title >= minCount, title > lower và title >= minRatioOverLower × lower.
     * (1, 1) rộng: một lần viết hoa nhiều hơn chữ thường là loại. (2, 3) chặt: ít nhầm từ thường hơn.
     */
    capitalized: { enabled: boolean; minCount: number; minRatioOverLower: number };
  };
  /** luôn loại (lý do "manual") */
  exclude: string[];
  /** luôn giữ, thắng mọi luật */
  keep: string[];
}

export interface Classification {
  reason: ExclusionReason;
  /** bằng chứng ngắn gọn, ghi vào báo cáo để duyệt */
  detail: string;
}

export interface CapitalCount {
  title: number;
  lower: number;
}

// ---------- Cấu hình ----------

function asObject(value: unknown, where: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${where}: phải là một đối tượng JSON`);
  return value as Record<string, unknown>;
}

function checkKeys(o: Record<string, unknown>, allowed: string[], where: string) {
  for (const key of Object.keys(o)) if (!allowed.includes(key)) throw new Error(`${where}: không có tuỳ chọn "${key}" (chỉ có: ${allowed.join(', ')})`);
  for (const key of allowed) if (!(key in o)) throw new Error(`${where}: thiếu tuỳ chọn "${key}"`);
}

function asBoolean(value: unknown, where: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${where}: phải là true hoặc false`);
  return value;
}

function asNumber(value: unknown, where: string, min: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) throw new Error(`${where}: phải là số >= ${min}`);
  return value;
}

function asStringList(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !v.trim())) throw new Error(`${where}: phải là danh sách chuỗi không rỗng`);
  return value as string[];
}

/** Từ trong danh sách exclude/keep: chuẩn hoá (kiểu dấu, chữ thường), phải là từ ghép hợp lệ, bỏ trùng. */
function asWordList(value: unknown, where: string): string[] {
  const words = new Set<string>();
  for (const raw of asStringList(value, where)) {
    const word = normalizeWord(raw);
    if (!word || !word.includes(' ')) throw new Error(`${where}: "${raw}" không phải từ ghép tiếng Việt hợp lệ`);
    words.add(word);
  }
  return [...words].sort((a, b) => a.localeCompare(b, 'vi'));
}

/** Kiểm tra chặt (tuỳ chọn lạ hay thiếu đều báo lỗi) để gõ nhầm tên tuỳ chọn không âm thầm làm mất tác dụng. */
export function parseExclusionConfig(raw: unknown): ExclusionConfig {
  const root = asObject(raw, 'keyword-exclusions');
  checkKeys(root, ['auxiliary', 'properNouns', 'exclude', 'keep'], 'keyword-exclusions');

  const a = asObject(root.auxiliary, 'auxiliary');
  checkKeys(a, ['enabled', 'pos', 'sources', 'match'], 'auxiliary');
  if (typeof a.pos !== 'string' || !a.pos) throw new Error('auxiliary.pos: phải là mã từ loại, vd "X"');
  if (a.match !== 'any' && a.match !== 'all') throw new Error('auxiliary.match: phải là "any" hoặc "all"');
  const auxiliary = {
    enabled: asBoolean(a.enabled, 'auxiliary.enabled'),
    pos: a.pos,
    sources: asStringList(a.sources, 'auxiliary.sources'),
    match: a.match,
  } as ExclusionConfig['auxiliary'];

  const p = asObject(root.properNouns, 'properNouns');
  checkKeys(p, ['enabled', 'nounsOnly', 'dictionaryTag', 'locationPattern', 'capitalized'], 'properNouns');
  const c = asObject(p.capitalized, 'properNouns.capitalized');
  checkKeys(c, ['enabled', 'minCount', 'minRatioOverLower'], 'properNouns.capitalized');
  const properNouns: ExclusionConfig['properNouns'] = {
    enabled: asBoolean(p.enabled, 'properNouns.enabled'),
    nounsOnly: asBoolean(p.nounsOnly, 'properNouns.nounsOnly'),
    dictionaryTag: asBoolean(p.dictionaryTag, 'properNouns.dictionaryTag'),
    locationPattern: asBoolean(p.locationPattern, 'properNouns.locationPattern'),
    capitalized: {
      enabled: asBoolean(c.enabled, 'properNouns.capitalized.enabled'),
      minCount: asNumber(c.minCount, 'properNouns.capitalized.minCount', 1),
      minRatioOverLower: asNumber(c.minRatioOverLower, 'properNouns.capitalized.minRatioOverLower', 1),
    },
  };

  const exclude = asWordList(root.exclude, 'exclude');
  const keep = asWordList(root.keep, 'keep');
  const both = exclude.filter((w) => keep.includes(w));
  if (both.length) throw new Error(`exclude và keep không được chứa cùng một từ: ${both.join(', ')}`);

  return { auxiliary, properNouns, exclude, keep };
}

export function loadExclusionConfig(file: string): ExclusionConfig {
  try {
    return parseExclusionConfig(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    throw new Error(`${file}: ${err instanceof Error ? err.message : err}`);
  }
}

// ---------- Quét chữ hoa trong văn bản ----------

const LETTERS = 'a-zđàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ';
const TOKEN = new RegExp(`[${LETTERS}]+`, 'giu');

const isLowercase = (token: string) => token === token.toLowerCase();
/** "Hà": chữ đầu viết hoa, các chữ sau viết thường (loại "HÀ", "hà", và cả "hÀ"). */
const isTitleCase = (token: string) => token[0] !== token[0].toLowerCase() && token.slice(1) === token.slice(1).toLowerCase();

/**
 * Đếm, trong các đoạn văn bản, số lần mỗi từ đích (từ ghép 2+ âm tiết, đã chuẩn hoá) xuất hiện:
 *   title  mọi âm tiết đều viết hoa chữ đầu ("Hà Nội", "Trần Hưng Đạo")
 *   lower  mọi âm tiết đều viết thường ("hà nội")
 * Các dạng khác (viết hoa mỗi âm tiết đầu như đầu câu "Hà nội", viết hoa toàn bộ) không tính vì không phân biệt được tên riêng với chữ đầu câu.
 * Chỉ trả về từ có xuất hiện ít nhất một lần.
 */
export function scanCapitalization(texts: Iterable<string>, targets: ReadonlySet<string>, maxSyllables = 5): Map<string, CapitalCount> {
  const counts = new Map<string, CapitalCount>();
  const canonical = new Map<string, string | null>();
  const canon = (token: string) => {
    const key = token.toLowerCase();
    if (!canonical.has(key)) canonical.set(key, normalizeSyllable(key));
    return canonical.get(key)!;
  };

  for (const text of texts) {
    const tokens = text.normalize('NFC').match(TOKEN) ?? [];
    const syllables = tokens.map(canon);
    for (let i = 0; i < tokens.length; i++) {
      for (let n = 2; n <= maxSyllables && i + n <= tokens.length; n++) {
        const parts = syllables.slice(i, i + n);
        if (parts.some((p) => !p)) break;
        const word = parts.join(' ');
        if (!targets.has(word)) continue;
        const window = tokens.slice(i, i + n);
        const kind = window.every(isLowercase) ? 'lower' : window.every(isTitleCase) ? 'title' : null;
        if (!kind) continue;
        const count = counts.get(word) ?? { title: 0, lower: 0 };
        count[kind]++;
        counts.set(word, count);
      }
    }
  }
  return counts;
}

// ---------- Phân loại ----------

/**
 * Mẫu câu mở đầu nghĩa của một địa danh/dân tộc: "Một xã thuộc huyện X", "Tên gọi các xã Việt Nam thuộc", "Sông ở...", "T. Quảng Ngãi".
 * Cố ý KHÔNG khớp "tên gọi chung ..." / "tên gọi thông thường ..." (acid béo, quạt máy...: danh từ thường).
 * Kết thúc bằng khoảng trắng/dấu câu thay vì \b vì \b của JavaScript không coi "ã", "ồ", "ố" là chữ.
 */
export const LOCATION_PATTERN = new RegExp(
  '^(?:(?:một|tên gọi các|tên một)\\s*'
  + '(?:xã|huyện|quận|thị xã|thị trấn|phường|tỉnh|thành phố|làng|thôn|sông|núi|dãy núi|đảo|quần đảo|hồ|vịnh|bán đảo|vùng|khu vực|quốc gia|nước|châu lục|dân tộc|tên gọi khác của dân tộc)'
  + '|(?:t|h|tx)\\.)(?=\\s|[,.;:]|$)',
  'i',
);

/** Bỏ ghi chú đầu nghĩa kiểu "[thường viết hoa] ..." */
const stripNote = (text: string) => text.replace(/^\[[^\]]*\]\s*/, '').trim();

/**
 * Nghĩa mô tả một địa danh/dân tộc: khớp LOCATION_PATTERN **và** nhắc một tên viết hoa ("huyện Thuận Châu", "Việt Nam").
 * Điều kiện thứ hai loại các nghĩa thường cũng bắt đầu bằng "Một nước/khu vực/quốc gia...":
 * "Một nước biến khai cuộc trong cờ tướng", "Một khu vực nằm trong công trình kiến trúc" (giếng trời).
 */
export function describesLocation(text: string): boolean {
  const sense = stripNote(text);
  return LOCATION_PATTERN.test(sense) && /\s\p{Lu}/u.test(sense);
}

/** Trả về hàm phân loại một từ khóa ứng viên: lý do bị loại, hoặc null nếu giữ. `senses` là các nghĩa hiển thị của từ. */
export function createClassifier(config: ExclusionConfig) {
  const keep = new Set(config.keep);
  const exclude = new Set(config.exclude);
  const { auxiliary: aux, properNouns: pn } = config;

  const isAuxiliary = (s: Sense) => s.pos === aux.pos && aux.sources.includes(s.source);

  return function classify(word: string, senses: Sense[], capital: CapitalCount | undefined): Classification | null {
    if (keep.has(word)) return null;
    if (exclude.has(word)) return { reason: 'manual', detail: 'trong danh sách exclude' };

    if (aux.enabled && senses.length && (aux.match === 'any' ? senses.some(isAuxiliary) : senses.every(isAuxiliary))) {
      const source = senses.find(isAuxiliary)!.source;
      return { reason: 'auxiliary', detail: `nghĩa ${aux.pos} của ${source}` };
    }

    if (pn.enabled && (!pn.nounsOnly || senses.some((s) => s.pos === 'N'))) {
      if (pn.dictionaryTag && senses.some((s) => s.subPos === 'Np')) return { reason: 'proper_noun', detail: 'nhãn Np của từ điển' };
      if (pn.locationPattern && senses[0] && describesLocation(senses[0].text)) {
        return { reason: 'proper_noun', detail: 'nghĩa đầu mô tả địa danh/dân tộc' };
      }
      const cap = pn.capitalized;
      if (cap.enabled && capital && capital.title >= cap.minCount && capital.title > capital.lower && capital.title >= cap.minRatioOverLower * capital.lower) {
        return { reason: 'proper_noun', detail: `viết hoa ${capital.title} lần, chữ thường ${capital.lower} lần` };
      }
    }
    return null;
  };
}
