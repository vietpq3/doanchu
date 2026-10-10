/**
 * Phần dùng chung của giao diện sáng/tối không phụ thuộc React, để layout gốc (Server Component) import được.
 * Xem src/lib/client/theme.ts.
 */
export const THEME_KEY = 'doanchu-theme';

/** Đoạn script đặt trong <head> của layout gốc: đọc lựa chọn đã lưu và đặt `data-theme` trước khi trình duyệt vẽ trang (không nháy màu). */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
