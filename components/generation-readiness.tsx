'use client';
import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  localCampaignReserve,
  type LocalGenerationConfig,
} from '@/lib/local-generation';

export function useGenerationReadiness(enabled: boolean) {
  const [config, setConfig] = useState<LocalGenerationConfig | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const lifecycle = new AbortController();
    void fetch('/api/config', { signal: lifecycle.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            'The provider setup could not be checked. Retry before starting a paid run.',
          );
        const result = (await response.json()) as {
          generation: LocalGenerationConfig;
        };
        if (!result.generation)
          throw new Error('Generation setup is unavailable.');
        if (!lifecycle.signal.aborted) setConfig(result.generation);
      })
      .catch((e: unknown) => {
        if (!lifecycle.signal.aborted)
          setError(
            e instanceof Error ? e.message : 'Unable to check provider setup.',
          );
      });
    return () => lifecycle.abort();
  }, [enabled, revision]);
  return {
    config,
    error,
    refresh: () => {
      setConfig(null);
      setError('');
      setRevision((value) => value + 1);
    },
  };
}

export function GenerationReadiness({
  setup,
  platforms,
  formats,
  monthlyLimit,
  onSettings,
}: {
  setup: ReturnType<typeof useGenerationReadiness>;
  platforms: string[];
  formats: string[];
  monthlyLimit: number;
  onSettings: () => void;
}) {
  const { config, error, refresh } = setup;
  const quote = config
    ? localCampaignReserve(platforms, formats, config)
    : null;
  const money = (amount: number) =>
    new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(
      amount,
    );
  return (
    <div className="generation-readiness" aria-live="polite">
      <div className="generation-readiness-heading">
        <ShieldCheck size={15} aria-hidden="true" />
        <strong>
          {config?.providerConfigured
            ? 'Gemini configured'
            : config
              ? 'Provider setup needed'
              : error
                ? 'Setup check unavailable'
                : 'Checking provider…'}
        </strong>
        <button
          type="button"
          onClick={refresh}
          aria-label="Refresh generation setup"
        >
          <RefreshCw size={13} />
        </button>
      </div>
      {error && <p>{error}</p>}
      {config && !config.ready && (
        <>
          <p>{config.reason}</p>
          {config.providerConfigured && (
            <a
              href="http://localhost:3000/content"
              target="_blank"
              rel="noreferrer"
            >
              Open local app <ExternalLink size={12} />
            </a>
          )}
        </>
      )}
      {config?.ready && (
        <>
          {quote ? (
            <dl className="generation-reservation">
              <div>
                <dt>
                  One pass · {quote.variants}{' '}
                  {quote.variants === 1 ? 'version' : 'versions'}
                </dt>
                <dd>{money(quote.firstPass)}</dd>
              </div>
              <div>
                <dt>Up to 5 attempts per version</dt>
                <dd>{money(quote.fullRun)}</dd>
              </div>
            </dl>
          ) : (
            <p>
              Choose a supported format and destination to see your reservation.
            </p>
          )}
          {(!config.textReady ||
            (formats.includes('image') && !config.imageReady)) && (
            <p>{config.errors.join(' ')}</p>
          )}
          <p>
            Conservative reservations, not actual charges. Your limit can stop
            retries early. Google billing is separate.
          </p>
          <button type="button" className="text-link" onClick={onSettings}>
            {monthlyLimit > 0
              ? `Monthly limit ${money(monthlyLimit)} · Edit`
              : 'Set your monthly spending limit'}
          </button>
        </>
      )}
    </div>
  );
}
