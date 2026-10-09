import 'server-only';

/** Số ngẫu nhiên trong [0, n), dùng Web Crypto (chạy được cả trên Node lẫn Cloudflare Workers). */
export function randomIndex(n: number): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] % n;
}
