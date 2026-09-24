import type { Span } from '../source.js';
export interface Token { kind: 'word'|'number'|'string'|'punct'|'eof'; text: string; value?: string|number; span: Span; lineBreakBefore: boolean }
/** Source is optional only for manually constructed token streams. */
export interface TokenStream extends Array<Token> {readonly source?:string}
