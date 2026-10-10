import type { WorkspaceState, Entity } from './contracts';
export const LOCAL_STATE_KEY = 'bc_local_workspace_v1';
export type LocalState = { state: WorkspaceState; resources: Entity[] };
export function recoverLocalState(
  snapshot: LocalState,
  interruptRuns = true,
): LocalState {
  return {
    ...snapshot,
    resources: snapshot.resources.map((record) => {
      let payload = record.payload;
      if (
        interruptRuns &&
        ['running', 'generating', 'reviewing'].includes(String(payload.status))
      )
        payload = {
          ...payload,
          status: 'interrupted',
          error: 'This browser run stopped. Retry the scan or campaign.',
        };
      if (record.kind === 'content' && !payload.provenance)
        payload = {
          ...payload,
          status: 'needs_revision',
          review: { ...(payload.review as object), passed: false },
        };
      return { ...record, payload };
    }),
  };
}
export function saveLocalState(
  storage: Pick<Storage, 'setItem'>,
  snapshot: LocalState,
) {
  try {
    storage.setItem(LOCAL_STATE_KEY, JSON.stringify(snapshot));
  } catch (cause) {
    throw new Error(
      'Browser storage could not save this update. Your previously saved results are unchanged. Free browser storage before retrying, and export your Brand DNA before clearing any site data.',
      { cause },
    );
  }
}
// Reading existing data must not depend on being able to write its recovery
// status back. A full browser store can still contain a perfectly valid report.
export function restoreLocalState(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  recover = true,
) {
  const saved = loadLocalState(storage);
  if (!saved) return { snapshot: null, warning: '' };
  const next = recoverLocalState(saved, recover);
  if (!recover) return { snapshot: next, warning: '' };
  if (!next.resources.some((r, i) => r.payload !== saved.resources[i].payload))
    return { snapshot: saved, warning: '' };
  try {
    saveLocalState(storage, next);
    return { snapshot: next, warning: '' };
  } catch (error) {
    return {
      snapshot: next,
      warning:
        error instanceof Error
          ? error.message
          : 'Saved results loaded, but recovery could not be saved.',
    };
  }
}
export function loadLocalState(
  storage: Pick<Storage, 'getItem'>,
): LocalState | null {
  const text = storage.getItem(LOCAL_STATE_KEY);
  if (!text) return null;
  const s = JSON.parse(text) as LocalState;
  if (
    !s.state?.workspace?.id ||
    !Array.isArray(s.state.brands) ||
    !Array.isArray(s.resources)
  )
    throw new Error(
      'Saved workspace data is invalid. Export browser data before resetting it.',
    );
  return s;
}
export function readLocalResources(snapshot: LocalState, url: string) {
  const q = new URL(url, 'https://workspace.invalid').searchParams;
  const brand = q.get('brandId'),
    kinds = (q.get('kinds') ?? '').split(','),
    query = (q.get('q') ?? '').trim().toLowerCase();
  const offset = Math.max(0, Number(q.get('cursor')) || 0),
    limit = Math.min(100, Math.max(1, Number(q.get('limit')) || 25));
  return {
    groups: kinds.map((kind) => {
      const rows = snapshot.resources
        .filter(
          (r) =>
            r.workspace_id === snapshot.state.workspace?.id &&
            r.brand_id === brand &&
            r.kind === kind &&
            (!query || JSON.stringify(r.payload).toLowerCase().includes(query)),
        )
        .sort(
          (a, b) =>
            b.created_at.localeCompare(a.created_at) ||
            b.id.localeCompare(a.id),
        );
      return {
        kind,
        rows: rows.slice(offset, offset + limit),
        total: rows.length,
        nextCursor:
          offset + limit < rows.length ? String(offset + limit) : null,
      };
    }),
  };
}
