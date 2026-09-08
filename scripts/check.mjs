import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const localPython = path.join(
  root,
  'services',
  'processor',
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
const python =
  process.env.PYTHON || (existsSync(localPython) ? localPython : 'python');
function run(command, args) {
  console.log(`Checking ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    cwd: root,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}
const npm = (args) =>
  run(process.execPath, [process.env.npm_execpath, ...args]);
if (process.argv.includes('--python'))
  run(python, [
    '-m',
    'unittest',
    'discover',
    '-s',
    'services/processor',
    '-p',
    'test_*.py',
    '-v',
  ]);
else {
  for (const name of ['typecheck', 'lint', 'test', 'test:python'])
    npm(['run', name]);
  npm(['audit', '--audit-level=low']);
  run(python, [
    '-m',
    'pip_audit',
    '-r',
    'services/processor/requirements.lock.txt',
    '--disable-pip',
    '--no-deps',
  ]);
  npm(['run', 'build']);
}
