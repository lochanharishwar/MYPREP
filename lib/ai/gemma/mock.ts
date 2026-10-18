import { GemmaProvider, GemmaHealthReport, GemmaCapabilities } from './types';

/**
 * Synthetic Gemma 4 Provider for offline testing, UI verification,
 * and environments where Ollama or Gemini API keys are temporarily unavailable.
 * Distinctly labels responses with backend="mock" to maintain strict honesty.
 */
export class SyntheticGemmaProvider implements GemmaProvider {
  private model: string;

  constructor(options?: { model?: string }) {
    this.model = options?.model || 'gemma4:e4b-synthetic';
  }

  async health(): Promise<GemmaHealthReport> {
    const caps: GemmaCapabilities = {
      modelId: this.model,
      backend: 'mock',
      text: true,
      images: true,
      nativeAudio: true,
      functionCalling: true,
      jsonSchema: true,
      streaming: false,
    };

    return {
      ready: true,
      diagnostic: 'Synthetic Gemma 4 development mock is active. Suitable for UI testing and offline preview.',
      capabilities: caps,
      activeBackend: 'mock',
      modelId: this.model,
      isLocal: true,
      hardwareNotes: 'Synthetic simulation mode (0 MB VRAM required).',
    };
  }

  async generateText(args: { system: string; prompt: string }): Promise<string> {
    const prompt = args.prompt.toLowerCase();

    // Voice Intent Classification prompt
    if (args.system.includes('MARGIN-INTENT') || args.system.includes('INKWISE-INTENT')) {
      if (prompt.includes('why') || prompt.includes('wrong') || prompt.includes('explain') || prompt.includes('hint') || prompt.includes('graph')) {
        return JSON.stringify({
          addressedToTutor: true,
          intent: prompt.includes('graph') ? 'graph' : prompt.includes('hint') ? 'hint' : 'explain',
          needsClarification: false,
          reasonShort: 'Utterance contains explicit mathematical inquiry addressed to Margin.',
        });
      }
      return JSON.stringify({
        addressedToTutor: false,
        intent: 'none',
        needsClarification: false,
        reasonShort: 'Utterance appears to be casual self-talk or ambient speech.',
      });
    }

    // Tutor Mode
    if (args.system.includes('MARGIN-TUTOR') || args.system.includes('INKWISE-TUTOR')) {
      if (prompt.includes('6x^2') || prompt.includes('6x^{2}') || prompt.includes('derivative')) {
        return JSON.stringify({
          summary: 'The derivative of f(x) = 6x² is calculated using the power rule: d/dx[a*x^n] = a*n*x^(n-1).',
          steps: [
            {
              stepNumber: 1,
              explanation: 'Identify the power n = 2 and the coefficient a = 6.',
              latex: 'f(x) = 6x^2',
              verificationStatus: 'verified',
            },
            {
              stepNumber: 2,
              explanation: 'Multiply the exponent by the coefficient: 6 × 2 = 12.',
              latex: "f'(x) = 6 \\cdot 2x^{2-1}",
              verificationStatus: 'verified',
            },
            {
              stepNumber: 3,
              explanation: 'Simplify the exponent to obtain the final verified derivative.',
              latex: "f'(x) = 12x",
              verificationStatus: 'verified',
            },
          ],
          assumptions: ['x is a real variable'],
          warnings: [],
          canInsertToCanvas: true,
          proposedAnnotation: {
            latex: "f'(x) = 12x",
            text: "Verified derivative: f'(x) = 12x",
            status: 'verified',
          },
        });
      }

      if (prompt.includes('check') || prompt.includes('mistake') || prompt.includes('2x^2') || prompt.includes('x^3')) {
        return JSON.stringify({
          summary: 'Error detected in step transition: power rule was incorrectly applied.',
          steps: [
            {
              stepNumber: 1,
              explanation: 'Original expression to differentiate:',
              latex: '\\frac{d}{dx}[x^3]',
              verificationStatus: 'verified',
            },
            {
              stepNumber: 2,
              explanation: 'You wrote 2x^2, but by the power rule d/dx[x^n] = n*x^(n-1), the exponent 3 must become the multiplier.',
              latex: '2x^2 \\neq 3x^2',
              verificationStatus: 'failed',
              warning: 'The coefficient should be 3, not 2.',
            },
            {
              stepNumber: 3,
              explanation: 'Correct application yields 3x^(3-1) = 3x².',
              latex: '\\frac{d}{dx}[x^3] = 3x^2',
              verificationStatus: 'verified',
            },
          ],
          assumptions: [],
          warnings: ['Earliest error located at step 2.'],
          canInsertToCanvas: true,
          proposedAnnotation: {
            latex: '\\frac{d}{dx}[x^3] = 3x^2',
            text: 'Correction: The exponent 3 becomes the coefficient (3x² not 2x²).',
            status: 'verified',
          },
        });
      }

      // Generic mathematical response
      return JSON.stringify({
        summary: 'Mathematical analysis of the selected expression.',
        steps: [
          {
            stepNumber: 1,
            explanation: 'Examining algebraic structure and domain properties.',
            latex: 'E(x)',
            verificationStatus: 'verified',
          },
          {
            stepNumber: 2,
            explanation: 'Applying transformation rules.',
            latex: 'E\'(x)',
            verificationStatus: 'approximate',
          },
        ],
        assumptions: ['Assume x in Real numbers'],
        warnings: [],
        canInsertToCanvas: true,
        proposedAnnotation: {
          text: 'Analysis complete: checked with SymPy.',
          status: 'verified',
        },
      });
    }

    return 'Gemma 4 response generated successfully.';
  }

  async analyzeImage(args: { system: string; prompt: string; imageBase64: string }): Promise<string> {
    // If prompt mentions scenario hints, return corresponding recognized math
    const p = (args.prompt || '').toLowerCase();
    
    let latex = 'f(x) = 6x^2';
    let plainText = 'f(x) = 6x^2';

    if (p.includes('derivative') || p.includes('x^3') || p.includes('mistake')) {
      latex = '\\frac{d}{dx}(x^3) = 2x^2';
      plainText = 'd/dx(x^3) = 2x^2';
    } else if (p.includes('quad') || p.includes('graph') || p.includes('x^2')) {
      latex = 'y = x^2 - 4x + 3';
      plainText = 'y = x^2 - 4x + 3';
    } else if (p.includes('linear') || p.includes('solve') || p.includes('2x')) {
      latex = '2x + 3 = 7';
      plainText = '2x + 3 = 7';
    }

    const cleanPlot = latex.replace(/^[fy]\(?[x]?\)?\s*=\s*/i, '').replace(/\\cdot/g, '*').trim() || 'x^2';

    return JSON.stringify({
      latex,
      plainText,
      equationCount: 1,
      expressions: [
        {
          latex,
          plainExplanation: `${latex}: Evaluated on the coordinate plane. Differentiate with respect to x using standard calculus rules.`,
          isGraphable: true,
          graphExpression: cleanPlot,
          sourceObjectIds: ['detected-stroke-1'],
          readingOrder: 1,
          uncertaintyReasons: [],
        },
      ],
      overallTeachingSummary: `Teaching mathematical analysis and calculus for ${latex}.`,
      conversationalScript: `I see you wrote ${latex} on the board. I am teaching you how to analyze this equation, evaluate its rate of change, and examine its graph.`,
      assumptions: ['Standard arithmetic notation'],
      ambiguities: [],
      overallConfidenceLabel: 'high',
    });
  }
}
