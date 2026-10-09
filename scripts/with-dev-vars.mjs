// Chạy một lệnh với biến môi trường lấy từ .dev.vars (nếu có), vd: node scripts/with-dev-vars.mjs next dev
// Biến đã có sẵn trong môi trường không bị ghi đè.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.dev.vars')) process.loadEnvFile('.dev.vars');
const [cmd, ...args] = process.argv.slice(2);
const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
