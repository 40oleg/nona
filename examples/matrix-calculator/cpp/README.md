# C++ reference for the matrix calculator

This is a C++ port of `examples/compat/matrix-calculator.cjs`. It performs the
same operations on the same input matrices and prints results with `%.17g`, so
the output can be compared with the JavaScript version at a `1e-12` tolerance.
It exists only as a size and behaviour baseline for the Nona-compiled example.

## Build

Any C++17 compiler works. Example with GCC (MSYS2 UCRT64) from the repository
root in PowerShell:

```powershell
g++.exe -std=c++17 -O2 -s -static -Wall -Wextra -Wpedantic -ffp-contract=off .\examples\matrix-calculator\cpp\matrix-calculator.cpp -o .\build\matrix-calculator-cpp.exe
.\build\matrix-calculator-cpp.exe
```

`-static` links the GCC/C++ runtime into the executable so it depends only on
system DLLs (KERNEL32 and UCRT); `-ffp-contract=off` disables FMA contraction
so floating-point results match JavaScript.

## Reference measurement (2026-09-23, GCC 16.2.0)

- Build had no warnings, exit code 0, empty stderr.
- Output matched the Node.js version after CRLF/LF normalisation.
- C++ executable: 204,288 bytes.
- Nona-compiled `build/matrix-calculator.exe`: 510,976 bytes.

The numbers are a point-in-time reference, not a benchmark of generated code
quality.
