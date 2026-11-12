'use client';
import { DesignGuidance } from './design-guidance';
import { BriefPresets, type BriefPreset } from './brief-presets';
import { ActivationNotice } from './activation-notice';
import { GenerationReadiness, useGenerationReadiness } from './generation-readiness';
import { localCampaignReserve } from '@/lib/local-generation';
// Evidence and signed private storage URLs must bypass image optimization.
/* oxlint-disable next/no-img-element */
// The installed Recharts 3 release supports Cell for per-series colors.
/* oxlint-disable typescript/no-deprecated */
import { useState } from 'react';
import { ConfirmAction } from './confirm-action';
import { ContentRevision } from './content-revision';
import { ThinkingIndicator } from './thinking-indicator';
import Link from 'next/link';
import { Dna, Sparkles, Image as ImageIcon, Video, FileText, ArrowRight, ShieldCheck } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useWorkspace } from './workspace-provider';
import { SectionHeading } from './section-heading';
import type { BrandDNA, ContentVersion, Entity } from '@/lib/contracts';
import { platforms } from '@/lib/contracts';
import { socialCatalog } from '@/lib/social-catalog';
import { Empty } from './empty-state';
import { ContentMedia } from './content-media';
import { Dropdown } from './workspace-shared';

export function ContentView() {
  const w = useWorkspace();
  const generation = useGenerationReadiness(w.localMode);
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
  const reservation = generation.config
    ? localCampaignReserve(targets, formats, generation.config)
    : null;
  const monthlyLimit = w.state.workspace?.monthly_limit ?? 0;
  const localBlocked =
    w.localMode &&
    (!generation.config?.ready ||
      !reservation ||
      monthlyLimit <= 0 ||
      !w.records<BrandDNA>('dna').length ||
      !Number.isFinite(Number(budget)) ||
      Number(budget) <= 0);
  return (
    <div className="stack content-studio">
      <BriefPresets key={w.workspaceId + ':' + w.brandId} scope={w.workspaceId + ':' + w.brandId} value={{idea,audience,scenario,event,direction,formats,targets} as BriefPreset} apply={v=>{setIdea(v.idea);setAudience(v.audience);setScenario(v.scenario);setEvent(v.event);setDirection(v.direction);setFormats(v.formats);setTargets(v.targets);}} />
      {formats.includes('image') && <DesignGuidance key={w.brandId} direction={direction} onChange={setDirection} />}
      <section className="panel glass studio-compose">
        <ActivationNotice feature="generation" />
        <div className="section-title studio-heading">
          <div>
            <span className="eyebrow">CAMPAIGN STUDIO</span>
            <SectionHeading character="campaign">
              Create a campaign
            </SectionHeading>
          </div>
          <div className="studio-heading-note">
            <Sparkles size={15} aria-hidden="true" />
            <span>Your brand. A new idea.</span>
          </div>
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
              <div className="field studio-idea-field">
                <div className="studio-step-title">
                  <span className="studio-step-number" aria-hidden="true">
                    01
                  </span>
                  <label htmlFor="campaign-idea">Shape the idea</label>
                  <span className="studio-required">Required</span>
                </div>
                <textarea
                  id="campaign-idea"
                  required
                  minLength={8}
                  rows={4}
                  placeholder="Launch a product, tell a story, or share an offer…"
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  aria-describedby="campaign-idea-hint"
                />
                <p id="campaign-idea-hint" className="studio-field-hint">
                  A clear goal, a key message, and a reason to care.
                </p>
              </div>
              <fieldset className="studio-formats">
                <legend>
                  <span className="studio-step-title">
                    <span className="studio-step-number" aria-hidden="true">
                      02
                    </span>
                    Choose your formats
                    <span className="studio-required">Select one or more</span>
                  </span>
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
                      <span className="studio-format-icon">
                        <f.icon size={20} aria-hidden="true" />
                      </span>
                      <span className="studio-format-copy">
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
              <label className="field studio-audience">
                <span className="studio-field-label">
                  Who is it for?{' '}
                  <span className="studio-optional">Optional</span>
                </span>
                <input
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="Who should this resonate with?"
                />
              </label>
              <details className="studio-advanced">
                <summary>
                  Creative details{' '}
                  <span className="muted small">Add context & direction</span>
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
                      maxLength={2000}
                      onChange={(e) => setDirection(e.target.value)}
                      placeholder="Style, casting, language, or references"
                    />
                  </label>
                </div>
              </details>
            </div>
            <aside className="studio-delivery">
              <div className="studio-step-title studio-delivery-title">
                <span className="studio-step-number" aria-hidden="true">
                  03
                </span>
                <h3>Set the delivery</h3>
              </div>
              <div className="studio-brand">
                <span className="studio-brand-icon">
                  <Dna size={19} aria-hidden="true" />
                </span>
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
                  <span className="studio-field-label">
                    Target platforms{' '}
                    <span className="studio-required">Required</span>
                  </span>
                </legend>
                <div className="studio-platforms">
                  {platforms.map((p) => (
                    <label
                      key={p}
                      className={`studio-platform ${targets.includes(p) ? 'checked' : ''} ${w.localMode && p === 'youtube' ? 'unavailable' : ''}`}
                      title={
                        w.localMode && p === 'youtube'
                          ? 'YouTube requires the server video workflow'
                          : undefined
                      }
                    >
                      <img
                        className={`studio-platform-logo studio-platform-logo-${p}`}
                        src={socialCatalog[p].logo}
                        width={20}
                        height={20}
                        alt=""
                        aria-hidden="true"
                      />
                      <span>{p === 'x' ? 'X' : socialCatalog[p].name}</span>
                      <Checkbox
                        aria-label={socialCatalog[p].name}
                        disabled={w.localMode && p === 'youtube'}
                        checked={targets.includes(p)}
                        onCheckedChange={() => toggle(targets, p, setTargets)}
                      />
                    </label>
                  ))}
                </div>
                {w.localMode && (
                  <p className="studio-field-hint">
                    YouTube becomes available with video setup.
                  </p>
                )}
              </fieldset>
              <label className="field studio-budget">
                <span className="studio-field-label">
                  Campaign limit <span className="studio-optional">USD</span>
                </span>
                <span className="studio-budget-input">
                  <span aria-hidden="true">$</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="0.00"
                    aria-describedby="campaign-budget-hint"
                  />
                </span>
                <span id="campaign-budget-hint" className="studio-field-hint">
                  Your maximum spend for this campaign.
                </span>
              </label>
              <p className="muted small studio-review-note">
                <ShieldCheck size={17} aria-hidden="true" />
                <span>
                  <strong>Reviewed before your gallery</strong>
                  Up to 5 attempts. Only results scoring 8.7/10 or higher
                  appear.
                </span>
              </p>
              {w.localMode && (
                <GenerationReadiness
                  setup={generation}
                  platforms={targets}
                  formats={formats}
                  monthlyLimit={monthlyLimit}
                  onSettings={() => w.setSettings(true)}
                />
              )}
              <button
                className="primary-btn studio-generate"
                disabled={
                  w.busy || !formats.length || !targets.length || localBlocked
                }
              >
                <Sparkles size={16} />
                {w.busy ? 'Generating and reviewing…' : 'Generate content'}
                {!w.busy && <ArrowRight size={16} aria-hidden="true" />}
              </button>
              <p
                className="muted small studio-selection-summary"
                aria-live="polite"
              >
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
          <SectionHeading character="campaign">
            Campaign activity
          </SectionHeading>
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
          <SectionHeading character="review">
            Approval gallery{' '}
            <span className="muted small">({contents.length})</span>
          </SectionHeading>
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
