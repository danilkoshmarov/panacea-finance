import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!match) throw new Error('Could not find the application module script in index.html');

const directory = await mkdtemp(join(tmpdir(), 'panacea-finance-check-'));
const file = join(directory, 'app.mjs');
try {
  await writeFile(file, match[1], 'utf8');
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'JavaScript syntax check failed\n');
    process.exitCode = result.status ?? 1;
  } else {
    process.stdout.write('Inline application module syntax: OK\n');
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
