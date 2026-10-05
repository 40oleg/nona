import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {test} from 'node:test';
import {runOnHost} from './host.js';
import {runOracle} from './oracle.js';

export interface CorpusCase {
  id: number;
  file: string;
  purpose: string;
  features: string[];
  sha256: string;
  stdout: string;
}
const root = new URL('../../../programs/', import.meta.url);
export const corpus: CorpusCase[] = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
export function readProgram(file: string): string {
  assert.match(file, /^(?:[a-z]+\/)?\d{3,4}-[a-z0-9-]+\.js$/);
  return readFileSync(new URL(file, root), 'utf8');
}
export function verifyInventory(): void {
  assert.equal(corpus.length, 1000, 'the corpus must contain exactly 1,000 cases');
  assert.deepEqual(corpus.map(item => item.id), Array.from({length: 1000}, (_, index) => index + 1));
  const files = readdirSync(root, {recursive: true}).map(String).map(file => file.replaceAll('\\', '/')).filter(file => file.endsWith('.js')).sort();
  assert.deepEqual(corpus.map(item => item.file).sort(), files, 'every program must be registered exactly once');
  const metadata = ({id, file, purpose, features}: Pick<CorpusCase, 'id' | 'file' | 'purpose' | 'features'>) => ({id, file, purpose, features});
  for (const category of ['algorithms', 'collections', 'text', 'async', 'objects', 'language']) {
    const catalog: Pick<CorpusCase, 'id' | 'file' | 'purpose' | 'features'>[] = JSON.parse(readFileSync(new URL(`${category}/cases.json`, root), 'utf8'));
    assert.equal(catalog.length, 165, `${category}: expected 165 catalog entries`);
    assert.deepEqual(catalog.map(metadata).sort((a, b) => a.id - b.id),
      corpus.filter(item => item.file.startsWith(`${category}/`)).map(metadata),
      `${category}: catalog differs from recorded manifest`);
  }
  const bodies = new Map<string, string>();
  for (const item of corpus) {
    assert.ok(item.purpose.trim().length >= 15, `${item.file}: missing purpose`);
    assert.ok(new Set(item.features).size >= 3, `${item.file}: describe at least three interacting features`);
    const source = readProgram(item.file);
    assert.equal(createHash('sha256').update(source).digest('hex'), item.sha256, `${item.file}: stale snapshot`);
    assert.ok(item.stdout.length > 0, `${item.file}: no observable output`);
    // Ignoring whole-line comments prevents a different title from masking a copied body.
    const body = source.split('\n').filter(line => !/^\s*\/\//.test(line)).map(line => line.trim()).filter(Boolean).join('\n');
    assert.ok(!bodies.has(body), `${item.file}: duplicated body of ${bodies.get(body)}`);
    bodies.set(body, item.file);
  }
}
export function registerProgramShard(shard: number): void {
  test(`program corpus inventory (shard ${shard})`, verifyInventory);
  // The original ten retain their independent handwritten expectations in the original test.
  for (const item of corpus.filter(item => item.id > 10 && (item.id - 1) % 10 === shard)) {
    test(`program corpus: ${item.file} — ${item.purpose}`, () => {
      const source = readProgram(item.file);
      const oracle = runOracle(source);
      assert.equal(oracle.stdout, item.stdout, `${item.file}: Node.js output differs from reviewed snapshot`);
      for (const gcStress of [false, true]) {
        const native = runOnHost(source, {gcStress});
        const context = `${item.file}, gcStress=${gcStress}`;
        assert.ifError(native.error);
        assert.equal(native.status, 0, `${context}: ${native.stderr}`);
        assert.equal(native.stdout.replace(/\r\n/g, '\n'), oracle.stdout, context);
        assert.equal(native.stderr, '', `${context}: unexpected diagnostics`);
      }
    });
  }
}
