---
layout: page
sidebar: false
title: Playground
description: Compile JavaScript into Windows, Linux, macOS or BSD executables in your browser.
---

<script setup>
import Playground from '../.vitepress/components/Playground.vue';
</script>

<div class="playground-page">

# Playground

Write a program, choose a target and press **Build**: Nona's compiler runs in your browser and the executable is downloaded. Your code is not sent anywhere.

Choose among Windows, Linux and macOS on x64 or ARM64, and FreeBSD or OpenBSD on x64. The downloaded program runs on the matching operating system and CPU; see the [native platform matrix](/reference/native-platforms) for host API limits.

<ClientOnly>
  <Playground />
</ClientOnly>

## Notes

- The playground compiles a single file. Built-in [`nona:*` and `node:*` modules](/reference/modules) are available; importing other files is not.
- The first build loads the compiler (about 0.5 MB compressed) and takes a few seconds; later builds are faster.
- The executables are the same as those of `node dist/cli.js build` with the same options; see [Getting started](/guide/getting-started) to build locally, add an icon or version information.
- Executables are not signed. Do not run programs from people you do not trust: a compiled program has the same permissions as any other program on your computer.

</div>

<style>
.playground-page { max-width: 1152px; margin: 0 auto; padding: 32px 24px 96px; }
.playground-page h1 { font-size: 32px; font-weight: 600; line-height: 40px; margin-bottom: 12px; }
.playground-page h2 { font-size: 22px; font-weight: 600; margin: 40px 0 12px; padding-top: 24px; border-top: 1px solid var(--vp-c-divider); }
.playground-page p, .playground-page li { line-height: 1.7; color: var(--vp-c-text-1); }
.playground-page ul { list-style: disc; padding-left: 20px; }
.playground-page a { color: var(--vp-c-brand-1); text-decoration: underline; text-underline-offset: 2px; }
@media (min-width: 768px) { .playground-page { padding: 48px 32px 96px; } }
</style>
