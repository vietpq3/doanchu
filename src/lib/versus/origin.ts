/**
 * Request tới phòng (WebSocket, gửi ảnh chat) có được nhận không, theo header Origin: không có Origin (ứng dụng di động, client không
 * phải trình duyệt; trình duyệt luôn gửi Origin với WebSocket và POST) hoặc Origin cùng host thì nhận; trang khác thì không.
 * Origin hỏng (vd "null" của trang sandbox/file://) thì không nhận, thay vì lỗi máy chủ.
 * Chặn Origin chỉ để trang web khác không mở được kết nối hay gửi ảnh vào phòng; người gửi thật sự do X-Player-Id + đang ở trong phòng quyết định.
 */
export function isAllowedOrigin(origin: string | null, host: string): boolean {
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
