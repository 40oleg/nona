import type { RuntimeBundle } from './abi.js';
import { emitBiguint } from './numeric/biguint.js';
import { emitParse } from './numeric/parse.js';
import { emitFormat } from './numeric/format.js';
import { emitFixed } from './numeric/fixed.js';
import { emitSignificant } from './numeric/significant.js';
import { emitRemainder } from './numeric/remainder.js';
import { emitPower } from './numeric/power.js';

/** Standalone integer/SSE2 numeric runtime, with only rt.alloc as a dependency. */
export function emitNumericRuntime():RuntimeBundle {
  const bundle:RuntimeBundle={fragments:[],functions:[],imports:[]};
  emitBiguint(bundle);emitParse(bundle);emitFormat(bundle);emitFixed(bundle);emitSignificant(bundle);emitRemainder(bundle);emitPower(bundle);
  return bundle;
}
