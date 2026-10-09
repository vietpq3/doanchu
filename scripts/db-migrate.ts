/*
 * Tạo/cập nhật bảng trên Supabase từ supabase/migrations (dùng Supabase CLI).
 * Chạy: npm run db:migrate   (cần SUPABASE_DB_URL trong .dev.vars — connection string Postgres)
 * Hoặc dán nội dung file trong supabase/migrations vào SQL Editor của Supabase Dashboard.
 */
import { spawnSync } from 'node:child_process';
import './env';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Thiếu SUPABASE_DB_URL (Supabase Dashboard > Connect > Session pooler), xem .dev.vars.example');
  process.exit(1);
}
const res = spawnSync('npx', ['supabase', 'db', 'push', '--db-url', url, '--include-all', '--yes'], { stdio: 'inherit' });
process.exit(res.status ?? 1);
