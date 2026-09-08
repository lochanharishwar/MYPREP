'use client';
import { useState } from 'react';
import { useWorkspace } from './workspace-provider';
export function PinBrandAsset({
  onPinned,
}: {
  onPinned: (asset: { id: string; name: string }) => void;
}) {
  const w = useWorkspace(),
    [name, setName] = useState(''),
    [source, setSource] = useState(''),
    [rights, setRights] = useState(''),
    [file, setFile] = useState<File | null>(null),
    [pending, setPending] = useState(false);
  return (
    <div className="data-card field">
      <h3>Pin an original brand asset</h3>
      <label>
        Asset name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Original source URL or file reference
        <input value={source} onChange={(e) => setSource(e.target.value)} />
      </label>
      <label>
        Rights and permitted usage
        <input value={rights} onChange={(e) => setRights(e.target.value)} />
      </label>
      <label>
        Image · PNG, JPEG or WebP, up to 8 MB
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <button
        type="button"
        className="secondary-btn"
        disabled={pending || !file || !name || !source || rights.length < 3}
        onClick={() => {
          void (async () => {
            if (!file || !w.client) return;
            setPending(true);
            try {
              if (file.size > 8_000_000)
                throw new Error('The supported image limit is 8 MB.');
              const { data } = await w.client.auth.getSession();
              const r = await fetch('/api/assets', {
                method: 'POST',
                headers: {
                  Authorization: 'Bearer ' + data.session?.access_token,
                  'x-workspace-id': w.workspaceId,
                  'x-brand-id': w.brandId,
                  'x-asset-info': encodeURIComponent(
                    JSON.stringify({ name, source, rights }),
                  ),
                },
                body: file,
              });
                const result = await r.json() as { id: string; error?: string };
              if (!r.ok) throw new Error(result.error);
              onPinned({ id: result.id, name });
              w.setNotice(
                'Original asset pinned in private storage. Approve the new brand version to use it.',
              );
            } catch (e) {
              w.setNotice((e as Error).message);
            } finally {
              setPending(false);
            }
          })();
        }}
      >
        Pin original asset
      </button>
    </div>
  );
}
