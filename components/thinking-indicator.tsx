'use client';

import { ThinkingOrb, type ThinkingOrbProps } from 'thinking-orbs';

// Keep the requested boolean theme API while using the installed package's API.
// The orb handles reduced motion, visibility and animation cleanup internally.
export function ThinkingIndicator({
  dark = true,
  size = 20,
  ...props
}: Omit<ThinkingOrbProps, 'theme'> & { dark?: boolean }) {
  return (
    <ThinkingOrb
      aria-hidden="true"
      {...props}
      size={size}
      theme={dark ? 'dark' : 'light'}
      style={{ flexShrink: 0, ...props.style }}
    />
  );
}
