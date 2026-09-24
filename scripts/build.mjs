import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const compiler = join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const result = spawnSync(process.execPath, [compiler, '-p', 'tsconfig.json'], {
  cwd: projectRoot,
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const outputDirectory = join(projectRoot, 'dist');
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, 'cli.js'), "import './src/cli.js';\n", 'utf8');
