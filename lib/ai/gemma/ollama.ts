import { GemmaProvider, GemmaHealthReport, GemmaCapabilities } from './types';

export class OllamaGemmaProvider implements GemmaProvider {
  private baseUrl: string;
  private model: string;
  private timeoutMs: number;

  constructor(options?: { baseUrl?: string; model?: string; timeoutMs?: number }) {
    this.baseUrl = options?.baseUrl || process.env.GEMMA_OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
    this.model = options?.model || process.env.GEMMA_OLLAMA_MODEL || 'gemma4:e4b';
    this.timeoutMs = options?.timeoutMs || parseInt(process.env.GEMMA_REQUEST_TIMEOUT_MS || '120000', 10);

    // Validate approved Gemma 4 model tag
    if (!/^gemma4:(e2b|e4b|12b|26b|31b)$/.test(this.model)) {
      console.warn(`[Gemma 4 Warning] Configured model '${this.model}' differs from standard Gemma 4 tags (gemma4:e2b/e4b/12b/26b/31b)`);
    }
  }

  async health(): Promise<GemmaHealthReport> {
    const caps: GemmaCapabilities = {
      modelId: this.model,
      backend: 'ollama',
      text: true,
      images: true,
      nativeAudio: ['gemma4:e2b', 'gemma4:e4b', 'gemma4:12b'].includes(this.model),
      functionCalling: true,
      jsonSchema: true,
      streaming: true,
    };

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(id);

      if (!res.ok) {
        return {
          ready: false,
          diagnostic: `Ollama returned HTTP ${res.status}. Ensure Ollama daemon is running at ${this.baseUrl}`,
          capabilities: caps,
          activeBackend: 'ollama',
          modelId: this.model,
          isLocal: true,
        };
      }

      const data = await res.json() as { models?: Array<{ name: string }> };
      const installedModels = (data.models || []).map(m => m.name);
      const modelInstalled = installedModels.some(name => name.startsWith(this.model) || name.includes(this.model));

      return {
        ready: modelInstalled,
        diagnostic: modelInstalled 
          ? `Gemma 4 model '${this.model}' is installed and ready on localhost Ollama.`
          : `Ollama is running, but model '${this.model}' is not pulled. Run: 'ollama pull ${this.model}'`,
        capabilities: caps,
        activeBackend: 'ollama',
        modelId: this.model,
        isLocal: true,
        hardwareNotes: `Local inference via Ollama (${this.model}). Recommended Q4 RAM: ~4.5GB for E4B, ~2.9GB for E2B.`,
      };
    } catch (err: any) {
      return {
        ready: false,
        diagnostic: `Could not connect to Ollama at ${this.baseUrl}. Error: ${err.message || 'Connection refused'}`,
        capabilities: caps,
        activeBackend: 'ollama',
        modelId: this.model,
        isLocal: true,
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const signal = args.signal || controller.signal;

    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          options: {
            temperature: args.temperature ?? 0.2,
            num_predict: args.maxTokens ?? 1200,
          },
          messages: [
            { role: 'system', content: args.system },
            { role: 'user', content: args.prompt },
          ],
        }),
        signal,
      });

      if (!res.ok) {
        throw new Error(`Ollama request failed with status HTTP ${res.status}`);
      }

      const json = await res.json() as { message?: { content?: string } };
      if (!json?.message?.content) {
        throw new Error('Ollama returned empty response content');
      }

      return json.message.content;
    } finally {
      clearTimeout(timeout);
    }
  }

  async analyzeImage(args: {
    system: string;
    prompt: string;
    imageBase64: string;
    mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
    signal?: AbortSignal;
    temperature?: number;
  }): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const signal = args.signal || controller.signal;

    // Strip data:image/...;base64, prefix if present
    const cleanBase64 = args.imageBase64.replace(/^data:image\/\w+;base64,/, '');

    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          options: {
            temperature: args.temperature ?? 0.1,
          },
          messages: [
            { role: 'system', content: args.system },
            {
              role: 'user',
              content: args.prompt,
              images: [cleanBase64],
            },
          ],
        }),
        signal,
      });

      if (!res.ok) {
        throw new Error(`Ollama vision request failed with status HTTP ${res.status}`);
      }

      const json = await res.json() as { message?: { content?: string } };
      if (!json?.message?.content) {
        throw new Error('Ollama vision returned empty response content');
      }

      return json.message.content;
    } finally {
      clearTimeout(timeout);
    }
  }
}
