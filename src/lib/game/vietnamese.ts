/**
 * Chữ cái, dấu thanh và chuẩn hoá tiếng Việt. Không phụ thuộc DOM hay Node: dùng chung cho server và client.
 *
 * Mô hình dữ liệu:
 *   - Một "ô" là một chữ cái tiếng Việt dạng NFC, gồm cả dấu phụ và dấu thanh (vd: "ổ").
 *     Chữ ghép (ch, ng, nh, th, tr, gi, qu...) KHÔNG gộp ô; "đ" là một chữ riêng.
 *   - Một âm tiết được tách thành: danh sách chữ cái không dấu thanh + MỘT dấu thanh.
 *     Vị trí đặt dấu do placeTone() quyết định, dùng chung cho từ khóa và chữ người chơi gõ,
 *     nên "hoà" và "hòa" luôn ra cùng một dãy ô.
 *   - Kiểu đặt dấu của cả game nằm ở DEFAULT_STYLE. Từ điển và giải nghĩa được chuẩn hoá theo kiểu này
 *     khi nạp vào Supabase (npm run db:seed); đổi kiểu dấu thì chạy lại lệnh đó.
 */

export type ToneStyle = 'old' | 'new';

/** 'old': òa, òe, úy (hòa, khỏe, thúy) · 'new': oà, oè, uý (hoà, khoẻ, thuý) */
export const DEFAULT_STYLE: ToneStyle = 'old';

/** 0 ngang · 1 sắc · 2 huyền · 3 hỏi · 4 ngã · 5 nặng */
export type Tone = 0 | 1 | 2 | 3 | 4 | 5;

// Thứ tự trong mỗi chuỗi: ngang, sắc, huyền, hỏi, ngã, nặng
const TONE_TABLE: Record<string, string> = {
  a: 'aáàảãạ', ă: 'ăắằẳẵặ', â: 'âấầẩẫậ',
  e: 'eéèẻẽẹ', ê: 'êếềểễệ',
  i: 'iíìỉĩị',
  o: 'oóòỏõọ', ô: 'ôốồổỗộ', ơ: 'ơớờởỡợ',
  u: 'uúùủũụ', ư: 'ưứừửữự',
  y: 'yýỳỷỹỵ',
};
const TONED: Record<string, string[]> = Object.fromEntries(
  Object.entries(TONE_TABLE).map(([base, forms]) => [base, Array.from(forms.normalize('NFC'))]),
);

export const VOWELS: ReadonlySet<string> = new Set(Object.keys(TONE_TABLE));
const MODIFIED_VOWELS = new Set(['ă', 'â', 'ê', 'ô', 'ơ', 'ư']);
// Không có f, j, w, z: chúng không thuộc bảng chữ cái tiếng Việt.
export const CONSONANTS: ReadonlySet<string> = new Set(['b', 'c', 'd', 'đ', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'q', 'r', 's', 't', 'v', 'x']);

/** 29 chữ cái tiếng Việt theo thứ tự bảng chữ cái. */
export const ALPHABET = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm',
  'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y'] as const;

const DECOMPOSE = new Map<string, { base: string; tone: Tone }>();
for (const [base, forms] of Object.entries(TONED)) forms.forEach((ch, tone) => DECOMPOSE.set(ch, { base, tone: tone as Tone }));
for (const c of CONSONANTS) DECOMPOSE.set(c, { base: c, tone: 0 });

/** "ộ" -> { base: "ô", tone: 5 }; ký tự không thuộc bảng chữ cái -> null */
export function decomposeChar(ch: string): { base: string; tone: Tone } | null {
  if (!ch) return null;
  return DECOMPOSE.get(ch.normalize('NFC').toLowerCase()) ?? null;
}
export function baseOf(ch: string): string | null { return decomposeChar(ch)?.base ?? null; }
export function toneOf(ch: string): Tone { return decomposeChar(ch)?.tone ?? 0; }
export function withTone(base: string, tone: Tone): string { return VOWELS.has(base) ? TONED[base][tone] : base; }

/** "hoà" -> { letters: ['h','o','a'], tone: 2 }. Trả null nếu có ký tự lạ. */
export function parseSyllable(str: string): { letters: string[]; tone: Tone } | null {
  const letters: string[] = [];
  let tone: Tone = 0;
  for (const ch of Array.from(str.normalize('NFC').toLowerCase())) {
    const d = decomposeChar(ch);
    if (!d) return null;
    letters.push(d.base);
    if (d.tone) tone = d.tone;
  }
  return letters.length ? { letters, tone } : null;
}

/** Vị trí bắt đầu của cụm nguyên âm, bỏ qua "u" trong qu- và "i" trong gi-. */
function nucleusStart(letters: string[]): number {
  let start = 0;
  while (start < letters.length && !VOWELS.has(letters[start])) start++;
  if (start === letters.length) return -1;
  if (start > 0 && start + 1 < letters.length && VOWELS.has(letters[start + 1])) {
    const prev = letters[start - 1], v = letters[start];
    if ((prev === 'q' && v === 'u') || (prev === 'g' && v === 'i')) start++;
  }
  return start;
}

/**
 * Sửa chính tả "ươ"/"uơ" để mọi cách gõ cho cùng một kết quả:
 *   - "ươ" ở cuối âm tiết (thuở, huơ) -> "uơ"
 *   - "uơ" còn âm phía sau (vd: "huơng") -> "ươ"
 */
export function normalizeLetters(letters: string[]): string[] {
  const L = letters.slice();
  for (let i = 0; i + 1 < L.length; i++) {
    if (L[i + 1] !== 'ơ' || (L[i] !== 'u' && L[i] !== 'ư')) continue;
    if (i > 0 && L[i - 1] === 'q') continue;
    L[i] = i + 2 >= L.length ? 'u' : 'ư';
  }
  return L;
}

/** Chữ cái nhận dấu thanh; -1 nếu âm tiết không có nguyên âm. */
export function tonePosition(letters: string[], style: ToneStyle = DEFAULT_STYLE): number {
  const start = nucleusStart(letters);
  if (start < 0) return -1;
  let end = start;
  while (end < letters.length && VOWELS.has(letters[end])) end++;
  const cluster = letters.slice(start, end);
  // Nguyên âm có mũ/móc/trăng luôn nhận dấu; với "ươ" thì là "ơ" (chữ cuối cùng).
  for (let i = cluster.length - 1; i >= 0; i--) if (MODIFIED_VOWELS.has(cluster[i])) return start + i;
  if (end < letters.length) return end - 1;          // vần đóng: toán, hoàng, huỳnh
  if (cluster.length === 1) return start;
  if (cluster.length >= 3) return start + 1;         // ngoài, xoáy, khuỷu
  const pair = cluster.join('');
  if (style === 'new' && (pair === 'oa' || pair === 'oe' || pair === 'uy')) return start + 1;
  return start;                                      // hòa, của, mía, máy...
}

/** letters + tone -> mảng ô đã đặt dấu. */
export function placeTone(letters: string[], tone: Tone, style: ToneStyle = DEFAULT_STYLE): string[] {
  const L = normalizeLetters(letters);
  if (tone) {
    const pos = tonePosition(L, style);
    if (pos >= 0) L[pos] = withTone(L[pos], tone);
  }
  return L;
}

export function normalizeSyllable(str: string, style: ToneStyle = DEFAULT_STYLE): string | null {
  const p = parseSyllable(str);
  return p ? placeTone(p.letters, p.tone, style).join('') : null;
}

/** Chuẩn hoá cả từ: chữ thường, NFC, một dấu cách giữa các âm tiết, đặt lại dấu. null nếu không hợp lệ. */
export function normalizeWord(str: string, style: ToneStyle = DEFAULT_STYLE): string | null {
  const syllables = String(str).normalize('NFC').toLowerCase().trim().split(/\s+/);
  const out: string[] = [];
  for (const s of syllables) {
    const n = normalizeSyllable(s, style);
    if (!n) return null;
    out.push(n);
  }
  return out.join(' ');
}

/**
 * Đặt lại dấu thanh trong một đoạn văn (giải nghĩa, ví dụ) theo kiểu dấu, giữ nguyên chữ hoa.
 * Chỉ dời vị trí dấu; từ nào không phải âm tiết tiếng Việt chuẩn thì để nguyên.
 */
export function restyleText(text: string, style: ToneStyle = DEFAULT_STYLE): string {
  return String(text).normalize('NFC').replace(/[A-Za-zÀ-ɏḀ-ỿ]+/g, (tok) => {
    const lower = tok.toLowerCase();
    const chars = Array.from(lower);
    if (chars.filter((ch) => toneOf(ch) > 0).length !== 1) return tok;
    const p = parseSyllable(lower);
    if (!p || normalizeLetters(p.letters).join('') !== p.letters.join('')) return tok;
    const out = placeTone(p.letters, p.tone, style);
    const orig = Array.from(tok);
    return out.map((ch, i) => (orig[i] !== chars[i] ? ch.toUpperCase() : ch)).join('');
  });
}

export interface WordInfo {
  word: string;
  syllables: string[];
  /** số chữ cái của từng âm tiết, vd "vũ trụ" -> [2, 3] */
  structure: number[];
  cells: string[];
}

/** "vũ trụ" -> { word, syllables: ['vũ','trụ'], structure: [2,3], cells: ['v','ũ','t','r','ụ'] } */
export function wordInfo(str: string, style: ToneStyle = DEFAULT_STYLE): WordInfo | null {
  const word = normalizeWord(str, style);
  if (!word) return null;
  const syllables = word.split(' ');
  const groups = syllables.map((s) => Array.from(s));
  return { word, syllables, structure: groups.map((g) => g.length), cells: groups.flat() };
}
