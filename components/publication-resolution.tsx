'use client';
import { useState } from 'react';
import type { Entity, ScheduledPost } from '@/lib/contracts';
import { useWorkspace } from './workspace-provider';
export function PublicationResolution({
  post,
}: {
  post: Entity<ScheduledPost>;
}) {
  const w = useWorkspace(),
    [reason, setReason] = useState(''),
    [candidate, setCandidate] = useState('');
  const matches = post.payload.verificationCandidates ?? [];
  return (
    <details className="spaced">
      <summary>Resolve uncertain publication</summary>
      <p className="muted small spaced">
        Check the destination account and exact content. Matching captions alone
        do not confirm publication. After six automatic checks an operator must
        resolve it; no automatic second post is sent.
      </p>
      {matches.length ? (
        <form
          className="field spaced"
          onSubmit={(e) => {
            e.preventDefault();
            void w
              .mutate('reconcile', {
                id: post.id,
                providerId: candidate,
                reason,
              })
              .then(() =>
                w.setNotice(
                  'Provider record verified and resolution recorded.',
                ),
              )
              .catch(() => {});
          }}
        >
          {matches.map((m) => (
            <label key={m.id}>
              <input
                type="radio"
                name={'candidate-' + post.id}
                value={m.id}
                checked={candidate === m.id}
                onChange={() => setCandidate(m.id)}
              />
              <a
                className="text-link"
                href={m.url}
                target="_blank"
                rel="noreferrer"
              >
                Inspect candidate {m.id}
              </a>
            </label>
          ))}
          <label>
            What confirms this is the approved post?
            <textarea
              required
              minLength={10}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button className="secondary-btn" disabled={w.busy || !candidate}>
            Confirm this provider post
          </button>
        </form>
      ) : (
        <p className="notice">
          No verifiable candidate is available. Reconnect an expired account or
          ask the platform support team to establish the request outcome. Keep
          this post verifying until evidence is available.
        </p>
      )}
    </details>
  );
}
