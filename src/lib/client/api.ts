import type { ErrorCode } from '@/lib/game/types';

export class ApiError extends Error {
  constructor(public readonly code: ErrorCode | 'network', message: string) {
    super(message);
  }
}

/** Gọi API JSON của server; lỗi nghiệp vụ được ném ra dưới dạng ApiError kèm thông báo tiếng Việt. */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError('network', 'Không kết nối được máy chủ');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'server_error', data.message ?? 'Lỗi máy chủ');
  return data as T;
}
