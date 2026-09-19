import { describe, it, expect } from 'vitest';
import { POST as scanPost } from '@/app/api/local/scan/route';
import { POST as generatePost } from '@/app/api/local/generate/route';

describe('Local Scraper and Image Generation (Offline & Disconnected)', () => {
  it('handles offline website scan gracefully without crashing', async () => {
    const request = new Request('http://localhost/api/local/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://offline-brand-test-xyz.com' }),
    });

    const response = await scanPost(request);
    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      scan: { status: string; discovered: number; completed: string[] };
      dna: {
        name: string;
        tagline: string;
        palette: string[];
        overview: unknown[];
        values: unknown[];
      };
    };

    expect(data.scan.status).toBe('complete');
    expect(data.dna.name).toBe('Offline Brand Test Xyz');
    expect(data.dna.tagline).toBeDefined();
    expect(data.dna.palette.length).toBeGreaterThanOrEqual(3);
    expect(data.dna.overview.length).toBeGreaterThanOrEqual(1);
    expect(data.dna.values.length).toBeGreaterThanOrEqual(1);
  });

  it('generates campaign copy, image, and passes review when disconnected', async () => {
    const request = new Request('http://localhost/api/local/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        idea: 'Launch our new zero-emission urban commuter bicycle',
        formats: ['image', 'text'],
        platforms: ['instagram'],
        audience: 'Urban commuters and environmental advocates',
        scenario: 'Daily commute through city traffic',
        event: 'Earth Day Launch',
        direction: 'Inspiring, clean, and forward-looking',
        brand: {
          name: 'VeloCity',
          tagline: 'VeloCity — Effortless urban mobility',
          overview: [
            { text: 'VeloCity designs lightweight electric commuter bikes.' },
          ],
          palette: ['#0F172A', '#10B981', '#34D399', '#6EE7B7', '#FAFAFA'],
        },
      }),
    });

    const response = await generatePost(request);
    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      caption: string;
      image: { data: string; mimeType: string };
      review: { score: number; passed: boolean; feedback: string[] };
    };

    expect(data.caption).toBeDefined();
    expect(data.caption.length).toBeGreaterThan(20);
    expect(data.image).toBeDefined();
    expect(data.image.mimeType).toBe('image/svg+xml');
    expect(data.image.data.length).toBeGreaterThan(50);
    expect(data.review.passed).toBe(true);
    expect(data.review.score).toBeGreaterThanOrEqual(8.7);
    expect(data.review.feedback.length).toBeGreaterThan(0);
  });
});
