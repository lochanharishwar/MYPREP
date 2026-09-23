'use client';
/* oxlint-disable next/no-img-element */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { Entity, Finding } from '@/lib/contracts';
import { useWorkspace } from './workspace-provider';
import { ThinkingIndicator } from './thinking-indicator';

type PageInsight = {
  url: string;
  screenshot?: string;
  thumbnail?: string;
  title?: string;
  retrieval?: string;
  summary?: { summary?: string; insights?: Finding[]; seoIssues?: string[] };
  error?: string;
};
type Results = {
  rows: Entity<PageInsight>[];
  total: number;
  nextCursor: string | null;
};
const publicUrl = (value?: string) => {
  try {
    const url = new URL(value ?? '');
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
};

function ResultsList({ query }: { query: string }) {
  const { read, brandId, records, localMode } = useWorkspace();
  const pageRevision = localMode
    ? records<PageInsight>('page')
        .map((r) => `${r.id}:${r.updated_at}`)
        .join('|')
    : '';
  const [result, setResult] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const failedCursor = useRef<string | undefined>(undefined);
  const load = useCallback(
    async (cursor?: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      const controller = new AbortController();
      request.current = controller;
      failedCursor.current = cursor;
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          brandId,
          kinds: 'page',
          q: query,
          limit: '25',
        });
        if (cursor) params.set('cursor', cursor);
        const response = await read<{ groups: Results[] }>(
          '/api/resources?' + params,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const next = response.groups[0];
        if (!next)
          throw new Error('Page findings could not be read. Please retry.');
        setResult((old) => ({
          ...next,
          rows: cursor
            ? [
                ...new Map(
                  [...(old?.rows ?? []), ...next.rows].map((row) => [
                    row.id,
                    row,
                  ]),
                ).values(),
              ]
            : next.rows,
        }));
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : 'Unable to load page findings.',
          );
      } finally {
        inFlight.current = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [read, brandId, query],
  );
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => {
      clearTimeout(timer);
      request.current?.abort();
    };
  }, [load, pageRevision]);
  return (
    <div aria-busy={loading}>
      <output className="row muted small spaced">
        {loading && <ThinkingIndicator state="searching" />}
        {loading
          ? 'Searching stored page findings…'
          : result
            ? `Showing ${result.rows.length} of ${result.total} matching pages`
            : 'Page findings unavailable'}
      </output>
      {error && (
        <div className="notice" role="alert">
          <p>{error}</p>
          <button
            className="secondary-btn spaced"
            disabled={loading}
            onClick={() => void load(failedCursor.current)}
          >
            Retry page findings
          </button>
        </div>
      )}
      {result && result.rows.length === 0 && !error && !loading && (
        <div className="empty-state">
          <Search size={32} />
          <h3>
            {query
              ? 'No matching page findings'
              : 'Insights begin with the source'}
          </h3>
          <p>
            {query
              ? 'Try another page address, topic, or SEO finding.'
              : 'Analyze your brand website to collect page findings and their evidence.'}
          </p>
        </div>
      )}
      <div className="two-col spaced">
        {result?.rows.map((page) => (
          <article className="data-card" key={page.id}>
            {page.payload.title && <h3>{page.payload.title}</h3>}
            {publicUrl(page.payload.screenshot) && (
              <img
                src={publicUrl(page.payload.screenshot)}
                alt={`Screenshot of ${page.payload.url}`}
                loading="lazy"
              />
            )}
            {publicUrl(page.payload.url) ? (
              <a
                href={publicUrl(page.payload.url)}
                className="text-link small"
                target="_blank"
                rel="noreferrer"
              >
                {page.payload.url}
              </a>
            ) : (
              <p>{page.payload.url}</p>
            )}
            <p>{page.payload.summary?.summary}</p>
            {page.payload.retrieval && (
              <p className="muted small">{page.payload.retrieval}</p>
            )}
            {page.payload.summary?.insights?.map((finding, index) => (
              <p key={index}>{finding.text}</p>
            ))}
            {page.payload.summary?.seoIssues?.map((issue, index) => (
              <p key={index}>SEO · {issue}</p>
            ))}
            {page.payload.error && (
              <p className="notice">{page.payload.error}</p>
            )}
          </article>
        ))}
      </div>
      <div className="tabs-row spaced">
        {result?.nextCursor && (
          <button
            className="secondary-btn"
            disabled={loading}
            onClick={() => void load(result.nextCursor ?? undefined)}
          >
            Load more page findings
          </button>
        )}
        {result && (
          <button
            className="text-link"
            disabled={loading}
            onClick={() => void load()}
          >
            Refresh page findings
          </button>
        )}
      </div>
    </div>
  );
}

export function PageInsights() {
  const w = useWorkspace();
  const [query, setQuery] = useState('');
  return (
    <section className="panel">
      <h2>Every page. Its own perspective.</h2>
      <div className="scan-form spaced">
        <Search size={18} aria-hidden="true" />
        <input
          aria-label="Search page insights"
          placeholder="Search pages, topics, or SEO findings"
          maxLength={200}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!w.brandId || (!w.session && !w.localMode)}
        />
        {query && (
          <button className="text-link" onClick={() => setQuery('')}>
            Clear search
          </button>
        )}
      </div>
      <p className="muted small spaced">
        Search includes all stored page findings for this brand, including older
        pages.
      </p>
      {w.brandId && (w.session || w.localMode) ? (
        <ResultsList
          key={`${w.workspaceId}:${w.brandId}:${w.session?.user.id ?? 'local'}:${query.trim()}`}
          query={query.trim()}
        />
      ) : (
        <p className="notice">
          {w.session
            ? 'Choose a brand to inspect its page findings.'
            : 'Connect your workspace to search saved page findings.'}
        </p>
      )}
    </section>
  );
}
