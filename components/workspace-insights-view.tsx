'use client';
import { ActivationNotice } from './activation-notice';
// Evidence and signed private storage URLs must bypass image optimization.
/* oxlint-disable next/no-img-element */
// The installed Recharts 3 release supports Cell for per-series colors.
/* oxlint-disable typescript/no-deprecated */
import { useState } from 'react';
import { CustomerExport } from './customer-export';
import { RefreshCw, Fingerprint, Upload, Network } from 'lucide-react';
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { useWorkspace } from './workspace-provider';
import { SectionHeading, SectionMascot } from './section-heading';
import type { Insight } from '@/lib/contracts';
import { Empty } from './empty-state';
import { useReport, ReportControls } from './report-controls';
import { EvidenceDetails, CustomerJourney, FunnelPanel } from './evidence-panels';
import { Dropdown } from './workspace-shared';
import { chartColors, tooltipStyle } from './workspace-chart-styles';

export function InsightsView() {
  const w = useWorkspace();
  const [currency, setCurrency] = useState('USD'),
    [model, setModel] = useState('linear'),
    [importOpen, setImportOpen] = useState(false),
    [kind, setKind] = useState('events'),
    [csv, setCSV] = useState(''),
    [tracking, setTracking] = useState<{
      script: string;
      endpoint: string;
      webhookSecret: string;
    } | null>(null);
  const reportState = useReport<{
    channels: {
      channel: string;
      currency: string;
      first_touch: number;
      last_touch: number;
      linear: number;
    }[];
    revenue: {
      currency: string;
      purchases: number;
      customers: number;
      new_customers: number;
      anonymous_purchases: number;
      revenue: number;
    }[];
    spend: {
      amount: number;
      currency: string;
      category: string;
      channel: string;
    }[];
    lookbackDays: number;
    customerPolicy: string;
    linearPolicy: string;
  }>('attribution');
  const report = reportState.data;
  const insight = w.records<Insight>('insight');
  const rev = report?.revenue?.find((r) => r.currency === currency);
  const spend = (report?.spend ?? [])
    .filter((s) => s.currency === currency)
    .map((payload) => ({ payload }));
  const ad = spend
      .filter((s) => s.payload.category === 'advertising')
      .reduce((a, s) => a + Number(s.payload.amount), 0),
    acquisition = spend.reduce((a, s) => a + Number(s.payload.amount), 0);
  const channels =
    report?.channels
      ?.filter((c) => c.currency === currency)
      .map((c) => ({
        channel: c.channel,
        value: Number(c[model as 'linear']),
      })) ?? [];
  const customers = w.records<{
      customerId: string;
      name: string;
      email?: string;
      accountId?: string;
    }>('customers'),
    accounts = w.records<{ accountId: string; name: string }>('accounts');
  const paidChannels = new Set(
    spend
      .filter((s) => s.payload.category === 'advertising')
      .map((s) => s.payload.channel),
  );
  const paidRevenue = channels
    .filter((c) => paidChannels.has(c.channel))
    .reduce((sum, c) => sum + c.value, 0);
  const number = (n: number | undefined) =>
    n === undefined
      ? '—'
      : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return (
    <div className="stack">
      <div className="section-title">
        <div>
          <SectionHeading character="customers">
            Beyond the click. Into the why.
          </SectionHeading>
          <p className="muted small spaced">
            Follow recorded journeys, understand customer feedback, and decide
            what to try next.
          </p>
        </div>
        <ReportControls report={reportState} />
        <div className="tabs-row">
          <button
            className="secondary-btn"
            disabled={w.localMode}
            onClick={() => setImportOpen(true)}
          >
            <Upload size={15} /> Import data
          </button>
          <button
            className="icon-btn"
            aria-label="Refresh customer insights"
            disabled={w.localMode || w.busy || !w.brandId}
            onClick={() =>
              void w
                .mutate('refresh-insights', { brandId: w.brandId })
                .then(() =>
                  w.setNotice('Attribution and insights queued for refresh.'),
                )
                .catch(() => {})
            }
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
      <ActivationNotice feature="insights" />
      <div className="tabs-row">
        <Dropdown
          value={currency}
          onChange={setCurrency}
          label="Reporting currency"
          options={[
            ...new Set([
              'USD',
              'INR',
              ...(report?.revenue?.map((r) => r.currency) ?? []),
            ]),
          ].map((c) => ({ value: c, label: c }))}
        />
        <span className="pill">
          {report?.lookbackDays ?? 30}-day attribution lookback
        </span>
        <span className="pill">Verified first-party journeys</span>
      </div>
      <div className="metric-grid">
        {[
          [
            'Verified purchases',
            number(rev?.purchases),
            'Authenticated events and imports',
          ],
          [
            'Net revenue',
            rev ? `${currency} ${number(Number(rev.revenue))}` : '—',
            'Purchases less recorded refunds',
          ],
          [
            'Acquisition cost',
            rev?.new_customers && spend.length
              ? `${currency} ${number(acquisition / rev.new_customers)}`
              : '—',
            'Acquisition spend / new customers',
          ],
          [
            'ROAS',
            rev && ad ? `${number(paidRevenue / ad)}×` : '—',
            'Attributed revenue on paid channels / ad spend',
          ],
        ].map(([title, value, desc]) => (
          <section className="panel" key={title}>
            <SectionMascot
              character={
                title === 'Verified purchases' ? 'review' : 'analytics'
              }
              className="metric-mascot"
            />
            <p className="muted small">{title}</p>
            <div className="metric-value">{value}</div>
            <p className="muted small">{desc}</p>
          </section>
        ))}
      </div>
      <div className="two-col">
        <section className="panel glass">
          <div className="section-title">
            <SectionHeading character="strategy">
              Where credit belongs
            </SectionHeading>
            <Dropdown
              value={model}
              onChange={setModel}
              label="Attribution model"
              options={[
                { value: 'linear', label: 'Linear' },
                { value: 'first_touch', label: 'First touch' },
                { value: 'last_touch', label: 'Last touch' },
              ]}
            />
          </div>
          {channels.length ? (
            <>
              <div className="chart-box">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={channels}
                      dataKey="value"
                      nameKey="channel"
                      innerRadius={65}
                      outerRadius={105}
                      paddingAngle={4}
                    >
                      {channels.map((c, i) => (
                        <Cell key={c.channel} fill={chartColors[i % 5]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <Table>
                <TableBody>
                  {channels.map((c) => (
                    <TableRow key={c.channel}>
                      <TableCell>{c.channel}</TableCell>
                      <TableCell>
                        {currency} {number(c.value)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : (
            <Empty
              icon={Network}
              title="Connect the journey to the outcome"
              description="Add website tracking and signed purchase events to calculate attribution from recorded touchpoints. Social engagement alone cannot establish a purchase."
            />
          )}
        </section>
        <section className="panel">
          <SectionHeading character="connections">
            Your first-party data connection
          </SectionHeading>
          <p className="muted small spaced">
            Track page views and engagement on your website. Send purchases,
            refunds, and identity links through signed server webhooks.
          </p>
          <div className="step-line">
            <div>
              <span>01 / REACHED</span>
              <strong>Platform observations</strong>
            </div>
            <div>
              <span>02 / ENGAGED</span>
              <strong>Recorded interactions</strong>
            </div>
            <div>
              <span>03 / CONVERTED</span>
              <strong>Verified purchases</strong>
            </div>
          </div>
          <button
            className="secondary-btn spaced"
            disabled={w.localMode || !w.brandId || w.busy}
            onClick={() =>
              void w
                .mutate<typeof tracking>('tracking', { brandId: w.brandId })
                .then(setTracking)
                .catch(() => {})
            }
          >
            Create tracking connection
          </button>
          {tracking && (
            <div className="spaced field">
              <label>
                Website snippet
                <textarea readOnly value={tracking.script} />
              </label>
              <label>
                Webhook endpoint
                <input readOnly value={tracking.endpoint} />
              </label>
              <label>
                Webhook signing secret · copy now
                <input readOnly value={tracking.webhookSecret} />
              </label>
              <p className="notice">
                Keep the signing secret on your server. It is displayed only now
                and must never be put in your website script.
              </p>
            </div>
          )}
        </section>
      </div>
      {report && (
        <p className="notice small">
          {report.customerPolicy}. {report.linearPolicy}. CAC excludes anonymous
          purchases; source dates must cover the business acquisition history.
        </p>
      )}
      <FunnelPanel key={w.brandId} />
      {!w.localMode && <CustomerExport key={'export-' + w.brandId} />}
      {w.records<{
        status: string;
        channels?: { channel: string; credit: number }[];
        reason?: string;
      }>('markov')[0] && (
        <section className="panel">
          <SectionHeading character="analytics">
            Markov attribution
          </SectionHeading>
          <p className="small muted">
            Rolling model window:{' '}
            {w
              .records<{ periodStart?: string }>('markov')[0]
              .payload.periodStart?.slice(0, 10) ?? 'Legacy history'}{' '}
            to{' '}
            {w
              .records<{ periodEnd?: string }>('markov')[0]
              .payload.periodEnd?.slice(0, 10) ?? 'last refresh'}
            . This independent model window does not change with the report date
            filter.
          </p>
          <p className="muted spaced">
            {w.records<{ status: string; reason?: string }>('markov')[0].payload
              .reason ??
              'Deterministic removal-effect model calculated from recorded journeys.'}
          </p>
          <Table>
            <TableBody>
              {w
                .records<{ channels?: { channel: string; credit: number }[] }>(
                  'markov',
                )[0]
                .payload.channels?.map((c) => (
                  <TableRow key={c.channel}>
                    <TableCell>{c.channel}</TableCell>
                    <TableCell>{(c.credit * 100).toFixed(1)}% credit</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </section>
      )}
      <section className="panel">
        <div className="section-title">
          <SectionHeading character="opportunities">
            From a signal to an experiment
          </SectionHeading>
          <span className="pill">AGENTS 08 + 09</span>
        </div>
        {insight.length ? (
          <div className="card-list">
            {insight.map((i) => (
              <article className="data-card" key={i.id}>
                <span className="pill">
                  {i.payload.confidence} confidence · hypothesis
                </span>
                <div className="insight-grid spaced">
                  <div>
                    <span className="eyebrow">WHAT CHANGED</span>
                    <p>{i.payload.what}</p>
                  </div>
                  <div>
                    <span className="eyebrow">POSSIBLE WHY</span>
                    <p>{i.payload.why}</p>
                  </div>
                  <div>
                    <span className="eyebrow">WHAT TO TRY</span>
                    <p>{i.payload.recommendation}</p>
                  </div>
                </div>
                <EvidenceDetails
                  ids={i.payload.evidenceIds}
                  metricIds={i.payload.metricIds}
                />
              </article>
            ))}
          </div>
        ) : (
          <Empty
            icon={Fingerprint}
            title="The numbers tell you what. Your customers help explain why."
            description="When metrics and customer feedback overlap, your agents will propose a supported hypothesis and a specific experiment."
          />
        )}
      </section>
      <div className="two-col">
        <section className="panel">
          <SectionHeading character="customers">
            Customer journeys
          </SectionHeading>
          {customers.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Account</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      {c.payload.name}
                      <p className="muted small">{c.payload.customerId}</p>
                      <CustomerJourney customerId={c.payload.customerId} />
                    </TableCell>
                    <TableCell>{c.payload.accountId ?? 'Unlinked'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty
              icon={Fingerprint}
              title="Only the customers you can identify"
              description="Import customer records or link first-party identities through your server. Audience identities are never guessed."
            />
          )}
        </section>
        <section className="panel">
          <SectionHeading character="competitors">
            Account-based marketing
          </SectionHeading>
          {accounts.length ? (
            <Table>
              <TableBody>
                {accounts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.payload.name}</TableCell>
                    <TableCell>
                      {
                        customers.filter(
                          (c) => c.payload.accountId === a.payload.accountId,
                        ).length
                      }{' '}
                      linked customers
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty
              icon={Network}
              title="See the account behind the activity"
              description="Import account records and explicitly linked customer IDs to build an ABM view."
            />
          )}
        </section>
      </div>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogTitle>Import first-party data</DialogTitle>
          <DialogDescription>
            CSV headers must match the selected import type. Up to 500 rows per
            batch. All rows are validated before saving.
          </DialogDescription>
          <Dropdown
            value={kind}
            onChange={setKind}
            label="Import type"
            options={[
              'events',
              'customers',
              'accounts',
              'spend',
              'feedback',
            ].map((k) => ({ value: k, label: k }))}
          />
          <p className="mono muted">
            {
              (
                {
                  events:
                    'eventId,occurredAt,type,anonymousId,customerId,channel,amount,currency,orderId',
                  customers: 'customerId,name,email,accountId',
                  accounts: 'accountId,name',
                  spend: 'spendId,date,channel,amount,currency,category',
                  feedback: 'sourceId,body,url,customerId',
                } as Record<string, string>
              )[kind]
            }
          </p>
          <label className="field">
            CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void file.text().then(setCSV);
              }}
            />
          </label>
          <label className="field">
            Or paste CSV
            <textarea
              value={csv}
              onChange={(e) => setCSV(e.target.value)}
              rows={7}
            />
          </label>
          <button
            className="primary-btn"
            disabled={!csv || !w.brandId || w.busy}
            onClick={() =>
              void w
                .mutate<{ imported: number; refreshQueued: boolean }>(
                  'imports',
                  { brandId: w.brandId, kind, csv },
                )
                .then((r) => {
                  setImportOpen(false);
                  w.setNotice(
                    `Imported ${r.imported} rows. ${r.refreshQueued ? 'Insights refresh queued.' : 'Insights refresh requires workflow activation.'}`,
                  );
                })
                .catch(() => {})
            }
          >
            Validate and import
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
