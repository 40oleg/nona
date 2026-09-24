export interface Span {
  start: number;
  end: number;
}

export interface SourcePosition {
  line: number;
  column: number;
}

export function position(source: string, offset: number): SourcePosition {
  if (!Number.isInteger(offset) || offset < 0 || offset > source.length) {
    throw new RangeError(`Source offset ${offset} is outside the source text`);
  }

  let line = 1;
  let column = 1;

  for (let index = 0; index < offset; index += 1) {
    const codeUnit = source.charCodeAt(index);

    if (codeUnit === 0x0d) {
      if (source.charCodeAt(index + 1) === 0x0a && index + 1 < offset) {
        index += 1;
      }
      line += 1;
      column = 1;
    } else if (codeUnit === 0x0a || codeUnit === 0x2028 || codeUnit === 0x2029) {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  return { line, column };
}
