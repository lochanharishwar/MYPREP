/** Curated prompt guidance; not model training or a guarantee of performance. */
export const VISUAL_DESIGN_VERSION = 'visual-design-1';
export const VISUAL_DESIGN_GUIDE = `Visual design guide ${VISUAL_DESIGN_VERSION}:
Respect the brand policy, provided product references and explicit creative direction. These principles guide execution, not a replacement brand style.
ATTENTION: establish one primary focal point around the product or relevant use case. Use relative scale and contrast to guide attention, balanced visual weight, intentional empty space, and proximity to group related elements. Remove competing decoration. Inspect the composition at mobile feed size.
RELEVANCE: communicate one clear idea through a recognizable context and credible benefit supported by supplied evidence. Prefer clear, easily understood scenes over cognitive overload. Do not infer personality or vulnerabilities from demographic traits. Color associations depend on culture and context; do not claim universal color psychology or guaranteed engagement.
CRAFT: specify subject, action, environment, framing, lighting, materials and visual style coherently. Preserve reference-product geometry, packaging and colors. Use realistic product-use photography by default only when the brief does not request another style. Avoid unrelated people, distorted anatomy, impossible product interactions and generic stock-photo clutter.
TYPE: omit embedded marketing text unless requested. If requested, use only approved exact wording, a restrained type hierarchy, clear spacing and a quiet background. Aim for 4.5:1 contrast for ordinary text or 3:1 for large text; these are design targets, not a claim that generated pixels have been measured. Keep important elements away from crop edges and platform overlays.
TRUST: never invent logos, ratings, testimonials, scarcity, prices or product claims. Use authentic relevance rather than deceptive urgency. Attractive design is a testable hypothesis, not proof of conversion. Render only the requested finished image, not this checklist.`;
export const VISUAL_REVIEW_GUIDE = `Design review ${VISUAL_DESIGN_VERSION}: Evaluate the actual finished output. Psychology means clarity of the intended idea, audience relevance and credible motivation, not manipulation or guessed conversion likelihood. Visual quality includes focal hierarchy, balance, grouping, uncluttered space, reference fidelity, coherent lighting and readable requested text at mobile size. Platform fit includes aspect ratio and safe framing. Describe observed defects and precise corrections; distinguish observations from hypotheses. Do not assert numerical contrast compliance without pixel measurement. Apply the existing rubric weights and passing threshold unchanged. Never award a passing score just because the prompt names design principles.`;
export const VISUAL_DESIGN_SOURCES = [
 'https://www.nngroup.com/articles/principles-visual-design/',
 'https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html',
 'https://deepmind.google/models/gemini-image/prompt-guide/',
];

export const DESIGN_STARTERS = [
 { name: 'Product in use', direction: 'Show the product in a believable everyday use scene. Use natural light, a clear product focal point and an uncluttered environment.' },
 { name: 'Minimal studio', direction: 'Use a restrained studio composition, deliberate negative space, controlled lighting and faithful product materials. Keep the product dominant.' },
 { name: 'Illustrated campaign', direction: 'Use a modern editorial illustration with clear silhouettes and a limited brand-led palette. Keep the use case central; preserve any provided product reference.' },
 { name: 'Bold editorial', direction: 'Use a confident editorial composition with purposeful asymmetry and strong focal contrast. Keep supporting elements quiet and leave room for approved copy.' },
] as const;
export function appendDesignDirection(current: string, addition: string) {
 if (current.includes(addition)) return current;
 const next = [current.trim(), addition].filter(Boolean).join('\n');
 if (next.length > 2000) throw new Error('Shorten your creative direction before adding this style. The limit is 2,000 characters.');
 return next;
}
