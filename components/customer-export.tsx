'use client';
import { useState } from 'react';
import { useWorkspace } from './workspace-provider';
export function CustomerExport() {
  const w = useWorkspace(),
    [kind, setKind] = useState('customers'),
    [cursor, setCursor] = useState(''),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  return (
    <details className="panel">
      <summary>Export authorized customer records</summary>
      <div className="field spaced">
        <p className="muted small">
          Requires customer-data and export permissions. Downloads 200 records
          per page and records each export in the audit history.
        </p>
        <label>
          Record type
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setCursor('');
              setDone(false);
            }}
          >
            <option value="customers">Customers</option>
            <option value="accounts">Accounts</option>
          </select>
        </label>
        <button
          className="secondary-btn"
          disabled={busy || done || !w.brandId}
          onClick={() => {
            setBusy(true);
            void w
              .read<{ csv: string; nextCursor: string | null }>(
                '/api/export?brandId=' +
                  w.brandId +
                  '&kind=' +
                  kind +
                  (cursor ? '&after=' + cursor : ''),
              )
              .then((r) => {
                const url = URL.createObjectURL(
                    new Blob([r.csv], { type: 'text/csv;charset=utf-8' }),
                  ),
                  a = document.createElement('a');
                a.href = url;
                a.download = 'brandcurrent-' + kind + '.csv';
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setCursor(r.nextCursor ?? '');
                setDone(!r.nextCursor);
              })
              .catch((e) => w.setNotice((e as Error).message))
              .finally(() => setBusy(false));
          }}
        >
          {done
            ? 'Export complete'
            : cursor
              ? 'Download next page'
              : 'Download first page'}
        </button>
      </div>
    </details>
  );
}
