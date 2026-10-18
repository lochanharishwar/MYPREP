'use client';

import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface KatexRendererProps {
  math: string;
  block?: boolean;
  className?: string;
}

export const KatexRenderer: React.FC<KatexRendererProps> = ({
  math,
  block = false,
  className = '',
}) => {
  const html = useMemo(() => {
    try {
      const cleanMath = (math || '').trim();
      if (!cleanMath) return '';
      return katex.renderToString(cleanMath, {
        displayMode: block,
        throwOnError: false,
      });
    } catch (e: any) {
      return `<span class="text-rose-500 font-mono text-xs">[LaTeX error: ${e.message}]</span>`;
    }
  }, [math, block]);

  if (!html) return null;

  return (
    <span
      className={`inline-block select-text ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
