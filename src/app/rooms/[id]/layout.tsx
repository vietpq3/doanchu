import { notFound } from 'next/navigation';
import NameGate from '@/components/versus/NameGate';
import { RoomProvider } from '@/components/versus/RoomProvider';
import { isRoomId, roomName } from '@/lib/versus/config';

/**
 * Layout chung của /rooms/[id] và /rooms/[id]/versus: giữ một kết nối WebSocket tới phòng xuyên suốt hai trang.
 * Chưa có tên (vd mở thẳng link phòng) thì hỏi tên tại chỗ trước, rồi mới kết nối.
 */
export default async function RoomLayout({ children, params }: LayoutProps<'/rooms/[id]'>) {
  const { id } = await params;
  const roomId = Number(id);
  if (!/^\d+$/.test(id) || !isRoomId(roomId)) notFound();
  return (
    <NameGate title={roomName(roomId)}>
      <RoomProvider roomId={roomId}>{children}</RoomProvider>
    </NameGate>
  );
}
