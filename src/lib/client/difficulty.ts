import { useSyncExternalStore } from 'react';
import { DEFAULT_DIFFICULTY, DIFFICULTY_COOKIE, parseDifficulty, type Difficulty } from '../game/difficulty';

/**
 * Độ khó người chơi chọn ở menu. Lưu trong cookie (không phải localStorage) để server đọc được khi tạo ván Chơi đơn
 * (trang /solo và POST /api/games); Đấu theo nhóm thì gửi kèm lệnh Start.
 */
const EVENT = 'doanchu-difficulty-change';
const MAX_AGE = 365 * 24 * 60 * 60;

function savedDifficulty(): Difficulty {
  const m = new RegExp(`(?:^|;\\s*)${DIFFICULTY_COOKIE}=([^;]*)`).exec(document.cookie);
  return parseDifficulty(m?.[1]) ?? DEFAULT_DIFFICULTY;
}

function subscribe(onChange: () => void) {
  // cookie không có sự kiện khi tab khác đổi: đọc lại khi quay lại tab này
  const onVisible = () => {
    if (document.visibilityState === 'visible') onChange();
  };
  window.addEventListener(EVENT, onChange);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener(EVENT, onChange);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Độ khó đã chọn (chưa chọn thì mặc định); null khi render ở server. */
export function useDifficulty(): Difficulty | null {
  return useSyncExternalStore(subscribe, savedDifficulty, () => null);
}

/** Chọn độ khó: áp dụng cho ván mới từ giờ. */
export function setDifficulty(difficulty: Difficulty): void {
  document.cookie = `${DIFFICULTY_COOKIE}=${difficulty}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax`;
  window.dispatchEvent(new Event(EVENT));
}

/** Đọc ngay độ khó đã chọn (dùng lúc bấm nút, không cần render lại). */
export const currentDifficulty = savedDifficulty;
