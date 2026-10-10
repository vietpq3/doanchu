import type { Metadata } from 'next';
import NameGate from '@/components/versus/NameGate';
import RoomListScreen from '@/components/versus/RoomListScreen';

export const metadata: Metadata = { title: 'Đấu theo nhóm · Đoán Chữ' };

/** Room List: danh sách room của tính năng đấu theo nhóm (docs/versus-v2.md). Chưa có tên thì hỏi tên tại chỗ. */
export default function RoomsPage() {
  return (
    <NameGate title="Chọn room">
      <RoomListScreen />
    </NameGate>
  );
}
