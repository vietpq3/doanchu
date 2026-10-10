'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getPlayerId, getSavedName } from '@/lib/client/player';
import type { ClientMessage, RoomView, ServerMessage } from '@/lib/versus/protocol';
import { sanitizeName } from '@/lib/versus/protocol';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'rejected' | 'replaced';

export interface RoomError {
  /** tăng mỗi lần có lỗi mới, để giao diện biết đó là một lỗi mới dù nội dung giống lần trước */
  seq: number;
  code: string;
  message: string;
}

interface RoomContextValue {
  roomId: number;
  view: RoomView | null;
  status: ConnectionStatus;
  /** lý do bị từ chối vào phòng (phòng đầy, tên trống...) */
  fatal: string | null;
  /** lỗi của thao tác gần nhất (vd: lượt đoán thiếu chữ) */
  lastError: RoomError | null;
  /** giờ server trừ giờ trình duyệt (ms), để đếm ngược theo giờ server */
  clockOffset: number;
  send: (msg: ClientMessage) => void;
  /** Rời phòng: báo server rồi về danh sách room */
  leave: () => void;
}

const RoomContext = createContext<RoomContextValue | null>(null);

export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom phải dùng bên trong RoomProvider');
  return ctx;
}

/** Lỗi khiến người chơi không vào được phòng: dừng, không tự kết nối lại. */
const FATAL_CODES = new Set(['room_full', 'bad_name', 'not_in_room']);

/**
 * Giữ MỘT kết nối WebSocket tới Durable Object của phòng, dùng chung cho /rooms/[id] và /rooms/[id]/versus
 * (layout không bị dựng lại khi chuyển giữa hai trang nên kết nối không đứt). Rời khỏi phòng (đóng trang hoặc
 * chuyển ra ngoài) = đóng kết nối = rời phòng. Mất mạng giữa chừng thì tự nối lại.
 */
export function RoomProvider({ roomId, children }: { roomId: number; children: ReactNode }) {
  const router = useRouter();
  const [view, setView] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [fatal, setFatal] = useState<string | null>(null);
  const [lastError, setLastError] = useState<RoomError | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const errorSeq = useRef(0);
  const leftRef = useRef(false);

  useEffect(() => {
    const name = sanitizeName(getSavedName());
    if (!name) {
      router.replace('/'); // chưa có tên: về Chơi đơn để nhập
      return;
    }
    let closedByUs = false;
    let terminal = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${scheme}//${location.host}/ws/rooms/${roomId}?pid=${encodeURIComponent(getPlayerId())}&name=${encodeURIComponent(name)}`);
      wsRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setStatus('open');
      };
      ws.onmessage = (event) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }
        if (msg.type === 'state') {
          setView(msg.view);
          setClockOffset(msg.view.serverNow - Date.now());
        } else if (msg.type === 'replaced') {
          terminal = true;
          setStatus('replaced');
        } else if (FATAL_CODES.has(msg.code)) {
          terminal = true;
          setFatal(msg.message);
          setStatus('rejected');
          ws.close(); // server không đóng giúp socket bị từ chối lúc vào, nên client tự đóng
        } else {
          setLastError({ seq: ++errorSeq.current, code: msg.code, message: msg.message });
        }
      };
      ws.onclose = () => {
        if (closedByUs || terminal) return;
        setStatus('reconnecting');
        timer = setTimeout(connect, Math.min(5000, 500 * 2 ** attempt++));
      };
    };
    connect();

    return () => {
      closedByUs = true;
      clearTimeout(timer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [roomId, router]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const leave = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    send({ type: 'leave' });
    router.push('/rooms');
  }, [send, router]);

  const value = useMemo(
    () => ({ roomId, view, status, fatal, lastError, clockOffset, send, leave }),
    [roomId, view, status, fatal, lastError, clockOffset, send, leave],
  );
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

/**
 * Số giây còn lại tới mốc `endsAt` (giờ server), cập nhật 4 lần/giây; null khi không có mốc.
 * `serverNow` (giờ server lúc nhận trạng thái gần nhất) dùng làm giá trị khởi đầu trước lần cập nhật đầu tiên.
 */
export function useSecondsLeft(endsAt: number | null, serverNow: number): number | null {
  const { clockOffset } = useRoom();
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => setNow(Date.now() + clockOffset);
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [endsAt, clockOffset]);
  return endsAt === null ? null : Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/**
 * Lỗi của thao tác gần nhất để hiện thành thông báo ngắn. Lỗi nằm trong provider dùng chung cho cả hai trang của phòng nên mỗi màn
 * chỉ hiện lỗi xảy ra SAU khi màn đó được mở (không hiện lại lỗi của trang trước). `visible` tự ẩn sau `hideAfterMs`;
 * `latest` giữ nguyên (dùng để rung hàng đang gõ, nhận biết lỗi mới qua `seq`).
 */
export function useRoomError(hideAfterMs: number): { visible: RoomError | null; latest: RoomError | null } {
  const { lastError } = useRoom();
  const [baseline] = useState(() => lastError?.seq ?? 0);
  const [hiddenSeq, setHiddenSeq] = useState(0);
  const latest = lastError && lastError.seq > baseline ? lastError : null;
  useEffect(() => {
    if (!latest) return;
    const timer = setTimeout(() => setHiddenSeq(latest.seq), hideAfterMs);
    return () => clearTimeout(timer);
  }, [latest, hideAfterMs]);
  return { visible: latest && latest.seq !== hiddenSeq ? latest : null, latest };
}

