import type { Definition } from '@/lib/game/types';

export const DEFINITION_SOURCE = 'Nguồn giải nghĩa: Từ điển tiếng Việt (TVTD) qua minhqnd/dictionary · CC BY-SA 4.0';

/** Giải nghĩa từ khóa ở màn hình kết thúc (Chơi đơn và đấu theo nhóm). Có thể kèm ghi nguồn theo giấy phép dữ liệu. */
export default function DefinitionList({ definitions, showSource = false }: { definitions: Definition[]; showSource?: boolean }) {
  return (
    <>
      {definitions.length ? (
        <ol className="defs">
          {definitions.map((d, i) => (
            <li key={i}>
              {d.pos && <span className="pos">{d.pos}</span>}
              {d.text}
              {d.example && <span className="ex">Ví dụ: {formatExample(d.example)}</span>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">Chưa có giải nghĩa cho từ này trong từ điển.</p>
      )}
      {showSource && <p className="source-note">{DEFINITION_SOURCE}</p>}
    </>
  );
}

/** Ví dụ trong từ điển ngăn cách bằng "~"; chỉ lấy 2 ví dụ đầu. */
function formatExample(e: string) {
  return e.split(/\s*~\s*/).filter(Boolean).slice(0, 2).join(' · ');
}
