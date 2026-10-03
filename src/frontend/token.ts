import type { Span } from '../source.js';
export interface Token { kind: 'word'|'private'|'number'|'string'|'regexp'|'punct'|'templateHead'|'templateMiddle'|'templateTail'|'templateNoSub'|'eof'; text: string; value?: string|number|bigint; pattern?:string; flags?:string; /** Annex B legacy octal literal or escape (a strict mode error). */legacyOctal?:boolean; span: Span; lineBreakBefore: boolean }
/** Source is optional only for manually constructed token streams. */
export interface TokenStream extends Array<Token> {readonly source?:string}
