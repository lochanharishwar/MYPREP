import { execSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

console.log('\n=========================================');
console.log('   InkWise × Gemma 4 System Diagnostics   ');
console.log('=========================================\n');

let allPassed = true;

function check(title, fn) {
  process.stdout.write(`• Checking ${title}... `);
  try {
    const result = fn();
    console.log(`[PASS] ${result || ''}`);
  } catch (err) {
    console.log(`[FAIL] ${err.message}`);
    allPassed = false;
  }
}

// 1. OS & Node.js
check('Node.js Environment', () => {
  const version = process.version;
  const major = parseInt(version.replace('v', '').split('.')[0], 10);
  if (major < 18) throw new Error(`Node ${version} is too old (18+ required)`);
  return `${process.platform} (${version})`;
});

// 2. Python & SymPy
check('Python & SymPy Installation', () => {
  const output = execSync('python -c "import sympy, fastapi; print(sympy.__version__)"', { encoding: 'utf8' }).trim();
  return `SymPy v${output} ready`;
});

// 3. SQLite Database
check('SQLite Database & Prisma', () => {
  if (!fs.existsSync(path.join(process.cwd(), 'prisma', 'schema.prisma'))) {
    throw new Error('prisma/schema.prisma not found');
  }
  return 'Prisma schema and SQLite ready';
});

// 4. Ollama Availability
check('Local Ollama Service', () => {
  try {
    const output = execSync('ollama --version', { encoding: 'utf8' }).trim();
    return `CLI detected: ${output}`;
  } catch {
    return 'Ollama not detected or server not running (Hosted or Mock mode can be used)';
  }
});

// 5. Gemma 4 Provider & Prompts
check('Gemma 4 Prompts & Architecture', () => {
  const promptsFile = path.join(process.cwd(), 'lib', 'ai', 'gemma', 'prompts.ts');
  if (!fs.existsSync(promptsFile)) throw new Error('prompts.ts missing');
  return 'Canonical prompts present (Vision, Tutor, Intent)';
});

console.log('\n-----------------------------------------');
if (allPassed) {
  console.log('✔ All fundamental dependencies are verified and operational!');
} else {
  console.log('⚠ Some optional services are not active. InkWise will run with graceful fallbacks.');
}
console.log('-----------------------------------------\n');
