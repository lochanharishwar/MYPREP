'use client';
import { ActivationNotice } from './activation-notice';
// Evidence and signed private storage URLs must bypass image optimization.
/* oxlint-disable next/no-img-element */
// The installed Recharts 3 release supports Cell for per-series colors.
/* oxlint-disable typescript/no-deprecated */
import { useState } from 'react';
import { rankObservations } from '@/lib/campaign-progress';
import { Globe2, ChartNoAxesCombined, Lightbulb, Network } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell } from 'recharts';
import { Table, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { useWorkspace } from './workspace-provider';
import { SectionHeading, SectionMascot } from './section-heading';
import type { Entity, Insight, MetricObservation } from '@/lib/contracts';
import { platforms } from '@/lib/contracts';
import { Empty } from './empty-state';
import { useReport, ReportControls } from './report-controls';
import { EvidenceDetails } from './evidence-panels';
import { Dropdown } from './workspace-shared';
import { chartColors, tooltipStyle } from './workspace-chart-styles';

export function AnalyticsView() {
  const [observedNow] = useState(() => Date.now());
  const w = useWorkspace();
  const [platform, setPlatform] = useState('all'),
    [metric, setMetric] = useState('impressions'),
    [campaign, setCampaign] = useState('all');
  const reportState = useReport<{
    totals: Record<string, number | null>;
    chart: { date: string; value: number | null }[];
    comparison: { platform: string; value: number }[];
    latest: Entity<MetricObservation>[];
    postCount: number;
    observationCount: number;
  }>('metrics', { platform, campaign, metric });
  const latest = reportState.data?.latest ?? [];
  const observations = latest;
  const total = (key: string) => reportState.data?.totals?.[key] ?? null;
  const chart = reportState.data?.chart ?? [];
  const comparison = reportState.data?.comparison ?? [];
  return (
    <div className="stack">
      <div className="section-title">
        <SectionHeading character="analytics">
          Understand the impression you leave.
        </SectionHeading>
        <Dropdown
          value={campaign}
          onChange={setCampaign}
          label="Campaign filter"
          options={[
            { value: 'all', label: 'All campaigns' },
            ...w.records<{ idea: string }>('campaign').map((c) => ({
              value: c.id,
              label: c.payload.idea.slice(0, 60),
            })),
          ]}
        />
        <Dropdown
          value={platform}
          onChange={setPlatform}
          label="Platform filter"
          options={[
            { value: 'all', label: 'All platforms' },
            ...platforms.map((p) => ({ value: p, label: p })),
          ]}
        />
      </div>
      <ReportControls report={reportState} />
      <ActivationNotice feature="analytics" />
      <section className="panel"><h2>Performance snapshot</h2><p className="muted small">Top posts by {metric}, using the latest observation per post in this report. Counts compare volume, not efficiency or causation.</p>{rankObservations(latest, metric).length ? <ol>{rankObservations(latest, metric).map(row => <li key={row.id}><strong>{row.payload.platform} · {row.payload.postId}</strong> — {row.payload.metrics[metric]?.toLocaleString()} {metric}<p className="small muted">Observed {new Date(row.payload.observedAt).toLocaleString()} · {row.payload.definitions[metric] || 'Use the platform definition.'}</p></li>)}</ol> : <p>Awaiting comparable platform observations. Publish an approved version, then collect metrics.</p>}{rankObservations(latest, metric).length > 0 && <p className="small muted">Suggested experiment, not a conclusion: repeat the strongest observed topic with one change to the opening. Compare the same metric, platform and observation window.</p>}</section>
      <div className="metric-grid">
        {[
          ['reach', 'Reported reach'],
          ['impressions', 'Impressions'],
          ['likes', 'Likes'],
          ['views', 'Views'],
        ].map(([key, label]) => (
          <section className="panel" key={key}>
            <SectionMascot
              character={
                key === 'likes'
                  ? 'voice'
                  : key === 'reach'
                    ? 'platforms'
                    : 'analytics'
              }
              className="metric-mascot"
            />
            <div className="small muted">{label}</div>
            <div className="metric-value">
              {total(key)?.toLocaleString() ?? '—'}
            </div>
            <p className="muted small">
              {total(key) === null
                ? 'Awaiting platform data'
                : 'Latest available observations'}
            </p>
          </section>
        ))}
      </div>
      <div className="two-col">
        <section className="panel glass">
          <div className="section-title">
            <SectionHeading character="analytics">
              Performance over time
            </SectionHeading>
            <Dropdown
              value={metric}
              onChange={setMetric}
              label="Chart metric"
              options={[
                'impressions',
                'reach',
                'views',
                'likes',
                'comments',
                'shares',
                'saves',
                'clicks',
                'watchTime',
              ].map((m) => ({
                value: m,
                label: m === 'watchTime' ? 'Watch time (seconds)' : m,
              }))}
            />
          </div>
          {chart.some((c) => c.value !== null) ? (
            <>
              <div className="chart-box">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chart}>
                    <defs>
                      <linearGradient id="areaMint" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="#a2f0dc"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="100%"
                          stopColor="#a2f0dc"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#ffffff09" vertical={false} />
                    <XAxis dataKey="date" stroke="#7a92a3" fontSize={12} />
                    <YAxis stroke="#7a92a3" fontSize={12} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#a2f0dc"
                      fill="url(#areaMint)"
                      connectNulls={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <details className="small">
                <summary>View accessible data table</summary>
                <Table>
                  <TableBody>
                    {chart.map((c) => (
                      <TableRow key={c.date}>
                        <TableCell>{c.date}</TableCell>
                        <TableCell>{c.value ?? 'Unavailable'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </details>
            </>
          ) : (
            <Empty
              icon={ChartNoAxesCombined}
              title="A story that starts with real results"
              description="Once an approved post is published, your agents will collect the available performance data. No simulated growth curves."
            />
          )}
        </section>
        <section className="panel">
          <SectionHeading character="platforms">
            Channel perspective
          </SectionHeading>
          {comparison.length ? (
            <div className="chart-box spaced">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparison}>
                  <XAxis dataKey="platform" stroke="#7a92a3" fontSize={12} />
                  <YAxis stroke="#7a92a3" fontSize={12} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" radius={[7, 7, 0, 0]}>
                    {comparison.map((p, i) => (
                      <Cell key={p.platform} fill={chartColors[i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty
              icon={Network}
              title="Your channels, in context"
              description="Compare the available metrics from connected accounts, with each platform's definitions preserved."
            />
          )}
        </section>
      </div>
      <p className="muted small">
        Reach is summed as reported by each platform and is not a deduplicated
        audience count. Missing metrics are unavailable, not zero. Trend values
        are daily snapshots, not daily increments.
      </p>
      {latest.length > 0 && (
        <section className="panel">
          <SectionHeading character="sources">
            Observation freshness & definitions
          </SectionHeading>
          <Table>
            <TableBody>
              {latest.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>{o.payload.platform}</TableCell>
                  <TableCell>
                    {new Date(o.payload.observedAt).toLocaleString()}{' '}
                    {observedNow - Date.parse(o.payload.observedAt) > 86400000
                      ? '· Stale (over 24 hours)'
                      : ''}
                  </TableCell>
                  <TableCell>
                    <details>
                      <summary>Post observations and definitions</summary>
                      <p>Post: {o.payload.postId}</p>
                      {Object.entries(o.payload.metrics).map(([key, value]) => (
                        <p key={key}>
                          {key}:{' '}
                          {value === null
                            ? 'Unavailable'
                            : value.toLocaleString()}
                        </p>
                      ))}
                      <p className="small muted">
                        Watch percentages are reported per post; they are not
                        summed across videos.
                      </p>
                      {Object.entries(o.payload.definitions).map(([k, v]) => (
                        <p key={k}>
                          {k}: {v}
                        </p>
                      ))}
                    </details>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
      <section className="panel">
        <SectionHeading character="voice">
          Audience sentiment & themes
        </SectionHeading>
        {w.records<{
          postId: string;
          items: { id: string; sentiment: string; theme: string }[];
          observedAt: string;
        }>('feedback_summary').length ? (
          [
            ...new Map(
              w
                .records<{
                  postId: string;
                  items: { id: string; sentiment: string; theme: string }[];
                  observedAt: string;
                }>('feedback_summary')
                .map((s) => [s.payload.postId, s] as const)
                .reverse(),
            ).values(),
          ]
            .filter((s) =>
              observations.some((o) => o.payload.postId === s.payload.postId),
            )
            .map((s) => (
              <article className="data-card spaced" key={s.id}>
                <p className="source">
                  Sampled accessible comments ·{' '}
                  {new Date(s.payload.observedAt).toLocaleString()}
                </p>
                <div className="tabs-row spaced">
                  {['positive', 'neutral', 'negative', 'mixed'].map((label) => (
                    <span className="pill" key={label}>
                      {label}:{' '}
                      {
                        s.payload.items.filter((i) => i.sentiment === label)
                          .length
                      }
                    </span>
                  ))}
                </div>
                {[...new Set(s.payload.items.map((i) => i.theme))].map(
                  (theme) => (
                    <p className="small spaced" key={theme}>
                      {theme}
                    </p>
                  ),
                )}
                <EvidenceDetails ids={s.payload.items.map((i) => i.id)} />
              </article>
            ))
        ) : (
          <p className="muted spaced">
            Awaiting accessible comments. Sentiment reflects expressed feedback
            and may be ambiguous.
          </p>
        )}
      </section>
      <section className="panel glass">
        <SectionHeading character="competitors">
          Competitor & market reading
        </SectionHeading>
        {w.records<{
          title: string;
          description: string;
          url: string;
          observedAt: string;
        }>('news').length ? (
          <div className="two-col spaced">
            {w
              .records<{
                title: string;
                description: string;
                url: string;
                observedAt: string;
              }>('news')
              .slice(0, 10)
              .map((n) => (
                <article className="data-card" key={n.id}>
                  <Globe2 size={22} />
                  <h3 className="spaced">{n.payload.title}</h3>
                  <p className="muted small">{n.payload.description}</p>
                  <a
                    href={n.payload.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                  >
                    Read source ↗
                  </a>
                  <p className="source">
                    Retrieved {new Date(n.payload.observedAt).toLocaleString()}{' '}
                    · source publication date may differ
                  </p>
                </article>
              ))}
          </div>
        ) : (
          <p className="muted spaced">
            Cited research appears after competitor evidence is available and
            research services are activated.
          </p>
        )}
      </section>
      <section className="panel">
        <SectionHeading character="opportunities">
          Signals worth your attention
        </SectionHeading>
        {w.records<Insight>('insight').length ? (
          <div className="two-col spaced">
            {w.records<Insight>('insight').map((i) => (
              <article className="data-card" key={i.id}>
                <Lightbulb size={22} className="muted" />
                <h3 className="spaced">{i.payload.what}</h3>
                <p>{i.payload.recommendation}</p>
                <EvidenceDetails
                  ids={i.payload.evidenceIds}
                  metricIds={i.payload.metricIds}
                />
              </article>
            ))}
          </div>
        ) : (
          <Empty
            icon={Lightbulb}
            title="Listening before drawing conclusions"
            description="Evidence-backed changes and recommendations appear as performance history and audience feedback become available."
          />
        )}
      </section>
    </div>
  );
}
