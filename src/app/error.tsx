'use client';

/** Lỗi khi render trang (vd: chưa cấu hình Supabase). */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="game wrap">
      <div className="panel" role="alert">
        <h2>Không tải được trò chơi</h2>
        <p>{process.env.NODE_ENV === 'development' ? error.message : 'Máy chủ đang gặp sự cố, vui lòng thử lại sau.'}</p>
        <button className="btn" type="button" onClick={reset}>Thử lại</button>
      </div>
    </main>
  );
}
