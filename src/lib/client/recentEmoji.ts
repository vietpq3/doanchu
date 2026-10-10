import { useSyncExternalStore } from 'react';

/** Emoji dùng gần đây trong chat (mã chuẩn, mới nhất trước), lưu ở localStorage: hiện đầu bảng chọn emoji và được ưu tiên khi gợi ý. */
const KEY = 'doanchu-recent-emoji';
const EVENT = 'doanchu-recent-emoji-change';
const MAX = 14;
const EMPTY: string[] = [];

// useSyncExternalStore cần cùng một mảng khi dữ liệu không đổi: nhớ chuỗi đã đọc lần trước.
let cachedRaw: string | null = null;
let cached: string[] = EMPTY;

function readRecent(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* trình duyệt chặn localStorage */
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = JSON.parse(raw ?? '[]');
      cached = Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string').slice(0, MAX) : EMPTY;
    } catch {
      cached = EMPTY;
    }
  }
  return cached;
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useRecentEmoji(): string[] {
  return useSyncExternalStore(subscribe, readRecent, () => EMPTY);
}

/** Đưa một emoji lên đầu danh sách dùng gần đây. */
export function rememberEmoji(code: string): void {
  const next = [code, ...readRecent().filter((c) => c !== code)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* không lưu được thì thôi */
  }
  window.dispatchEvent(new Event(EVENT));
}
