import type { Status } from '@/lib/game/scoring';

export const STATUS_LABEL: Record<Status, string> = {
  correct: 'đúng chữ, đúng dấu, đúng vị trí',
  present: 'đúng chữ, đúng dấu, sai vị trí',
  tone: 'đúng nguyên âm, sai dấu thanh',
  absent: 'không có trong từ khóa',
};

export const STATUS_COLOR: Record<Status, string> = { correct: 'Xanh lá', present: 'Vàng', tone: 'Xanh dương', absent: 'Xám' };
