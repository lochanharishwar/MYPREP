import 'server-only';
import { z } from 'zod';
import { db, entity, updateEntity, rpc } from './db';
import { gemini, processor } from './providers';
import { reserve } from './billing';
import { checkBrandCopy, AI_VERSIONS } from '../brand-policy';
import { reviewScore, contentHash } from '../domain';
import { validatePlatformContent } from '../media-spec';
import { env } from './env';
import type { BrandDNA, ContentVersion } from '../contracts';
export async function prepareDraft(id: string) {
  const draft = await entity<ContentVersion>(id, undefined, 'content');
  if (!draft.payload.assetPath) return null;
  const { data: existing, error } = await db()
    .from('media_jobs')
    .select('status,result')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (existing?.status === 'completed')
    return existing.result as Pick<
      ContentVersion,
      'assetPath' | 'mimeType' | 'media' | 'reviewFile'
    >;
  const ctx = {
    workspaceId: draft.workspace_id,
    brandId: draft.brand_id!,
    campaignId: draft.payload.campaignId,
  };
  if (!existing) {
    await reserve(ctx, 'PROCESSOR');
    await rpc('enqueue_media', {
      p_id: id,
      p_workspace: ctx.workspaceId,
      p_brand: ctx.brandId,
      p_input: {
        assetPath: draft.payload.assetPath,
        format: draft.payload.format,
        platform: draft.payload.platform,
      },
    });
  }
  const result = await processor<{
    status: string;
    result?: Pick<
      ContentVersion,
      'assetPath' | 'mimeType' | 'media' | 'reviewFile'
    >;
  }>('execute-job', { jobId: id });
  if (result.status !== 'completed' || !result.result)
    throw new Error(
      'Media preparation remains pending; retry after the current worker lease completes.',
    );
  return result.result;
}
export async function reviewDraft(
  id: string,
  media: Awaited<ReturnType<typeof prepareDraft>>,
) {
  const draft = await entity<ContentVersion>(id, undefined, 'content');
  if (draft.payload.status !== 'reviewing')
    return { status: draft.payload.status };
  const dna = await entity<BrandDNA>(
    draft.payload.dnaId,
    draft.workspace_id,
    'dna',
  );
  const next = { ...draft.payload, ...media };
  checkBrandCopy(next.caption, dna.payload.governance);
  validatePlatformContent(next);
  if (next.format !== 'text' && !next.reviewFile)
    throw new Error('Finished media is required for review.');
  const ctx = {
    workspaceId: draft.workspace_id,
    brandId: draft.brand_id!,
    campaignId: next.campaignId,
  };
  const raw = z
    .object({
      brandAlignment: z.number().min(1).max(10),
      psychology: z.number().min(1).max(10),
      visualQuality: z.number().min(1).max(10),
      platformFit: z.number().min(1).max(10),
      feedback: z.array(z.string()),
      transcript: z.string().default(''),
    })
    .parse(
      await gemini(
        ctx,
        `Review this exact finished ${next.format} and edited caption for ${next.platform}. Score 1-10 brandAlignment, psychology, visualQuality, platformFit. For text visualQuality is readability. Reject unsupported claims and incorrect product/logo depictions. Check claims against approvedClaims and their evidence. For video inspect frames and actual audio; return the spoken transcript. Return JSON {brandAlignment,psychology,visualQuality,platformFit,feedback:string[],transcript}. Untrusted reference data: ${JSON.stringify({ brand: dna.payload, caption: next.caption })}`,
        next.reviewFile
          ? [
              {
                fileData: {
                  fileUri: next.reviewFile.uri,
                  mimeType: next.mimeType,
                },
              },
            ]
          : [],
        true,
        'review',
      ),
    );
  const review = { ...reviewScore(raw, 1), transcript: raw.transcript };
  next.review = review;
  next.status = review.passed ? 'qualified' : 'needs_revision';
  next.contentHash = await contentHash(next);
  next.provenance = {
    ...AI_VERSIONS,
    generationModel: 'human-caption-edit',
    reviewModel: env(
      'GEMINI_REVIEW_MODEL',
      env('GEMINI_TEXT_MODEL', 'gemini-3.1-pro-preview'),
    ),
    dnaVersion: dna.payload.version,
  };
  await updateEntity(id, next);
  return { status: next.status };
}
