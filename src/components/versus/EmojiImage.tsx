import { emojiCode, emojiSrc, emojiSrc2x, type EmojiDef } from '@/lib/versus/emoji';

/**
 * Ảnh một emoji voz (PNG 48px, kèm bản 96px cho màn hình nét cao như điện thoại), thu nhỏ (giữ tỉ lệ, không phóng to) cho vừa khung
 * `maxWidth` × `maxHeight`.
 * Kích thước tính sẵn và ghi vào width/height nên trang giữ chỗ trước khi ảnh tải xong (khung chat cuộn xuống cuối không bị hụt).
 * Dùng <img> thường: ảnh tĩnh vài KB trong public/, đã có sẵn bản 2x nên không cần tối ưu ảnh của Next. `alt` là mã emoji, nên
 * copy tin nhắn hay trình đọc màn hình vẫn ra chữ `:beauty:`.
 */
export default function EmojiImage({ emoji, maxWidth, maxHeight, className }: { emoji: EmojiDef; maxWidth: number; maxHeight: number; className?: string }) {
  const scale = Math.min(1, maxWidth / emoji.width, maxHeight / emoji.height);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={emojiSrc(emoji)}
      srcSet={`${emojiSrc(emoji)} 1x, ${emojiSrc2x(emoji)} 2x`}
      width={Math.round(emoji.width * scale)}
      height={Math.round(emoji.height * scale)}
      alt={emojiCode(emoji)}
      title={`${emojiCode(emoji)} ${emoji.label}`}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}
