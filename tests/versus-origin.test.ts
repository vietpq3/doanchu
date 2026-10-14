import { describe, expect, test } from 'vitest';
import { isAllowedOrigin } from '@/lib/versus/origin';

describe('Origin của request vào phòng (WebSocket, gửi ảnh chat)', () => {
  const host = 'doanchu.pqv.workers.dev';

  test('không có Origin (ứng dụng di động, client không phải trình duyệt): nhận', () => {
    expect(isAllowedOrigin(null, host)).toBe(true);
    expect(isAllowedOrigin('', host)).toBe(true);
  });

  test('cùng host: nhận; trang khác: không', () => {
    expect(isAllowedOrigin('https://doanchu.pqv.workers.dev', host)).toBe(true);
    expect(isAllowedOrigin('http://localhost:3000', 'localhost:3000')).toBe(true);
    expect(isAllowedOrigin('https://evil.example', host)).toBe(false);
    expect(isAllowedOrigin('https://doanchu.pqv.workers.dev.evil.example', host)).toBe(false);
    expect(isAllowedOrigin('http://localhost:3001', 'localhost:3000')).toBe(false);
  });

  test('Origin hỏng (vd "null" của trang sandbox, file://): không nhận, không ném lỗi', () => {
    expect(isAllowedOrigin('null', host)).toBe(false);
    expect(isAllowedOrigin('not a url', host)).toBe(false);
  });
});
