export type GemmaBackend = 'ollama' | 'google-gemma-api' | 'transformers' | 'mock';

export type GemmaTask = 'recognize' | 'tutor' | 'intent' | 'transcribe';

export interface GemmaCapabilities {
  modelId: string;
  backend: GemmaBackend;
  text: boolean;
  images: boolean;
  nativeAudio: boolean;
  functionCalling: boolean;
  jsonSchema: boolean;
  streaming: boolean;
}

export interface GemmaHealthReport {
  ready: boolean;
  diagnostic: string;
  capabilities: GemmaCapabilities;
  activeBackend: GemmaBackend;
  modelId: string;
  isLocal: boolean;
  hardwareNotes?: string;
}

export interface GemmaProvider {
  health(): Promise<GemmaHealthReport>;
  generateText(args: { 
    system: string; 
    prompt: string; 
    signal?: AbortSignal;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string>;
  analyzeImage(args: { 
    system: string; 
    prompt: string; 
    imageBase64: string; 
    mimeType?: 'image/png' | 'image/jpeg' | 'image/webp'; 
    signal?: AbortSignal;
    temperature?: number;
  }): Promise<string>;
  transcribeAudio?(args: { 
    audioBase64: string; 
    mimeType: string;
    sampleRateHz?: number; 
    signal?: AbortSignal;
  }): Promise<string>;
}
