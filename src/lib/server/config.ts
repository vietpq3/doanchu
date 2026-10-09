import 'server-only';

/** Cấu hình đọc từ biến môi trường (local: .dev.vars, Cloudflare: vars/secrets — xem .dev.vars.example), đọc lại mỗi lần truy cập. */
export const config = {
  maxTurns: 6,
  /** Số lần gợi ý (nút Hint) tối đa mỗi ván */
  maxHints: 3,
  /** Số nghĩa tối đa hiển thị ở màn hình kết thúc */
  maxDefinitions: 4,
  /** Ván chơi cũ hơn số ngày này bị xoá */
  gameTtlDays: 7,
  get supabaseUrl() {
    return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  },
  /** Secret key (sb_secret_... / service_role): chỉ dùng ở server, không bao giờ gửi xuống trình duyệt */
  get supabaseSecretKey() {
    return process.env.SUPABASE_SECRET_KEY;
  },
  /** REVIEW_MODE=1: cho phép chọn sẵn từ khóa bằng ?tu=... (dành cho kiểm thử, tắt ở production) */
  get reviewMode() {
    return process.env.REVIEW_MODE === '1';
  },
};
