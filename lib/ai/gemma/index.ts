import { GemmaProvider, GemmaBackend, GemmaHealthReport } from './types';
import { OllamaGemmaProvider } from './ollama';
import { HostedGemmaProvider } from './hosted';
import { SyntheticGemmaProvider } from './mock';

export * from './types';
export * from './prompts';

class GemmaRegistry {
  private activeProvider?: GemmaProvider;
  private currentBackend: GemmaBackend = 'ollama';

  constructor() {
    this.initProvider();
  }

  private initProvider() {
    const defaultBackend = process.env.GEMINI_API_KEY ? 'google-gemma-api' : 'ollama';
    const backendEnv = (process.env.GEMMA_BACKEND || defaultBackend).toLowerCase() as GemmaBackend;
    this.currentBackend = backendEnv;

    if (backendEnv === 'google-gemma-api') {
      this.activeProvider = new HostedGemmaProvider();
    } else if (backendEnv === 'mock') {
      this.activeProvider = new SyntheticGemmaProvider();
    } else {
      this.activeProvider = new OllamaGemmaProvider();
    }
  }

  getProvider(explicitBackend?: GemmaBackend): GemmaProvider {
    if (explicitBackend && explicitBackend !== this.currentBackend) {
      if (explicitBackend === 'google-gemma-api') return new HostedGemmaProvider();
      if (explicitBackend === 'mock') return new SyntheticGemmaProvider();
      return new OllamaGemmaProvider();
    }
    if (!this.activeProvider) {
      this.initProvider();
    }
    return this.activeProvider!;
  }

  async getHealth(explicitBackend?: GemmaBackend): Promise<GemmaHealthReport> {
    const provider = this.getProvider(explicitBackend);
    const health = await provider.health();
    return health;
  }
}

export const gemmaGateway = new GemmaRegistry();
