import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  geminiImage,
  geminiText,
  SYSTEM_PROMPT,
} from '../lib/server/gemini-client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function fixtureEnv() {
  vi.stubEnv('GEMINI_API_KEY', 'fixture-test-key');
  vi.stubEnv('GEMINI_TEXT_MODEL', 'gemini-2.5-pro');
  vi.stubEnv('GEMINI_REVIEW_MODEL', 'gemini-2.5-pro');
  vi.stubEnv('GEMINI_IMAGE_MODEL', 'gemini-3-pro-image');
}

const answer = (parts: unknown[]) =>
  Response.json({ candidates: [{ content: { parts } }] });

describe('local Gemini spending bounds (mocked provider transport)', () => {
  it('preflights the exact system, text, and media request before paid text review', async () => {
    fixtureEnv();
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith(':countTokens')
        ? Response.json({ totalTokens: 60_000 })
        : answer([{ text: '{"brandAlignment":9}' }]),
    );
    vi.stubGlobal('fetch', fetcher);
    const image = { inlineData: { mimeType: 'image/png', data: 'ZmFrZQ==' } };
    await geminiText('Review this finished image.', [image], true, true, true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const countRequest = JSON.parse(
      (fetcher.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    );
    const generationRequest = JSON.parse(
      (fetcher.mock.calls[1] as unknown as [string, { body: string }])[1].body,
    );
    expect(countRequest.generateContentRequest).toEqual({
      model: 'models/gemini-2.5-pro',
      ...generationRequest,
    });
    expect(generationRequest.systemInstruction.parts).toEqual([
      { text: SYSTEM_PROMPT },
    ]);
    expect(generationRequest.contents[0].parts).toEqual([
      { text: 'Review this finished image.' },
      image,
    ]);
    expect(generationRequest.generationConfig).toMatchObject({
      maxOutputTokens: 8000,
      candidateCount: 1,
      responseMimeType: 'application/json',
    });
  });

  it('fixes local image size, output tokens, and candidate count', async () => {
    fixtureEnv();
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith(':countTokens')
        ? Response.json({ totalTokens: 350 })
        : answer([{ inlineData: { mimeType: 'image/png', data: 'ZmFrZQ==' } }]),
    );
    vi.stubGlobal('fetch', fetcher);
    await geminiImage('A product photograph.', [], '4:5', true);
    const countRequest = JSON.parse(
      (fetcher.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    );
    const generationRequest = JSON.parse(
      (fetcher.mock.calls[1] as unknown as [string, { body: string }])[1].body,
    );
    expect(countRequest.generateContentRequest).toEqual({
      model: 'models/gemini-3-pro-image',
      ...generationRequest,
    });
    expect(generationRequest.generationConfig).toEqual({
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: '4:5', imageSize: '1K' },
      candidateCount: 1,
      maxOutputTokens: 8192,
    });
  });

  it.each([60_001, -1, 0, 2.5, '250', null, undefined])(
    'never dispatches generation with an unsafe token count: %s',
    async (totalTokens) => {
      fixtureEnv();
      const fetcher = vi.fn().mockResolvedValue(Response.json({ totalTokens }));
      vi.stubGlobal('fetch', fetcher);
      await expect(
        geminiText('A caption.', [], false, false, true),
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][0]).toContain(':countTokens');
    },
  );

  it('does not dispatch generation when the token check fails or returns malformed data', async () => {
    fixtureEnv();
    for (const response of [
      new Response('invalid', { status: 500 }),
      new Response('{bad'),
    ]) {
      const fetcher = vi.fn().mockResolvedValue(response);
      vi.stubGlobal('fetch', fetcher);
      await expect(
        geminiImage('A product.', [], '1:1', true),
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      geminiText('A caption.', [], false, false, true),
    ).rejects.toThrow('No generation was dispatched');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing server path unchanged when local bounds are not requested', async () => {
    fixtureEnv();
    const fetcher = vi.fn(async () =>
      answer([
        {
          text: 'A caption.',
          inlineData: { mimeType: 'image/png', data: 'ZmFrZQ==' },
        },
      ]),
    );
    vi.stubGlobal('fetch', fetcher);
    await geminiText('A caption.');
    await geminiImage('A product.');
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const call of fetcher.mock.calls as unknown as [string, RequestInit][])
      expect(call[0]).toContain(':generateContent');
    const imageRequest = JSON.parse(
      (fetcher.mock.calls[1] as unknown as [string, { body: string }])[1].body,
    );
    expect(imageRequest.generationConfig).toEqual({
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: '1:1' },
    });
  });
});
