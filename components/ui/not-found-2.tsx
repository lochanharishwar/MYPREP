import Link from 'next/link';
import { CompassIcon, HomeIcon } from 'lucide-react';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { LiquidButton } from '@/components/ui/liquid-glass-button';

export function NotFound() {
  return (
    <main id="main" className="not-found-page relative flex min-h-screen w-full items-center justify-center overflow-hidden px-6">
      <Empty className="max-w-xl border-white/10 bg-[#111821]/85 shadow-2xl backdrop-blur-xl">
        <EmptyHeader>
          <Link href="/" aria-label="MARKY dashboard"><img src="/marky-logo.webp" alt="MARKY" width={2172} height={724} className="not-found-logo" /></Link>
          <EmptyTitle className="bg-gradient-to-b from-cyan-100 to-cyan-300/20 bg-clip-text text-8xl font-extrabold leading-none tracking-tighter text-transparent sm:text-9xl">
            404
          </EmptyTitle>
          <h1 className="text-2xl font-semibold">This page is off the map.</h1>
          <EmptyDescription className="max-w-sm text-foreground/80">
            This address may be incorrect, or the page may have moved. Your saved workspace is still here.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <LiquidButton asChild variant="primary">
            <Link href="/">
              <HomeIcon className="size-4" />
              Back to dashboard
            </Link>
          </LiquidButton>
          <LiquidButton asChild variant="outline">
            <Link href="/brand-dna">
              <CompassIcon className="size-4" />
              Open Brand DNA
            </Link>
          </LiquidButton>
        </EmptyContent>
      </Empty>
    </main>
  );
}
