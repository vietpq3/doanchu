import { notFound } from 'next/navigation';
import { RoomProvider } from '@/components/versus/RoomProvider';
import { isRoomId } from '@/lib/versus/config';

/** Layout chung của /rooms/[id] và /rooms/[id]/versus: giữ một kết nối WebSocket tới phòng xuyên suốt hai trang. */
export default async function RoomLayout({ children, params }: LayoutProps<'/rooms/[id]'>) {
  const { id } = await params;
  const roomId = Number(id);
  if (!/^\d+$/.test(id) || !isRoomId(roomId)) notFound();
  return <RoomProvider roomId={roomId}>{children}</RoomProvider>;
}
