'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import {
  createClient,
  type SupabaseClient,
  type Session,
} from '@supabase/supabase-js';
import {
  campaignSchema,
  type WorkspaceState,
  type Entity,
  type BrandDNA,
  type ContentVersion,
} from '@/lib/contracts';
import { contentHash, normalizeUrl } from '@/lib/domain';
import {
  loadLocalState,
  saveLocalState,
  readLocalResources,
  recoverLocalState,
} from '@/lib/local-state';
import { storeLocalMedia, deleteLocalMedia } from '@/lib/local-media';
import { scanWithProgress } from '@/lib/scan-stream';
import {
  analyzeSavedPages,
  retainBrandCorrections,
  jobsNeedResourceRefresh,
} from '@/lib/brand-report';
const empty: WorkspaceState = {
  configured: false,
  authenticated: false,
  brands: [],
  entities: [],
  services: [],
};
type PageInfo = { total: number; nextCursor: string | null };
interface Context {
  state: WorkspaceState;
  client: SupabaseClient | null;
  session: Session | null;
  brand: WorkspaceState['brands'][number] | undefined;
  brandId: string;
  setBrandId: (v: string) => void;
  workspaceId: string;
  setWorkspaceId: (v: string) => void;
  records: <T>(kind: string) => Entity<T>[];
  pages: Record<string, PageInfo>;
  loadMore: (kind: string) => Promise<void>;
  loading: boolean;
  busy: boolean;
  notice: string;
  setNotice: (v: string) => void;
  mutate: <T = Record<string, unknown>>(
    action: string,
    body: unknown,
  ) => Promise<T>;
  read: <T>(path: string, options?: { signal?: AbortSignal }) => Promise<T>;
  refresh: () => Promise<void>;
  settings: boolean;
  localMode: boolean;
  setSettings: (v: boolean) => void;
}
const WorkspaceContext = createContext<Context | null>(null);
export function useWorkspace() {
  const c = useContext(WorkspaceContext);
  if (!c) throw new Error('Workspace context unavailable');
  return c;
}
const resourcesByPath: Record<string, string[]> = {
  '/': ['dna', 'scan', 'activity', 'campaign', 'schedule', 'connection'],
  '/brand-dna': [
    'dna',
    'post_insight',
    'activity',
    'connection',
    'brand_asset',
  ],
  '/content': ['dna', 'campaign', 'content', 'connection', 'approval'],
  '/schedule': ['schedule', 'approval', 'content', 'connection', 'metrics'],
  '/analytics': [
    'campaign',
    'insight',
    'feedback_summary',
    'news',
    'schedule',
    'content',
    'connection',
  ],
  '/insights': ['customers', 'accounts', 'insight', 'markov', 'connection'],
};
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(empty),
    [client, setClient] = useState<SupabaseClient | null>(null),
    [session, setSession] = useState<Session | null>(null);
  const [brandId, setBrand] = useState(''),
    [workspaceId, setWorkspace] = useState(''),
    [resources, setResources] = useState<Entity[]>([]),
    [pages, setPages] = useState<Record<string, PageInfo>>({});
  const [loading, setLoading] = useState(true),
    [localMode, setLocalMode] = useState(false),
    [pending, setPending] = useState(0),
    [notice, setNotice] = useState(''),
    [settings, setSettings] = useState(false);
  const path = usePathname();
  const cursor = useRef(new Date().toISOString());
  const epoch = useRef(0);
  const jobIdCursor = useRef('');
  const pendingCommands = useRef(new Map<string, string>());
  const localRunning = useRef(false);
  const localSnapshot = useRef({ state: empty, resources: [] as Entity[] });

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void fetch('/api/config')
      .then(
        (r) =>
          r.json() as Promise<{
            supabaseUrl: string;
            supabaseKey: string;
            workspaceMode: 'browser' | 'server';
            services: WorkspaceState['services'];
          }>,
      )
      .then((config) => {
        if (disposed) return;
        setState((s) => ({
          ...s,
          services: config.services,
          configured: !!config.supabaseUrl,
        }));
        if (
          config.workspaceMode !== 'browser' &&
          config.supabaseUrl &&
          config.supabaseKey
        ) {
          const c = createClient(config.supabaseUrl, config.supabaseKey);
          setClient(c);
          void c.auth.getSession().then(({ data }) => {
            if (!disposed) setSession(data.session);
          });
          const listener = c.auth.onAuthStateChange((_event, s) => {
            if (!disposed) {
              if (_event === 'SIGNED_OUT') {
                epoch.current++;
                setResources([]);
                setPages({});
                setBrand('');
                setState((old) => ({
                  ...empty,
                  configured: old.configured,
                  services: old.services,
                }));
              }
              setSession(s);
            }
          });
          unsubscribe = () => listener.data.subscription.unsubscribe();
        } else {
          setLocalMode(true);
          try {
            const loaded = loadLocalState(localStorage);
            const saved = loaded ? recoverLocalState(loaded) : null;
            if (saved?.state?.workspace) {
              localSnapshot.current = {
                state: { ...saved.state, services: config.services },
                resources: saved.resources,
              };
              saveLocalState(localStorage, localSnapshot.current);
              setState({ ...saved.state, services: config.services });
              setResources(saved.resources ?? []);
              setWorkspace(saved.state.workspace.id);
              const selected = localStorage.getItem(
                'bc_brand:' + saved.state.workspace.id,
              );
              setBrand(
                saved.state.brands.find((b) => b.id === selected)?.id ??
                  saved.state.brands[0]?.id ??
                  '',
              );
            } else {
              const id = crypto.randomUUID();
              const local = {
                ...empty,
                services: config.services,
                workspace: {
                  id,
                  name: 'Local workspace',
                  monthly_limit: 0,
                  currency: 'USD',
                  role: 'owner' as const,
                },
                workspaces: [
                  { id, name: 'Local workspace', role: 'owner' as const },
                ],
              };
              localSnapshot.current = { state: local, resources: [] };
              setState(local);
              setWorkspace(id);
              localStorage.setItem(
                'bc_local_workspace_v1',
                JSON.stringify({ state: local, resources: [] }),
              );
            }
          } catch {
            setNotice(
              'Browser storage is unavailable. Local work will not persist.',
            );
          }
          setLoading(false);
        }
      })
      .catch(() => {
        setNotice('Could not load workspace configuration. Refresh to retry.');
        setLoading(false);
      });
    queueMicrotask(() => {
      const q = new URLSearchParams(location.search);
      if (q.get('connectionError')) setNotice(q.get('connectionError')!);
      if (q.get('connected'))
        setNotice(`${q.get('connected')} account connected.`);
      try {
        setWorkspace(localStorage.getItem('bc_workspace') ?? '');
      } catch {}
    });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);
  const read = useCallback(
    async <T,>(url: string, options?: { signal?: AbortSignal }): Promise<T> => {
      if (localMode) {
        if (new URL(url, location.origin).pathname === '/api/resources')
          return readLocalResources(localSnapshot.current, url) as T;
        throw new Error(
          'This feature needs the server workspace and a connected data source. Open Connections to check setup.',
        );
      }
      if (!client)
        throw new Error('Connect Supabase to access workspace data.');
      const { data } = await client.auth.getSession();
      const r = await fetch(url, {
        signal: options?.signal
          ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)])
          : AbortSignal.timeout(30000),
        headers: {
          Authorization: `Bearer ${data.session?.access_token ?? ''}`,
          ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
        },
      });
      const value = (await r.json()) as Record<string, unknown>;
      if (!r.ok)
        throw new Error(
          typeof value.error === 'string' ? value.error : 'Request failed.',
        );
      return value as T;
    },
    [client, localMode, workspaceId],
  );
  const loadResources = useCallback(
    async (kinds: string[], nextCursor?: string) => {
      if (localMode || !brandId || !client) return;
      const requestedEpoch = epoch.current;
      const result = await read<{
        groups: {
          kind: string;
          rows: Entity[];
          total: number;
          nextCursor: string | null;
        }[];
      }>(
        `/api/resources?brandId=${brandId}&kinds=${kinds.join(',')}${nextCursor ? '&cursor=' + encodeURIComponent(nextCursor) : ''}`,
      );
      if (requestedEpoch !== epoch.current) return;
      setResources((old) => {
        const retain = nextCursor
          ? old
          : old.filter((r) => !kinds.includes(r.kind));
        const map = new Map(retain.map((r) => [r.id, r]));
        for (const g of result.groups)
          for (const row of g.rows) map.set(row.id, row);
        return [...map.values()].sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        );
      });
      setPages((old) => ({
        ...old,
        ...Object.fromEntries(
          result.groups.map((g) => [
            g.kind,
            { total: g.total, nextCursor: g.nextCursor },
          ]),
        ),
      }));
    },
    [brandId, client, localMode, read],
  );
  const refresh = useCallback(async () => {
    if (localMode) {
      setLoading(false);
      return;
    }
    if (!client) return;
    const requestedEpoch = epoch.current;
    const next = await read<WorkspaceState>('/api/state');
    if (requestedEpoch !== epoch.current) return;
    setState(next);
    setLoading(false);
    if (!workspaceId && next.workspace) setWorkspace(next.workspace.id);
    setBrand((current) => {
      let saved = '';
      try {
        saved = localStorage.getItem('bc_brand:' + next.workspace?.id) ?? '';
      } catch {}
      return next.brands.some((b) => b.id === current)
        ? current
        : (next.brands.find((b) => b.id === saved)?.id ??
            next.brands[0]?.id ??
            '');
    });
  }, [client, localMode, read, workspaceId]);
  useEffect(() => {
    if (!client && !localMode) return;
    queueMicrotask(
      () =>
        void refresh().catch((e) => {
          setNotice((e as Error).message);
          setLoading(false);
        }),
    );
  }, [client, localMode, refresh, session]);
  useEffect(() => {
    if (!brandId || (!session && !localMode)) return;
    queueMicrotask(
      () =>
        void loadResources(resourcesByPath[path] ?? resourcesByPath['/']).catch(
          (e) => setNotice((e as Error).message),
        ),
    );
  }, [brandId, session, localMode, path, loadResources]);
  useEffect(() => {
    if (!brandId || !session || localMode) return;
    cursor.current = new Date().toISOString();
    jobIdCursor.current = '';
    let active = true;
    let polling = false;
    const requestedEpoch = epoch.current;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible' || polling) return;
      polling = true;
      void read<{ rows: Entity[]; cursor: string; cursorId: string }>(
        `/api/jobs?brandId=${brandId}&since=${encodeURIComponent(cursor.current)}&afterId=${jobIdCursor.current}`,
      )
        .then((result) => {
          if (!active || requestedEpoch !== epoch.current) return;
          cursor.current = result.cursor;
          jobIdCursor.current = result.cursorId;
          setResources((old) => {
            const map = new Map(old.map((r) => [r.id, r]));
            for (const r of result.rows)
              map.set(r.id, {
                ...r,
                payload: { ...map.get(r.id)?.payload, ...r.payload },
              });
            return [...map.values()].sort((a, b) =>
              b.created_at.localeCompare(a.created_at),
            );
          });
          if (jobsNeedResourceRefresh(result.rows))
            void loadResources(
              resourcesByPath[path] ?? resourcesByPath['/'],
            ).catch(() => {
              if (active && requestedEpoch === epoch.current)
                setNotice(
                  'New activity is available, but the latest records could not be loaded. Refresh to retry.',
                );
            });
        })
        .catch(() => {
          if (active && requestedEpoch === epoch.current)
            setNotice(
              'Live activity could not be refreshed. Displayed statuses may be out of date; the next refresh will retry.',
            );
        })
        .finally(() => {
          polling = false;
        });
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [brandId, session, localMode, read, path, loadResources]);
  const setWorkspaceId = (id: string) => {
    epoch.current++;
    setWorkspace(id);
    setBrand('');
    if (!localMode) setResources([]);
    setPages({});
    try {
      localStorage.setItem('bc_workspace', id);
    } catch {}
  };
  const setBrandId = (id: string) => {
    epoch.current++;
    setBrand(id);
    setNotice('');
    if (!localMode) setResources([]);
    setPages({});
    try {
      localStorage.setItem('bc_brand:' + workspaceId, id);
    } catch {}
  };
  async function mutateLocal<T>(action: string, body: unknown): Promise<T> {
    const request = body as Record<string, unknown>;
    const textValue = (v: unknown) => (typeof v === 'string' ? v : '');
    const snapshot = () => localSnapshot.current;
    const workspace = snapshot().state.workspace;
    if (!workspace) throw new Error('Workspace is still loading.');
    const save = (state: WorkspaceState, rows: Entity[]) => {
      saveLocalState(localStorage, { state, resources: rows });
      localSnapshot.current = { state, resources: rows };
      setState(state);
      setResources(rows);
    };
    const create = (
      kind: string,
      brand: string | null,
      payload: Record<string, unknown>,
    ): Entity => {
      const now = new Date().toISOString();
      return {
        id: crypto.randomUUID(),
        workspace_id: workspace.id,
        brand_id: brand,
        kind,
        payload,
        created_at: now,
        updated_at: now,
      };
    };
    const put = (...rows: Entity[]) =>
      save(snapshot().state, [
        ...rows,
        ...snapshot().resources.filter((r) => !rows.some((n) => n.id === r.id)),
      ]);
    const record = (id: unknown, kind: string) => {
      const value = snapshot().resources.find(
        (r) =>
          r.id === id && r.kind === kind && r.workspace_id === workspace.id,
      );
      if (!value)
        throw new Error('Saved record was not found. Refresh and retry.');
      return value;
    };
    const post = async <R,>(path: string, input: unknown): Promise<R> => {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(300000),
      });
      const result = (await response.json()) as R & { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? 'Server request failed.');
      return result;
    };
    if (action === 'brands') {
      const raw = typeof request.url === 'string' ? request.url.trim() : '';
      const website = normalizeUrl(
        /^https?:\/\//i.test(raw) ? raw : 'https://' + raw,
      );
      const old = snapshot().state.brands.find((b) => b.website === website);
      if (old) return old as T;
      const brand = {
        id: crypto.randomUUID(),
        workspace_id: workspace.id,
        website,
        name: new URL(website).hostname,
      };
      save(
        { ...snapshot().state, brands: [...snapshot().state.brands, brand] },
        snapshot().resources,
      );
      return brand as T;
    }
    if (action === 'settings') {
      const limit = Number(request.monthlyLimit);
      if (!Number.isFinite(limit) || limit < 0)
        throw new Error('Enter a valid monthly spending limit.');
      save(
        {
          ...snapshot().state,
          workspace: { ...workspace, monthly_limit: limit },
        },
        snapshot().resources,
      );
      return { saved: true } as T;
    }
    if (action === 'analyze-dna') {
      const old = record(request.id, 'dna');
      const next = create(
        'dna',
        old.brand_id,
        analyzeSavedPages(
          old.payload as unknown as BrandDNA,
          snapshot().resources.filter((r) => r.workspace_id === workspace.id),
        ) as unknown as Record<string, unknown>,
      );
      put(next);
      setNotice(
        'Analysis updated from your saved page evidence. Open each finding to inspect its sources.',
      );
      return next as T;
    }
    if (action === 'dna') {
      const old = record(request.id, 'dna');
      const correction = request.correction as {
        name: string | null;
        tagline: string | null;
      };
      if (
        !correction ||
        [correction.name, correction.tagline].some(
          (v) => v !== null && typeof v !== 'string',
        )
      )
        throw new Error('Enter a name and tagline correction.');
      const dna = old.payload as unknown as BrandDNA;
      const id = crypto.randomUUID();
      const next = create('dna', old.brand_id, {
        ...dna,
        ...correction,
        identityEvidence: {
          ...dna.identityEvidence,
          name: [id],
          tagline: [id],
        },
        version: Date.now(),
        createdAt: new Date().toISOString(),
        governance: undefined,
        evidence: [
          ...dna.evidence,
          {
            id,
            url: 'user:correction',
            excerpt: JSON.stringify(correction),
            observedAt: new Date().toISOString(),
            method: 'user',
            confidence: 1,
          },
        ],
        overview: [
          ...dna.overview,
          {
            text: 'Name and tagline corrected by you.',
            type: 'correction',
            evidenceIds: [id],
          },
        ],
      });
      put(next);
      return next as T;
    }
    if (action === 'scan' || action === 'resume-scan') {
      const target =
        action === 'resume-scan'
          ? record(request.id, 'scan').brand_id
          : request.brandId;
      const brand = snapshot().state.brands.find((b) => b.id === target);
      if (!brand) throw new Error('Enter a brand website first.');
      const previousDNA = snapshot().resources.find(
        (r) => r.kind === 'dna' && r.brand_id === brand.id,
      )?.payload as unknown as BrandDNA | undefined;
      const scan = create('scan', brand.id, {
        status: 'running',
        url: brand.website,
        completed: [],
        failed: [],
        excluded: [],
        discovered: 0,
        agent: 1,
      });
      put(scan);
      setNotice('Connecting to your website and collecting page evidence…');
      const dnaId = crypto.randomUUID();
      let latestScan = scan;
      let savedPages = 0;
      try {
        const result = await scanWithProgress(
          brand.website,
          (result, complete) => {
            savedPages = result.dna.coverage.completed;
            latestScan = {
              ...scan,
              payload: {
                ...scan.payload,
                ...result.scan,
                status: complete ? result.scan.status : 'running',
              },
            };
            put(
              {
                ...create('dna', brand.id, {
                  ...retainBrandCorrections(result.dna, previousDNA),
                  brandId: brand.id,
                }),
                id: dnaId,
              },
              latestScan,
              ...(result.pages ?? []).map((p) => {
                const old = snapshot().resources.find(
                  (r) =>
                    r.kind === 'page' &&
                    r.brand_id === brand.id &&
                    r.payload.url === p.url,
                );
                return {
                  ...create('page', brand.id, p),
                  ...(old ? { id: old.id } : {}),
                };
              }),
            );
            if (!complete)
              setNotice(
                `Read ${savedPages} ${savedPages === 1 ? 'page' : 'pages'} from ${new URL(brand.website).hostname}. Findings saved; checking more pages…`,
              );
          },
        );
        setNotice(
          `Read ${result.dna.coverage.completed} pages from ${new URL(brand.website).hostname}. Your observed Brand DNA is saved; coverage limits are shown below.`,
        );
        return { jobId: scan.id } as T;
      } catch (e) {
        put({
          ...latestScan,
          payload: {
            ...latestScan.payload,
            status: savedPages ? 'partial' : 'blocked',
            error: savedPages
              ? null
              : e instanceof Error
                ? e.message
                : 'Scan failed.',
            ...(savedPages
              ? {
                  warnings: [
                    String(
                      e instanceof Error ? e.message : 'Scan interrupted.',
                    ),
                  ],
                }
              : {}),
          },
        });
        if (savedPages) {
          setNotice(
            `${savedPages} pages saved. The connection ended before the remaining pages finished. Your results are available below.`,
          );
          return { jobId: scan.id } as T;
        }
        throw e;
      }
    }
    if (action === 'decision' && request.decision === 'reject') {
      const content = record(request.id, 'content');
      save(
        snapshot().state,
        snapshot().resources.filter((r) => r.id !== content.id),
      );
      if (
        typeof content.payload.assetPath === 'string' &&
        content.payload.assetPath.startsWith('local-media:')
      )
        await deleteLocalMedia(content.payload.assetPath.slice(12));
      return { deleted: true } as T;
    }
    if (
      action === 'campaign' ||
      (action === 'decision' &&
        ['redo', 'edit'].includes(String(request.decision)))
    ) {
      const previous =
        action === 'decision' ? record(request.id, 'content') : null;
      const original = previous
        ? record(previous.payload.campaignId, 'campaign')
        : null;
      const input = campaignSchema.parse(
        original
          ? {
              ...original.payload,
              formats: [previous!.payload.format],
              platforms: [previous!.payload.platform],
              direction: `${textValue(original.payload.direction)}\nRevision: ${textValue(request.feedback ?? request.caption)}`,
            }
          : request,
      );
      const dna = record(
        original?.payload.dnaId ??
          snapshot().resources.find(
            (r) => r.kind === 'dna' && r.brand_id === input.brandId,
          )?.id,
        'dna',
      );
      if (
        (dna.payload.evidence as { excerpt: string }[]).some((e) =>
          /synthesized|generated locally|Local Intelligence Profile/i.test(
            e.excerpt,
          ),
        )
      )
        throw new Error(
          'Re-scan this brand. Its older profile was created by an unverified fallback.',
        );
      const config = (await fetch('/api/config').then((r) => r.json())) as {
        generation: {
          ready: boolean;
          textCost: number;
          imageCost: number;
          model: string;
          reviewModel: string;
          imageModel: string;
        };
      };
      if (!config.generation?.ready)
        throw new Error(
          'Image and text creation need your Gemini API key on the server. Open Connections for setup; no image has been generated.',
        );
      if (!workspace.monthly_limit)
        throw new Error(
          'Set your monthly automation limit in Workspace settings before paid generation.',
        );
      if (input.formats.includes('video'))
        throw new Error(
          'Video needs the media processor and durable server workflow. Choose image or text here.',
        );
      const supported: Record<string, string[]> = {
        instagram: ['image'],
        youtube: [],
        x: ['text', 'image'],
        linkedin: ['text', 'image'],
        reddit: ['text', 'image'],
      };
      const pairs = input.platforms.flatMap((platform) =>
        input.formats
          .filter((format) => supported[platform].includes(format))
          .map((format) => ({ platform, format })),
      );
      if (!pairs.length)
        throw new Error(
          'No selected platform supports these formats. YouTube requires video.',
        );
      const campaign = create('campaign', input.brandId, {
        ...input,
        dnaId: dna.id,
        status: 'generating',
        agent: 3,
        estimatedCostUSD: 0,
        budgetCampaignId: original?.payload.budgetCampaignId ?? original?.id,
        referenceUrl:
          request.referenceUrl ?? original?.payload.referenceUrl ?? '',
      });
      const budgetId =
        textValue(campaign.payload.budgetCampaignId) || campaign.id;
      campaign.payload.budgetCampaignId = budgetId;
      put(campaign);
      let qualified = 0;
      let lastFeedback: string[] = [];
      try {
        for (const pair of pairs) {
          let feedback: string[] = [];
          for (let attempt = 1; attempt <= 5; attempt++) {
            const estimate =
              2 * config.generation.textCost +
              (pair.format === 'image' ? config.generation.imageCost : 0);
            if (
              !Number.isFinite(config.generation.textCost) ||
              config.generation.textCost <= 0 ||
              (pair.format === 'image' &&
                (!Number.isFinite(config.generation.imageCost) ||
                  config.generation.imageCost <= 0))
            )
              throw new Error(
                'Configure positive conservative COST_TEXT and COST_IMAGE estimates before paid generation.',
              );
            const month = new Date().toISOString().slice(0, 7);
            const prior = snapshot().state.budget;
            const spent = prior?.periodStart.startsWith(month)
              ? prior.reservedUSD
              : 0;
            const campaignSpend = snapshot()
              .resources.filter(
                (r) =>
                  r.kind === 'campaign' &&
                  r.payload.budgetCampaignId === budgetId,
              )
              .reduce((n, r) => n + Number(r.payload.estimatedCostUSD ?? 0), 0);
            if (
              spent + estimate > workspace.monthly_limit ||
              campaignSpend + estimate > input.budget
            )
              throw new Error(
                'The next attempt would exceed your spending limit. Review existing output or increase the limit.',
              );
            campaign.payload = {
              ...campaign.payload,
              status: 'generating',
              attempt,
              estimatedCostUSD:
                Number(campaign.payload.estimatedCostUSD) + estimate,
            };
            save(
              {
                ...snapshot().state,
                budget: {
                  reservedUSD: spent + estimate,
                  estimated: true,
                  periodStart: month + '-01',
                },
              },
              snapshot().resources.map((r) =>
                r.id === campaign.id ? { ...campaign } : r,
              ),
            );
            const result = await post<{
              caption: string;
              image: { data: string; mimeType: string } | null;
              review: ContentVersion['review'];
            }>('/api/local/generate', {
              ...input,
              formats: [pair.format],
              platforms: [pair.platform],
              brand: dna.payload,
              attempt,
              feedback,
              referenceUrl: campaign.payload.referenceUrl,
            });
            feedback = result.review.feedback;
            lastFeedback = feedback;
            if (!result.review.passed) continue;
            if (pair.format === 'image' && !result.image)
              throw new Error('The provider returned no image.');
            const id = crypto.randomUUID();
            const assetPath = result.image
              ? await storeLocalMedia(id, result.image)
              : null;
            const payload = {
              campaignId: campaign.id,
              dnaId: dna.id,
              ...pair,
              caption: result.caption,
              assetPath,
              mimeType: result.image?.mimeType ?? null,
              review: result.review,
              status: 'qualified',
              attempt,
              provenance: {
                generationModel:
                  pair.format === 'image'
                    ? config.generation.imageModel
                    : config.generation.model,
                reviewModel: config.generation.reviewModel,
                generationPrompt: 'local-creative-3',
                reviewPrompt: 'finished-media-3',
                rubric: 'weighted-35-25-20-20-v1',
                policy: 'observed-facts',
                dnaVersion: Number(dna.payload.version),
              },
            };
            put({
              ...create('content', input.brandId, {
                ...payload,
                contentHash: await contentHash(payload as ContentVersion),
              }),
              id,
            });
            qualified++;
            break;
          }
        }
        put({
          ...campaign,
          payload: {
            ...campaign.payload,
            status: qualified === pairs.length ? 'completed' : 'needs_revision',
            error:
              qualified === pairs.length
                ? undefined
                : `${qualified}/${pairs.length} variants qualified. ${lastFeedback.join(' ')}`,
            agent: 4,
          },
        });
        setNotice(
          `${qualified}/${pairs.length} finished platform versions passed review.`,
        );
        return { jobId: campaign.id } as T;
      } catch (e) {
        put({
          ...campaign,
          payload: {
            ...campaign.payload,
            status: 'blocked',
            error: e instanceof Error ? e.message : 'Generation failed.',
          },
        });
        throw e;
      }
    }
    throw new Error(
      'This action needs a durable server workspace and a connected account. Check Connections for the remaining setup.',
    );
  }
  async function mutate<T>(action: string, body: unknown): Promise<T> {
    if (localMode) {
      if (localRunning.current)
        throw new Error('Wait for the current operation to finish.');
      localRunning.current = true;
      setPending((n) => n + 1);
      try {
        const run = async () => {
          const latest = loadLocalState(localStorage);
          if (latest) localSnapshot.current = latest;
          return mutateLocal<T>(action, body);
        };
        return navigator.locks
          ? await navigator.locks.request('bc-workspace-mutation', run)
          : await run();
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Local operation failed.');
        throw e;
      } finally {
        localRunning.current = false;
        setPending((n) => n - 1);
      }
    }
    if (!client || !session) {
      setSettings(true);
      const message = state.configured
        ? 'Sign in to continue.'
        : 'Connect Supabase to enable secure sign-in and saved workspaces.';
      setNotice(message);
      throw new Error(message);
    }
    setPending((n) => n + 1);
    const commandScope = `${session.user.id}:${workspaceId}:${action}:${JSON.stringify(body)}`;
    const idempotencyKey =
      pendingCommands.current.get(commandScope) ?? crypto.randomUUID();
    pendingCommands.current.set(commandScope, idempotencyKey);
    try {
      const { data } = await client.auth.getSession();
      const r = await fetch('/api/' + action, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          Authorization: `Bearer ${data.session?.access_token ?? ''}`,
          ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
        },
        body: JSON.stringify(body),
      });
      const result = (await r.json()) as Record<string, unknown>;
      if (!r.ok)
        throw new Error(
          typeof result.error === 'string' ? result.error : 'Request failed.',
        );
      pendingCommands.current.delete(commandScope);
      if (!['evidence', 'journey', 'funnel', 'tracking'].includes(action)) {
        try {
          await refresh();
          await loadResources(resourcesByPath[path] ?? resourcesByPath['/']);
        } catch {
          setNotice(
            'Saved successfully. Refresh the workspace to load the latest state.',
          );
        }
      }
      return result as T;
    } catch (e) {
      setNotice((e as Error).message);
      throw e;
    } finally {
      setPending((n) => n - 1);
    }
  }
  const records = <T,>(kind: string) =>
    resources.filter(
      (e) =>
        e.kind === kind &&
        e.brand_id === brandId &&
        e.workspace_id === (workspaceId || state.workspace?.id),
    ) as Entity<T>[];
  return (
    <WorkspaceContext.Provider
      value={{
        state: { ...state, entities: resources },
        client,
        session,
        brandId,
        setBrandId,
        workspaceId,
        setWorkspaceId,
        brand: state.brands.find((b) => b.id === brandId),
        records,
        pages,
        loadMore: (kind) =>
          loadResources([kind], pages[kind]?.nextCursor ?? undefined),
        loading,
        busy: pending > 0,
        notice,
        setNotice,
        mutate,
        read,
        refresh,
        settings,
        localMode,
        setSettings,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
