'use client';
import { useEffect, useState } from 'react';
import { useWorkspace } from './workspace-provider';
export function useReport<T>(
  type: 'attribution' | 'metrics',
  filters: Record<string, string> = {},
) {
  const { read, brandId, workspaceId, session } = useWorkspace();
  const [end, setEnd] = useState(() =>
    new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  );
  const [start, setStart] = useState(() =>
    new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
  );
  const [data, setData] = useState<{ key: string; value: T } | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0);
  const query = new URLSearchParams({
    type,
    brandId,
    start,
    end,
    ...filters,
  }).toString();
  const resultKey = `${workspaceId}:${session?.user.id ?? ''}:${query}:${revision}`;
  useEffect(() => {
    let active = true;
    if (!brandId || !session) return;
    queueMicrotask(() => {
      setLoading(true);
      setError('');
    });
    void read<T>('/api/reports?' + query)
      .then((r) => {
        if (active) setData({ key: resultKey, value: r });
      })
      .catch((e) => {
        if (active) {
          setError((e as Error).message);
          setData(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [read, query, brandId, session, revision, resultKey]);
  return {
    data: brandId && session && data?.key === resultKey ? data.value : null,
    start,
    end,
    setStart,
    setEnd,
    error,
    loading,
    refresh: () => setRevision((v) => v + 1),
  };
}
export function ReportControls({
  report,
}: {
  report: {
    start: string;
    end: string;
    setStart: (v: string) => void;
    setEnd: (v: string) => void;
    error: string;
    loading: boolean;
    refresh: () => void;
  };
}) {
  return (
    <div className="panel field">
      <div className="tabs-row">
        <label>
          From (UTC)
          <input
            type="date"
            value={report.start}
            onChange={(e) => report.setStart(e.target.value)}
          />
        </label>
        <label>
          Until (exclusive, UTC)
          <input
            type="date"
            value={report.end}
            onChange={(e) => report.setEnd(e.target.value)}
          />
        </label>
        <button
          className="secondary-btn"
          disabled={report.loading}
          onClick={report.refresh}
        >
          {report.loading ? 'Loading report…' : 'Refresh report'}
        </button>
      </div>
      {report.error && (
        <p role="alert" className="notice">
          {report.error}
        </p>
      )}
      <p className="muted small">
        Reports use all matching database records in this period. Resource
        pagination does not change totals.
      </p>
    </div>
  );
}
