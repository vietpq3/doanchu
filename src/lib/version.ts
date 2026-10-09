/** Phiên bản app, lấy từ `version` trong package.json lúc build (xem next.config.ts); 'dev' nếu chạy ngoài Next (vd: test). */
export const APP_VERSION = process.env.APP_VERSION ?? 'dev';
