/**
 * Tên gợi ý ngẫu nhiên cho người chơi đấu theo nhóm (vd "Hổ Vàng 27"): điền sẵn trong hộp thoại nhập tên để người chơi
 * chỉ cần bấm Vào. Mọi tổ hợp đều không quá VERSUS.nameMax ký tự và đã ở dạng chuẩn của sanitizeName (có test kiểm tra).
 */
export const NAME_ANIMALS = ['Hổ', 'Báo', 'Sói', 'Gấu', 'Cáo', 'Mèo', 'Thỏ', 'Rồng', 'Voi', 'Ngựa', 'Khỉ', 'Rùa', 'Sóc', 'Cú',
  'Hươu', 'Nai', 'Công', 'Đại Bàng', 'Cá Heo', 'Chim Sẻ'] as const;

export const NAME_TRAITS = ['Vàng', 'Bạc', 'Xanh', 'Đỏ', 'Tím', 'Hồng', 'Lanh Lợi', 'Vui Vẻ', 'Dũng Cảm', 'Siêu Tốc', 'Tinh Anh',
  'Nhanh', 'Khôn', 'Hiền'] as const;

/** `random` trả về số trong [0, 1) như Math.random (truyền vào để test). Số ở cuối từ 10 đến 99. */
export function randomPlayerName(random: () => number = Math.random): string {
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length) % list.length]!;
  const number = 10 + (Math.floor(random() * 90) % 90);
  return `${pick(NAME_ANIMALS)} ${pick(NAME_TRAITS)} ${number}`;
}
