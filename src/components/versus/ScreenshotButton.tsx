'use client';

import { useEffect, useRef, useState } from 'react';
import { renderBoardImage } from '@/lib/client/boardImage';
import { copyImageToClipboard, downloadBlob } from '@/lib/client/clipboard';
import type { GameView } from '@/lib/versus/protocol';
import { summarizeResult } from '@/lib/versus/summary';

const MESSAGE_MS = 3000;

type State = 'idle' | 'copied' | 'downloaded' | 'failed';

const LABEL: Record<State, string> = {
  idle: 'Chụp ảnh màn hình',
  copied: '✓ Đã copy ảnh! Dán để chia sẻ',
  downloaded: '✓ Đã tải ảnh về máy',
  failed: 'Không chụp được ảnh',
};

/**
 * Nút "Chụp ảnh màn hình" sau ván đấu theo nhóm: vẽ ô chữ của mình (chữ + màu, kèm kết quả và từ khóa) thành ảnh PNG
 * rồi copy vào clipboard để dán gửi người khác. Trình duyệt không cho copy ảnh thì tải ảnh về máy.
 */
export default function ScreenshotButton({ game, roomName, className = '' }: { game: GameView; roomName: string; className?: string }) {
  const [state, setState] = useState<State>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function capture() {
    const result = game.result;
    if (!result) return;
    // bắt đầu vẽ ngay trong lúc bấm (xem copyImageToClipboard)
    const png = renderBoardImage({
      subtitle: `Đấu theo nhóm · ${roomName}`,
      result: summarizeResult(game) ?? '',
      won: result.youWon,
      word: result.word,
      structure: game.structure,
      rows: game.yourRows,
      maxRows: game.maxTurns,
    });
    let next: State;
    if (await copyImageToClipboard(png)) {
      next = 'copied';
    } else {
      try {
        downloadBlob(await png, `doan-chu-${roomName.replace(/\W+/g, '').toLowerCase()}.png`);
        next = 'downloaded';
      } catch {
        next = 'failed';
      }
    }
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), MESSAGE_MS);
  }

  return (
    <>
      <button className={`btn secondary shot-btn ${className}`.trim()} type="button" title="Chụp ô chữ của bạn vào clipboard để chia sẻ" onClick={capture}>
        {state === 'idle' && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        )}
        {LABEL[state]}
      </button>
      <p className="visually-hidden" role="status" aria-live="polite">{state === 'idle' ? '' : LABEL[state]}</p>
    </>
  );
}
