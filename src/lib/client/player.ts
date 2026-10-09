import { isValidPlayerId } from '../versus/protocol';

const ID_KEY = 'doanchu-player-id';
const NAME_KEY = 'doanchu-player-name';

let fallbackId: string | null = null; // khi trình duyệt chặn localStorage: giữ trong bộ nhớ cho tới khi tải lại trang

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
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* trình duyệt chặn localStorage: bỏ qua */
  }
}
