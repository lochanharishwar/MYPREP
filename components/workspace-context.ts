'use client';
import { createContext, useContext } from 'react';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { WorkspaceState, Entity } from '@/lib/contracts';
export type PageInfo = { total: number; nextCursor: string | null };
export interface WorkspaceContextValue {
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
export const WorkspaceContext = createContext<WorkspaceContextValue | null>(
  null,
);
export function useWorkspace() {
  const c = useContext(WorkspaceContext);
  if (!c) throw new Error('Workspace context unavailable');
  return c;
}
