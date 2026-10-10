'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { currentDifficulty, useDifficulty } from '@/lib/client/difficulty';
import { difficultyName } from '@/lib/game/difficulty';
import { VERSUS } from '@/lib/versus/config';
import type { Medal, RoomView } from '@/lib/versus/protocol';
import DefinitionList from '../DefinitionList';
import { useRoom, useRoomError, useSecondsLeft } from './RoomProvider';
import VersusHeader from './VersusHeader';

/** Chữ trên nút Start theo pha của phòng. */
function startLabel(view: RoomView, secondsLeft: number | null): string {
  switch (view.phase) {
    case 'countdown': return `Start after ${Math.max(1, secondsLeft ?? 1)}s`;
    case 'starting': return 'Đang bắt đầu…';
    case 'playing': return 'Đang đấu…';
    case 'locked': return 'Vừa xong, đợi chút…';
    default: return 'Start';
  }
}

const MEDAL_NAMES: Record<Medal, string> = { 1: 'hạng nhất', 2: 'hạng nhì', 3: 'hạng ba' };

/** Vương miện nhỏ ở góc trên bên trái thẻ tên của 3 người đứng đầu Leader Board ("Bảng xếp hạng"; màu theo hạng, đặt bằng CSS). */
function Crown() {
  return (
    <svg className="crown" viewBox="0 0 24 19" aria-hidden="true">
      <path d="M3.2 15.5 1.6 6.2l5.6 4.1L12 3.2l4.8 7.1 5.6-4.1-1.6 9.3z" />
      <path d="M3.4 16.6h17.2v2H3.4z" />
      <circle cx="1.8" cy="5" r="1.6" />
      <circle cx="12" cy="2" r="1.7" />
      <circle cx="22.2" cy="5" r="1.6" />
    </svg>
  );
}

/** Lớp CSS và vương miện cho thẻ tên của người có hạng 1–3 trên Leader Board. */
const medalClass = (medal: Medal | undefined) => (medal ? ` medal medal-${medal}` : '');

/**
 * Từ khóa chọn sẵn để kiểm thử (`/rooms/1?tu=vũ trụ`), giống `?tu=` của Chơi đơn: gửi kèm lệnh Start và chỉ có tác dụng
 * khi server bật REVIEW_MODE=1 (production tắt nên bỏ qua).
 */
function reviewWordFromUrl(): string | undefined {
  return new URLSearchParams(window.location.search).get('tu') ?? undefined;
}

/** Inside Room (/rooms/[id]): Sảnh chờ + Bàn chơi + nút Start. Khi mình được đưa vào ván thì chuyển sang màn Versus. */
export default function InsideRoomScreen() {
  const router = useRouter();
  const { roomId, view, status, fatal, send, leave } = useRoom();
  const savedDifficulty = useDifficulty();
  const secondsLeft = useSecondsLeft(view?.countdownEndsAt ?? null, view?.serverNow ?? 0);

  // Ván bắt đầu và mình ở trong ván: sang màn Versus.
  const inMatch = view?.phase === 'playing' && view.game !== null && view.game.result === null;
  useEffect(() => {
    if (inMatch) router.replace(`/rooms/${roomId}/versus`);
  }, [inMatch, roomId, router]);

  // Thông báo lỗi thao tác (vd: "Ô này đã có người") tự ẩn sau ít giây.
  const toast = useRoomError(2500).visible?.message ?? '';

  if (status === 'rejected' || status === 'replaced') {
    return (
      <>
        <VersusHeader title={`Room #${roomId}`} backHref="/rooms" backLabel="Về danh sách room" />
        <main className="game wrap">
          <div className="notice" role="alert">
            {status === 'replaced' ? 'Bạn đã mở room này ở một tab khác nên tab này bị ngắt.' : fatal ?? 'Không vào được room.'}
          </div>
          <Link className="btn" href="/rooms">Về danh sách room</Link>
        </main>
      </>
    );
  }

  if (!view) {
    return (
      <>
        <VersusHeader title={`Room #${roomId}`} backHref="/rooms" backLabel="Về danh sách room" />
        <main className="game wrap"><p className="muted" role="status">Đang vào room…</p></main>
      </>
    );
  }

  const canSit = view.youSeat === null && (view.phase === 'idle' || view.phase === 'countdown');
  const canStand = view.youSeat !== null && (view.phase === 'idle' || view.phase === 'countdown');
  const tableLocked = view.phase === 'starting' || view.phase === 'playing' || view.phase === 'locked';
  const last = view.lastResult;

  return (
    <>
      <VersusHeader
        title={view.roomName}
        backHref="/rooms"
        backLabel="Rời phòng"
        right={<button className="link-btn leave-btn" type="button" onClick={leave}>Rời phòng</button>}
      />
      <main className="game wrap">
        <div className="toast-host">
          <div className="toast" role="status" aria-live="polite" hidden={!toast}>{toast}</div>
        </div>
        {status === 'reconnecting' && <div className="notice" role="status">Mất kết nối, đang thử nối lại…</div>}

        <div className="lobby-row">
          <section className="lobby" aria-label="Sảnh chờ">
            <h2 className="section-title">Sảnh chờ <span className="muted">({view.lobby.length}/{VERSUS.lobbyMax})</span></h2>
            <ul className="name-tags">
              {view.lobby.map((name) => {
                const medal = view.medals[name];
                return (
                  <li
                    key={name}
                    className={'name-tag' + (name === view.youName && view.youSeat === null ? ' you' : '') + medalClass(medal)}
                    title={medal ? `${MEDAL_NAMES[medal]} bảng xếp hạng hôm nay` : undefined}
                  >
                    {medal && <Crown />}
                    {name}
                  </li>
                );
              })}
              {view.lobby.length === 0 && <li className="muted">Không có ai ở sảnh</li>}
            </ul>
          </section>

          <section className="leaderboard" aria-labelledby="leaderboard-title">
            <h2 className="section-title" id="leaderboard-title">Bảng xếp hạng</h2>
            <ol className="lb-list">
              {view.leaderboard.map((e) => {
                const medal = view.medals[e.name];
                return (
                  <li key={e.name} className={'lb-row' + (e.isYou ? ' you' : '') + medalClass(medal)}>
                    {medal && <Crown />}
                    <span className="lb-rank">{e.rank}</span>
                    <span className="lb-name">
                      {e.name}
                      {e.isYou && <span className="visually-hidden"> (bạn)</span>}
                    </span>
                    <span className="lb-wins" aria-label={`${e.wins} ván thắng`}>{e.wins}</span>
                  </li>
                );
              })}
            </ol>
            {view.leaderboard.length > 3 && <p className="lb-note muted">Cuộn để xem thêm {view.leaderboard.length - 3} người</p>}
          </section>
        </div>

        <section className="table-area" aria-label="Bàn chơi">
          <h2 className="section-title">
            Bàn chơi {tableLocked && <span className="lock-badge">đã khóa</span>}
          </h2>
          <ol className="seats">
            {view.seats.map((name, seat) => {
              const mine = view.youSeat === seat;
              if (name === null) {
                return (
                  <li key={seat}>
                    <button className="seat empty" type="button" disabled={!canSit} onClick={() => send({ type: 'sit', seat })} aria-label={`Ngồi vào ô ${seat + 1}`}>
                      <span className="seat-no">{seat + 1}</span>
                      <span className="seat-hint">Trống</span>
                    </button>
                  </li>
                );
              }
              const medal = view.medals[name];
              return (
                <li key={seat}>
                  <button
                    className={'seat taken' + (mine ? ' you' : '') + medalClass(medal)}
                    type="button"
                    disabled={!(mine && canStand)}
                    onClick={() => send({ type: 'stand' })}
                    aria-label={mine ? `${name} (bạn): bấm để đứng dậy` : name}
                    title={mine && canStand ? 'Bấm để đứng dậy về sảnh' : undefined}
                  >
                    {medal && <Crown />}
                    <span className="seat-no">{seat + 1}</span>
                    <span className="seat-name">{name}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <button
          className="btn start-btn"
          type="button"
          disabled={!view.canStart}
          onClick={() => send({ type: 'start', difficulty: currentDifficulty(), word: reviewWordFromUrl() })}
        >
          {startLabel(view, secondsLeft)}
        </button>
        <p className="input-hint difficulty-hint">
          {view.difficulty !== null ? (
            <>Độ khó ván này: <b>{difficultyName(view.difficulty)}</b></>
          ) : savedDifficulty !== null ? (
            <>Bấm Start thì ván dùng độ khó của bạn: <b>{difficultyName(savedDifficulty)}</b> (đổi ở menu ☰)</>
          ) : null}
        </p>
        <p className="input-hint">
          {view.youSeat === null
            ? 'Bấm vào một ô trống ở Bàn chơi để tham gia đấu. Cần từ 2 người trở lên để Start.'
            : 'Bấm tên của bạn để đứng dậy. Ai ở Bàn chơi cũng bấm được Start khi có từ 2 người.'}
        </p>

        {/* Nằm dưới nút Start (không chen giữa bàn và nút) để Start luôn ở ngay dưới Bàn chơi, không bị đẩy xuống khi giải nghĩa dài. */}
        <section className="last-result" aria-label="Kết quả lượt trước">
          <h3>Lượt trước</h3>
          {last ? (
            <>
              <p>
                Từ khóa: <b>{last.word}</b>
                <br />
                {last.winnerName ? <>Người chiến thắng: <b>{last.winnerName}</b></> : 'Không ai tìm ra từ khóa'}
              </p>
              <DefinitionList definitions={last.definitions} showSource />
            </>
          ) : (
            <p className="muted">Chưa có lượt nào.</p>
          )}
        </section>
      </main>
    </>
  );
}
