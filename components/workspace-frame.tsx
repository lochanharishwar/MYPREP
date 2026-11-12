'use client';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { MarketingApp, type Page } from './marketing-app';

const pages: Record<string, Page> = {
  '/': 'dashboard', '/brand-dna': 'brand-dna', '/content': 'content',
  '/schedule': 'schedule', '/analytics': 'analytics', '/insights': 'insights',
};

// Root-layout ownership keeps the navigation, settings and tool registrations
// mounted across workspace routes. Unknown paths render the router's 404.
export function WorkspaceFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const page = pages[pathname?.replace(/\/$/, '') || '/'];
  return page ? <MarketingApp page={page} /> : <>{children}</>;
}
