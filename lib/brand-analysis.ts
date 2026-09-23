import type { BrandDNA, Evidence, Finding } from './contracts';

export type AnalysisPage = {
  observedAt?: string;
  url: string;
  title: string;
  description: string;
  headings: string[];
  copy: { text: string; selector: string; heading?: string }[];
  links: { url: string; text: string }[];
  method: Evidence['method'];
  truncated: boolean;
};

// A reproducible, source-bound analysis for the keyless website scan. These are
// observations and testable recommendations, not simulated AI or market research.
export function analyzeWebsiteDNA<T extends Omit<BrandDNA, 'brandId'>>(
  source: T,
  pages: AnalysisPage[],
): T {
  const dna = { ...source, evidence: [...source.evidence] };
  const findings = {
    values: [] as Finding[],
    aesthetics: [] as Finding[],
    voice: [] as Finding[],
    strengths: [] as Finding[],
    weaknesses: [] as Finding[],
    opportunities: [] as Finding[],
    marketGaps: [] as Finding[],
    competitors: [] as Finding[],
    recommendations: {} as Record<string, Finding[]>,
  };
  const cite = (page: AnalysisPage, excerpt: string, selector: string) => {
    const existing = dna.evidence.find(
      (e) =>
        e.url === page.url && e.excerpt === excerpt && e.selector === selector,
    );
    if (existing) return existing.id;
    const id = crypto.randomUUID();
    dna.evidence.push({
      id,
      url: page.url,
      excerpt,
      selector,
      observedAt: page.observedAt ?? source.createdAt,
      method: page.method,
      confidence: page.method === 'research' ? 0.8 : 1,
    });
    return id;
  };
  const copy = pages.flatMap((page) =>
    [
      ...(page.description.length >= 40
        ? [{ text: page.description, selector: 'description metadata' }]
        : []),
      ...page.copy,
    ].map((block) => ({ ...block, page })),
  );
  const unique = copy.filter(
    (b, i) =>
      copy.findIndex((c) => c.text === b.text) === i &&
      !/^(?:contact us|email(?: id)?\s*:|copyright|all rights reserved|accept (?:all )?cookies|sign (?:in|up)|log in)\b/i.test(
        b.text,
      ),
  );
  const quoted = (value: string) =>
    `“${value.slice(0, 320)}${value.length > 320 ? '…' : ''}”`;
  const from = (
    block: (typeof copy)[number],
    finding: Omit<Finding, 'evidenceIds'>,
  ): Finding => ({
    ...finding,
    evidenceIds: [cite(block.page, block.text, block.selector)],
  });
  const positioning = unique[0];
  if (positioning) {
    findings.strengths.push(
      from(positioning, {
        title: 'A concrete starting point for your message',
        type: 'interpretation',
        text: `The website describes its offer as ${quoted(positioning.text)}. This is a source-backed message to build a campaign around; the claim itself has not been independently verified.`,
        recommendation:
          'Use one specific benefit from this copy in a campaign, with a demonstration or supporting proof on the destination page.',
      }),
    );
    findings.opportunities.push(
      from(positioning, {
        title: 'Turn the stated offer into a proof-led campaign',
        type: 'interpretation',
        text: `Start with the offer described on ${new URL(positioning.page.url).pathname || '/'}: ${quoted(positioning.text)}`,
        hypothesis:
          'Showing how the offer works may answer questions that a general brand message leaves open.',
        recommendation:
          'Compare a concrete demonstration with your current general message, using the same audience and destination. Measure qualified clicks and verified conversions before scaling.',
      }),
    );
  }

  // Values require a stated commitment or a values/mission context, not a padded
  // list of attractive adjectives inferred from a company category.
  const values = unique.filter(
    (b) =>
      /\b(our (?:values|mission|purpose|principles)|we (?:believe|value|are committed)|committed to|our commitment)\b/i.test(
        b.text,
      ) ||
      /\b(values|mission|purpose|principles|commitment)\b/i.test(
        b.heading ?? '',
      ),
  );
  findings.values = values.slice(0, 4).map((b) =>
    from(b, {
      title: b.heading || 'Stated brand commitment',
      type: 'fact',
      text: `Website statement: ${quoted(b.text)}`,
    }),
  );
  const proof = unique.find((b) =>
    /\b(certified|certification|warranty|guarantee|since \d{4}|founded|case study|farmer-owned|cooperative|independently tested)\b/i.test(
      b.text,
    ),
  );
  if (proof && proof !== positioning)
    findings.strengths.push(
      from(proof, {
        title: 'A credibility claim to substantiate',
        type: 'interpretation',
        text: `The website supplies a potential proof point: ${quoted(proof.text)}. This is the brand's own statement, not independent verification.`,
        recommendation:
          'Link the original certification, policy, history, or customer case when using this claim in marketing.',
      }),
    );

  const secondPerson = unique.find((b) => /\b(you|your|yours)\b/i.test(b.text));
  const firstPerson = unique.find((b) => /\b(we|our)\b/i.test(b.text));
  if (secondPerson)
    findings.voice.push(
      from(secondPerson, {
        title: 'Direct reader address',
        type: 'interpretation',
        text: `The sampled copy addresses the reader directly: ${quoted(secondPerson.text)}. Use similarly direct language when adapting this passage.`,
      }),
    );
  if (firstPerson)
    findings.voice.push(
      from(firstPerson, {
        title: 'A first-person brand voice',
        type: 'interpretation',
        text: `The brand speaks as “we” or “our” in ${quoted(firstPerson.text)}. This supports a first-person voice for company stories; it does not establish the tone of every channel.`,
      }),
    );
  if (!findings.voice.length && positioning)
    findings.voice.push(
      from(positioning, {
        title: 'Descriptive messaging',
        type: 'interpretation',
        text: `The sampled introduction presents the offer without directly addressing the reader: ${quoted(positioning.text)}. Preserve its concrete terminology; wider tone and personality need more examples.`,
      }),
    );

  const style =
    source.colors.find((c) => source.palette.includes(c.value)) ??
    source.colors[0];
  if (style) {
    const page = { ...pages[0], url: style.url, method: 'dom' as const };
    if (pages.length)
      findings.aesthetics.push({
        title: source.palette.length
          ? 'Declared brand color candidates'
          : 'An observed color system',
        type: 'interpretation',
        text: source.palette.length
          ? `The sampled styles declare ${source.palette.join(', ')} as brand or primary color candidates. Validate the selected theme before using them in creative work.`
          : `${new Set(source.colors.map((c) => c.value)).size} distinct color values were observed in the sampled stylesheets. A complete stylesheet can include unused components and themes, so these are not automatically the brand palette.`,
        evidenceIds: [
          cite(
            page,
            `${style.selector}: ${style.value}. ${style.method}`,
            style.selector,
          ),
        ],
        recommendation:
          'Compare the observed declarations with the visible homepage and official brand guidelines before selecting campaign colors.',
      });
  }

  for (const page of pages.filter((p) => p.method === 'dom' && !p.truncated)) {
    const missing = [
      !page.title && 'a page title',
      !page.description && 'description metadata',
    ].filter(Boolean);
    if (missing.length && findings.weaknesses.length < 3)
      findings.weaknesses.push({
        title: 'A search presentation gap',
        type: 'interpretation',
        text: `The returned HTML for ${new URL(page.url).pathname || '/'} did not include ${missing.join(' or ')}. Check the rendered page before changing it; JavaScript may supply additional metadata.`,
        evidenceIds: [
          cite(
            page,
            `Inspected returned HTML. Title: ${page.title || '(absent)'}. Description: ${page.description || '(absent)'}.`,
            'head',
          ),
        ],
        recommendation:
          'Add a page-specific title and description where missing, then confirm the public HTML exposes them.',
      });
  }
  const descriptions = pages.filter((p) => p.description.length > 40);
  const duplicate = descriptions.find((p, i) =>
    descriptions.some(
      (q, j) => i !== j && q.url !== p.url && q.description === p.description,
    ),
  );
  if (duplicate)
    findings.weaknesses.push({
      title: 'Repeated page descriptions',
      type: 'interpretation',
      text: 'Multiple sampled pages use the same description. Their search previews may not communicate the purpose of each page.',
      evidenceIds: descriptions
        .filter((p) => p.description === duplicate.description)
        .map((p) => cite(p, p.description, 'description metadata')),
      recommendation:
        'Give each distinct product or service page a description specific to that offer.',
    });
  const evaluation = unique.find((b) =>
    /\b(versus|alternative to|compared (?:to|with)|vs\.)\s+\S/i.test(b.text),
  );
  if (evaluation) {
    findings.competitors.push(
      from(evaluation, {
        title: 'Comparison language found on the brand website',
        type: 'fact',
        text: `The brand states ${quoted(evaluation.text)}. This is a first-party comparison, not an independent ranking or a verified competitor list.`,
        recommendation:
          'Check the named alternatives against their own current product and pricing pages before using comparative claims.',
      }),
    );
  } else if (positioning) {
    findings.marketGaps.push(
      from(positioning, {
        title: 'Test a clearer reason to choose this offer',
        type: 'interpretation',
        text: `The sampled offer is ${quoted(positioning.text)}. The retrieved copy does not establish how customers compare this offer with alternatives. This is a research gap, not proof of unmet market demand.`,
        hypothesis:
          'Prospects comparing options may need a more specific explanation of who this offer serves and what trade-offs it makes.',
        recommendation:
          'Ask recent prospects which alternatives they considered and why. Test a page for one confirmed use case; publish comparisons only after checking both products.',
      }),
    );
  }
  const questions = unique.find((b) =>
    /\?|\b(faq|frequently asked|how (?:to|does|do)|getting started)\b/i.test(
      b.text,
    ),
  );
  if (!questions && positioning) {
    findings.weaknesses.push(
      from(positioning, {
        title: 'Buyer questions are not established by this sample',
        type: 'interpretation',
        text: 'The retrieved explanatory copy does not identify common buyer questions or answers. This is a limitation of the sampled pages, not a claim that the whole site has no FAQ.',
        recommendation:
          'Review sales and support questions, then make the most important buying objection easy to answer beside the offer.',
      }),
    );
    findings.opportunities.push(
      from(positioning, {
        title: 'Answer one real customer objection',
        type: 'interpretation',
        text: `Use the stated offer ${quoted(positioning.text)} as the starting point for customer-question research.`,
        hypothesis:
          'An answer based on an actual sales or support question may attract more qualified interest than another general promotion.',
        recommendation:
          'Choose a recurring question from real customer conversations. Publish a concise answer with a relevant product demonstration and track qualified visits.',
      }),
    );
  }
  if (positioning && !findings.marketGaps.length)
    findings.marketGaps.push(
      from(positioning, {
        title: 'Validate which audience is underserved',
        type: 'interpretation',
        text: `The website's positioning (${quoted(positioning.text)}) identifies an offer, but website copy alone does not measure unmet demand.`,
        hypothesis:
          'One specific use case may respond differently from the broad audience addressed by the site.',
        recommendation:
          'Segment real enquiries by use case, compare recurring objections, and test a dedicated message for a segment supported by those records.',
      }),
    );
  if (positioning) {
    const business = unique.find((b) =>
      /\b(business(?:es)?|teams?|enterprise|workflow|B2B|organizations?)\b/i.test(
        b.text,
      ),
    );
    const products = unique.find((b) =>
      /\b(products?|shop|wear|food|milk|shoe|skin|furniture|buy)\b/i.test(
        b.text,
      ),
    );
    const demos = unique.find((b) =>
      /\b(how|build|create|use|workflow|tool|learn|software)\b/i.test(b.text),
    );
    const recommend = (
      platform: string,
      block: typeof positioning,
      text: string,
    ) => {
      findings.recommendations[platform] = [
        from(block, {
          title: 'An experiment to test',
          type: 'interpretation',
          text,
          hypothesis:
            'This format may help communicate the cited offer; audience fit and results are unverified.',
          recommendation:
            'Run a small controlled test after connecting the account. Compare qualified engagement and destination conversions; do not assume reach or sales.',
        }),
      ];
    };
    if (business)
      recommend(
        'linkedin',
        business,
        `Test an explanation of one work-related use case from ${quoted(business.text)}, with a concrete example and a link to its source page.`,
      );
    if (products)
      recommend(
        'instagram',
        products,
        `Test a product-use image or short demonstration grounded in ${quoted(products.text)}. Use actual product references and substantiated claims.`,
      );
    if (demos)
      recommend(
        'youtube',
        demos,
        `Test a focused walkthrough based on ${quoted(demos.text)}. Explain one task and show the actual result.`,
      );
    recommend(
      'x',
      positioning,
      `Test a short explanation of one verifiable point from ${quoted(positioning.text)}, linking to the original page.`,
    );
    recommend(
      'reddit',
      positioning,
      'First research community rules and real questions relevant to the cited offer. Test a useful, disclosed answer only where participation and promotion are permitted.',
    );
  }
  const missing: Record<string, string> = {
    values:
      'No explicit values or mission statement was identified in the retrieved copy. Scan a public mission/about page or add a sourced correction; values will not be invented.',
    aesthetics:
      'No usable style evidence was retrieved. Rendered styles or official brand guidelines are needed to characterize the visual identity.',
    voice:
      'More readable brand copy is needed to characterize its language. Try a public about or product page.',
    strengths:
      'The retrieved material does not establish a specific advantage. Add product or service evidence to identify a defensible message.',
    weaknesses:
      'No specific issue was established by these checks. This is a limited review of retrieved pages, not a clean bill of health for the business.',
    opportunities:
      'A readable offer and evidence of customer needs are needed for a relevant experiment.',
    marketGaps:
      'Market demand is not established by website copy. Customer interviews and cited competitor research are needed to validate a gap.',
    competitors:
      'No explicit competitor comparison was found in the sampled copy. Competitor names, prices, and rankings need independent sources; unrelated outbound links are not competitors.',
  };
  return {
    ...dna,
    ...findings,
    analysis: {
      version: 1,
      method: 'website-evidence',
      missing,
      limitations: [
        'Analysis uses the pages actually retrieved. Website statements are first-party claims; recommendations are hypotheses to test.',
        'This scan does not measure market demand, competitor performance, customer behaviour, or business results.',
      ],
    },
  };
}
