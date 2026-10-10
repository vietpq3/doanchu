import { defineConfig, devices } from '@playwright/test';

/**
 * Test E2E (thư mục e2e/).
 *   npm run test:e2e                                    chạy với bản local (tự chạy `npm run preview` nếu cổng 3000 chưa có server)
 *   npm run test:e2e:prod                               chạy với bản đã deploy (https://doanchu.pqv.workers.dev)
 *   E2E_BASE_URL=<url> npm run test:e2e                 chạy với một URL bất kỳ
 * Các test cần chọn sẵn từ khóa (?tu=) tự bỏ qua khi server tắt REVIEW_MODE.
 * Mặc định dùng Google Chrome cài trên máy; đổi bằng E2E_BROWSER_CHANNEL (vd: chromium sau khi `npx playwright install chromium`).
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Pixel 7'],
    baseURL,
    channel: process.env.E2E_BROWSER_CHANNEL ?? 'chrome',
    locale: 'vi-VN',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // --persist-to + xóa thư mục: mỗi lần chạy e2e bắt đầu với Durable Object (các room đấu theo nhóm) trống, không dính dữ liệu lần trước
        command: 'rm -rf .wrangler/e2e-state && npm run preview -- --port 3000 --persist-to .wrangler/e2e-state',
        url: 'http://localhost:3000/icon.svg',
        reuseExistingServer: true,
        timeout: 240_000,
      },
});
