'use client';
// Evidence and signed private storage URLs must bypass image optimization.
/* oxlint-disable next/no-img-element */
// The installed Recharts 3 release supports Cell for per-series colors.
/* oxlint-disable typescript/no-deprecated */
import { useState } from 'react';
import { BrandGovernance } from './brand-governance';
import { PageInsights } from './page-insights';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { useWorkspace } from './workspace-provider';
import { SectionHeading } from './section-heading';
import type { BrandDNA } from '@/lib/contracts';
import { BrandFinding, DNACard } from './workspace-shared';

export function BrandView() {
  const w = useWorkspace(),
    dna = w.records<BrandDNA>('dna')[0]?.payload;
  const [colorsOpen, setColorsOpen] = useState(false);
  const [colorLimit, setColorLimit] = useState(100);
  return (
    <div className="stack">
      <DNACard />
      {!w.localMode && w.records<BrandDNA>('dna')[0] && (
        <BrandGovernance
          key={w.records<BrandDNA>('dna')[0].id}
          record={w.records<BrandDNA>('dna')[0]}
        />
      )}
      {dna && (
        <>
          <section className="panel" id="brand-strategy">
            <div className="section-title">
              <SectionHeading character="strategy">
                Brand strategy &amp; opportunities
              </SectionHeading>
              <span className="pill">
                {dna.analysis ? 'Website evidence analysis' : 'Saved findings'}
              </span>
            </div>
            {dna.analysis?.limitations.map((line, i) => (
              <p className="muted small spaced" key={i}>
                {line}
              </p>
            ))}
            <div className="tabs-row spaced">
              <a className="text-link" href="#brand-strengths">
                Advantages
              </a>
              <a className="text-link" href="#brand-weaknesses">
                Weaknesses
              </a>
              <a className="text-link" href="#brand-marketGaps">
                Gaps to investigate
              </a>
              <a className="text-link" href="#brand-opportunities">
                Experiments
              </a>
              <a className="text-link" href="#brand-platforms">
                Channels
              </a>
            </div>
            <button
              className="secondary-btn spaced"
              disabled={w.busy}
              onClick={() =>
                void w.mutate('scan', { brandId: w.brandId }).catch(() => {})
              }
            >
              {w.busy ? 'Reading website…' : 'Refresh website & analysis'}
            </button>
          </section>
          <div className="two-col brand-strategy-grid">
            {(
              [
                'strengths',
                'weaknesses',
                'marketGaps',
                'opportunities',
                'values',
                'voice',
                'aesthetics',
                'competitors',
              ] as const
            ).map((key) => (
              <section className="panel" key={key} id={`brand-${key}`}>
                <SectionHeading character={key} featured>
                  {
                    {
                      values: 'Brand values',
                      aesthetics: 'Brand aesthetic',
                      voice: 'Tone of voice',
                      strengths: 'Strengths & advantages',
                      weaknesses: 'Weaknesses',
                      marketGaps: 'Gaps to investigate',
                      opportunities: 'Opportunities & experiments',
                      competitors: 'Competitor landscape',
                    }[key]
                  }
                </SectionHeading>
                {dna[key]?.length ? (
                  dna[key].map((f, j) => (
                    <BrandFinding finding={f} dna={dna} key={j} />
                  ))
                ) : (
                  <p className="muted small">
                    {dna.analysis?.missing[key] ??
                      'This saved profile has no analysis for this section. Refresh the website analysis to collect evidence and build supported findings.'}
                  </p>
                )}
              </section>
            ))}
          </div>
          <section className="panel">
            <SectionHeading character="colors">
              Observed color inventory
            </SectionHeading>
            <p className="muted small spaced">
              {dna.colors.length} declarations from the retrieved styles. CSS
              declarations can include unused components and themes; they are
              not a screenshot or a verified primary palette.
            </p>
            {!dna.colors.length && (
              <p className="notice spaced">
                No readable color declarations were retrieved. Scan a page with
                accessible styles or consult your official brand guidelines.
              </p>
            )}
            {!!dna.colors.length && (
              <button
                className="secondary-btn spaced"
                aria-expanded={colorsOpen}
                onClick={() => setColorsOpen((v) => !v)}
              >
                {colorsOpen
                  ? 'Hide color inventory'
                  : `Inspect ${dna.colors.length} color declarations`}
              </button>
            )}
            {colorsOpen && (
              <div
                className="table-scroll spaced"
                style={{ maxHeight: 420, overflow: 'auto' }}
                aria-label="Observed color inventory"
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Color</TableHead>
                      <TableHead>Selector</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Page</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dna.colors.slice(0, colorLimit).map((c, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <span
                            className="color-dot"
                            style={{ background: c.value }}
                          />
                          {c.value}
                        </TableCell>
                        <TableCell>{c.selector}</TableCell>
                        <TableCell>{c.method}</TableCell>
                        <TableCell>
                          <a
                            className="source"
                            href={c.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {c.url}
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {colorsOpen && colorLimit < dna.colors.length && (
              <button
                className="text-link spaced"
                onClick={() => setColorLimit((n) => n + 100)}
              >
                Show 100 more declarations (
                {Math.min(colorLimit, dna.colors.length)} of {dna.colors.length}
                )
              </button>
            )}
          </section>
          <section className="panel" id="brand-platforms">
            <SectionHeading character="platforms">
              Platform recommendations
            </SectionHeading>
            <p className="muted small spaced">
              Suggested tests based on the offer and language found on your
              pages. Account analytics are needed to determine which channels
              work best.
            </p>
            {!Object.keys(dna.recommendations).length && (
              <p className="notice spaced">
                Refresh the analysis to build channel experiments from readable
                product or service copy.
              </p>
            )}
            <div className="two-col spaced">
              {Object.entries(dna.recommendations).map(([p, findings]) => (
                <article className="data-card" key={p}>
                  <h3 className="capitalize">{p}</h3>
                  {findings.map((f, i) => (
                    <BrandFinding key={i} finding={f} dna={dna} />
                  ))}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      <PageInsights />
    </div>
  );
}
