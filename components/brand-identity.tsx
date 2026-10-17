'use client';
/* oxlint-disable next/no-img-element */
import { useState } from 'react';
import { Dna, ExternalLink, Moon, Sun, Quote } from 'lucide-react';
import type { BrandDNA } from '@/lib/contracts';
import {
  brandLogoUrl,
  brandVoiceLabel,
  getBrandIdentityColors,
  type BrandIdentityColor,
} from '@/lib/brand-identity';

function BrandLogo({ url, name }: { url: string | null; name: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [surface, setSurface] = useState<'light' | 'dark'>('light');
  const src = brandLogoUrl(url);
  const available = src && failedUrl !== src;
  return (
    <div className="identity-logo-block">
      <div className={`identity-logo-surface identity-logo-${surface}`}>
        {available ? (
          <img
            src={src}
            alt={`${name} logo`}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailedUrl(src)}
          />
        ) : (
          <div className="identity-logo-fallback">
            <Dna size={36} aria-hidden="true" />
            <span>{src ? 'Logo unavailable' : 'Logo not found'}</span>
          </div>
        )}
      </div>
      {available && (
        <fieldset
          className="identity-logo-controls"
          aria-label="Logo preview background"
        >
          <button
            type="button"
            aria-label="Preview logo on light background"
            aria-pressed={surface === 'light'}
            onClick={() => setSurface('light')}
          >
            <Sun size={12} aria-hidden="true" /> Light
          </button>
          <button
            type="button"
            aria-label="Preview logo on dark background"
            aria-pressed={surface === 'dark'}
            onClick={() => setSurface('dark')}
          >
            <Moon size={12} aria-hidden="true" /> Dark
          </button>
        </fieldset>
      )}
    </div>
  );
}

function IdentityColor({ color }: { color: BrandIdentityColor }) {
  const candidate = color.candidates[0];
  return (
    <div
      className={`identity-color${candidate ? '' : ' identity-color-missing'}`}
    >
      <div className="identity-color-label">{color.label}</div>
      <div className="identity-color-preview">
        <span
          className="identity-color-chip"
          style={candidate ? { backgroundColor: candidate.value } : undefined}
          aria-hidden="true"
        />
        <strong>{candidate?.value ?? 'Not identified'}</strong>
      </div>
      {candidate ? (
        <details className="identity-color-source">
          <summary>
            CSS candidate
            {color.candidates.length > 1 &&
              ` · +${color.candidates.length - 1}`}
          </summary>
          <p>
            Declared in the sampled CSS. The active theme and approved brand
            role need confirmation.
          </p>
          {color.candidates.map((item) => (
            <div key={item.value} className="identity-color-evidence">
              <strong>{item.value}</strong>
              {item.observations.slice(0, 5).map((observation, index) => (
                <div
                  key={`${observation.url}-${observation.selector}-${index}`}
                >
                  <code>{observation.selector}</code>
                  <span>{observation.method}</span>
                  {brandLogoUrl(observation.url) && (
                    <a href={observation.url} target="_blank" rel="noreferrer">
                      View source <ExternalLink size={11} aria-hidden="true" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          ))}
        </details>
      ) : (
        <p className="identity-color-note">No matching declaration</p>
      )}
    </div>
  );
}

function VoiceSources({ ids, dna }: { ids: string[]; dna: BrandDNA }) {
  const sources = dna.evidence.filter((evidence) => ids.includes(evidence.id));
  if (!sources.length) return null;
  return (
    <details className="identity-voice-sources">
      <summary>
        Inspect voice {sources.length === 1 ? 'source' : 'sources'}
      </summary>
      {sources.map((source) => (
        <div key={source.id}>
          {brandLogoUrl(source.url) ? (
            <a href={source.url} target="_blank" rel="noreferrer">
              {new URL(source.url).hostname}{' '}
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          ) : (
            <span>Saved evidence</span>
          )}
          <p>{source.excerpt}</p>
          {source.selector && <code>{source.selector}</code>}
        </div>
      ))}
    </details>
  );
}

export function BrandIdentitySummary({
  dna,
  fallbackName,
}: {
  dna: BrandDNA;
  fallbackName?: string;
}) {
  const name = dna.name || fallbackName || 'Your brand';
  const voice = dna.voice[0];
  const colors = getBrandIdentityColors(dna);
  return (
    <div className="brand-identity-summary">
      <div className="brand-identity-hero">
        <BrandLogo url={dna.logo} name={name} />
        <div className="brand-identity-name">
          <span className="identity-kicker">Brand identity</span>
          <h2>{name}</h2>
          <div className="identity-tagline">
            <span className="identity-field-label">Motto / tagline</span>
            {dna.tagline?.trim() ? (
              <p>{dna.tagline}</p>
            ) : (
              <p className="identity-missing">
                No explicit motto or tagline found in the sampled pages.
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="brand-identity-facts">
        <div className="identity-tone">
          <span className="identity-field-label">
            <Quote size={14} aria-hidden="true" /> Tone of voice
          </span>
          {voice ? (
            <>
              {voice.title && <strong>{voice.title}</strong>}
              <p className="identity-tone-copy">{voice.text}</p>
              <span className="identity-tone-status">
                {brandVoiceLabel(voice, dna)}
              </span>
              <VoiceSources ids={voice.evidenceIds} dna={dna} />
              {dna.voice.length > 1 && (
                <details className="identity-tone-more">
                  <summary>
                    {dna.voice.length - 1} more voice{' '}
                    {dna.voice.length === 2 ? 'finding' : 'findings'}
                  </summary>
                  {dna.voice.slice(1).map((finding, index) => (
                    <div key={index}>
                      {finding.title && <strong>{finding.title}</strong>}
                      <p>{finding.text}</p>
                      <span className="identity-tone-status">
                        {brandVoiceLabel(finding, dna)}
                      </span>
                      <VoiceSources ids={finding.evidenceIds} dna={dna} />
                    </div>
                  ))}
                </details>
              )}
            </>
          ) : (
            <p className="identity-missing">
              Tone not yet identified. More readable brand copy is needed.
            </p>
          )}
        </div>
        <div className="identity-colors">
          <span className="identity-field-label">Main colors</span>
          <div className="identity-color-grid">
            {colors.map((color) => (
              <IdentityColor key={color.role} color={color} />
            ))}
          </div>
          <p className="identity-colors-note">
            Roles are suggested by CSS declarations.
          </p>
        </div>
      </div>
    </div>
  );
}
