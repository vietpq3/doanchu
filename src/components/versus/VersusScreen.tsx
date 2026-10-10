'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { difficultyName } from '@/lib/game/difficulty';
import { textCells } from '@/lib/game/input';
import { letterStatuses } from '@/lib/game/scoring';
import { VERSUS } from '@/lib/versus/config';
import type { MatchPlayerStatus } from '@/lib/versus/protocol';
import { formatClock, summarizeResult } from '@/lib/versus/summary';
import Board from '../Board';
import LetterStrip from '../LetterStrip';
import ResultDialog from './ResultDialog';
import { useRoom, useRoomError, useSecondsLeft } from './RoomProvider';
import ScreenshotButton from './ScreenshotButton';
import VersusHeader from './VersusHeader';

const GUESS_ERRORS = new Set(['bad_request', 'invalid_chars', 'incomplete', 'wrong_structure', 'invalid_word']);

const STATUS_TEXT: Record<MatchPlayerStatus, string> = { playing: '', won: ' · đã đoán đúng', out: ' · hết lượt', left: ' · đã rời' };

/** Còn từ chừng này giây trở xuống thì đồng hồ của ván chuyển màu cảnh báo. */
const TIME_WARN_SECONDS = 60;

/** Đồng hồ hiện tối đa chừng này giây: "10:00" chỉ có trong giây đầu của ván, hiện "9:59" để đồng hồ không phải rộng thêm một chữ số. */
const CLOCK_MAX_SHOWN = Math.floor(VERSUS.matchMaxMs / 1000) - 1;
/** Bề rộng đồng hồ: đủ cho số chữ số của dạng dài nhất được hiện ("9:59": 3 chữ số + dấu ":"). */
const CLOCK_WIDTH = `calc(${formatClock(CLOCK_MAX_SHOWN).replace(':', '').length} * .72em + .34em)`;

/**
 * Đồng hồ "m:ss". Font của app không có chữ số đều độ rộng (tabular-nums không có tác dụng), nên mỗi ký tự nằm trong một ô
 * rộng cố định và đồng hồ có bề rộng cố định: số đổi mỗi giây mà khối "Lượt · còn" (căn phải) không bị xô lệch.
 */
function Clock({ seconds }: { seconds: number }) {
  return (
    <b className="clock" style={{ minWidth: CLOCK_WIDTH }}>
      {Array.from(formatClock(Math.min(seconds, CLOCK_MAX_SHOWN)), (ch, i) => (
        <span key={i} className={ch === ':' ? 'clock-sep' : 'clock-digit'}>{ch}</span>
      ))}
    </b>
  );
}

/**
 * Màn Room versus (/rooms/[id]/versus): mỗi người đoán riêng với cùng một từ khóa. Server kiểm tra và chấm từng lượt;
 * mình chỉ thấy chữ/màu của lượt đoán của chính mình, còn đối thủ chỉ thấy tên + số lượt. Không có Hint, New game, số #N.
 * Trong ván có đồng hồ thời gian còn lại. Ván xong: popup kết quả đếm ngược tới lúc phòng mở lại; đóng popup thì xem lại ô chữ,
 * nút đếm ngược `Về phòng (Ns)` và nút chụp ảnh chuyển xuống dưới ô chữ. Hết đếm ngược thì tự về Inside Room.
 */
export default function VersusScreen() {
  const router = useRouter();
  const { roomId, view, status, send, leave } = useRoom();
  const game = view?.game ?? null;

  const inputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const rowCount = game?.yourRows.length ?? 0;
  // Chữ đang gõ gắn với số lượt đã đoán: có lượt mới (server đã nhận) thì coi như ô nhập trống.
  const [typed, setTyped] = useState({ rows: 0, text: '' });
  const text = typed.rows === rowCount ? typed.text : '';

  // Không có ván của mình (chưa vào ván, hoặc popup kết quả đã hết hạn và phòng mở lại): về Inside Room.
  useEffect(() => {
    if (view && !view.game) router.replace(`/rooms/${roomId}`);
  }, [view, roomId, router]);

  const toInside = useCallback(() => router.replace(`/rooms/${roomId}`), [router, roomId]);

  const result = game?.result ?? null;
  // người chơi đã đóng popup kết quả để xem lại ô chữ
  const [reviewing, setReviewing] = useState(false);
  // thời gian còn lại của ván, và (sau ván) tới lúc phòng mở lại — theo giờ server
  const matchLeft = useSecondsLeft(game && !result ? game.endsAt : null, view?.serverNow ?? 0);
  const lockLeft = useSecondsLeft(result ? (view?.lockedUntil ?? null) : null, view?.serverNow ?? 0);
  useEffect(() => {
    if (result && lockLeft === 0) toInside();
  }, [result, lockLeft, toInside]);

  // Có lượt mới được chấm: xóa chữ trong ô nhập (giữ nguyên focus để bàn phím không bị đóng).
  useEffect(() => {
    if (inputRef.current) inputRef.current.value = '';
  }, [rowCount]);

  const playing = game !== null && game.yourStatus === 'playing' && game.result === null;
  useEffect(() => {
    if (playing) inputRef.current?.focus({ preventScroll: true });
  }, [playing, rowCount]);

  // Lỗi của lượt đoán (thiếu chữ, sai cấu trúc...): rung hàng đang gõ và báo ngắn gọn.
  const { visible, latest } = useRoomError(1800);
  const guessError = latest && GUESS_ERRORS.has(latest.code) ? latest : null;
  const toast = visible?.message ?? '';

  const current = useMemo(() => (game && playing ? textCells(text, game.structure) : null), [game, playing, text]);
  const letters = useMemo(() => letterStatuses(game?.yourRows ?? []), [game]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!playing || composing.current) return;
    send({ type: 'guess', guess: inputRef.current?.value ?? text });
  }

  // Rời phòng giữa ván: bị loại ngay (không chờ 30 giây nối lại như khi mất kết nối).
  // Đang đấu: menu không đổi được độ khó, hiện độ khó của ván.
  const menu = game && !game.result
    ? { locked: { difficulty: game.difficulty }, note: 'Đang đấu: độ khó do người bấm Start chọn.' }
    : undefined;
  const header = <VersusHeader title={view?.roomName ?? `Room #${roomId}`} backHref="/rooms" backLabel="Rời phòng" onBack={leave} menu={menu} />;

  if (status === 'rejected' || status === 'replaced') {
    return (
      <>
        {header}
        <main className="game wrap">
          <div className="notice" role="alert">{status === 'replaced' ? 'Bạn đã mở room này ở một tab khác nên tab này bị ngắt.' : 'Không vào được room.'}</div>
        </main>
      </>
    );
  }
  if (!view || !game) {
    return (
      <>
        {header}
        <main className="game wrap"><p className="muted" role="status">Đang vào ván…</p></main>
      </>
    );
  }

  const totalLetters = game.structure.reduce((a, b) => a + b, 0);
  const done = game.yourStatus !== 'playing';

  return (
    <>
      {header}
      <main className="game wrap">
        <div className="toast-host">
          <div className="toast" role="status" aria-live="polite" hidden={!toast}>{toast}</div>
        </div>
        {status === 'reconnecting' && <div className="notice" role="status">Mất kết nối, đang thử nối lại…</div>}

        <p className="meta">
          <span>Từ khóa: <b>{game.structure.length} âm tiết · {totalLetters} chữ cái</b></span>
          <span>
            <b>{difficultyName(game.difficulty)}</b> · Lượt <b>{Math.min(rowCount + 1, game.maxTurns)}/{game.maxTurns}</b>
            {matchLeft !== null && (
              <>
                {' · '}
                <span className={'time-left' + (matchLeft <= TIME_WARN_SECONDS ? ' warn' : '')} title="Thời gian còn lại của ván">
                  còn <Clock seconds={matchLeft} />
                </span>
              </>
            )}
          </span>
        </p>

        <ul className="opponents" aria-label="Người chơi trong ván">
          {game.players.map((p) => (
            <li key={p.name} className={`opponent ${p.status}${p.isYou ? ' you' : ''}`}>
              {p.isYou ? 'Bạn' : p.name} · lượt {p.turns}/{game.maxTurns}{STATUS_TEXT[p.status]}
            </li>
          ))}
        </ul>

        <div onClick={() => inputRef.current?.focus()}>
          <Board structure={game.structure} rows={game.yourRows} current={current} maxRows={game.maxTurns} shakeKey={guessError?.seq ?? 0} />
        </div>

        {playing ? (
          <div className="input-area">
            <form className="guess-form" onSubmit={submit} autoComplete="off">
              <label className="visually-hidden" htmlFor="guess">Từ bạn đoán</label>
              <input
                ref={inputRef}
                id="guess"
                className="guess-input"
                type="text"
                lang="vi"
                inputMode="text"
                enterKeyHint="send"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={60}
                placeholder="Gõ từ có dấu, vd: vũ trụ"
                defaultValue=""
                onInput={(e) => setTyped({ rows: rowCount, text: e.currentTarget.value })}
                onCompositionStart={() => { composing.current = true; }}
                onCompositionEnd={(e) => { composing.current = false; setTyped({ rows: rowCount, text: e.currentTarget.value }); }}
              />
              <button className="btn" type="submit">Đoán</button>
            </form>
            <p className={'input-hint' + (current?.overflow ? ' warn' : '')}>
              {current?.overflow ? 'Nhiều chữ hơn ô chữ' : 'Gõ bằng bộ gõ tiếng Việt của máy; các âm tiết cách nhau bằng dấu cách.' + (VERSUS.validateGuessWords ? ' Từ đoán phải là từ hợp lệ.' : '')}
            </p>
            <LetterStrip statuses={letters} />
          </div>
        ) : result && reviewing ? (
          <div className="review-bar">
            <p className="review-text">{summarizeResult(game)}</p>
            <div className="review-actions">
              <ScreenshotButton game={game} roomName={view.roomName} />
              <button className="btn" type="button" onClick={toInside}>Về phòng ({lockLeft ?? 0}s)</button>
            </div>
          </div>
        ) : (
          <div className="notice" role="status">
            {result
              ? 'Ván đã kết thúc.'
              : done
                ? 'Bạn đã hết lượt đoán. Đang chờ những người khác…'
                : ''}
          </div>
        )}
      </main>

      {result && !reviewing && (
        <ResultDialog game={game} roomName={view.roomName} secondsLeft={lockLeft} onOk={toInside} onDismiss={() => setReviewing(true)} />
      )}
    </>
  );
}
