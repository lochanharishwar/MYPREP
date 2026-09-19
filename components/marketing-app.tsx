'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  ArrowRight,
  Globe2,
  Dna,
  LayoutDashboard,
  Sparkles,
  CalendarDays,
  ChartNoAxesCombined,
  Fingerprint,
  Settings2,
  Waves,
  ScanSearch,
  ShieldCheck,
  MessageCircle,
  Lightbulb,
  Network,
  Plus,
  LockKeyhole,
} from 'lucide-react';
import { WorkspaceProvider, useWorkspace } from './workspace-provider';
import { ResourcePaging } from './resource-paging';
import { WorkspaceSettings } from './workspace-settings';
import { ThinkingIndicator } from './thinking-indicator';
import type { OrbState } from 'thinking-orbs';
import {
  BrandView,
  ContentView,
  ScheduleView,
  AnalyticsView,
  InsightsView,
  DNACard,
  Dropdown,
} from './workspace-views';
export type Page =
  | 'dashboard'
  | 'brand-dna'
  | 'content'
  | 'schedule'
  | 'analytics'
  | 'insights';
export const nav = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { id: 'brand-dna', label: 'Brand DNA', icon: Dna, path: '/brand-dna' },
  { id: 'content', label: 'Content studio', icon: Sparkles, path: '/content' },
  {
    id: 'schedule',
    label: 'Scheduled posts',
    icon: CalendarDays,
    path: '/schedule',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: ChartNoAxesCombined,
    path: '/analytics',
  },
  {
    id: 'insights',
    label: 'Customer insights',
    icon: Fingerprint,
    path: '/insights',
  },
];
export const agents = [
  { name: 'Website discovery', icon: ScanSearch, orb: 'searching' },
  { name: 'Brand DNA', icon: Dna, orb: 'weaving' },
  { name: 'Content generation', icon: Sparkles, orb: 'composing' },
  { name: 'Content reviewer', icon: ShieldCheck, orb: 'solving' },
  { name: 'Scheduler', icon: CalendarDays, orb: 'connecting' },
  { name: 'Audience feedback', icon: MessageCircle, orb: 'listening' },
  { name: 'Performance analyst', icon: ChartNoAxesCombined, orb: 'working' },
  { name: 'Attribution', icon: Network, orb: 'weaving' },
  { name: 'Customer insights', icon: Lightbulb, orb: 'shaping' },
] satisfies { name: string; icon: typeof ScanSearch; orb: OrbState }[];
export function Empty({
  icon: Icon = Globe2,
  title,
  description,
}: {
  icon?: typeof Globe2;
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <Icon size={36} strokeWidth={1.3} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
function Dashboard() {
  const w = useWorkspace();
  const [url, setUrl] = useState('');
  const scans = w.records<{
    status: string;
    discovered: number;
    completed: string[];
    failed: string[];
    excluded: string[];
    error?: string;
    agent: number;
  }>('scan');
  const campaign = w.records<{
    status: string;
    agent: number;
    frozen?: boolean;
  }>('campaign')[0];
  const scan = scans[0];
  const activeAgent =
    campaign &&
    !campaign.payload.frozen &&
    ['generating', 'reviewing'].includes(campaign.payload.status)
      ? campaign.payload.agent
      : scan &&
          ['running', 'queued', 'building_dna'].includes(scan.payload.status)
        ? scan.payload.agent
        : 0;
  async function start() {
    try {
      let brandId = w.brandId;
      if (url && url !== w.brand?.website) {
        const b = await w.mutate<{ id: string }>('brands', { url });
        brandId = b.id;
        w.setBrandId(b.id);
      }
      if (!brandId) throw new Error('Enter your brand website.');
      await w.mutate('scan', { brandId });
      w.setNotice(
        'Website analysis queued. Your brand findings will appear as evidence is collected.',
      );
    } catch (e) {
      w.setNotice((e as Error).message);
    }
  }
  return (
    <div className="grid-main">
      <div className="stack">
        <section className="panel glass intro-card">
          <span className="pill green">
            <span className="dot" /> START WITH YOUR BRAND
          </span>
          <h2>Good marketing starts with understanding.</h2>
          <p>
            Share your website. Your agents will uncover the identity, voice,
            and details that make your brand yours.
          </p>
          <form
            className="scan-form"
            onSubmit={(e) => {
              e.preventDefault();
              void start();
            }}
          >
            <Globe2 size={20} className="muted" />
            <input
              aria-label="Brand website URL"
              type="url"
              required={!w.brand}
              placeholder={w.brand?.website ?? 'https://yourbrand.com'}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button disabled={w.busy} className="primary-btn">
              {w.busy ? 'Starting…' : 'Discover my brand'}{' '}
              <ArrowRight size={16} />
            </button>
          </form>
          <div className="form-note">
            <span className="row">
              <ShieldCheck size={13} /> Your website is the source of truth.
            </span>
            <span>No invented facts. Every insight traceable.</span>
          </div>
          <div className="step-line">
            <div>
              <span>01 / DISCOVER</span>
              <strong>Read the whole story</strong>
            </div>
            <div>
              <span>02 / UNDERSTAND</span>
              <strong>Find your brand DNA</strong>
            </div>
            <div>
              <span>03 / CREATE</span>
              <strong>Make something that fits</strong>
            </div>
          </div>
        </section>
        {scan && (
          <section className="panel">
            <div className="section-title">
              <h2>Website discovery</h2>
              <output className="pill">
                {['running', 'queued', 'building_dna'].includes(
                  scan.payload.status,
                ) && (
                  <ThinkingIndicator
                    state={
                      scan.payload.status === 'building_dna'
                        ? 'weaving'
                        : scan.payload.status === 'queued'
                          ? 'connecting'
                          : 'searching'
                    }
                  />
                )}
                {scan.payload.status}
              </output>
            </div>
            <div className="metric-grid">
              {[
                ['Discovered', scan.payload.discovered],
                ['Read', scan.payload.completed.length],
                ['Failed', scan.payload.failed.length],
                ['Excluded', scan.payload.excluded.length],
              ].map(([name, n]) => (
                <div key={name}>
                  <p className="muted small">{name}</p>
                  <strong className="metric-value">{n}</strong>
                </div>
              ))}
            </div>
            {scan.payload.error && (
              <p className="notice">{scan.payload.error}</p>
            )}
            {['partial', 'blocked'].includes(scan.payload.status) && (
              <button
                className="secondary-btn spaced"
                disabled={w.busy}
                onClick={() =>
                  void w.mutate('resume-scan', { id: scan.id }).catch(() => {})
                }
              >
                Resume analysis
              </button>
            )}
          </section>
        )}
        <DNACard compact />
        <div className="quick-grid">
          {[
            {
              name: 'Make it yours',
              desc: 'Turn an idea into on-brand content.',
              icon: Sparkles,
              path: '/content',
            },
            {
              name: 'Find your moment',
              desc: 'Plan your next great impression.',
              icon: CalendarDays,
              path: '/schedule',
            },
            {
              name: 'See what resonates',
              desc: 'Connect content to real outcomes.',
              icon: ChartNoAxesCombined,
              path: '/analytics',
            },
          ].map((q) => (
            <Link href={q.path} key={q.path} className="panel quick-card">
              <div className="row">
                <q.icon size={21} className="quick-icon" />
                <ArrowUpRight size={15} className="muted" />
              </div>
              <h3>{q.name}</h3>
              <p>{q.desc}</p>
            </Link>
          ))}
        </div>
      </div>
      <aside className="panel">
        <div className="section-title">
          <h3>Your agent team</h3>
          <span className="mono muted">09 AGENTS</span>
        </div>
        <output className="agent-thinking">
          <ThinkingIndicator
            state={agents[activeAgent - 1]?.orb ?? 'breathing'}
            size={64}
            paused={!activeAgent}
          />
          <span>
            <strong>
              {agents[activeAgent - 1]?.name ?? 'Ready when you are'}
            </strong>
            <span className="muted small agent-thinking-copy">
              {activeAgent
                ? 'Working on your brand'
                : 'Your team is on standby'}
            </span>
          </span>
        </output>
        <div className="agent-list">
          {agents.map((a, i) => (
            <div
              className={`agent ${activeAgent === i + 1 ? 'active' : ''}`}
              key={a.name}
            >
              <span className="agent-icon">
                {activeAgent === i + 1 ? (
                  <ThinkingIndicator state={a.orb} />
                ) : (
                  <a.icon size={16} />
                )}
              </span>
              <span className="agent-text">{a.name}</span>
              <small>{activeAgent === i + 1 ? 'Working' : 'Standby'}</small>
            </div>
          ))}
        </div>
        <p className="aside-note">
          Your agents work together. You stay in control of what gets published.
        </p>
      </aside>
    </div>
  );
}
function Shell({ page }: { page: Page }) {
  const w = useWorkspace();
  // Tool handlers are registered once, but always read the current workspace.
  // Registering again on every provider update aborts the previous registration.
  const workspace = useRef(w);
  useEffect(() => {
    workspace.current = w;
  }, [w]);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      document.documentElement.style.setProperty(
        '--mx',
        `${(e.clientX / window.innerWidth) * 100}%`,
      );
      document.documentElement.style.setProperty(
        '--my',
        `${(e.clientY / window.innerHeight) * 100}%`,
      );
    };
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
      window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => void | Promise<unknown>;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    const register = (tool: unknown) => {
      try {
        // Some hosts register synchronously while others return a promise. Always
        // consume a cleanup-time AbortError so it cannot reach the global error
        // boundary as an unhandled rejection.
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch((error) => {
          if (!lifecycle.signal.aborted)
            console.warn('model_context_registration_failed', error);
        });
      } catch (error) {
        if (!lifecycle.signal.aborted)
          console.warn('model_context_registration_failed', error);
      }
    };
    register({
      name: 'read_brand_workspace',
      title: 'Read brand workspace',
      description: 'Read the selected brand and workflow statuses. Read-only.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({
        brand: workspace.current.brand ?? null,
        workflows: workspace.current
          .records<{ status?: string }>('scan')
          .map((e) => ({ id: e.id, status: e.payload.status })),
      }),
    });
    register({
      name: 'select_brand',
      title: 'Select brand',
      description: 'Select an existing brand in the workspace.',
      inputSchema: {
        type: 'object',
        properties: { brandId: { type: 'string' } },
        required: ['brandId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input: unknown) => {
        const id = (input as { brandId?: string })?.brandId;
        if (
          !id ||
          !workspace.current.state.brands.some((brand) => brand.id === id)
        )
          throw new Error('Brand not found.');
        workspace.current.setBrandId(id);
        return { selectedBrandId: id };
      },
    });
    return () =>
      lifecycle.abort(
        new DOMException('Tool registration replaced.', 'AbortError'),
      );
  }, []);
  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Skip to workspace
      </a>
      <div className="ambient" />
      <header className="topbar">
        <Link href="/" className="wordmark">
          <span className="mark">
            <Waves size={23} />
          </span>
          brandcurrent<span className="muted small">/</span>
          <span className="muted small">
            {w.state.workspace?.name ?? 'Workspace'}
          </span>
        </Link>
        <div className="top-actions">
          {w.state.brands.length > 0 && (
            <Dropdown
              value={w.brandId}
              onChange={w.setBrandId}
              label="Selected brand"
              options={w.state.brands.map((b) => ({
                value: b.id,
                label: b.name,
              }))}
            />
          )}
          <span className="pill">
            <LockKeyhole size={12} /> Private workspace
          </span>
          <div className="divider" />
          <button
            className="icon-btn"
            aria-label="Workspace settings"
            onClick={() => w.setSettings(true)}
          >
            <Settings2 size={18} />
          </button>
          <button
            className="avatar"
            aria-label={w.session ? 'Your account' : 'Sign in'}
            onClick={() => w.setSettings(true)}
          >
            {w.session?.user.email?.slice(0, 2).toUpperCase() ?? 'BC'}
          </button>
        </div>
      </header>
      <nav className="dock" aria-label="Main navigation">
        {nav.map((n) => (
          <Link
            href={n.path}
            key={n.id}
            className={page === n.id ? 'selected' : ''}
            aria-current={page === n.id ? 'page' : undefined}
            title={n.label}
          >
            <n.icon size={18} />
            <span>{n.label}</span>
          </Link>
        ))}
      </nav>
      <main id="main" className="content">
        <div className="page-heading">
          <div>
            <div className="eyebrow">YOUR MARKETING, IN MOTION</div>
            <h1>
              {page === 'dashboard'
                ? 'A clearer view. A stronger brand.'
                : nav.find((n) => n.id === page)?.label}
            </h1>
            <p className="muted">
              {page === 'dashboard'
                ? 'From your first impression to your next customer. All connected.'
                : 'One connected workspace. Every decision grounded in your brand.'}
            </p>
          </div>
          <button className="subtle-link" onClick={() => w.setSettings(true)}>
            <Plus size={16} />{' '}
            {w.session ? 'Workspace settings' : 'Connect your workspace'}
          </button>
        </div>
        {w.notice && (
          <output
            className="notice row"
            style={{ justifyContent: 'space-between' }}
          >
            {w.notice}
            <button aria-label="Dismiss notice" onClick={() => w.setNotice('')}>
              ×
            </button>
          </output>
        )}
        {w.state.coverage &&
          w.state.coverage.loaded < w.state.coverage.total && (
            <p className="notice">
              Showing the latest {w.state.coverage.loaded} of{' '}
              {w.state.coverage.total} workspace records. Older records remain
              stored; reports use server data.
            </p>
          )}
        {page === 'dashboard' ? (
          <Dashboard />
        ) : page === 'brand-dna' ? (
          <BrandView />
        ) : page === 'content' ? (
          <ContentView />
        ) : page === 'schedule' ? (
          <ScheduleView />
        ) : page === 'analytics' ? (
          <AnalyticsView />
        ) : (
          <InsightsView />
        )}
        <ResourcePaging />
      </main>

      <WorkspaceSettings />
    </div>
  );
}
export function MarketingApp({ page }: { page: Page }) {
  return (
    <WorkspaceProvider>
      <Shell page={page} />
    </WorkspaceProvider>
  );
}
