/* oxlint-disable next/no-img-element */
import type { ReactNode } from 'react';

export type SectionCharacter =
  | 'identity'
  | 'strategy'
  | 'strengths'
  | 'weaknesses'
  | 'marketGaps'
  | 'opportunities'
  | 'values'
  | 'voice'
  | 'aesthetics'
  | 'competitors'
  | 'colors'
  | 'platforms'
  | 'sources'
  | 'campaign'
  | 'schedule'
  | 'analytics'
  | 'customers'
  | 'review'
  | 'connections';

// Editorial mascots are decorative; observed logos, screenshots and evidence
// remain separate and retain their own source labels.
export function SectionMascot({
  character,
  className = '',
}: {
  character: SectionCharacter;
  className?: string;
}) {
  return (
    <img
      className={`section-mascot ${className}`}
      src={`/illustrations/robots/${character}.webp`}
      width={144}
      height={144}
      loading="lazy"
      decoding="async"
      alt=""
      aria-hidden="true"
    />
  );
}

export function SectionHeading({
  character,
  children,
  featured = false,
  as: Tag = 'h2',
}: {
  character: SectionCharacter;
  children: ReactNode;
  featured?: boolean;
  as?: 'h2' | 'h3';
}) {
  return (
    <div
      className={`illustrated-heading${featured ? ' illustrated-heading-featured' : ''}`}
    >
      <SectionMascot character={character} />
      <Tag>{children}</Tag>
    </div>
  );
}
