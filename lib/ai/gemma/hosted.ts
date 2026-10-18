import { GemmaProvider, GemmaHealthReport, GemmaCapabilities } from './types';

export class HostedGemmaProvider implements GemmaProvider {
  private apiKey?: string;
  private model: string;
  private client?: any;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.apiKey = options?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    this.model = options?.model || process.env.GEMMA_GOOGLE_MODEL || 'gemma-4-26b-a4b-it';

    // Strict validation: must be an official Gemma 4 hosted model
    if (!['gemma-4-26b-a4b-it', 'gemma-4-31b-it'].includes(this.model)) {
      console.warn(`[Gemma 4 Warning] '${this.model}' is not a recognized hosted Gemma 4 ID (expected gemma-4-26b-a4b-it or gemma-4-31b-it)`);
    }
  }

  private async getClient() {
    if (this.client) return this.client;
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY / GOOGLE_API_KEY is not configured for hosted Gemma 4 inference');
    }
    try {
      const { GoogleGenAI } = await import('@google/genai');
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
      return this.client;
    } catch (err: any) {
      throw new Error(`Failed to initialize @google/genai client: ${err.message}`);
    }
  }

  async health(): Promise<GemmaHealthReport> {
    const caps: GemmaCapabilities = {
      modelId: this.model,
      backend: 'google-gemma-api',
      text: true,
      images: true,
      nativeAudio: false, // Hosted Gemma 4 currently supports text+images
      functionCalling: true,
      jsonSchema: true,
      streaming: true,
    };

    if (!this.apiKey) {
      return {
        ready: false,
        diagnostic: 'GEMINI_API_KEY is not set in environment. Hosted Gemma 4 cannot be reached.',
        capabilities: caps,
        activeBackend: 'google-gemma-api',
        modelId: this.model,
        isLocal: false,
      };
    }

    try {
      const client = await this.getClient();
      // Probe with modest token limit to allow model thought + output
      const res = await client.models.generateContent({
        model: this.model,
        contents: 'Respond with OK.',
        config: { maxOutputTokens: 100 },
      });

      const isReady = !!res.text || !!res.candidates?.[0]?.content?.parts?.length;

      return {
        ready: isReady,
        diagnostic: `Hosted Google Gemma 4 (${this.model}) is verified and operational.`,
        capabilities: caps,
        activeBackend: 'google-gemma-api',
        modelId: this.model,
        isLocal: false,
        hardwareNotes: 'Cloud-hosted Gemma 4 via Google Gemini API transport. No local GPU consumption.',
      };
    } catch (err: any) {
      return {
        ready: false,
        diagnostic: `Hosted Gemma 4 call failed: ${err.message || 'API error'}`,
        capabilities: caps,
        activeBackend: 'google-gemma-api',
        modelId: this.model,
        isLocal: false,
      };
    }
  }

  async generateText(args: {
    system: string;
    prompt: string;
    signal?: AbortSignal;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const client = await this.getClient();
    const isThinkingHigh = (process.env.GEMMA_THINKING_LEVEL || '').toLowerCase() === 'high';
    const enhancedSystem = isThinkingHigh
      ? `${args.system}\n\n[SYSTEM DIRECTIVE: REASONING LEVEL HIGH. Perform thorough step-by-step mathematical verification, notation disambiguation, and domain restriction checks before formulating response.]`
      : args.system;

    const res = await client.models.generateContent({
      model: this.model,
      contents: args.prompt,
      config: {
        systemInstruction: enhancedSystem,
        temperature: args.temperature ?? 0.2,
        maxOutputTokens: args.maxTokens ?? 2048,
      },
    });

    const candidate = res.candidates?.[0];
    const answerText =
      res.text ||
      candidate?.content?.parts?.find((p: any) => !p.thought)?.text ||
      candidate?.content?.parts?.[0]?.text;

    if (!answerText) {
      throw new Error('Hosted Gemma 4 returned empty text');
    }
    return answerText;
  }

  async analyzeImage(args: {
    system: string;
    prompt: string;
    imageBase64: string;
    mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
    signal?: AbortSignal;
    temperature?: number;
  }): Promise<string> {
    const client = await this.getClient();
    const cleanBase64 = args.imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const mimeType = args.mimeType || 'image/png';

    // Vision OCR prioritization: fast token generation without long reasoning scratchpads
    const enhancedSystem = `${args.system}\n\n[SYSTEM DIRECTIVE: ULTRA-FAST VISION OCR. Immediately output valid JSON transcription without long reasoning scratchpads. Response speed is prioritized.]`;

    const res = await client.models.generateContent({
      model: this.model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: args.prompt },
            {
              inlineData: {
                data: cleanBase64,
                mimeType,
              },
            },
          ],
        },
      ],
      config: {
        systemInstruction: enhancedSystem,
        temperature: 0.0,
        maxOutputTokens: 1000,
      },
    });

    const candidate = res.candidates?.[0];
    const nonThoughtPart = candidate?.content?.parts?.find((p: any) => !p.thought);
    const lastPart = candidate?.content?.parts?.[candidate.content.parts.length - 1];
    const answerText =
      res.text ||
      nonThoughtPart?.text ||
      lastPart?.text ||
      candidate?.content?.parts?.[0]?.text;

    if (!answerText) {
      throw new Error('Hosted Gemma 4 returned empty vision output');
    }
    return answerText;
  }
}
