'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { setDifficulty, useDifficulty } from '@/lib/client/difficulty';
import { reapplySavedTheme } from '@/lib/client/theme';
import { DIFFICULTIES, type Difficulty } from '@/lib/game/difficulty';
import ThemeSwitch from './ThemeSwitch';

interface Props {
  /**
   * Đang chơi: không đổi được độ khó (các lựa chọn bị tắt) và hiện độ khó của ván đang chơi; `difficulty` null = ván này
   * không chọn từ khóa theo độ khó (chọn theo số #N).
   */
  locked?: { difficulty: Difficulty | null } | null;
  /** dòng giải thích dưới các lựa chọn độ khó */
  note?: string;
  /** gọi sau khi người chơi chọn độ khó khác (đã lưu); có thì menu đóng lại (vd Chơi đơn: bắt đầu ván mới) */
  onDifficultyChange?: (difficulty: Difficulty) => void;
}

/**
 * Menu ở góc trên bên phải (nút ☰): chọn giao diện sáng/tối và độ khó. Bấm ra ngoài hoặc Esc thì đóng.
 * Độ khó lưu trong cookie (src/lib/client/difficulty.ts), áp dụng cho ván mới.
 */
export default function SettingsMenu({ locked, note, onDifficultyChange }: Props) {
  const [open, setOpen] = useState(false);
  const saved = useDifficulty();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const name = useId();
  // Khi chạy `next dev`, React Strict Mode dựng lại <html> và xóa `data-theme` (xem reapplySavedTheme); menu luôn có mặt trên thanh
  // trên cùng nên đặt lại ở đây, kể cả khi chưa mở menu.
  useLayoutEffect(reapplySavedTheme, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const shown = locked ? locked.difficulty : saved;
  return (
    <div className="settings-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        className="icon-btn"
        type="button"
        aria-label="Menu"
        title="Menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {open && (
        <div className="settings-panel" id={panelId} role="group" aria-label="Menu">
          <section className="settings-section">
            <h2 className="settings-title">Giao diện</h2>
            <ThemeSwitch />
          </section>
          <section className="settings-section">
            <h2 className="settings-title" id={`${name}-title`}>
              Độ khó {locked && <span className="lock-badge">đang chơi</span>}
            </h2>
            <div className="difficulty-options" role="radiogroup" aria-labelledby={`${name}-title`}>
              {DIFFICULTIES.map((d) => (
                <label key={d.level} className={'difficulty-opt' + (locked ? ' disabled' : '')}>
                  <input
                    type="radio"
                    name={name}
                    value={d.level}
                    checked={shown === d.level}
                    disabled={!!locked}
                    onChange={() => {
                      setDifficulty(d.level);
                      if (!onDifficultyChange) return;
                      setOpen(false);
                      onDifficultyChange(d.level);
                    }}
                  />
                  <span className="difficulty-text">
                    <span className="difficulty-name">{d.name}</span>
                    <span className="difficulty-desc">{d.desc}</span>
                  </span>
                </label>
              ))}
            </div>
            {note && <p className="settings-note">{note}</p>}
          </section>
        </div>
      )}
    </div>
  );
}
