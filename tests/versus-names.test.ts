import { describe, expect, test } from 'vitest';
import { VERSUS } from '@/lib/versus/config';
import { NAME_ANIMALS, NAME_TRAITS, randomPlayerName } from '@/lib/versus/names';
import { sanitizeName } from '@/lib/versus/protocol';

describe('tên gợi ý ngẫu nhiên (đấu theo nhóm)', () => {
  test('mọi tổ hợp đều không quá giới hạn độ dài tên và đã ở dạng chuẩn của sanitizeName', () => {
    const bad: string[] = [];
    for (const a of NAME_ANIMALS) for (const t of NAME_TRAITS) for (const n of [10, 99]) {
      const name = `${a} ${t} ${n}`;
      if (Array.from(name).length > VERSUS.nameMax || sanitizeName(name) !== name) bad.push(name);
    }
    expect(bad).toEqual([]);
  });

  test('dạng "<con vật> <tính chất> <10..99>", lấy đầu và cuối danh sách theo bộ sinh số', () => {
    expect(randomPlayerName(() => 0)).toBe(`${NAME_ANIMALS[0]} ${NAME_TRAITS[0]} 10`);
    expect(randomPlayerName(() => 0.999999)).toBe(`${NAME_ANIMALS.at(-1)} ${NAME_TRAITS.at(-1)} 99`);
    for (let i = 0; i < 200; i++) {
      const name = randomPlayerName();
      expect(name).toMatch(/^\S.* \d{2}$/);
      expect(sanitizeName(name)).toBe(name);
    }
  });
});
