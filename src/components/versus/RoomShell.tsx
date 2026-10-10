'use client';

import type { ReactNode } from 'react';
import RoomChat from './RoomChat';
import { useRoom } from './RoomProvider';

/**
 * Khung trang của một phòng: trang đang mở (Inside Room hoặc màn đấu) và chat của phòng. Chat chỉ có khi đã vào được phòng
 * (không có khi đang vào, bị từ chối, hoặc tab bị thay). Laptop: hai cột, chat bên phải; điện thoại: chat là bubble (globals.css).
 */
export default function RoomShell({ children }: { children: ReactNode }) {
  const { view, status } = useRoom();
  const chatOn = view !== null && status !== 'rejected' && status !== 'replaced';
  return (
    <div className={'room-layout' + (chatOn ? ' with-chat' : '')}>
      <div className="room-page">{children}</div>
      {chatOn && <RoomChat />}
    </div>
  );
}
