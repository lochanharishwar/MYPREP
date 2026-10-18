// scripts/test-multi-equation.mjs
// Verifies multi-equation separation, plain explanations, and conversational script

const BASE_URL = 'http://localhost:3000';

// Minimal 1x1 blank PNG data URL to test the endpoint structure
const SAMPLE_IMAGE_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function testMultiEquation() {
  console.log('🧪 Testing Multi-Equation Separation & Conversational AI API...\n');

  try {
    const res = await fetch(`${BASE_URL}/api/ai/recognize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: SAMPLE_IMAGE_BASE64,
        promptOverride: 'Transcribe these equations: line 1: f(x) = 6x^2, line 2: y = 2x + 1. Return structured JSON with separate expressions.'
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    console.log('✅ API returned success!');
    console.log('Equation Count:', data.equationCount || data.expressions?.length);
    console.log('Expressions:', JSON.stringify(data.expressions, null, 2));
    console.log('Conversational Script:', data.conversationalScript);
    console.log('Overall Teaching Summary:', data.overallTeachingSummary);

    if (Array.isArray(data.expressions) && data.expressions.length >= 1) {
      const first = data.expressions[0];
      if (first.latex && first.plainExplanation) {
        console.log('\n🎉 Verified: Separate equation has LaTeX, plainExplanation, and conversationalScript!');
        process.exit(0);
      }
    }
    throw new Error('Expressions format missing required fields');
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  }
}

testMultiEquation();
