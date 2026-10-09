'use client';

import type { Status } from '@/lib/game/scoring';
import { APP_VERSION } from '@/lib/version';
import Cell from './Cell';
import { STATUS_COLOR, STATUS_LABEL } from './labels';
import Modal from './Modal';

const SAMPLE: Record<Status, string> = { correct: 'ổ', present: 'ổ', tone: 'ộ', absent: 'b' };

/** Luật chơi, luật màu và cách gõ. */
export default function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} label="Luật chơi">
      <div className="dlg-head">
        <div className="dlg-title">
          <h2>Luật chơi</h2>
          <span className="version" title="Phiên bản">v{APP_VERSION}</span>
        </div>
        <button className="icon-btn" type="button" aria-label="Đóng" onClick={onClose}>✕</button>
      </div>
      <div className="dlg-body">
        <p>Máy chọn ngẫu nhiên một <b>từ ghép tiếng Việt</b> (2 âm tiết trở lên). Bạn có <b>6 lượt</b> để đoán đúng từ khóa, chính xác 100% kể cả dấu thanh (sắc, huyền, hỏi, ngã, nặng).</p>
        <p>Mỗi ô là một chữ cái. Ô chữ cho biết số âm tiết và số chữ cái của từng âm tiết. Lượt đoán chỉ cần đủ chữ cái cho từng âm tiết, không bắt buộc là từ có nghĩa.</p>

        <h3>Luật màu sau mỗi lượt</h3>
        <ul className="legend">
          {(Object.keys(STATUS_LABEL) as Status[]).map((st) => (
            <li key={st}>
              <Cell ch={SAMPLE[st]} status={st} />
              <span><b>{STATUS_COLOR[st]}:</b> {STATUS_LABEL[st]}</span>
            </li>
          ))}
        </ul>
        <p className="muted">Ví dụ: từ khóa có <b>ổ</b> ở ô thứ 2, bạn đoán <b>ộ</b> ở ô thứ 5 → ô 5 tô xanh dương. Lưu ý <b>o</b>, <b>ô</b>, <b>ơ</b> là ba chữ cái khác nhau: đoán <b>o</b> khi từ khóa có <b>ô</b> thì ô đó tô xám.</p>

        <h3>Cách gõ</h3>
        <ul>
          <li>Gõ vào ô nhập bằng <b>bộ gõ tiếng Việt của máy</b>: Unikey/EVKey trên Windows, Telex/VNI của macOS, bàn phím tiếng Việt của iOS/Android.</li>
          <li>Các âm tiết cách nhau bằng dấu cách. Máy tự đặt dấu theo kiểu cũ (hòa, khỏe, thúy), nên gõ &quot;hoà&quot; hay &quot;hòa&quot; đều được.</li>
          <li>Bấm <b>Đoán</b> hoặc <kbd>Enter</kbd> để gửi.</li>
          <li className="hint-feature">Nút <b>Hint</b> gợi ý một ô chữ chưa được tô xanh lá: chữ đúng của ô đó hiện mờ trong hàng đang gõ. Mỗi ván được gợi ý <b>3 lần</b>, không mất lượt đoán.</li>
          <li>Số <b>#N</b> ở góc trên bên trái là số thứ tự của từ khóa. Bấm vào đó, nhập một số khác để chơi đúng từ khóa số đó; bấm <b>New game</b> để chơi từ khóa ngẫu nhiên.</li>
          <li>Bảng chữ cái bên dưới tô màu theo kết quả tốt nhất của từng chữ (bỏ qua dấu thanh: chữ ô gồm ô, ố, ồ…).</li>
        </ul>
        <p className="source-note">Dữ liệu từ điển: <a href="https://dict.minhqnd.com">minhqnd/dictionary</a> v2.0.0 (CC BY-SA 4.0).</p>
      </div>
    </Modal>
  );
}
