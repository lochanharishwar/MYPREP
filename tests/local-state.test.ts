import { describe, it, expect } from 'vitest';
import {
  loadLocalState,
  saveLocalState,
  readLocalResources,
  recoverLocalState,
  restoreLocalState,
  type LocalState,
} from '@/lib/local-state';
const state: LocalState = {
  state: {
    configured: false,
    authenticated: false,
    entities: [],
    workspace: {
      id: 'w',
      name: 'Local',
      role: 'owner',
      currency: 'USD',
      monthly_limit: 10,
    },
    brands: [
      {
        id: 'b',
        workspace_id: 'w',
        name: 'Brand',
        website: 'https://example.com',
      },
    ],
    services: [],
  },
  resources: [],
};
const record = (
  id: string,
  brand_id = 'b',
  workspace_id = 'w',
  kind = 'page',
  payload: Record<string, unknown> = {
    url: 'https://example.com',
    summary: 'City bicycles',
  },
) => ({
  id,
  brand_id,
  workspace_id,
  kind,
  payload,
  created_at: '2026-09-20T00:00:00Z',
  updated_at: '2026-09-20T00:00:00Z',
});
describe('browser workspace persistence', () => {
  it('keeps scoped search and pagination after a save/load', () => {
    let saved = '';
    const storage = {
      getItem: () => saved,
      setItem: (_key: string, text: string) => {
        saved = text;
      },
    };
    saveLocalState(storage, {
      ...state,
      resources: [
        record('a'),
        record('b'),
        record('c', 'another'),
        record('d', 'b', 'another'),
      ],
    });
    const snapshot = loadLocalState(storage)!;
    const first = readLocalResources(
      snapshot,
      '/api/resources?brandId=b&kinds=page&q=BICYCLES&limit=1',
    ).groups[0];
    expect(first.total).toBe(2);
    expect(first.rows).toHaveLength(1);
    expect(first.nextCursor).toBe('1');
    const last = readLocalResources(
      snapshot,
      '/api/resources?brandId=b&kinds=page&cursor=1&limit=1',
    ).groups[0];
    expect(last.nextCursor).toBeNull();
    expect(last.rows[0].id).not.toBe(first.rows[0].id);
  });
  it('persists interrupted jobs and quarantined legacy content through later updates', () => {
    let saved = '';
    const storage = {
      getItem: () => saved,
      setItem: (_key: string, text: string) => {
        saved = text;
      },
    };
    const recovered = recoverLocalState({
      ...state,
      resources: [
        record('old', 'b', 'w', 'content', {
          status: 'qualified',
          review: { score: 9, passed: true },
        }),
        record('run', 'b', 'w', 'campaign', { status: 'generating' }),
      ],
    });
    saveLocalState(storage, recovered);
    const next = loadLocalState(storage)!;
    saveLocalState(storage, {
      ...next,
      state: {
        ...next.state,
        workspace: { ...next.state.workspace!, monthly_limit: 20 },
      },
    });
    expect(
      loadLocalState(storage)!.resources.map((r) => r.payload.status),
    ).toEqual(['needs_revision', 'interrupted']);
  });
  it('reports quota errors without pretending the state was saved', () => {
    expect(() =>
      saveLocalState(
        {
          setItem: () => {
            throw new Error('QuotaExceededError');
          },
        },
        state,
      ),
    ).toThrow('Browser storage could not save');
    expect(() => loadLocalState({ getItem: () => '{"state":{}}' })).toThrow(
      'invalid',
    );
  });
  it('still loads saved reports when recovery cannot be written', () => {
    const snapshot = {
      ...state,
      resources: [
        record('run', 'b', 'w', 'scan', { status: 'running' }),
        record('dna', 'b', 'w', 'dna', { name: 'Saved brand' }),
      ],
    };
    const restored = restoreLocalState({
      getItem: () => JSON.stringify(snapshot),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(restored.snapshot?.resources[1]).toEqual(snapshot.resources[1]);
    expect(restored.snapshot?.resources[0].payload.status).toBe('interrupted');
    expect(restored.warning).toContain(
      'previously saved results are unchanged',
    );
  });
  it('does not recover or overwrite a run owned by another tab', () => {
    const snapshot = {
      ...state,
      resources: [record('active', 'b', 'w', 'scan', { status: 'running' })],
    };
    let writes = 0;
    const restored = restoreLocalState(
      {
        getItem: () => JSON.stringify(snapshot),
        setItem: () => {
          writes++;
        },
      },
      false,
    );
    expect(restored.snapshot?.resources[0].payload.status).toBe('running');
    expect(writes).toBe(0);
  });
  it('opens a healthy report without an unnecessary storage rewrite', () => {
    const restored = restoreLocalState({
      getItem: () => JSON.stringify(state),
      setItem: () => {
        throw new Error('Must not write');
      },
    });
    expect(restored.snapshot).toEqual(state);
    expect(restored.warning).toBe('');
  });
  it.each([true, false])(
    'quarantines legacy fabricated content in memory even when writes are unavailable (recover=%s)',
    (recover) => {
      const saved = {
        ...state,
        resources: [
          record('legacy', 'b', 'w', 'content', {
            status: 'qualified',
            review: { score: 10, passed: true },
          }),
        ],
      };
      const bytes = JSON.stringify(saved);
      const restored = restoreLocalState(
        {
          getItem: () => bytes,
          setItem: () => {
            throw new Error('Full');
          },
        },
        recover,
      );
      expect(restored.snapshot?.resources[0].payload.status).toBe(
        'needs_revision',
      );
      expect(JSON.parse(bytes).resources[0].payload.status).toBe('qualified');
    },
  );
});
