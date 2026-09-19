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
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-6">
      <Empty className="max-w-xl border-white/10 bg-[#111821]/85 shadow-2xl backdrop-blur-xl">
        <EmptyHeader>
          <EmptyTitle className="bg-gradient-to-b from-cyan-100 to-cyan-300/20 bg-clip-text text-8xl font-extrabold leading-none tracking-tighter text-transparent sm:text-9xl">
            404
          </EmptyTitle>
          <EmptyDescription className="max-w-sm text-foreground/80">
            The page you&apos;re looking for may have moved or no longer exists.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <LiquidButton asChild variant="primary">
            <Link href="/">
              <HomeIcon className="size-4" />
              Go home
            </Link>
          </LiquidButton>
          <LiquidButton asChild variant="outline">
            <Link href="/brand-dna">
              <CompassIcon className="size-4" />
              Explore
            </Link>
          </LiquidButton>
        </EmptyContent>
      </Empty>
    </div>
  );
}
