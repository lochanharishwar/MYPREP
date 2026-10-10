'use client';
import { useState } from 'react';
import { useWorkspace } from './workspace-provider';
import { SectionHeading } from './section-heading';
import type { MetricObservation } from '@/lib/contracts';
import { Table, TableBody, TableCell, TableRow } from './ui/table';

type SourceRow = { id: string; body: string; url?: string; created_at: string };
export function EvidenceDetails({
  ids,
  metricIds = [],
}: {
  ids: string[];
  metricIds?: string[];
}) {
  const w = useWorkspace();
  const [sources, setSources] = useState<SourceRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const metrics = w
    .records<MetricObservation>('metrics')
    .filter((m) => metricIds.includes(m.id));
  return (
    <details
      className="spaced small"
      onToggle={(e) => {
        if (e.currentTarget.open && sources === null && !loading) {
          setLoading(true);
          void w
            .mutate<{ sources: SourceRow[] }>('evidence', {
              brandId: w.brandId,
              ids,
            })
            .then((r) => setSources(r.sources))
            .catch(() => {})
            .finally(() => setLoading(false));
        }
      }}
    >
      <summary>
        Inspect {ids.length} feedback and {metricIds.length} metric references
      </summary>
      {loading && <p className="muted">Loading sources…</p>}
      {sources?.map((s) => (
        <blockquote className="data-card spaced" key={s.id}>
          <p>{s.body}</p>
          <p className="source">
            {new Date(s.created_at).toLocaleString()}{' '}
            {s.url && /^https?:\/\//.test(s.url) && (
              <a
                className="text-link"
                href={s.url}
                target="_blank"
                rel="noreferrer"
              >
                Original comment ↗
              </a>
            )}
          </p>
        </blockquote>
      ))}
      {sources?.length === 0 && ids.length > 0 && (
        <p className="muted">
          Referenced feedback was deleted or is no longer accessible.
        </p>
      )}
      {metrics.map((m) => (
        <div className="data-card spaced" key={m.id}>
          <strong>
            {m.payload.platform} ·{' '}
            {new Date(m.payload.observedAt).toLocaleString()}
          </strong>
          <Table>
            <TableBody>
              {Object.entries(m.payload.metrics).map(([key, value]) => (
                <TableRow key={key}>
                  <TableCell>{key}</TableCell>
                  <TableCell>{value ?? 'Unavailable'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="source">{JSON.stringify(m.payload.definitions)}</p>
        </div>
      ))}
      {metricIds.length > metrics.length && (
        <p className="muted">
          Some older metric references are outside the current view.
        </p>
      )}
    </details>
  );
}

type EventRow = {
  event_id: string;
  occurred_at: string;
  type: string;
  channel: string;
  amount: number | null;
  currency: string | null;
  source: string;
  account_id?: string;
};
export function CustomerJourney({ customerId }: { customerId: string }) {
  const w = useWorkspace();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [more, setMore] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const load = (offset = 0) =>
    void w
      .mutate<{ events: EventRow[] }>('journey', {
        brandId: w.brandId,
        customerId,
        offset,
      })
      .then((r) => {
        setEvents((old) => (offset ? [...(old ?? []), ...r.events] : r.events));
        setMore(r.events.length === 100);
      })
      .catch(() => {});
  return (
    <details
      className="small spaced"
      onToggle={(e) => {
        if (e.currentTarget.open && events === null) load();
      }}
    >
      <summary>Inspect recorded journey</summary>
      {events?.length === 0 && (
        <p className="muted">No linked events recorded.</p>
      )}
      {events?.map((e) => (
        <div className="data-card spaced" key={e.event_id}>
          <strong>
            {e.type} · {e.channel}
          </strong>
          <p className="muted">
            {new Date(e.occurred_at).toLocaleString()} · {e.source}
          </p>
          {e.amount !== null && (
            <p>
              {e.currency} {e.amount}
            </p>
          )}
          {e.account_id && <p>Account: {e.account_id}</p>}
        </div>
      ))}
      {more && (
        <button
          className="secondary-btn spaced"
          disabled={w.busy}
          onClick={() => load(events?.length ?? 0)}
        >
          Load next 100
        </button>
      )}
      {w.state.workspace?.role === 'owner' && (
        <div className="spaced">
          {confirm ? (
            <div className="notice">
              <p>
                Delete this customer’s linked events, feedback, embeddings and
                derived reports? This cannot be undone.
              </p>
              <button
                className="danger-btn"
                disabled={w.busy}
                onClick={() =>
                  void w
                    .mutate('delete-customer', {
                      brandId: w.brandId,
                      customerId,
                    })
                    .then(() =>
                      w.setNotice(
                        'Customer data deleted. Reports will reconcile.',
                      ),
                    )
                    .catch(() => {})
                }
              >
                Delete customer data
              </button>
              <button
                className="secondary-btn"
                onClick={() => setConfirm(false)}
              >
                Keep data
              </button>
            </div>
          ) : (
            <button className="text-link" onClick={() => setConfirm(true)}>
              Delete customer data…
            </button>
          )}
        </div>
      )}
    </details>
  );
}

export function FunnelPanel() {
  const w = useWorkspace();
  const [data, setData] = useState<{
    visitors: number;
    engaged: number;
    purchasers: number;
    totalEvents: number;
  } | null>(null);
  const [loadedBrand, setLoadedBrand] = useState('');
  const current = loadedBrand === w.brandId ? data : null;
  return (
    <section className="panel">
      <div className="section-title">
        <SectionHeading character="customers">
          First-party conversion funnel
        </SectionHeading>
        <button
          className="secondary-btn"
          disabled={w.busy || !w.brandId}
          onClick={() =>
            void w
              .mutate<typeof data>('funnel', { brandId: w.brandId })
              .then((r) => {
                setData(r);
                setLoadedBrand(w.brandId);
              })
              .catch(() => {})
          }
        >
          Load recorded funnel
        </button>
      </div>
      <p className="muted small spaced">
        Distinct recorded journeys: a page view, a later interaction, then a
        verified purchase. Aggregate social reach remains separate.
      </p>
      {current ? (
        <div className="stack spaced">
          {[
            ['Website visitors', current.visitors],
            ['Engaged after visiting', current.engaged],
            ['Purchased after engaging', current.purchasers],
          ].map(([label, count]) => (
            <div className="data-card" key={label}>
              <div className="section-title">
                <strong>{label}</strong>
                <span>{Number(count).toLocaleString()}</span>
              </div>
              <progress
                aria-label={String(label)}
                max={Math.max(1, current.visitors)}
                value={Number(count)}
              />
            </div>
          ))}
          <p className="source">
            All recorded history · {current.totalEvents} source events.
            Anonymous journeys are not necessarily unique people.
          </p>
        </div>
      ) : (
        <p className="notice spaced">
          Load your linked records to inspect the funnel. No counts are inferred
          from social reach.
        </p>
      )}
    </section>
  );
}
