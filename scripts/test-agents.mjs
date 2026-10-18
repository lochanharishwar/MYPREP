// scripts/test-agents.mjs
// Verifies all 6 agents on the Margin platform via HTTP

const BASE_URL = 'http://localhost:3000';

async function testAgents() {
  console.log('🤖 Testing 6-Agent AI Team on Margin (Gemma 4 26B)...\n');

  const tests = [
    {
      name: 'Agent 1: Problem Overseer (Atlas)',
      action: 'oversee',
      payload: { mathContext: 'f(x) = 6x^2', studentQuery: 'How do I take derivative?' }
    },
    {
      name: 'Agent 2: Problem Analyzer (Hypatia)',
      action: 'analyze',
      payload: { mathExpression: 'f(x) = 6x^2' }
    },
    {
      name: 'Agent 3: Whiteboard Co-Writer (Scribe)',
      action: 'cowrite',
      payload: { currentMath: 'f(x) = 6x^2', lastPosition: { x: 120, y: 150 } }
    },
    {
      name: 'Agent 4: Socratic Explainer (Socrates)',
      action: 'explain',
      payload: { topicOrQuestion: 'Explain why 6x^2 becomes 12x', mathExpression: 'f(x) = 6x^2' }
    },
    {
      name: 'Agent 5: Artifact Generator (Euclid)',
      action: 'artifact',
      payload: { mathExpression: '6*x^2' }
    },
    {
      name: 'Agent 6: Handwriting Beautifier (Callisto)',
      action: 'beautify',
      payload: {
        scribbledMath: 'f(x) = 6x^2',
        sourceIds: ['stroke-1', 'stroke-2'],
        bbox: { minX: 100, minY: 150, width: 250, height: 90 }
      }
    }
  ];

  let passed = 0;

  for (const test of tests) {
    process.stdout.write(`Testing [${test.name}] ... `);
    try {
      const res = await fetch(`${BASE_URL}/api/ai/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: test.action, payload: test.payload })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const json = await res.json();
      if (!json.result && !json.agent) {
        throw new Error(`Unexpected payload format: ${JSON.stringify(json)}`);
      }

      console.log(`✅ OK (Agent: ${json.agent})`);
      passed++;
    } catch (err) {
      console.log(`❌ FAILED: ${err.message}`);
    }
  }

  console.log(`\nAgent Team Test Results: ${passed}/${tests.length} tests passed.\n`);
  if (passed !== tests.length) {
    process.exit(1);
  }
}

testAgents();
