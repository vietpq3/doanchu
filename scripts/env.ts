// Nạp .dev.vars (nếu có) cho các script chạy bằng tsx; biến đã có sẵn trong môi trường không bị ghi đè.
// Secret để ở .dev.vars thay vì .env.local vì OpenNext gói mọi file .env* vào code của Worker khi build.
import fs from 'node:fs';

if (fs.existsSync('.dev.vars')) process.loadEnvFile('.dev.vars');
