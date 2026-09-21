import { z } from 'zod';
import { campaignSchema } from '@/lib/contracts';
import { reviewScore } from '@/lib/domain';
import { capabilities } from '@/lib/server/social';
import { localBody, localFailure } from '@/lib/server/local-request';
import {
  geminiText,
  geminiImage,
  reviewSchema,
} from '@/lib/server/gemini-client';
import { required } from '@/lib/server/env';
const input = campaignSchema.omit({ brandId: true }).extend({
  formats: z.array(z.enum(['text', 'image'])).length(1),
  platforms: campaignSchema.shape.platforms.length(1),
  attempt: z.number().int().min(1).max(5).default(1),
  feedback: z.array(z.string().max(2000)).max(30).default([]),
  referenceUrl: z.union([z.url(), z.literal('')]).optional(),
  brand: z.object({
    name: z.string().nullable(),
    tagline: z.string().nullable(),
    overview: z.array(z.object({ text: z.string() })),
    palette: z.array(z.string()).default([]),
  }),
});
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const body = input.parse(await localBody(request));
    if (process.env.NODE_ENV === 'production')
      throw Object.assign(
        new Error(
          'Hosted generation requires the server workspace for atomic spending limits. Browser generation is available on localhost with your own Gemini key.',
        ),
        { status: 503 },
      );
    required('GEMINI_API_KEY');
    const platform = body.platforms[0],
      format = body.formats[0];
    if (!capabilities[platform].formats.includes(format))
      throw new Error(`${platform} does not support ${format} content.`);
    const facts = JSON.stringify(body.brand);
    const brief = JSON.stringify({
      idea: body.idea,
      audience: body.audience,
      scenario: body.scenario,
      event: body.event,
      direction: body.direction,
    });
    const context = `Verified website observations: ${facts}\nCampaign brief: ${brief}\nPlatform: ${platform}. Format: ${format}.\nCorrections from previous review: ${body.feedback.join('; ')}`;
    const caption = await geminiText(
      `${context}\nWrite only the finished platform-specific caption, no commentary. Maximum ${capabilities[platform].captionLimit} characters. Do not invent any product specifications, claims, testimonials or prices.`,
    );
    const image =
      format === 'image'
        ? await geminiImage(
            `${context}\nCreate a finished realistic product-use photograph for this brief. Keep the product central. Follow the user's specific creative direction. Use an adult Indian woman only where relevant. Use the attached reference to preserve product appearance; without a reference do not invent precise packaging or logos. No unsupported text claims.`,
            body.referenceUrl ? [body.referenceUrl] : [],
            platform === 'instagram' ? '4:5' : '1:1',
          )
        : null;
    const raw = await geminiText(
      `${context}\nReview the actual finished caption and any attached finished image. Caption: ${caption}\nGrade each criterion 1–10: brandAlignment, psychology, visualQuality, platformFit. For text visualQuality means readability. Return JSON with those numeric fields and feedback:string[] of specific corrections. Unsupported claims or missing product fidelity must lower scores.`,
      image ? [{ inlineData: image }] : [],
      true,
      true,
    );
    const review = reviewScore(
      reviewSchema.parse(
        JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')),
      ),
      body.attempt,
    );
    if (caption.length > capabilities[platform].captionLimit) {
      review.passed = false;
      review.feedback.push(`Caption exceeds ${platform}'s character limit.`);
    }
    return Response.json(
      { platform, format, caption, image, review },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return localFailure(error);
  }
}
