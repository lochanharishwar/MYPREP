'use client';
import { isUnverifiedDNA } from '@/lib/brand-report';
// Evidence and signed private storage URLs must bypass image optimization.
/* oxlint-disable next/no-img-element */
// The installed Recharts 3 release supports Cell for per-series colors.
/* oxlint-disable typescript/no-deprecated */
import { useState } from 'react';
import { BrandIdentitySummary } from './brand-identity';
import Link from 'next/link';
import { Dna, ArrowRight, Download, ExternalLink } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useWorkspace } from './workspace-provider';
import { SectionHeading } from './section-heading';
import type { BrandDNA, Evidence, Finding } from '@/lib/contracts';

export function Dropdown({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (s: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
      <SelectTrigger aria-label={label} className="min-w-36 h-10">
        <SelectValue placeholder={label}>
          {options.find((option) => option.value === value)?.label ?? label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function Source({ evidence }: { evidence: Evidence }) {
  const valid = /^https?:\/\//.test(evidence.url);
  return (
    <div className="source spaced">
      {valid ? (
        <a href={evidence.url} target="_blank" rel="noreferrer">
          {new URL(evidence.url).hostname}{' '}
          <ExternalLink size={12} className="inline" />
        </a>
      ) : (
        <span>User correction</span>
      )}{' '}
      · {evidence.method} · {Math.round(evidence.confidence * 100)}% confidence
      <p className="muted small">{evidence.excerpt.slice(0, 300)}</p>
      {evidence.selector && (
        <p className="muted small">Observed at {evidence.selector}</p>
      )}
    </div>
  );
}

export function BrandFinding({ finding, dna }: { finding: Finding; dna: BrandDNA }) {
  return (
    <article className="data-card brand-finding">
      <div className="section-title">
        {finding.title && <h3>{finding.title}</h3>}
        <span className="pill">
          {finding.hypothesis
            ? 'Hypothesis'
            : finding.type === 'interpretation'
              ? 'Interpretation'
              : finding.type === 'fact'
                ? 'Website observation'
                : finding.type}
        </span>
      </div>
      <p>{finding.text}</p>
      {finding.hypothesis && (
        <p className="spaced">
          <strong>Why test this</strong>
          <br />
          {finding.hypothesis}
        </p>
      )}
      {finding.recommendation && (
        <p className="spaced experiment-action">
          <strong>Next step</strong>
          <br />
          {finding.recommendation}
        </p>
      )}
      <details className="spaced small">
        <summary>
          Inspect{' '}
          {finding.evidenceIds.length === 1
            ? 'source'
            : `${finding.evidenceIds.length} sources`}
        </summary>
        {finding.evidenceIds.map((id) => {
          const e = dna.evidence.find((e) => e.id === id);
          return e ? <Source key={id} evidence={e} /> : null;
        })}
      </details>
    </article>
  );
}

export function DNACard({ compact = false }: { compact?: boolean }) {
  const w = useWorkspace();
  const record = w.records<BrandDNA>('dna')[0];
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(''),
    [tagline, setTagline] = useState('');
  if (!record)
    return (
      <section
        className={`panel brand-dna-card${compact ? ' brand-dna-card-compact' : ''}`}
      >
        <div className="section-title">
          <SectionHeading character="identity">Your Brand DNA</SectionHeading>
          <span className="pill">Awaiting your website</span>
        </div>
        <div className="dna-empty">
          <div className="dna-symbol">
            <Dna />
          </div>
          <div>
            <h3>Your identity, brought into focus.</h3>
            <p>
              Your logo, colors, typography, and voice will live here—extracted
              from your website, with the evidence behind every detail.
            </p>
            <div className="tags">
              <span>Brand identity</span>
              <span>Visual language</span>
              <span>Tone of voice</span>
              <span>Market opportunities</span>
            </div>
          </div>
        </div>
      </section>
    );
  const dna = record.payload;
  const unverified = isUnverifiedDNA(dna);
  return (
    <section
      className={`panel brand-dna-card${compact ? ' brand-dna-card-compact' : ''}`}
    >
      <div className="section-title">
        <SectionHeading character="identity">Your Brand DNA</SectionHeading>
        <span
          className={`pill ${dna.coverage.status === 'complete' ? 'green' : 'amber'}`}
        >
          {dna.coverage.completed} pages · {dna.coverage.status}
        </span>
      </div>
      <p className="muted small">
        Profile saved {new Date(dna.createdAt).toLocaleString()} · version{' '}
        {dna.version}
      </p>
      {unverified && (
        <p className="notice" role="alert">
          This older profile contains unverified generated information. Scan the
          website again before relying on it.
        </p>
      )}
      {!dna.analysis && !unverified && w.localMode && !compact && (
        <div className="notice spaced">
          <p>
            This saved profile predates the strategic analysis. Build strengths,
            weaknesses, and experiments from the page evidence already saved.
          </p>
          <button
            className="secondary-btn spaced"
            disabled={w.busy}
            onClick={() =>
              void w.mutate('analyze-dna', { id: record.id }).catch(() => {})
            }
          >
            Analyze saved evidence
          </button>
        </div>
      )}
      <BrandIdentitySummary dna={dna} fallbackName={w.brand?.name} />
      <div className="spaced">
        {dna.overview.map((f, i) => (
          <div key={i} className="spaced">
            <p>{f.text}</p>
            {!compact && (
              <details className="small">
                <summary>Source</summary>
                {f.evidenceIds.map((id) => {
                  const e = dna.evidence.find((e) => e.id === id);
                  return e ? <Source key={id} evidence={e} /> : null;
                })}
              </details>
            )}
          </div>
        ))}
      </div>
      {!compact && dna.identityEvidence && (
        <details className="small spaced">
          <summary>Identity sources</summary>
          {Object.entries(dna.identityEvidence).map(([key, ids]) => (
            <div key={key}>
              <strong className="capitalize">{key}</strong>
              {ids?.map((id) => {
                const e = dna.evidence.find((e) => e.id === id);
                return e ? <Source key={id} evidence={e} /> : null;
              })}
            </div>
          ))}
        </details>
      )}
      {!!dna.palette.length && (
        <p className="muted small spaced dna-observed-palette">
          Observed palette · CSS candidates
        </p>
      )}
      <div className="swatches spaced">
        {dna.palette.map((color) => (
          <div className="swatch" key={color}>
            <i style={{ background: color }} />
            {color}
          </div>
        ))}
      </div>
      <div className="tags">
        {dna.fonts.slice(0, 4).map((font) => (
          <span key={font}>{font}</span>
        ))}
      </div>
      <div className="row spaced dna-card-actions">
        {compact ? (
          <Link href="/brand-dna" className="subtle-link">
            Explore Brand DNA <ArrowRight size={15} />
          </Link>
        ) : (
          <>
            <button
              className="secondary-btn"
              onClick={() => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(
                  new Blob([JSON.stringify(dna, null, 2)], {
                    type: 'application/json',
                  }),
                );
                a.download = 'brand-dna.json';
                a.click();
                URL.revokeObjectURL(a.href);
              }}
            >
              <Download size={15} /> Export JSON
            </button>
            <button
              className="secondary-btn"
              onClick={() => {
                setName(dna.name ?? '');
                setTagline(dna.tagline ?? '');
                setEdit(true);
              }}
            >
              Correct brand details
            </button>
          </>
        )}
      </div>
      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent>
          <DialogTitle>Correct brand details</DialogTitle>
          <DialogDescription>
            Your changes create a new version and are labeled as user
            corrections.
          </DialogDescription>
          <form
            className="field"
            onSubmit={(e) => {
              e.preventDefault();
              void w
                .mutate('dna', {
                  id: record.id,
                  correction: { name: name || null, tagline: tagline || null },
                })
                .then(() => setEdit(false))
                .catch(() => {});
            }}
          >
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Tagline
              <input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
              />
            </label>
            <button className="primary-btn" disabled={w.busy}>
              Save new version
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
