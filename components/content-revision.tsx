'use client';
import { useState } from 'react';
import type { Entity, ContentVersion } from '@/lib/contracts';
import { useWorkspace } from './workspace-provider';
export function ContentRevision({
  content,
}: {
  content: Entity<ContentVersion>;
}) {
  const w = useWorkspace(),
    [caption, setCaption] = useState(content.payload.caption);
  return (
    <details className="spaced">
      <summary>Edit caption and request review</summary>
      <form
        className="field spaced"
        onSubmit={(e) => {
          e.preventDefault();
          void w
            .mutate('decision', { id: content.id, decision: 'edit', caption })
            .then(() =>
              w.setNotice(
                'Revision queued for review. It will appear in the gallery only if it qualifies.',
              ),
            )
            .catch(() => {});
        }}
      >
        <p className="muted small">
          This creates a separate version, reuses the existing media and charges
          review/preparation against the same campaign limit. Approvals of the
          original version do not approve the revision.
        </p>
        <label>
          Revised caption
          <textarea
            required
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </label>
        <details>
          <summary>Original caption</summary>
          <p className="preserve-lines">{content.payload.caption}</p>
        </details>
        <button
          className="secondary-btn"
          disabled={w.busy || caption === content.payload.caption}
        >
          Submit revision for review
        </button>
      </form>
    </details>
  );
}
