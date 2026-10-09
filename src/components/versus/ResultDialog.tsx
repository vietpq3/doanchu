'use client';

import { useEffect, useRef } from 'react';
import type { GameView } from '@/lib/versus/protocol';
import Modal from '../Modal';
import { useSecondsLeft } from './RoomProvider';

interface Props {
  game: GameView;
  /** giờ server mà phòng mở lại; popup đếm ngược tới mốc này */
  lockedUntil: number | null;
  serverNow: number;
  /** bấm OK, hết đếm ngược hoặc đóng popup: về Inside Room */
  onOk: () => void;
}

/**
 * Popup kết quả khi ván kết thúc, có button `OK (10s)` đếm ngược 10 giây (theo giờ server). Hết giờ hoặc bấm OK thì
 * onOk(); đóng popup bằng Esc cũng tính là OK.
 */
export default function ResultDialog({ game, lockedUntil, serverNow, onOk }: Props) {
  const okRef = useRef<HTMLButtonElement>(null);
  const secondsLeft = useSecondsLeft(lockedUntil, serverNow);
  const result = game.result;

  useEffect(() => {
    if (secondsLeft === 0) onOk();
  }, [secondsLeft, onOk]);

  if (!result) return null;
  return (
    <Modal open onClose={onOk} className="endgame-dlg" label="Kết quả ván đấu" initialFocus={okRef}>
      <section className={`endgame ${result.youWon ? 'won' : 'lost'}`}>
        {result.youWon ? (
          <p className="result-text"><b className="result-head">Bạn đã thắng!</b> Từ khóa là <b>{result.word}</b></p>
        ) : result.winnerName ? (
          <p className="result-text"><b className="result-head">Bạn đã thua!</b> Từ khóa là <b>{result.word}</b>. Người chiến thắng là: <b>{result.winnerName}</b></p>
        ) : (
          <p className="result-text"><b className="result-head">Không ai tìm ra từ khóa.</b> Từ khóa là <b>{result.word}</b></p>
        )}
        <button ref={okRef} className="btn" type="button" onClick={onOk}>
          OK ({secondsLeft ?? 0}s)
        </button>
      </section>
    </Modal>
  );
}
