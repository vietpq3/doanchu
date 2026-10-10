'use client';

import { useId } from 'react';
import { setTheme, useTheme, type Theme } from '@/lib/client/theme';

const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
  </svg>
);
const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
  </svg>
);

const OPTIONS: { value: Theme; label: string; icon: () => React.JSX.Element }[] = [
  { value: 'light', label: 'Giao diện sáng', icon: SunIcon },
  { value: 'dark', label: 'Giao diện tối', icon: MoonIcon },
];

/**
 * Nút chọn giao diện sáng/tối trong menu (SettingsMenu): hai radio button (☀ / ☾) trông như một công tắc nhỏ. Chưa chọn thì đang theo
 * máy và ô tương ứng được đánh dấu; chọn thì nhớ cho lần sau (src/lib/client/theme.ts). Dùng phím mũi tên để đổi như radio thông thường.
 */
export default function ThemeSwitch() {
  const theme = useTheme();
  const name = useId();
  return (
    <div className="theme-switch" role="radiogroup" aria-label="Giao diện">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <label key={value} className="theme-opt" title={label}>
          <input
            className="visually-hidden"
            type="radio"
            name={name}
            value={value}
            checked={theme === value}
            onChange={() => setTheme(value)}
            aria-label={label}
          />
          <Icon />
        </label>
      ))}
    </div>
  );
}
