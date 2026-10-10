import { useSyncExternalStore } from 'react';
import { THEME_KEY } from '../themeScript';

/**
 * Giao diện sáng/tối. Mặc định theo cài đặt của máy (CSS `prefers-color-scheme`); người chơi chọn ở nút trên thanh trên cùng thì
 * lưu vào localStorage và đặt `data-theme` trên <html> (globals.css đổi bộ màu theo thuộc tính này).
 * Lúc tải trang, THEME_INIT_SCRIPT (src/lib/themeScript.ts, chạy trong <head> trước khi trang hiện ra) đặt sẵn `data-theme` để không
 * bị nháy màu.
 */
export type Theme = 'light' | 'dark';

const EVENT = 'doanchu-theme-change';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function savedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

/** Giao diện đang dùng: lựa chọn đã lưu, chưa chọn thì theo máy. */
function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(DARK_QUERY);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY) return;
    applyAttribute(savedTheme()); // đổi ở tab khác
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onStorage);
  mq.addEventListener('change', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onStorage);
    mq.removeEventListener('change', onChange);
  };
}

function applyAttribute(theme: Theme | null) {
  if (theme) document.documentElement.setAttribute('data-theme', theme);
  else document.documentElement.removeAttribute('data-theme');
}

/** Giao diện đang dùng; null khi render ở server (chưa biết). */
export function useTheme(): Theme | null {
  return useSyncExternalStore(subscribe, currentTheme, () => null);
}

/** Chọn giao diện: áp dụng ngay và nhớ cho lần sau. */
export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* không lưu được thì chỉ đổi cho lần này */
  }
  applyAttribute(theme);
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Đặt lại `data-theme` theo lựa chọn đã lưu. Bản production không cần (script trong <head> đã làm); khi chạy `next dev`, React Strict
 * Mode dựng lại <html> và xóa thuộc tính đó, nên nút chọn giao diện gọi hàm này lúc vừa hiện ra.
 */
export function reapplySavedTheme(): void {
  const t = savedTheme();
  if (t) applyAttribute(t);
}
