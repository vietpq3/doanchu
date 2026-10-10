import { useSyncExternalStore } from 'react';
import { isValidPlayerId, sanitizeName } from '../versus/protocol';

const ID_KEY = 'doanchu-player-id';
const NAME_KEY = 'doanchu-player-name';

const NAME_EVENT = 'doanchu-name-change';

let fallbackId: string | null = null; // khi trình duyệt chặn localStorage: giữ trong bộ nhớ cho tới khi tải lại trang
let fallbackName: string | null = null; // như trên, cho tên

/** Định danh người chơi (không có tài khoản): UUID sinh một lần, lưu ở localStorage. Hai tab cùng trình duyệt là cùng một người. */
export function getPlayerId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id || !isValidPlayerId(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return (fallbackId ??= crypto.randomUUID());
  }
}

/** Tên đã nhập lần trước ('' nếu chưa có). */
export function getSavedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? fallbackName ?? '';
  } catch {
    return fallbackName ?? '';
  }
}

/** Lưu tên và báo cho các component đang dùng useSavedName() trong trang. */
export function saveName(name: string): void {
  fallbackName = name;
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* trình duyệt chặn localStorage: chỉ nhớ trong bộ nhớ (fallbackName) cho tới khi tải lại trang */
  }
  window.dispatchEvent(new Event(NAME_EVENT));
}

function subscribeName(onChange: () => void): () => void {
  window.addEventListener(NAME_EVENT, onChange);
  window.addEventListener('storage', onChange); // tab khác đổi tên
  return () => {
    window.removeEventListener(NAME_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

const readName = () => sanitizeName(getSavedName()) ?? '';

/**
 * Tên đã lưu (đã chuẩn hoá) và tự cập nhật khi đổi tên. '' = chưa có tên; null = chưa biết (đang render ở server
 * hoặc đang hydrate: tên nằm ở localStorage nên chỉ đọc được ở trình duyệt, trả null để HTML khớp khi hydrate).
 */
export function useSavedName(): string | null {
  return useSyncExternalStore(subscribeName, readName, () => null);
}
