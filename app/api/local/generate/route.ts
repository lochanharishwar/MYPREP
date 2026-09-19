import { z } from 'zod';
import { providerJSON } from '@/lib/server/providers';
import { env, required } from '@/lib/server/env';

export const dynamic = 'force-dynamic';

const input = z.object({
  idea: z.string().min(8).max(6000),
  formats: z.array(z.enum(['text', 'image', 'video'])).min(1),
  platforms: z
    .array(z.enum(['instagram', 'youtube', 'x', 'linkedin', 'reddit']))
    .min(1),
  audience: z.string().max(1000).default(''),
  scenario: z.string().max(1000).default(''),
  event: z.string().max(500).default(''),
  direction: z.string().max(2000).default(''),
  brand: z.object({
    name: z.string().nullable(),
    tagline: z.string().nullable(),
    overview: z.array(z.object({ text: z.string() })).default([]),
  }),
});

function localOnly() {
  if (process.env.NODE_ENV === 'production')
    throw Object.assign(
      new Error('Local generation is available only in local development.'),
      { status: 403 },
    );
}

async function generateText(
  prompt: string,
  json = false,
  parts: unknown[] = [],
) {
  const response = await providerJSON<{
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  }>(
    `https://generativelanguage.googleapis.com/v1beta/models/${env('GEMINI_TEXT_MODEL', 'gemini-2.5-pro')}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': required('GEMINI_API_KEY'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, ...parts] }],
        generationConfig: {
          ...(json ? { responseMimeType: 'application/json' } : {}),
          maxOutputTokens: 2000,
        },
      }),
    },
  );
  const text = response.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim();
  if (!text) throw new Error('Gemini returned no usable content.');
  return text;
}

export async function POST(request: Request) {
  try {
    localOnly();
    const body = input.parse(await request.json());
    if (body.formats.includes('video'))
      throw Object.assign(
        new Error(
          'Video generation needs the configured Cloud Run media processor. Use text or image in local workspace mode.',
        ),
        { status: 503 },
      );
    const brandFacts = [
      body.brand.name,
      body.brand.tagline,
      ...body.brand.overview.map((x) => x.text),
    ]
      .filter(Boolean)
      .join('\n');
    const prompt = `Create one concise, platform-specific marketing caption for ${body.platforms.join(', ')}. Use only these observed brand facts: ${brandFacts || 'No verified facts available.'}\nCampaign: ${body.idea}\nAudience: ${body.audience}\nScenario: ${body.scenario}\nEvent: ${body.event}\nDirection: ${body.direction}\nDo not invent product claims, prices, results, or testimonials.`;
    const caption = await generateText(prompt);
    let image: { data: string; mimeType: string } | null = null;
    if (body.formats.includes('image')) {
      const generated = await providerJSON<{
        candidates?: {
          content?: {
            parts?: { inlineData?: { data: string; mimeType: string } }[];
          };
        }[];
      }>(
        `https://generativelanguage.googleapis.com/v1beta/models/${env('GEMINI_IMAGE_MODEL', 'gemini-3-pro-image')}:generateContent`,
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': required('GEMINI_API_KEY'),
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `${prompt}\nCreate a realistic product-use scene only when supported by the facts. Keep the product/use case central. Do not add text claims to the image.`,
                  },
                ],
              },
            ],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
          }),
        },
      );
      image =
        generated.candidates?.[0]?.content?.parts?.find(
          (part) => part.inlineData,
        )?.inlineData ?? null;
      if (!image) throw new Error('Gemini returned no image.');
    }
    const review = JSON.parse(
      await generateText(
        `Review this finished ${image ? 'image and ' : ''}caption against the supplied facts. Caption: ${caption}\nFacts: ${brandFacts}\nReturn JSON only: {"brandAlignment":number,"psychology":number,"visualQuality":number,"platformFit":number,"feedback":string[]}. Give 1-10 scores. Do not give a passing score for unsupported claims.`,
        true,
        image
          ? [{ inlineData: { data: image.data, mimeType: image.mimeType } }]
          : [],
      ).then((text) => text.replace(/^```json\s*|\s*```$/g, '')),
    );
    const score =
      review.brandAlignment * 0.35 +
      review.psychology * 0.25 +
      review.visualQuality * 0.2 +
      review.platformFit * 0.2;
    return Response.json({
      caption,
      image,
      review: { ...review, score, passed: score >= 8.7, attempt: 1 },
    });
  } catch (error) {
    const e = error as Error & { status?: number };
    return Response.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
