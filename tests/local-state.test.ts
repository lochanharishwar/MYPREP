import { describe, it, expect } from 'vitest';
import {
  loadLocalState,
  saveLocalState,
  readLocalResources,
  recoverLocalState,
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
    ).toThrow('Quota');
    expect(() => loadLocalState({ getItem: () => '{"state":{}}' })).toThrow(
      'invalid',
    );
  });
});
