'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getSavedName } from '@/lib/client/player';
import type { RoomSummary } from '@/lib/versus/room';
import { VERSUS } from '@/lib/versus/config';
import VersusHeader from './VersusHeader';

const REFRESH_MS = 5000;

/** Danh sách room (/rooms): `Room #id` kèm số người và trạng thái; tự làm mới. Chưa có tên thì về Chơi đơn. */
export default function RoomListScreen() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [name, setName] = useState('');

  useEffect(() => {
    const saved = getSavedName().trim();
    if (!saved) {
      router.replace('/');
      return;
    }
    const raf = setTimeout(() => setName(saved), 0);
    return () => clearTimeout(raf);
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/rooms', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { rooms: RoomSummary[] };
        if (!cancelled) {
          setRooms(data.rooms);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [reloadKey]);

  return (
    <>
      <VersusHeader title="Chọn room" backHref="/" backLabel="Về Chơi đơn" />
      <main className="game wrap">
        <p className="meta">
          <span>{name ? <>Tên của bạn: <b>{name}</b></> : ' '}</span>
          <span>{VERSUS.roomCount} room</span>
        </p>

        {failed && (
          <div className="notice" role="alert">
            Không tải được danh sách room.{' '}
            <button className="link-btn" type="button" onClick={() => setReloadKey((k) => k + 1)}>Thử lại</button>
          </div>
        )}

        {!rooms && !failed && <p className="muted">Đang tải danh sách room…</p>}

        {rooms && (
          <ul className="room-list" aria-label="Danh sách room">
            {rooms.map((room) => (
              <li key={room.id}>
                <Link className="room-card" href={`/rooms/${room.id}`}>
                  <span className="room-name">{room.name}</span>
                  <span className="room-info">
                    <span>{room.players} người</span>
                    <span className={`room-badge ${room.status}`}>{room.status === 'playing' ? 'Đang đấu' : 'Đang chờ'}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
