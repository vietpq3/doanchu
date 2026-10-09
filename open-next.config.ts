import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Trang chơi render động mỗi request (đọc cookie), không dùng ISR nên không cần incremental cache.
export default defineCloudflareConfig();
