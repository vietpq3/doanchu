import { expect, test } from 'vitest';
import { textCells } from '@/lib/game/input';

test('ô hiển thị theo chữ trong ô nhập (do bộ gõ của máy tạo ra)', () => {
  const t = (text: string) => textCells(text, [2, 3]);
  const none = [false, false];
  expect(t('')).toEqual({ cells: ['', '', '', '', ''], overflow: false, overflowGroups: none, activeGroup: 0, cursor: 0 });
  expect(t('vũ')).toEqual({ cells: ['v', 'ũ', '', '', ''], overflow: false, overflowGroups: none, activeGroup: 0, cursor: -1 });
  expect(t('Vũ ')).toEqual({ cells: ['v', 'ũ', '', '', ''], overflow: false, overflowGroups: none, activeGroup: 1, cursor: 2 });
  expect(t('vũ tr').cells).toEqual(['v', 'ũ', 't', 'r', '']);
  expect(t('vũ tr').cursor).toBe(4);
  // bộ gõ để dấu kiểu mới vẫn hiện theo kiểu cũ của game; chữ lạ hiện nguyên
  expect(textCells('hoà bình', [3, 4]).cells).toEqual(['h', 'ò', 'a', 'b', 'ì', 'n', 'h']);
  expect(t('wf').cells).toEqual(['w', 'f', '', '', '']);
  // thừa chữ hoặc thừa âm tiết: chỉ báo để hiển thị
  expect(t('vũu trụ').overflowGroups).toEqual([true, false]);
  expect(t('vũ trụ x').overflowGroups).toEqual([false, true]);
  expect(t('vũ trụ').overflow).toBe(false);
});
