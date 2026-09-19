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
import type { WorkspaceState, Entity } from '@/lib/contracts';
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
  const localSnapshot = useRef({ state: empty, resources: [] as Entity[] });
  useEffect(() => {
    localSnapshot.current = { state, resources };
  }, [state, resources]);
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void fetch('/api/config')
      .then(
        (r) =>
          r.json() as Promise<{
            supabaseUrl: string;
            supabaseKey: string;
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
        if (config.supabaseUrl && config.supabaseKey) {
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
            const saved = JSON.parse(
              localStorage.getItem('bc_local_workspace_v1') ?? 'null',
            ) as { state?: WorkspaceState; resources?: Entity[] } | null;
            if (saved?.state?.workspace) {
              setState({ ...saved.state, services: config.services });
              setResources(saved.resources ?? []);
              setWorkspace(saved.state.workspace.id);
              setBrand(saved.state.brands[0]?.id ?? '');
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
      if (localMode) return { groups: [] } as T;
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
      if (!brandId || (!client && !localMode)) return;
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
          if (
            result.rows.some((r) =>
              ['completed', 'qualified', 'published'].includes(
                String(r.payload.status),
              ),
            )
          )
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
    setResources([]);
    setPages({});
    try {
      localStorage.setItem('bc_workspace', id);
    } catch {}
  };
  const setBrandId = (id: string) => {
    epoch.current++;
    setBrand(id);
    setResources([]);
    setPages({});
    try {
      localStorage.setItem('bc_brand:' + workspaceId, id);
    } catch {}
  };
  async function mutate<T>(action: string, body: unknown): Promise<T> {
    if (localMode) {
      const request = body as Record<string, unknown>;
      const text = (value: unknown, fallback = '') =>
        typeof value === 'string' ? value : fallback;
      const snapshot = localSnapshot.current;
      const currentWorkspace = snapshot.state.workspace;
      if (!currentWorkspace)
        throw new Error('Local workspace is still loading.');
      const save = (nextState: WorkspaceState, nextResources: Entity[]) => {
        setState(nextState);
        setResources(nextResources);
        try {
          localStorage.setItem(
            'bc_local_workspace_v1',
            JSON.stringify({ state: nextState, resources: nextResources }),
          );
        } catch {
          setNotice('This result is visible now, but browser storage is full.');
        }
      };
      const now = new Date().toISOString();
      const create = (
        kind: string,
        brand: string | null,
        payload: Record<string, unknown>,
      ): Entity => ({
        id: crypto.randomUUID(),
        workspace_id: currentWorkspace.id,
        brand_id: brand,
        kind,
        payload,
        created_at: now,
        updated_at: now,
      });
      if (action === 'brands') {
        const website = new URL(text(request.url)).toString();
        const brand = {
          id: crypto.randomUUID(),
          workspace_id: currentWorkspace.id,
          name: new URL(website).hostname,
          website,
        };
        save(
          { ...snapshot.state, brands: [...snapshot.state.brands, brand] },
          snapshot.resources,
        );
        return brand as T;
      }
      if (action === 'settings') {
        const workspace = {
          ...currentWorkspace,
          name: text(request.name, currentWorkspace.name),
          monthly_limit: Number(
            request.monthlyLimit ?? currentWorkspace.monthly_limit,
          ),
        };
        save(
          {
            ...snapshot.state,
            workspace,
            workspaces: [
              { id: workspace.id, name: workspace.name, role: workspace.role },
            ],
          },
          snapshot.resources,
        );
        return { saved: true } as T;
      }
      if (action === 'scan') {
        const targetBrand = text(request.brandId, brandId);
        const brand = snapshot.state.brands.find(
          (item) => item.id === targetBrand,
        );
        if (!brand) throw new Error('Enter a brand website first.');
        const scan = create('scan', targetBrand, {
          url: brand.website,
          status: 'running',
          queue: [],
          completed: [],
          failed: [],
          excluded: [],
          discovered: 0,
          batch: 0,
          agent: 1,
        });
        save(snapshot.state, [scan, ...snapshot.resources]);
        setPending((n) => n + 1);
        try {
          const response = await fetch('/api/local/scan', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: brand.website }),
          });
          const result = (await response.json()) as {
            error?: string;
            scan?: Record<string, unknown>;
            dna?: Record<string, unknown>;
          };
          if (!response.ok || !result.scan || !result.dna)
            throw new Error(result.error ?? 'Website analysis failed.');
          const nextScan = {
            ...scan,
            payload: { ...scan.payload, ...result.scan, agent: 2 },
          };
          const dna = create('dna', targetBrand, {
            ...result.dna,
            brandId: targetBrand,
          });
          const next = [dna, nextScan, ...snapshot.resources];
          save(snapshot.state, next);
          return { jobId: scan.id } as T;
        } finally {
          setPending((n) => n - 1);
        }
      }
      if (action === 'campaign') {
        const targetBrand = text(request.brandId, brandId);
        const dna = snapshot.resources.find(
          (item) => item.kind === 'dna' && item.brand_id === targetBrand,
        );
        if (!dna)
          throw new Error('Analyze your website before generating content.');
        const campaign = create('campaign', targetBrand, {
          ...request,
          status: 'generating',
          agent: 3,
          dnaId: dna.id,
        });
        save(snapshot.state, [campaign, ...snapshot.resources]);
        setPending((n) => n + 1);
        try {
          const response = await fetch('/api/local/generate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...request, brand: dna.payload }),
          });
          const result = (await response.json()) as {
            error?: string;
            caption?: string;
            image?: { data: string; mimeType: string } | null;
            review?: Record<string, unknown>;
          };
          if (!response.ok || !result.caption || !result.review)
            throw new Error(result.error ?? 'Generation failed.');
          const formats = Array.isArray(request.formats) ? request.formats : [];
          const platforms = Array.isArray(request.platforms)
            ? request.platforms
            : [];
          const assetUrl =
            result.image && result.image.data.length < 1200000
              ? `data:${result.image.mimeType};base64,${result.image.data}`
              : undefined;
          const content = platforms.flatMap((platform) =>
            formats
              .filter((format) => format !== 'video')
              .map((format) =>
                create('content', targetBrand, {
                  campaignId: campaign.id,
                  dnaId: dna.id,
                  format,
                  platform,
                  caption: result.caption,
                  assetPath: assetUrl ? 'browser-storage' : null,
                  assetUrl,
                  mimeType: result.image?.mimeType ?? null,
                  review: result.review,
                  status: result.review?.passed
                    ? 'qualified'
                    : 'needs_revision',
                  contentHash: crypto.randomUUID(),
                  attempt: 1,
                }),
              ),
          );
          const completedCampaign = {
            ...campaign,
            payload: { ...campaign.payload, status: 'completed', agent: 4 },
          };
          save(snapshot.state, [
            ...content,
            completedCampaign,
            ...snapshot.resources,
          ]);
          return { jobId: campaign.id } as T;
        } finally {
          setPending((n) => n - 1);
        }
      }
      if (action === 'decision' && request.decision === 'reject') {
        save(
          snapshot.state,
          snapshot.resources.filter((item) => item.id !== request.id),
        );
        return { deleted: true } as T;
      }
      throw new Error(
        `${action} requires the secure Supabase workspace. Local mode supports brand discovery and text/image generation only.`,
      );
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
