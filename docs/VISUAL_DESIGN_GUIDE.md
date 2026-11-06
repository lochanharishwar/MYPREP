# Image design guidance

This is a locally saved, curated synthesis, not a download of copyrighted articles or a model fine-tune. No weights, API keys, billing settings or model identifiers were changed. The existing Gemini key is read server-side through the existing configuration.

## Reference library
- Nielsen Norman Group: https://www.nngroup.com/articles/principles-visual-design/ — hierarchy, scale, balance, grouping and contrast.
- W3C: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html — text contrast targets. Prompt instructions do not certify image accessibility.
- Google DeepMind: https://deepmind.google/models/gemini-image/prompt-guide/ — concrete subject, setting, composition and style instructions.

## Implementation
The versioned guide in lib/visual-design.ts is added to the system instruction for all geminiImage calls, covering local and durable image generation. The same criteria inform local review, durable campaign review and edited-caption review. Existing 35/25/20/20 weights, 8.7 acceptance threshold, five-attempt bound, cancellation and budget checks remain intact. Prompt provenance versions have changed for new server-generated records; historical records remain unchanged.

## Limits and evaluation
No collection can contain all design rules or establish what everyone finds attractive. These principles support legibility and intentional composition. Advertising effectiveness must be measured with consenting audiences and actual campaign results. No paid generation or fine-tuning was performed because paid tests remain disabled. A future visual evaluation should compare a fixed set of authorized product briefs and references, with blinded human ratings and measured text legibility before making quality claims.
