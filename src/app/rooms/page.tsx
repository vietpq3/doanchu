import type { Metadata } from 'next';
import RoomListScreen from '@/components/versus/RoomListScreen';

export const metadata: Metadata = { title: 'Đấu theo nhóm · Đoán Chữ' };

/** Room List: danh sách room của tính năng đấu theo nhóm (docs/versus-v2.md). */
export default function RoomsPage() {
  return <RoomListScreen />;
}
