/**
 * Emoji voz trong chat của phòng (bộ "popopo" của voz.vn, src/lib/versus/emoji-data.ts). Hàm thuần, dùng chung giao diện và test.
 *
 * Tin chat vẫn chỉ là chữ: emoji được gửi dưới dạng mã (`::beauty::`) và hiện thành ảnh lúc hiển thị, nên server không cần đổi gì.
 * Mã được nhận: mã chuẩn `::tên_file::` và các mã cũ dạng chữ của vozforums.com gõ theo cùng kiểu (`::sogood::`, `::brick::`...) ở bất kỳ
 * đâu trong tin, và các mã cũ dạng ký hiệu (`:)`, `:D`, `:((`...) khi đứng riêng (cách bởi khoảng trắng), như trên voz ngày trước.
 * Mã một dấu hai chấm (`:beauty:`, dùng đến v1.3.14) không còn được nhận: giữ nguyên chữ.
 */
import { VERSUS } from './config';
import { VOZ_EMOJI, type EmojiDef } from './emoji-data';

export { VOZ_EMOJI, type EmojiDef };

export const emojiSrc = (emoji: EmojiDef) => `/emoji/voz/${emoji.file}`;
/** ảnh gấp đôi (96px) cho màn hình mật độ điểm ảnh cao */
export const emojiSrc2x = (emoji: EmojiDef) => `/emoji/voz/${emoji.file2x}`;
export const emojiCode = (emoji: EmojiDef) => `::${emoji.code}::`;

/** mã chuẩn -> emoji */
export const EMOJI_BY_CODE: ReadonlyMap<string, EmojiDef> = new Map(VOZ_EMOJI.map((e) => [e.code, e]));

const WORD_CODE = /^:([a-z0-9_]+):$/i;
/** chữ trong mã dạng `::chữ::` (chữ thường) -> emoji: mã chuẩn và mã cũ dạng chữ (emoji-data.ts ghi mã cũ như trên vozforums.com: `:chữ:`) */
const BY_WORD = new Map<string, EmojiDef>();
/** mã cũ dạng ký hiệu (chữ thường) -> emoji; chỉ nhận khi đứng riêng */
const BY_SYMBOL = new Map<string, EmojiDef>();
for (const emoji of VOZ_EMOJI) {
  BY_WORD.set(emoji.code, emoji);
  for (const alias of emoji.aliases) {
    const word = WORD_CODE.exec(alias)?.[1];
    if (word) BY_WORD.set(word.toLowerCase(), emoji);
    else BY_SYMBOL.set(alias.toLowerCase(), emoji);
  }
}

export type ChatSegment = { type: 'text'; text: string } | { type: 'emoji'; emoji: EmojiDef; source: string };

/**
 * Tách một tin chat thành chữ và emoji. Không dùng lookbehind trong regex (Safari cũ báo lỗi cú pháp ngay khi tải file):
 * tách theo khoảng trắng trước rồi xét từng cụm.
 */
export function parseChatText(text: string): ChatSegment[] {
  const out: ChatSegment[] = [];
  const pushText = (t: string) => {
    if (!t) return;
    const last = out.at(-1);
    if (last?.type === 'text') last.text += t;
    else out.push({ type: 'text', text: t });
  };
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue;
    const symbol = BY_SYMBOL.get(part.toLowerCase());
    if (symbol) {
      out.push({ type: 'emoji', emoji: symbol, source: part });
      continue;
    }
    const re = /::([a-z0-9_]+)::/gi;
    let last = 0;
    for (let m = re.exec(part); m; m = re.exec(part)) {
      const emoji = BY_WORD.get(m[1].toLowerCase());
      if (!emoji) {
        re.lastIndex = m.index + m[0].length - 2; // dấu "::" đóng có thể là dấu mở của mã kế tiếp (vd `::abc::beauty::`)
        continue;
      }
      pushText(part.slice(last, m.index));
      out.push({ type: 'emoji', emoji, source: m[0] });
      last = m.index + m[0].length;
    }
    pushText(part.slice(last));
  }
  return out;
}

/** Tin chỉ gồm emoji (tối đa chừng này cái) thì hiện không có nền bong bóng. */
export const EMOJI_ONLY_MAX = 5;

export function isEmojiOnly(segments: ChatSegment[]): boolean {
  let count = 0;
  for (const s of segments) {
    if (s.type === 'emoji') count++;
    else if (s.text.trim()) return false;
  }
  return count >= 1 && count <= EMOJI_ONLY_MAX;
}

/**
 * Chuẩn hoá chữ gõ sau "::" để tìm emoji: chữ thường, bỏ dấu tiếng Việt, chỉ giữ a-z, 0-9, "_". Cần thiết vì với bộ gõ Telex,
 * gõ `::sexy` thành `::sẽy`, `::boss` thành `::bó` (s, f, r, x, j là phím dấu): bỏ dấu đi thì `::sẽ`, `::bó` vẫn tìm ra emoji.
 */
export function normalizeQuery(raw: string): string {
  return raw.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9_]/g, '');
}

export interface EmojiQuery {
  /** vị trí "::" mở */
  start: number;
  /** vị trí con trỏ (hết đoạn cần thay) */
  end: number;
  /** chữ sau "::" đã chuẩn hoá; rỗng khi mới gõ "::" */
  query: string;
}

/**
 * Đoạn `::x...` đang gõ ngay trước con trỏ (chưa có "::" đóng) để mở bảng emoji; null nếu không có. Xét cụm chữ (không có khoảng trắng)
 * chứa con trỏ từ trái sang, theo đúng cách parseChatText đọc mã: "::" mở một mã, "::" kế tiếp (sau ít nhất một chữ) đóng mã đó, dấu
 * ":" lẻ thì cụm đó không phải mã. "::" mở được ở bất kỳ đâu (không cần dấu cách trước), như mã trong tin.
 * Vd "::|" -> { start: 0, query: "" }; "chào ::bea|", "chào::bea|" -> query "bea"; "::beauty::::bo|" -> { start: 10, query: "bo" };
 * "::beauty::|", "::be:a|", ":bea|", "::)|" -> null.
 */
export function findEmojiQuery(value: string, caret: number): EmojiQuery | null {
  let i = caret;
  while (i > 0 && !/\s/.test(value[i - 1])) i--;
  let open = -1;
  while (i < caret) {
    if (value[i] === ':' && value[i + 1] === ':' && i + 1 < caret) {
      open = open >= 0 && i > open + 2 ? -1 : i; // đóng mã đang mở; còn lại ("::" đầu tiên, hay "::::") là mở mã
      i += 2;
    } else {
      if (value[i] === ':') open = -1;
      i++;
    }
  }
  if (open < 0) return null;
  const raw = value.slice(open + 2, caret);
  const query = normalizeQuery(raw);
  return raw && !query ? null : { start: open, end: caret, query };
}

export interface EmojiMatch {
  emoji: EmojiDef;
  /** mã cũ khớp với chữ đã gõ (vd "::chaymau::" khi gõ "::chay", ":D" khi gõ "::d"); null nếu khớp mã chuẩn */
  alias: string | null;
}

/** Mức khớp, càng cao càng gần: trùng hẳn > bắt đầu bằng > một chữ (tách bởi "_") bắt đầu bằng > chứa > có đủ các chữ theo thứ tự. */
function matchTier(name: string, q: string): number {
  if (name === q) return 5;
  if (name.startsWith(q)) return 4;
  if (name.split('_').some((w) => w.startsWith(q))) return 3;
  if (name.includes(q)) return 2;
  let i = 0;
  for (const ch of name) if (ch === q[i]) i++;
  return i === q.length ? 1 : 0;
}

/**
 * Các emoji khớp với `query` (đã chuẩn hoá), gần khớp nhất trước, xét mã chuẩn và mã cũ. Cùng mức khớp thì emoji dùng gần đây
 * (`recent`, mới nhất trước) đứng trước, rồi tên ngắn hơn, rồi theo thứ tự trong bảng. Mã cũ dạng ký hiệu (`:D`, `:-s`) chỉ tính khi
 * gõ trùng hẳn (vd `::d` ra Big Smile đầu tiên).
 */
export function searchEmoji(query: string, recent: readonly string[] = []): EmojiMatch[] {
  if (!query) return [];
  const scored: { emoji: EmojiDef; alias: string | null; tier: number; recentRank: number; length: number; order: number }[] = [];
  VOZ_EMOJI.forEach((emoji, order) => {
    let best = { tier: matchTier(emoji.code, query), alias: null as string | null, length: emoji.code.length };
    for (const alias of emoji.aliases) {
      const word = WORD_CODE.exec(alias)?.[1]?.toLowerCase();
      const tier = word ? matchTier(word, query) : normalizeQuery(alias) === query ? 5 : 0;
      if (tier > best.tier) best = { tier, alias: word ? `::${word}::` : alias, length: (word ?? alias).length };
    }
    if (best.tier === 0) return;
    const r = recent.indexOf(emoji.code);
    scored.push({ emoji, alias: best.alias, tier: best.tier, recentRank: r < 0 ? Infinity : r, length: best.length, order });
  });
  scored.sort((a, b) => b.tier - a.tier || a.recentRank - b.recentRank || a.length - b.length || a.order - b.order);
  return scored.map(({ emoji, alias }) => ({ emoji, alias }));
}

/**
 * Chèn mã emoji vào ô nhập, thay đoạn [start, end) (đoạn `::x...` đang gõ, hoặc vùng đang chọn): thêm dấu cách trước nếu dính chữ
 * và một dấu cách sau để gõ tiếp. Trả về null nếu tin sẽ dài quá `max` (gán `input.value` bằng code không bị maxLength chặn).
 */
export function insertEmoji(value: string, start: number, end: number, emoji: EmojiDef, max: number = VERSUS.chatMax): { value: string; caret: number } | null {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const insert = (before && !/\s$/.test(before) ? ' ' : '') + emojiCode(emoji) + (after.startsWith(' ') ? '' : ' ');
  const next = before + insert + after;
  if (next.length > max) return null;
  return { value: next, caret: before.length + insert.length + (after.startsWith(' ') ? 1 : 0) };
}
