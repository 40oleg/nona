import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, openSync, closeSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const TEMP_PREFIX = 'nona-native-';
// First execution of a newly emitted PE may wait for Windows antivirus scanning.
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BUFFER_BYTES = 4 * 1024 * 1024;

export interface NativeRun {
  status: number | null;
  stdout: Buffer;
  stderr: Buffer;
  error?: Error;
}
function isOwnedTempDirectory(directory: string): boolean {
  const resolvedDirectory = resolve(directory);
  return (
    dirname(resolvedDirectory) === resolve(tmpdir()) &&
    basename(resolvedDirectory).startsWith(TEMP_PREFIX)
  );
}

export function runNative(
  image: Uint8Array,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  redirectStdout = false,
): NativeRun {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('Native process timeout must be a positive finite number');
  }

  const directory = mkdtempSync(join(tmpdir(), TEMP_PREFIX));

  try {
    const executable = join(directory, 'image.exe');
    writeFileSync(executable, image);

    const outputPath = join(directory, 'stdout.bin');
    const outputFd = redirectStdout ? openSync(outputPath, 'w') : undefined;
    const result = spawnSync(executable, [], {
      shell: false,
      timeout: timeoutMs,
      maxBuffer: MAX_BUFFER_BYTES,
      windowsHide: true,
      ...(outputFd === undefined ? {} : {stdio: ["ignore", outputFd, "pipe"] as const}),
    });

    if (outputFd !== undefined) closeSync(outputFd);
    const run: NativeRun = {
      status: result.status,
      stdout: redirectStdout ? readFileSync(outputPath) : result.stdout ?? Buffer.alloc(0),
      stderr: result.stderr ?? Buffer.alloc(0),
    };

    if (result.error) {
      run.error = result.error;
    }

    return run;
  } finally {
    if (!isOwnedTempDirectory(directory)) {
      throw new Error(`Refusing to remove unverified temp directory: ${directory}`);
    }

    rmSync(directory, { recursive: true, force: true });
  }
}

/** Replace a Windows IAT slot with a native stub, entirely in test composition. */
export function replaceImport(program:import('../../src/backend/pe/model.js').NativeProgram,symbol:string,stub:string):void {
 program.imports=program.imports.filter(i=>i.symbol!==symbol);
 program.fragments.push({name:symbol,section:'.rdata',alignment:8,bytes:new Uint8Array(8),symbols:{},fixups:[{offset:0,kind:'va64',target:stub,addend:0}]});
}
