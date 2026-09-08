'use client';
import { useWorkspace } from './workspace-provider';
export function ResourcePaging() {
  const w = useWorkspace();
  const groups = Object.entries(w.pages).filter(([, p]) => p.nextCursor);
  if (!groups.length) return null;
  return (
    <details className="panel spaced small">
      <summary>Load older workspace records</summary>
      <div className="tabs-row">
        {groups.map(([kind]) => (
          <button
            className="secondary-btn"
            key={kind}
            disabled={w.busy}
            onClick={() =>
              void w
                .loadMore(kind)
                .catch((e) => w.setNotice((e as Error).message))
            }
          >
            More {kind.replaceAll('_', ' ')}
          </button>
        ))}
      </div>
      <p className="source">
        Each resource has its own page history. Reports query the complete
        selected period.
      </p>
    </details>
  );
}
