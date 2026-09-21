'use client';
import { ActivationNotice } from './activation-notice';
// Evidence and signed private storage URLs must bypass image optimization.
/* oxlint-disable next/no-img-element */
// The installed Recharts 3 release supports Cell for per-series colors.
/* oxlint-disable typescript/no-deprecated */
import { useState } from 'react';
import { BrandGovernance } from './brand-governance';
import { PageInsights } from './page-insights';
import { ConfirmAction } from './confirm-action';
import { PublicationResolution } from './publication-resolution';
import { ContentRevision } from './content-revision';
import { ThinkingIndicator } from './thinking-indicator';
import { CustomerExport } from './customer-export';
import Link from 'next/link';
import {
  Dna,
  Globe2,
  Sparkles,
  Image as ImageIcon,
  Video,
  FileText,
  CalendarDays,
  ArrowRight,
  Download,
  ShieldCheck,
  RefreshCw,
  Fingerprint,
  ChartNoAxesCombined,
  Lightbulb,
  ExternalLink,
  Upload,
  Network,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { useWorkspace } from './workspace-provider';
import type {
  BrandDNA,
  ContentVersion,
  Entity,
  Evidence,
  Insight,
  MetricObservation,
  ScheduledPost,
  Approval,
} from '@/lib/contracts';
import { platforms } from '@/lib/contracts';
import { Empty } from './marketing-app';
import { ContentMedia } from './content-media';
import { useReport, ReportControls } from './report-controls';
import { postingWindows } from '@/lib/timing';
import {
  EvidenceDetails,
  CustomerJourney,
  FunnelPanel,
} from './evidence-panels';

export function Dropdown({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (s: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
      <SelectTrigger aria-label={label} className="min-w-36 h-10">
        <SelectValue placeholder={label}>
          {options.find((option) => option.value === value)?.label ?? label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Source({ evidence }: { evidence: Evidence }) {
  const valid = /^https?:\/\//.test(evidence.url);
  return (
    <div className="source spaced">
      {valid ? (
        <a href={evidence.url} target="_blank" rel="noreferrer">
          {new URL(evidence.url).hostname}{' '}
          <ExternalLink size={12} className="inline" />
        </a>
      ) : (
        <span>User correction</span>
      )}{' '}
      · {evidence.method} · {Math.round(evidence.confidence * 100)}% confidence
      <p className="muted small">{evidence.excerpt.slice(0, 300)}</p>
    </div>
  );
}
export function DNACard({ compact = false }: { compact?: boolean }) {
  const w = useWorkspace();
  const record = w.records<BrandDNA>('dna')[0];
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(''),
    [tagline, setTagline] = useState('');
  if (!record)
    return (
      <section className="panel">
        <div className="section-title">
          <h2>Your Brand DNA</h2>
          <span className="pill">Awaiting your website</span>
        </div>
        <div className="dna-empty">
          <div className="dna-symbol">
            <Dna />
          </div>
          <div>
            <h3>Your identity, brought into focus.</h3>
            <p>
              Your logo, colors, typography, and voice will live here—extracted
              from your website, with the evidence behind every detail.
            </p>
            <div className="tags">
              <span>Brand identity</span>
              <span>Visual language</span>
              <span>Tone of voice</span>
              <span>Market opportunities</span>
            </div>
          </div>
        </div>
      </section>
    );
  const dna = record.payload;
  return (
    <section className="panel">
      <div className="section-title">
        <h2>Your Brand DNA</h2>
        <span
          className={`pill ${dna.coverage.status === 'complete' ? 'green' : 'amber'}`}
        >
          {dna.coverage.completed} pages · {dna.coverage.status}
        </span>
      </div>
      <div className="row">
        {dna.logo && /^https?:/.test(dna.logo) ? (
          <img
            src={dna.logo}
            alt={`${dna.name ?? 'Brand'} logo`}
            className="brand-logo"
          />
        ) : (
          <Dna size={38} />
        )}
        <div>
          <h2>{dna.name ?? w.brand?.name}</h2>
          <p className="muted">{dna.tagline ?? 'No verified tagline found'}</p>
        </div>
      </div>
      <div className="spaced">
        {dna.overview.map((f, i) => (
          <div key={i} className="spaced">
            <p>{f.text}</p>
            {!compact && (
              <details className="small">
                <summary>Source</summary>
                {f.evidenceIds.map((id) => {
                  const e = dna.evidence.find((e) => e.id === id);
                  return e ? <Source key={id} evidence={e} /> : null;
                })}
              </details>
            )}
          </div>
        ))}
      </div>
      {!compact && dna.identityEvidence && (
        <details className="small spaced">
          <summary>Identity sources</summary>
          {Object.entries(dna.identityEvidence).map(([key, ids]) => (
            <div key={key}>
              <strong className="capitalize">{key}</strong>
              {ids?.map((id) => {
                const e = dna.evidence.find((e) => e.id === id);
                return e ? <Source key={id} evidence={e} /> : null;
              })}
            </div>
          ))}
        </details>
      )}
      {!!dna.palette.length && (
        <p className="muted small spaced">
          Observed primary / brand CSS declarations
        </p>
      )}
      <div className="swatches spaced">
        {dna.palette.map((color) => (
          <div className="swatch" key={color}>
            <i style={{ background: color }} />
            {color}
          </div>
        ))}
      </div>
      <div className="tags">
        {dna.fonts.slice(0, 4).map((font) => (
          <span key={font}>{font}</span>
        ))}
      </div>
      <div className="row spaced">
        {compact ? (
          <Link href="/brand-dna" className="subtle-link">
            Explore Brand DNA <ArrowRight size={15} />
          </Link>
        ) : (
          <>
            <button
              className="secondary-btn"
              onClick={() => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(
                  new Blob([JSON.stringify(dna, null, 2)], {
                    type: 'application/json',
                  }),
                );
                a.download = 'brand-dna.json';
                a.click();
                URL.revokeObjectURL(a.href);
              }}
            >
              <Download size={15} /> Export JSON
            </button>
            <button
              className="secondary-btn"
              onClick={() => {
                setName(dna.name ?? '');
                setTagline(dna.tagline ?? '');
                setEdit(true);
              }}
            >
              Correct brand details
            </button>
          </>
        )}
      </div>
      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent>
          <DialogTitle>Correct brand details</DialogTitle>
          <DialogDescription>
            Your changes create a new version and are labeled as user
            corrections.
          </DialogDescription>
          <form
            className="field"
            onSubmit={(e) => {
              e.preventDefault();
              void w
                .mutate('dna', {
                  id: record.id,
                  correction: { name: name || null, tagline: tagline || null },
                })
                .then(() => setEdit(false))
                .catch(() => {});
            }}
          >
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Tagline
              <input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
              />
            </label>
            <button className="primary-btn" disabled={w.busy}>
              Save new version
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
export function BrandView() {
  const w = useWorkspace(),
    dna = w.records<BrandDNA>('dna')[0]?.payload;
  return (
    <div className="stack">
      <DNACard />
      {!w.localMode && w.records<BrandDNA>('dna')[0] && (
        <BrandGovernance
          key={w.records<BrandDNA>('dna')[0].id}
          record={w.records<BrandDNA>('dna')[0]}
        />
      )}
      {dna && (
        <>
          <div className="two-col">
            {(
              [
                'values',
                'aesthetics',
                'voice',
                'strengths',
                'weaknesses',
                'marketGaps',
                'opportunities',
                'competitors',
              ] as const
            ).map((key, i) => (
              <section className="panel" key={key}>
                <div className="section-title">
                  <h2>
                    {
                      {
                        values: 'Brand values',
                        aesthetics: 'Brand aesthetic',
                        voice: 'Tone of voice',
                        strengths: 'Strengths',
                        weaknesses: 'Weaknesses',
                        marketGaps: 'Market gaps',
                        opportunities: 'Opportunities',
                        competitors: 'Competitor landscape',
                      }[key]
                    }
                  </h2>
                  {i % 2 ? (
                    <Lightbulb size={22} className="muted" />
                  ) : (
                    <Fingerprint size={22} className="muted" />
                  )}
                </div>
                {dna[key]?.length ? (
                  dna[key].map((f, j) => (
                    <article className="data-card" key={j}>
                      <span className="pill">{f.type}</span>
                      <p>{f.text}</p>
                      <details className="spaced small">
                        <summary>View evidence</summary>
                        {f.evidenceIds.map((id) => {
                          const e = dna.evidence.find((e) => e.id === id);
                          return e ? <Source key={id} evidence={e} /> : null;
                        })}
                      </details>
                    </article>
                  ))
                ) : (
                  <p className="muted small">
                    Not enough evidence to make a supported finding.
                  </p>
                )}
              </section>
            ))}
          </div>
          <section className="panel">
            <h2>Complete observed color inventory</h2>
            <p className="muted small spaced">
              Observed on the crawled pages. Visual estimates are labeled
              separately from computed styles.
            </p>
            <div
              className="table-scroll spaced"
              style={{ maxHeight: 420, overflow: 'auto' }}
              aria-label="Observed color inventory"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Color</TableHead>
                    <TableHead>Selector</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Page</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dna.colors.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <span
                          className="color-dot"
                          style={{ background: c.value }}
                        />
                        {c.value}
                      </TableCell>
                      <TableCell>{c.selector}</TableCell>
                      <TableCell>{c.method}</TableCell>
                      <TableCell>
                        <a
                          className="source"
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {c.url}
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
          <section className="panel">
            <h2>Platform recommendations</h2>
            <div className="two-col spaced">
              {Object.entries(dna.recommendations).map(([p, findings]) => (
                <article className="data-card" key={p}>
                  <h3 className="capitalize">{p}</h3>
                  {findings.map((f, i) => (
                    <p key={i}>{f.text}</p>
                  ))}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      <PageInsights />
    </div>
  );
}
export function ContentView() {
  const w = useWorkspace();
  const [approvalStage, setApprovalStage] = useState('brand');
  const [idea, setIdea] = useState(''),
    [formats, setFormats] = useState<string[]>([]),
    [targets, setTargets] = useState<string[]>([]),
    [audience, setAudience] = useState(''),
    [scenario, setScenario] = useState(''),
    [event, setEvent] = useState(''),
    [direction, setDirection] = useState(''),
    [referenceUrl, setReferenceUrl] = useState(''),
    [budget, setBudget] = useState('');
  const [selected, setSelected] = useState<Entity<ContentVersion> | null>(null),
    [account, setAccount] = useState(''),
    [redo, setRedo] = useState<Entity<ContentVersion> | null>(null),
    [feedback, setFeedback] = useState('');
  const contents = w
    .records<ContentVersion & { assetUrl?: string }>('content')
    .filter(
      (c) =>
        ['qualified', 'approved'].includes(c.payload.status) &&
        c.payload.review?.score >= 8.7,
    );
  const runs = w.records<{
    idea: string;
    status: string;
    error?: string;
    attempt?: number;
    agent?: number;
    frozen?: boolean;
  }>('campaign');
  const connections = w.records<{
    platform: string;
    name: string;
    status: string;
  }>('connection');
  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((s) => s !== v) : [...arr, v]);
  return (
    <div className="stack content-studio">
      <section className="panel glass studio-compose">
        <ActivationNotice feature="generation" />
        <div className="section-title">
          <div>
            <span className="eyebrow">CAMPAIGN STUDIO</span>
            <h2 className="spaced">Create a campaign</h2>
          </div>
          <Sparkles size={25} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void w
              .mutate('campaign', {
                brandId: w.brandId,
                idea,
                formats,
                platforms: targets,
                audience,
                scenario,
                event,
                direction,
                referenceUrl,
                budget: Number(budget),
              })
              .then(
                () =>
                  !w.localMode &&
                  w.setNotice(
                    'Campaign queued. Finished content will appear after it passes review.',
                  ),
              )
              .catch(() => {});
          }}
        >
          <div className="studio-columns">
            <div className="studio-brief">
              <div className="field">
                <label htmlFor="campaign-idea">What are we creating?</label>
                <textarea
                  id="campaign-idea"
                  required
                  minLength={8}
                  rows={4}
                  placeholder="Launch a product, tell a story, or share an offer…"
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                />
              </div>
              <fieldset className="studio-formats">
                <legend>
                  Format{' '}
                  <span className="muted small">· choose at least one</span>
                </legend>
                <div className="studio-format-grid">
                  {[
                    {
                      id: 'image',
                      icon: ImageIcon,
                      description: 'Product & lifestyle',
                    },
                    {
                      id: 'text',
                      icon: FileText,
                      description: 'Posts & captions',
                    },
                    {
                      id: 'video',
                      icon: Video,
                      description: w.localMode
                        ? 'Server setup needed'
                        : 'Motion & stories',
                    },
                  ].map((f) => (
                    <label
                      htmlFor={`format-${f.id}`}
                      className={`format-option studio-format ${formats.includes(f.id) ? 'checked' : ''} ${w.localMode && f.id === 'video' ? 'unavailable' : ''}`}
                      key={f.id}
                    >
                      <f.icon size={20} />
                      <span>
                        <strong className="capitalize">{f.id}</strong>
                        <small>{f.description}</small>
                      </span>
                      <Checkbox
                        id={`format-${f.id}`}
                        aria-label={`${f.id} format`}
                        disabled={w.localMode && f.id === 'video'}
                        checked={formats.includes(f.id)}
                        onCheckedChange={() =>
                          toggle(formats, f.id, setFormats)
                        }
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="field">
                Audience
                <input
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="Who should this resonate with?"
                />
              </label>
              <details className="studio-advanced">
                <summary>
                  Creative details <span className="muted small">Optional</span>
                </summary>
                <div className="form-grid">
                  <label className="field">
                    Product-use scenario
                    <input
                      value={scenario}
                      onChange={(e) => setScenario(e.target.value)}
                      placeholder="Where and how is it used?"
                    />
                  </label>
                  <label className="field">
                    Event or passion
                    <input
                      value={event}
                      onChange={(e) => setEvent(e.target.value)}
                      placeholder="Launch, festival, or interest"
                    />
                  </label>
                  <label className="field span-2">
                    Product image reference URL
                    <input
                      type="url"
                      value={referenceUrl}
                      onChange={(e) => setReferenceUrl(e.target.value)}
                      placeholder="https://…/your-product.jpg"
                    />
                  </label>
                  <label className="field span-2">
                    Creative direction
                    <input
                      value={direction}
                      onChange={(e) => setDirection(e.target.value)}
                      placeholder="Style, casting, language, or references"
                    />
                  </label>
                </div>
              </details>
            </div>
            <aside className="studio-delivery">
              <div className="studio-brand">
                <Dna size={18} />
                <div>
                  <span className="muted small">Brand source</span>
                  <strong>
                    {w.records<BrandDNA>('dna')[0]?.payload.name ||
                      w.brand?.name ||
                      'Choose a brand'}
                  </strong>
                  <span className="muted small">
                    {w.records<BrandDNA>('dna')[0]
                      ? `${w.records<BrandDNA>('dna')[0].payload.coverage.completed} observed pages`
                      : 'Scan a website to start'}
                  </span>
                </div>
              </div>
              <fieldset>
                <legend>
                  Platforms <span className="muted small">· required</span>
                </legend>
                <div className="studio-platforms">
                  {platforms.map((p) => (
                    <label
                      key={p}
                      className={`studio-platform ${targets.includes(p) ? 'checked' : ''}`}
                    >
                      <Checkbox
                        aria-label={p}
                        disabled={w.localMode && p === 'youtube'}
                        checked={targets.includes(p)}
                        onCheckedChange={() => toggle(targets, p, setTargets)}
                      />
                      <span className="capitalize">
                        {p === 'youtube'
                          ? 'YouTube'
                          : p === 'linkedin'
                            ? 'LinkedIn'
                            : p === 'x'
                              ? 'X'
                              : p}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="field">
                Campaign limit <span className="muted small">USD</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="Maximum spend"
                />
              </label>
              <p className="muted small studio-review-note">
                <ShieldCheck size={16} />
                Up to 5 attempts. Only results scoring 8.7/10 or higher reach
                your gallery.
              </p>
              <button
                className="primary-btn studio-generate"
                disabled={w.busy || !formats.length || !targets.length}
              >
                <Sparkles size={16} />
                {w.busy ? 'Generating and reviewing…' : 'Generate content'}
              </button>
              <p className="muted small">
                {formats.length} {formats.length === 1 ? 'format' : 'formats'} ·{' '}
                {targets.length}{' '}
                {targets.length === 1 ? 'platform' : 'platforms'} selected
              </p>
            </aside>
          </div>
        </form>
      </section>
      {runs.length > 0 && (
        <section className="panel">
          <h2>Campaign activity</h2>
          <div className="card-list spaced">
            {runs.map((r) => (
              <article key={r.id} className="data-card">
                <div className="section-title">
                  <h3>{r.payload.idea}</h3>
                  <span className="pill">
                    {r.payload.status}
                    {r.payload.attempt
                      ? ` · attempt ${r.payload.attempt}/5`
                      : ''}
                  </span>
                </div>
                {['queued', 'generating', 'reviewing'].includes(
                  r.payload.status,
                ) && (
                  <output className="agent-thinking">
                    <ThinkingIndicator
                      state={
                        r.payload.status === 'reviewing'
                          ? 'solving'
                          : r.payload.status === 'queued'
                            ? 'connecting'
                            : 'composing'
                      }
                      size={64}
                      paused={!!r.payload.frozen}
                    />
                    <span className="muted small agent-thinking-copy">
                      {r.payload.frozen
                        ? 'Campaign frozen'
                        : r.payload.status === 'reviewing'
                          ? 'Reviewing finished content against your brand and platform requirements.'
                          : r.payload.status === 'queued'
                            ? 'Waiting to start your campaign.'
                            : 'Creating content from your approved Brand DNA.'}
                    </span>
                  </output>
                )}
                {r.payload.error && <p className="notice">{r.payload.error}</p>}
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="panel">
        <div className="section-title">
          <h2>
            Approval gallery{' '}
            <span className="muted small">({contents.length})</span>
          </h2>
          <span className="pill green">
            <ShieldCheck size={12} /> Reviewed before you see it
          </span>
        </div>
        {contents.length ? (
          <div className="two-col">
            {contents.map((c) => (
              <article className="data-card" key={c.id}>
                {c.payload.assetPath && <ContentMedia content={c} />}
                <div className="section-title">
                  <span className="pill capitalize">
                    {c.payload.platform} · {c.payload.format}
                  </span>
                  <strong className="score">
                    {c.payload.review.score.toFixed(2)}
                    <span className="muted small"> / 10</span>
                  </strong>
                </div>
                <p className="preserve-lines">{c.payload.caption}</p>
                <ContentRevision content={c} />
                <details className="small spaced">
                  <summary>Review breakdown</summary>
                  {Object.entries({
                    Brand: c.payload.review.brandAlignment,
                    Psychology: c.payload.review.psychology,
                    Quality: c.payload.review.visualQuality,
                    Platform: c.payload.review.platformFit,
                  }).map(([k, v]) => (
                    <p key={k}>
                      {k}: {v}/10
                    </p>
                  ))}
                  {c.payload.review.feedback.map((f, i) => (
                    <p key={i}>{f}</p>
                  ))}
                </details>
                <div className="tabs-row spaced">
                  <button
                    className="primary-btn"
                    onClick={() => {
                      setSelected(c);
                      setAccount('');
                    }}
                  >
                    Approve
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={() => {
                      setRedo(c);
                      setFeedback('');
                    }}
                  >
                    Redo
                  </button>
                  <ConfirmAction
                    key={`${w.workspaceId}:${c.id}:reject`}
                    label="Reject"
                    title="Reject this content version?"
                    description="This deletes the rejected content and its media, retaining only minimal operational audit information. This action cannot be undone."
                    confirmLabel="Reject and delete"
                    disabled={w.busy}
                    onConfirm={() =>
                      w.mutate('decision', { id: c.id, decision: 'reject' })
                    }
                  />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            icon={Sparkles}
            title="Your next great impression starts here"
            description="Choose a format and share your campaign idea. Content appears here only after the reviewer scores it at least 8.7 out of 10."
          />
        )}
      </section>
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent>
          <DialogTitle>Approve this exact version</DialogTitle>
          <DialogDescription>
            Approval covers this caption, media, platform, and selected
            destination. Editing it requires a new review.
          </DialogDescription>
          <Dropdown
            value={account}
            onChange={setAccount}
            label="Destination account"
            options={connections
              .filter(
                (c) =>
                  c.payload.platform === selected?.payload.platform &&
                  c.payload.status === 'connected',
              )
              .map((c) => ({ value: c.id, label: c.payload.name }))}
          />
          <button
            className="primary-btn"
            disabled={!account || w.busy}
            onClick={() =>
              void w
                .mutate<{ status: string }>('decision', {
                  id: selected?.id,
                  decision: 'approve',
                  accountId: account,
                  stage: approvalStage,
                })
                .then((result) => {
                  setSelected(null);
                  w.setNotice(
                    result.status === 'approved'
                      ? 'Approved. Choose a date and time in Scheduled posts.'
                      : 'Your review was recorded. Additional approval stages are still required.',
                  );
                })
                .catch(() => {})
            }
          >
            Approve for this account
          </button>
          <Dropdown
            value={approvalStage}
            onChange={setApprovalStage}
            label="Approval stage"
            options={(
              w.state.workspace?.approval_policy?.stages ?? ['brand']
            ).map((stage) => ({ value: stage, label: stage }))}
          />
          <Link className="text-link small" href="/schedule">
            Open scheduled posts
          </Link>
        </DialogContent>
      </Dialog>
      <Dialog open={!!redo} onOpenChange={(v) => !v && setRedo(null)}>
        <DialogContent>
          <DialogTitle>What should change?</DialogTitle>
          <DialogDescription>
            A new generation and review run will use the same campaign limit.
          </DialogDescription>
          <label className="field">
            Revision feedback
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </label>
          <button
            className="primary-btn"
            disabled={w.busy}
            onClick={() =>
              void w
                .mutate('decision', {
                  id: redo?.id,
                  decision: 'redo',
                  feedback,
                })
                .then(() => setRedo(null))
                .catch(() => {})
            }
          >
            Generate a revision
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function ScheduleView() {
  const w = useWorkspace();
  const posts = w.records<ScheduledPost>('schedule'),
    approvals = w.records<Approval>('approval'),
    contents = w.records<ContentVersion>('content');
  const [modal, setModal] = useState(false),
    [editing, setEditing] = useState<Entity<ScheduledPost> | null>(null),
    [approval, setApproval] = useState(''),
    [localTime, setLocalTime] = useState(''),
    [timezone, setTimezone] = useState('Asia/Kolkata');
  const [month, setMonth] = useState(new Date());
  const unscheduled = approvals.filter(
    (a) =>
      !posts.some(
        (p) =>
          p.payload.approvalId === a.id &&
          !['cancelled', 'failed', 'missed'].includes(p.payload.status),
      ),
  );
  const destination =
    editing?.payload.accountId ??
    approvals.find((a) => a.id === approval)?.payload.accountId ??
    '';
  const windows = postingWindows(
    posts,
    w.records<MetricObservation>('metrics'),
    destination,
    timezone,
  );
  const first = new Date(month.getFullYear(), month.getMonth(), 1),
    days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from(
    { length: Math.ceil((first.getDay() + days) / 7) * 7 },
    (_, i) => i - first.getDay() + 1,
  );
  const open = (p?: Entity<ScheduledPost>) => {
    setEditing(p ?? null);
    setApproval('');
    setLocalTime(
      p
        ? new Intl.DateTimeFormat('sv-SE', {
            timeZone: p.payload.timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          })
            .format(new Date(p.payload.scheduledAt))
            .replace(' ', 'T')
        : '',
    );
    setTimezone(p?.payload.timezone ?? 'Asia/Kolkata');
    setModal(true);
  };
  return (
    <div className="stack">
      <div className="section-title">
        <div>
          <h2>A good idea deserves its moment.</h2>
          <p className="muted small spaced">
            Approved versions, connected accounts, and a time that works for
            your audience.
          </p>
        </div>
        <button
          className="primary-btn"
          disabled={w.localMode || !unscheduled.length || w.busy}
          onClick={() => open()}
        >
          <CalendarDays size={16} /> Schedule content
        </button>
      </div>
      <ActivationNotice feature="publishing" />
      <section className="panel">
        <Tabs defaultValue="list">
          <div className="section-title">
            <TabsList>
              <TabsTrigger value="list">List view</TabsTrigger>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
            </TabsList>
            <span className="pill">
              {posts.filter((p) => p.payload.status === 'scheduled').length}{' '}
              scheduled
            </span>
          </div>
          <TabsContent value="list">
            {posts.length ? (
              <div className="card-list">
                {posts.map((p) => (
                  <article className="data-card" key={p.id}>
                    <div className="section-title">
                      <span className="pill capitalize">
                        {p.payload.platform} · {p.payload.status}
                      </span>
                      <span className="small muted">
                        {new Date(p.payload.scheduledAt).toLocaleString(
                          undefined,
                          { timeZone: p.payload.timezone },
                        )}{' '}
                        · {p.payload.timezone}
                      </span>
                    </div>
                    <p>
                      {contents.find((c) => c.id === p.payload.contentId)
                        ?.payload.caption ?? 'Approved content'}
                    </p>
                    {p.payload.url && (
                      <a
                        className="text-link small"
                        href={p.payload.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View published post
                      </a>
                    )}
                    {p.payload.error && (
                      <p className="notice">{p.payload.error}</p>
                    )}
                    {p.payload.status === 'verifying' && (
                      <PublicationResolution post={p} />
                    )}
                    {p.payload.status === 'verifying' && (
                      <button
                        className="secondary-btn spaced"
                        disabled={w.busy}
                        onClick={() =>
                          void w
                            .mutate('reconcile', { id: p.id })
                            .then(() =>
                              w.setNotice(
                                'Provider status checked. Uncertain matches remain verifying.',
                              ),
                            )
                            .catch(() => {})
                        }
                      >
                        Verify publication
                      </button>
                    )}
                    {contents.find((c) => c.id === p.payload.contentId)?.payload
                      .assetPath && (
                      <details className="spaced">
                        <summary>Preview approved media</summary>
                        <ContentMedia
                          content={contents.find(
                            (c) => c.id === p.payload.contentId,
                          )!}
                        />
                      </details>
                    )}
                    {['scheduled', 'failed', 'missed'].includes(
                      p.payload.status,
                    ) && (
                      <div className="tabs-row spaced">
                        <button
                          className="secondary-btn"
                          onClick={() => open(p)}
                        >
                          Reschedule
                        </button>
                        <button
                          className="secondary-btn"
                          disabled={w.busy}
                          onClick={() =>
                            void w
                              .mutate('change-schedule', {
                                id: p.id,
                                command: 'cancel',
                              })
                              .catch(() => {})
                          }
                        >
                          Cancel schedule
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                icon={CalendarDays}
                title="Room for your next big moment"
                description={
                  w.localMode
                    ? 'Activate the background publishing service and connect a destination before scheduling. Local drafts remain available in Content studio.'
                    : 'Approve a reviewed content version, then choose its destination, date, and time. Your schedule will stay active when you close the app.'
                }
              />
            )}
          </TabsContent>
          <TabsContent value="calendar">
            <div className="section-title spaced">
              <button
                aria-label="Previous month"
                className="secondary-btn"
                onClick={() =>
                  setMonth(new Date(month.getFullYear(), month.getMonth() - 1))
                }
              >
                ←
              </button>
              <h3>
                {month.toLocaleDateString(undefined, {
                  month: 'long',
                  year: 'numeric',
                })}
              </h3>
              <button
                aria-label="Next month"
                className="secondary-btn"
                onClick={() =>
                  setMonth(new Date(month.getFullYear(), month.getMonth() + 1))
                }
              >
                →
              </button>
            </div>
            <div className="calendar-grid">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="muted small">
                  {d}
                </div>
              ))}
              {cells.map((d, i) => (
                <div key={i} className="calendar-cell">
                  {d > 0 && d <= days && (
                    <>
                      <span>{d}</span>
                      {posts
                        .filter((p) => {
                          const dt = new Date(p.payload.scheduledAt);
                          return (
                            dt.getFullYear() === month.getFullYear() &&
                            dt.getMonth() === month.getMonth() &&
                            dt.getDate() === d
                          );
                        })
                        .map((p) => (
                          <button key={p.id} onClick={() => open(p)}>
                            {p.payload.platform} · {p.payload.status}
                          </button>
                        ))}
                    </>
                  )}
                </div>
              ))}
            </div>
            <p className="muted small spaced">
              Calendar dates use your browser timezone. Each post retains its
              scheduling timezone.
            </p>
          </TabsContent>
        </Tabs>
      </section>
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent>
          <DialogTitle>
            {editing ? 'Reschedule post' : 'Give your content a moment'}
          </DialogTitle>
          <DialogDescription>
            Select an approved version and a future date. Times remain attached
            to the chosen timezone.
          </DialogDescription>
          <form
            className="field"
            onSubmit={(e) => {
              e.preventDefault();
              void w
                .mutate(
                  editing ? 'change-schedule' : 'schedule',
                  editing
                    ? {
                        id: editing.id,
                        command: 'reschedule',
                        localTime,
                        timezone,
                      }
                    : { approvalId: approval, localTime, timezone },
                )
                .then(() => setModal(false))
                .catch(() => {});
            }}
          >
            {!editing && (
              <Dropdown
                value={approval}
                onChange={setApproval}
                label="Approved content"
                options={unscheduled.map((a) => ({
                  value: a.id,
                  label: `${a.payload.platform}: ${contents.find((c) => c.id === a.payload.contentId)?.payload.caption.slice(0, 60) ?? 'Approved version'}`,
                }))}
              />
            )}
            <label>
              Date and time
              <input
                type="datetime-local"
                required
                value={localTime}
                onChange={(e) => setLocalTime(e.target.value)}
              />
            </label>
            <label>
              Timezone
              <input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                required
                placeholder="Asia/Kolkata"
              />
            </label>
            <div className="notice">
              {windows.experimental
                ? 'Experimental starting windows'
                : `Based on ${windows.sampleCount} posts from this account`}
              :{' '}
              {windows.hours
                .map((h) => String(h).padStart(2, '0') + ':00')
                .join(', ')}{' '}
              in {timezone}.{' '}
              {windows.experimental
                ? 'More comparable account history is needed.'
                : 'Ranked by impressions observed 24–48 hours after publication.'}{' '}
              These windows do not predict future reach.
            </div>
            <button
              className="primary-btn"
              disabled={w.busy || (!editing && !approval)}
            >
              Save schedule
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
const chartColors = ['#a2f0dc', '#80aaff', '#c7afff', '#ffc990', '#fa9bb8'];
const tooltipStyle = {
  background: '#17202b',
  border: '1px solid #ffffff20',
  borderRadius: 12,
  color: '#eef3f5',
};
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
        <h2>Understand the impression you leave.</h2>
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
      <div className="metric-grid">
        {[
          ['reach', 'Reported reach'],
          ['impressions', 'Impressions'],
          ['likes', 'Likes'],
          ['views', 'Views'],
        ].map(([key, label]) => (
          <section className="panel" key={key}>
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
            <h2>Performance over time</h2>
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
          <h2>Channel perspective</h2>
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
          <h2>Observation freshness & definitions</h2>
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
        <h2>Audience sentiment & themes</h2>
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
        <h2>Competitor & market reading</h2>
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
        <h2>Signals worth your attention</h2>
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
          <h2>Beyond the click. Into the why.</h2>
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
            <p className="muted small">{title}</p>
            <div className="metric-value">{value}</div>
            <p className="muted small">{desc}</p>
          </section>
        ))}
      </div>
      <div className="two-col">
        <section className="panel glass">
          <div className="section-title">
            <h2>Where credit belongs</h2>
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
          <h2>Your first-party data connection</h2>
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
          <h2>Markov attribution</h2>
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
          <h2>From a signal to an experiment</h2>
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
          <h2>Customer journeys</h2>
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
          <h2>Account-based marketing</h2>
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
