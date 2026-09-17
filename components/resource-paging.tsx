'use client';
import { useRef, useState } from 'react';
import { useWorkspace } from './workspace-provider';
export function ResourcePaging() {
  const w = useWorkspace();
  const [loading, setLoading] = useState('');
  const pending = useRef(false);
  async function more(kind: string) {
    if (pending.current) return;
    pending.current = true;
    setLoading(kind);
    try {
      await w.loadMore(kind);
    } catch (e) {
      w.setNotice((e as Error).message);
    } finally {
      pending.current = false;
      setLoading('');
    }
  }
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
            disabled={w.busy || !!loading}
            onClick={() => void more(kind)}
          >
            {loading === kind ? 'Loading' : 'More'} {kind.replaceAll('_', ' ')}
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
