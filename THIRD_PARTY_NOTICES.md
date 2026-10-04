# Third-party notices

## ARM64 logarithm and exponential range reduction

The reduction constants in `src/backend/arm64/math.ts` follow Sun fdlibm,
as published in OpenLibm's [e_log.c](https://github.com/JuliaMath/openlibm/blob/master/src/e_log.c)
and [e_exp.c](https://github.com/JuliaMath/openlibm/blob/master/src/e_exp.c).
Nona emits its own native instructions and convergent polynomial approximations.

Copyright (C) 1993, 2004 by Sun Microsystems, Inc. All rights reserved.
Permission to use, copy, modify, and distribute this software is freely
granted, provided that this notice is preserved.

## Nondecimal numeric formatting

The nondecimal numeric digit/rounding strategy in
`src/runtime/numeric/radix.ts` is adapted from V8's
[DoubleToRadixStringView](https://chromium.googlesource.com/v8/v8/+/refs/heads/main/src/numbers/conversions.cc).
Nona emits its own x64 implementation; it does not embed the V8 engine.
Retain this notice with source and binary distributions using that formatter.

Copyright 2014, the V8 project authors. All rights reserved.
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

* Redistributions of source code must retain the above copyright
  notice, this list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above
  copyright notice, this list of conditions and the following
  disclaimer in the documentation and/or other materials provided
  with the distribution.
* Neither the name of Google Inc. nor the names of its
  contributors may be used to endorse or promote products derived
  from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
