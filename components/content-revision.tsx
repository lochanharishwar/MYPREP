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
      <summary>
        {w.localMode
          ? 'Give direction for a new version'
          : 'Edit caption and request review'}
      </summary>
      <form
        className="field spaced"
        onSubmit={(e) => {
          e.preventDefault();
          void w
            .mutate('decision', {
              id: content.id,
              decision: w.localMode ? 'redo' : 'edit',
              caption,
              feedback: w.localMode ? caption : undefined,
            })
            .then(
              () =>
                !w.localMode &&
                w.setNotice(
                  'Revision queued for review. It will appear in the gallery only if it qualifies.',
                ),
            )
            .catch(() => {});
        }}
      >
        <p className="muted small">
          {w.localMode ? (
            'This generates new media and copy using your direction, then reviews them against the same campaign limit.'
          ) : (
            <>
              This creates a separate version, reuses the existing media and
              charges review/preparation against the same campaign limit.
              Approvals of the original version do not approve the revision.
            </>
          )}
        </p>
        <label>
          {w.localMode ? 'Revision direction' : 'Revised caption'}
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
          {w.localMode ? 'Generate new version' : 'Submit revision for review'}
        </button>
      </form>
    </details>
  );
}
