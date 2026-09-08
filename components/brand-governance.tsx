'use client';
import { useState } from 'react';
import type { BrandDNA, Entity } from '@/lib/contracts';
import { brandPolicySchema } from '@/lib/brand-policy';
import { useWorkspace } from './workspace-provider';
import { PinBrandAsset } from './pin-brand-asset';
export function BrandGovernance({ record }: { record: Entity<BrandDNA> }) {
  const w = useWorkspace();
  const [pinned, setPinned] = useState<{ id: string; name: string }[]>([]);
  const [policy, setPolicy] = useState(() =>
    brandPolicySchema.parse(record.payload.governance ?? {}),
  );
  const [claim, setClaim] = useState(''),
    [evidence, setEvidence] = useState('');
  const lines = (s: string) =>
    s
      .split('\n')
      .map((v) => v.trim())
      .filter(Boolean);
  return (
    <section className="panel">
      <div className="section-title">
        <h2>Brand governance</h2>
        <span className="pill">
          {record.payload.governance?.approvedBy
            ? 'Owner-approved version'
            : 'Awaiting owner approval'}
        </span>
      </div>
      <p className="muted small spaced">
        Approved facts and usage rules accompany this exact brand version.
        Corrections create a new version that needs approval.
      </p>
      {w.state.workspace?.role === 'owner' ? (
        <details className="spaced">
          <summary>Review facts, creative preferences and rights</summary>
          <form
            className="field spaced"
            onSubmit={(e) => {
              e.preventDefault();
              void w
                .mutate('brand-policy', { id: record.id, policy })
                .then(() => w.setNotice('New Brand DNA version approved.'))
                .catch(() => {});
            }}
          >
            <PinBrandAsset
              onPinned={(asset) => {
                setPinned((a) => [...a, asset]);
                setPolicy((p) => ({
                  ...p,
                  assetIds: [...p.assetIds, asset.id],
                }));
              }}
            />
            {[
              ...w
                .records<{ name: string }>('brand_asset')
                .map((a) => ({ id: a.id, name: a.payload.name })),
              ...pinned,
            ].map((a) => (
              <label key={a.id}>
                <input
                  type="checkbox"
                  checked={policy.assetIds.includes(a.id)}
                  onChange={(e) =>
                    setPolicy((p) => ({
                      ...p,
                      assetIds: e.target.checked
                        ? [...p.assetIds, a.id]
                        : p.assetIds.filter((id) => id !== a.id),
                    }))
                  }
                />
                {a.name} · pinned creative reference
              </label>
            ))}
            <label>
              Approved claim
              <input
                value={claim}
                onChange={(e) => setClaim(e.target.value)}
                maxLength={1000}
              />
            </label>
            <label>
              Supporting evidence
              <select
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
              >
                <option value="">Choose an observed source</option>
                {record.payload.evidence.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.url} · {e.excerpt.slice(0, 110)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary-btn"
              disabled={!claim.trim() || !evidence}
              onClick={() => {
                setPolicy((p) => ({
                  ...p,
                  approvedClaims: [
                    ...p.approvedClaims,
                    { text: claim.trim(), evidenceIds: [evidence] },
                  ],
                }));
                setClaim('');
              }}
            >
              Add supported claim
            </button>
            {policy.approvedClaims.map((c, i) => (
              <div className="data-card" key={i}>
                {c.text}
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    setPolicy((p) => ({
                      ...p,
                      approvedClaims: p.approvedClaims.filter(
                        (_, j) => i !== j,
                      ),
                    }))
                  }
                >
                  Remove claim
                </button>
              </div>
            ))}
            {(
              ['forbiddenClaims', 'disclaimers', 'palette', 'fonts'] as const
            ).map((k) => (
              <label key={k}>
                {
                  {
                    forbiddenClaims: 'Forbidden phrases',
                    disclaimers: 'Required disclaimers',
                    palette: 'Approved colors (#RRGGBB)',
                    fonts: 'Approved fonts',
                  }[k]
                }{' '}
                · one per line
                <textarea
                  defaultValue={policy[k].join('\n')}
                  onBlur={(e) =>
                    setPolicy((p) => ({ ...p, [k]: lines(e.target.value) }))
                  }
                />
              </label>
            ))}
            {(
              [
                'toneRules',
                'language',
                'market',
                'visualDirection',
                'rightsNotes',
              ] as const
            ).map((k) => (
              <label key={k}>
                {
                  {
                    toneRules: 'Tone rules',
                    language: 'Language',
                    market: 'Market',
                    visualDirection: 'Visual direction',
                    rightsNotes: 'Rights and permitted usage',
                  }[k]
                }
                <textarea
                  value={policy[k]}
                  onChange={(e) =>
                    setPolicy((p) => ({ ...p, [k]: e.target.value }))
                  }
                />
              </label>
            ))}
            <label>
              Usage rights expire (optional, UTC date)
              <input
                type="date"
                value={policy.rightsExpireAt?.slice(0, 10) ?? ''}
                onChange={(e) =>
                  setPolicy((p) => ({
                    ...p,
                    rightsExpireAt: e.target.value
                      ? e.target.value + 'T00:00:00Z'
                      : null,
                  }))
                }
              />
            </label>
            <button className="primary-btn" disabled={w.busy}>
              Approve a new brand version
            </button>
          </form>
        </details>
      ) : (
        <p className="muted small spaced">
          A workspace owner reviews approved claims, brand rules, creative
          preferences and usage rights.
        </p>
      )}
    </section>
  );
}
