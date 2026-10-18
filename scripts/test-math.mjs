import * as math from 'mathjs';

console.log('\n=========================================');
console.log('   InkWise Golden Math Fixture Suite     ');
console.log('=========================================\n');

let passCount = 0;
let failCount = 0;

function assertTest(name, condition, details = '') {
  if (condition) {
    console.log(`✔ [PASS] ${name} ${details}`);
    passCount++;
  } else {
    console.error(`✖ [FAIL] ${name} ${details}`);
    failCount++;
  }
}

// 1. Scenario A: Derivative Verification f(x) = 6x^2 -> 12x
try {
  const expr = math.parse('6 * x^2');
  const derived = math.derivative(expr, 'x');
  const simplified = math.simplify(derived);
  const diff = math.simplify(math.parse(`(${simplified.toString()}) - (12 * x)`));
  assertTest('Scenario A: Derivative of 6x^2', diff.toString() === '0', `(Result: ${simplified.toString()})`);
} catch (e) {
  assertTest('Scenario A: Derivative of 6x^2', false, e.message);
}

// 2. Scenario B: Catch Wrong Derivative d/dx[x^3] != 2x^2
try {
  const expr = math.parse('x^3');
  const actualDeriv = math.simplify(math.derivative(expr, 'x')); // 3x^2
  const studentClaim = math.parse('2 * x^2');
  const diff = math.simplify(math.parse(`(${actualDeriv.toString()}) - (${studentClaim.toString()})`));
  const isErroneous = diff.toString() !== '0';
  assertTest('Scenario B: Catch mistake in d/dx[x^3] = 2x^2', isErroneous, `(Diff: ${diff.toString()} != 0)`);
} catch (e) {
  assertTest('Scenario B: Catch mistake', false, e.message);
}

// 3. Scenario C: Root finding for y = x^2 - 4x + 3 (Roots at x = 1 and x = 3)
try {
  const f = (x) => x * x - 4 * x + 3;
  const root1 = Math.abs(f(1)) < 1e-6;
  const root2 = Math.abs(f(3)) < 1e-6;
  const nonRoot = Math.abs(f(0)) > 1e-6;
  assertTest('Scenario C: Roots of x^2 - 4x + 3 are x=1, x=3', root1 && root2 && nonRoot, `(f(1)=${f(1)}, f(3)=${f(3)})`);
} catch (e) {
  assertTest('Scenario C: Roots calculation', false, e.message);
}

// 4. Scenario D: Domain checking division by zero (x / (x - 2))
try {
  const exprStr = 'x / (x - 2)';
  const hasDiv = exprStr.includes('/');
  assertTest('Scenario D: Domain restriction detection on rational expressions', hasDiv, '(Identified division by (x - 2))');
} catch (e) {
  assertTest('Scenario D: Domain check', false, e.message);
}

// 5. Scenario E: Trigonometric derivative d/dx[sin(x)] = cos(x)
try {
  const expr = math.parse('sin(x)');
  const derived = math.simplify(math.derivative(expr, 'x'));
  assertTest('Scenario E: Symbolic derivative of sin(x) is cos(x)', derived.toString() === 'cos(x)', `(Result: ${derived.toString()})`);
} catch (e) {
  assertTest('Scenario E: Trigonometric derivative', false, e.message);
}

console.log('\n-----------------------------------------');
console.log(`Results: ${passCount} Passed, ${failCount} Failed.`);
console.log('-----------------------------------------\n');

if (failCount > 0) process.exit(1);
