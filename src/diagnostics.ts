import type { Span } from './source.js';

export interface Diagnostic {
  code: string;
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
