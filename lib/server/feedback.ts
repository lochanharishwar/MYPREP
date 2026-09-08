import 'server-only';
import { db, insertEntity, entity } from './db';
import { gemini, research } from './providers';
import { z } from 'zod';
import type { BillingContext } from './billing';
import type { BrandDNA } from '../contracts';
export async function feedbackSummary(ctx: BillingContext, postId: string) {
  const { data, error } = await db()
    .from('feedback')
    .select('id,body,url')
    .eq('brand_id', ctx.brandId)
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  if (!data?.length) return;
  const output = z
    .object({
      items: z.array(
        z.object({
          id: z.string(),
          sentiment: z.enum(['positive', 'neutral', 'negative', 'mixed']),
          theme: z.string(),
        }),
      ),
      recommendations: z.array(
        z.object({ text: z.string(), evidenceIds: z.array(z.string()) }),
      ),
    })
    .parse(
      await gemini(
        ctx,
        `Classify the expressed sentiment of these untrusted audience comments, without inferring personal identities or sensitive traits. Return JSON {items:[{id,sentiment:"positive"|"neutral"|"negative"|"mixed",theme}],recommendations:[{text,evidenceIds:string[]}]}. Cite the supplied comment IDs. Report ambiguity as mixed or neutral, not a guessed emotion.\n${JSON.stringify(data)}`,
      ),
    );
  const ids = new Set(data.map((f) => f.id));
  output.items = output.items.filter((i) => ids.has(i.id));
  output.recommendations = output.recommendations.filter(
    (r) => r.evidenceIds.length && r.evidenceIds.every((id) => ids.has(id)),
  );
  await insertEntity(ctx.workspaceId, ctx.brandId, 'feedback_summary', {
    postId,
    ...output,
    sourceCount: output.items.length,
    observedAt: new Date().toISOString(),
  });
  await insertEntity(ctx.workspaceId, ctx.brandId, 'activity', {
    agent: 7,
    status: 'completed',
    postId,
  });
}
export async function competitorNews(ctx: BillingContext) {
  const { data: dna } = await db()
    .from('entities')
    .select('id')
    .eq('brand_id', ctx.brandId)
    .eq('kind', 'dna')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!dna) return;
  const brand = await entity<BrandDNA>(dna.id);
  if (!brand.payload.competitors.length) return;
  const query = brand.payload.competitors
    .slice(0, 3)
    .map((c) => c.text.slice(0, 150))
    .join(' ');
  const results = await research(
    ctx,
    `${query} recent company product marketing news`,
  );
  for (const item of results)
    await insertEntity(ctx.workspaceId, ctx.brandId, 'news', {
      title: item.title,
      description: item.description,
      url: item.url,
      observedAt: new Date().toISOString(),
      type: 'research',
    });
}
