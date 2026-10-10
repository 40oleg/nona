import type { Span } from './source.js';

/**
 * Every diagnostic code the compiler reports (documented in
 * site/src/reference/cli.md). E_INTERNAL is a failed compiler invariant: a
 * bug in Nona, not in the program.
 */
export type DiagnosticCode =
  | 'E_LEX'
  | 'E_SYNTAX'
  | 'E_BIND'
  | 'E_MODULE'
  | 'E_HOST_MODULE'
  | 'E_FFI_STATIC'
  | 'E_FFI_TARGET'
  | 'E_RESOURCE'
  | 'E_TARGET'
  | 'E_INTERNAL';

/** The compiler phases named by E_INTERNAL diagnostics. */
export type CompilerPhase =
  | 'parse'
  | 'dynamic-functions'
  | 'eval'
  | 'module-requests'
  | 'module-graph'
  | 'bind'
  | 'lower'
  | 'codegen'
  | 'link'
  | 'compile';

export interface Diagnostic {
  code: DiagnosticCode;
  message: string;
  file: string;
  span: Span;
}

export class CompileError extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(diagnostics: Diagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
    this.name = 'CompileError';
    this.diagnostics = diagnostics;
  }
}

/** An E_INTERNAL diagnostic for a failed invariant in `phase`; an empty file is the entry file. */
export function internalError(phase: CompilerPhase, message: string, span: Span = { start: 0, end: 0 }, file = ''): CompileError {
  return new CompileError([{ code: 'E_INTERNAL', message: `Internal compiler error in ${phase}: ${message}`, file, span }]);
}

/** Runs one compiler phase; any failure other than a CompileError becomes an E_INTERNAL diagnostic naming the phase. */
export function inPhase<T>(phase: CompilerPhase, run: () => T): T {
  try {
    // Fault injection for tests: NONA_DEBUG_FAIL_PHASE=<phase> fails that
    // phase the way a broken invariant would.
    if (process.env.NONA_DEBUG_FAIL_PHASE === phase) throw new Error('Injected failure (NONA_DEBUG_FAIL_PHASE)');
    return run();
  } catch (error) {
    if (error instanceof CompileError) throw error;
    throw internalError(phase, error instanceof Error ? error.message : String(error));
  }
}
