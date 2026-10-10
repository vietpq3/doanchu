'use client';

import { useRef } from 'react';
import type { GameView } from '@/lib/versus/protocol';
import DefinitionList from '../DefinitionList';
import Modal from '../Modal';
import ScreenshotButton from './ScreenshotButton';

interface Props {
  game: GameView;
  roomName: string;
  /** số giây tới khi phòng mở lại (đếm ở VersusScreen theo giờ server); hết giờ thì VersusScreen tự về Inside Room */
  secondsLeft: number | null;
  /** bấm OK: về Inside Room */
  onOk: () => void;
  /** đóng popup (✕, Esc, bấm ra ngoài): ở lại xem ô chữ của mình, nút đếm ngược chuyển xuống màn ô chữ */
  onDismiss: () => void;
}

/**
 * Popup kết quả khi ván kết thúc: câu kết quả, button `OK (10s)` đếm ngược tới lúc phòng mở lại, nút chụp ảnh ô chữ và giải nghĩa
 * từ khóa. OK thì về Inside Room; đóng popup thì xem lại ô chữ (vẫn đếm ngược). Nút OK đặt ngay dưới câu kết quả (trước phần
 * giải nghĩa dài) để luôn thấy được mà không phải cuộn; giải nghĩa vẫn còn ở khối "Lượt trước" của Inside Room.
 */
export default function ResultDialog({ game, roomName, secondsLeft, onOk, onDismiss }: Props) {
  const okRef = useRef<HTMLButtonElement>(null);
  const result = game.result;
  if (!result) return null;
  return (
    <Modal open onClose={onDismiss} className="endgame-dlg" label="Kết quả ván đấu" initialFocus={okRef}>
      <section className={`endgame versus-result ${result.youWon ? 'won' : 'lost'}`}>
        <button className="icon-btn endgame-close" type="button" aria-label="Đóng để xem lại ô chữ" title="Đóng để xem lại ô chữ" onClick={onDismiss}>✕</button>
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
        <ScreenshotButton game={game} roomName={roomName} />
        <p className="answer-label">Giải nghĩa</p>
        <DefinitionList definitions={result.definitions} showSource />
      </section>
    </Modal>
  );
}
