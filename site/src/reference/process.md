---
editLink: false
---

<!--@include: ../../generated/process.md-->

::: info Source
This page is generated from [`docs/process.md`](https://github.com/40oleg/nona/edit/main/docs/process.md) in the repository. Edit it there.
:::


## Native signals and diagnostic reports

Native signal listeners do not keep the loop alive and restore prior OS dispositions when removed. Windows supports console SIGHUP, SIGINT and SIGBREAK. Diagnostic reports expose genuine Nona allocator, OS resource and network data through process.report; report signal registration survives removal of public listeners. Fatal reporting uses static native storage. See the current [Process API](https://github.com/40oleg/nona/blob/main/docs/process.md) for details and verification status.
