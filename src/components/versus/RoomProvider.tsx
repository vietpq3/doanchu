'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getPlayerId, getSavedName } from '@/lib/client/player';
import { VERSUS } from '@/lib/versus/config';
import type { ChatMessage, ClientMessage, RoomView, ServerMessage } from '@/lib/versus/protocol';
import { isChatError, sanitizeName } from '@/lib/versus/protocol';

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
  /** gửi lệnh cho server; false nếu đang mất kết nối (lệnh không được gửi) */
  send: (msg: ClientMessage) => boolean;
  /** Rời phòng: báo server rồi về danh sách room */
  leave: () => void;
  /** các tin chat gần nhất của phòng (cũ trước, mới sau) */
  chat: ChatMessage[];
  /** lỗi của lần gửi chat gần nhất (vd gửi quá nhanh): hiện trong khung chat, không hiện ở màn chơi */
  chatError: RoomError | null;
  /** Đăng ký nhận từng tin chat mới đến (không gồm lịch sử gửi lúc vào phòng); trả về hàm hủy đăng ký. */
  onChatMessage: (listener: (message: ChatMessage) => void) => () => void;
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
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatError, setChatError] = useState<RoomError | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const errorSeq = useRef(0);
  const leftRef = useRef(false);
  const chatListeners = useRef(new Set<(message: ChatMessage) => void>());

  useEffect(() => {
    const name = sanitizeName(getSavedName());
    if (!name) {
      router.replace('/'); // phòng hờ: NameGate đã hỏi tên trước khi dựng RoomProvider
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
        } else if (msg.type === 'chat_history') {
          setChat(msg.messages); // vào/nối lại phòng: thay toàn bộ (không trùng tin đã có)
        } else if (msg.type === 'chat') {
          setChat((prev) => [...prev, msg.message].slice(-VERSUS.chatHistory));
          for (const listener of chatListeners.current) listener(msg.message);
        } else if (msg.type === 'replaced') {
          terminal = true;
          setStatus('replaced');
        } else if (isChatError(msg.code)) {
          setChatError({ seq: ++errorSeq.current, code: msg.code, message: msg.message });
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
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }, []);

  const onChatMessage = useCallback((listener: (message: ChatMessage) => void) => {
    const listeners = chatListeners.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const leave = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    send({ type: 'leave' });
    router.push('/rooms');
  }, [send, router]);

  const value = useMemo(
    () => ({ roomId, view, status, fatal, lastError, clockOffset, send, leave, chat, chatError, onChatMessage }),
    [roomId, view, status, fatal, lastError, clockOffset, send, leave, chat, chatError, onChatMessage],
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
  // `now` có thể còn cũ ở lần vẽ đầu (vd tải lại trang: serverNow lúc đầu là 0); giờ server mới nhất chặn dưới để không hiện số khổng lồ
  return endsAt === null ? null : Math.max(0, Math.ceil((endsAt - Math.max(now, serverNow)) / 1000));
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

