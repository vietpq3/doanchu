'use client';

import { useRouter } from 'next/navigation';
import { useRef, type ReactNode } from 'react';
import { saveName, useSavedName } from '@/lib/client/player';
import NameDialog from './NameDialog';
import VersusHeader from './VersusHeader';

/**
 * Các trang đấu theo nhóm cần tên người chơi. Đã có tên thì hiện trang; chưa có (vd mở thẳng /rooms/2) thì hỏi tên
 * ngay tại chỗ rồi hiện trang, không đưa về trang chủ. Hủy hộp thoại thì về trang chủ.
 */
export default function NameGate({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  const name = useSavedName();
  const submitted = useRef(false); // hộp thoại biến mất khi đã có tên: không coi đó là Hủy

  if (name === null) return null; // đang hydrate: chưa đọc được tên
  if (name) return children;
  return (
    <>
      <VersusHeader title={title} backHref="/" backLabel="Về trang chủ" />
      <main className="game wrap">
        <p className="muted">Nhập tên để đấu theo nhóm.</p>
      </main>
      <NameDialog
        open
        title="Tên của bạn"
        initialName=""
        submitLabel="Vào"
        onSubmit={(newName) => {
          submitted.current = true;
          saveName(newName);
        }}
        onClose={() => {
          if (!submitted.current) router.push('/');
        }}
      />
    </>
  );
}
