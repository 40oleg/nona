<script setup>
// The playground: an editor, compile options and Nona's compiler running in a
// Web Worker (public/playground-worker.js, built by scripts/build-playground.mjs).
import {computed, onBeforeUnmount, onMounted, ref, shallowRef, watch} from 'vue';
import {useData, withBase} from 'vitepress';
import hello from '../../samples/hello.js?raw';
import generators from '../../samples/playground-generators.js?raw';
import asyncModule from '../../samples/playground-async.mjs?raw';
import messageBox from '../../samples/playground-messagebox.win32.mjs?raw';
import wordCount from '../../samples/word-count.mjs?raw';

const examples = [
  {id: 'hello', title: 'Hello, timers', source: hello, module: false},
  {id: 'generators', title: 'Classes and generators', source: generators, module: false},
  {id: 'async', title: 'Async functions (ES module)', source: asyncModule, module: true},
  {id: 'word-count', title: 'Word count with node:fs', source: wordCount, module: true},
  {id: 'message-box', title: 'Message box (Windows GUI)', source: messageBox, module: true, target: 'win32-x64', gui: true},
];

const storageKey = 'nona-playground';
const {isDark} = useData();
const editorElement = ref();
const view = shallowRef();
const example = ref('hello');
const target = ref('win32-x64');
const module = ref(false);
const gui = ref(false);
const name = ref('app');
const state = ref('loading'); // loading | ready | compiling
const result = ref(null);     // {ok, ms, size, url, file} | {ok: false, diagnostics | error}
const copied = ref(false);

let worker, themeCompartment, oneDark, nextId = 0;
const fileName = computed(() => (name.value.trim() || 'app') + (target.value === 'win32-x64' ? '.exe' : ''));

function source() {
  return view.value?.state.doc.toString() ?? '';
}

function setSource(text) {
  const v = view.value;
  if (v) v.dispatch({changes: {from: 0, to: v.state.doc.length, insert: text}});
}

function loadExample(id) {
  const e = examples.find(e => e.id === id);
  if (!e) return;
  setSource(e.source);
  module.value = e.module;
  gui.value = !!e.gui;
  if (e.target) target.value = e.target;
  result.value = null;
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({source: source(), target: target.value, module: module.value, gui: gui.value, name: name.value, example: example.value}));
  } catch {}
}

async function encode(text) {
  const bytes = new TextEncoder().encode(text);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const packed = new Uint8Array(await new Response(stream).arrayBuffer());
  return btoa(String.fromCharCode(...packed)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function decode(text) {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  const stream = new Blob([Uint8Array.from(binary, c => c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

async function share() {
  const params = new URLSearchParams({code: await encode(source()), target: target.value});
  if (module.value) params.set('module', '1');
  if (gui.value) params.set('gui', '1');
  const url = location.origin + location.pathname + '#' + params;
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); copied.value = true; setTimeout(() => copied.value = false, 2000); } catch {}
}

async function initialState() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('code')) {
    try {
      return {source: await decode(params.get('code')), target: params.get('target') === 'linux-x64' ? 'linux-x64' : 'win32-x64', module: params.has('module'), gui: params.has('gui'), example: ''};
    } catch {}
  }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (saved?.source) return saved;
  } catch {}
  return {source: hello, target: 'win32-x64', module: false, gui: false, example: 'hello'};
}

function lineColumn(offset) {
  const text = source().slice(0, offset);
  const line = text.split('\n').length;
  return {line, column: offset - text.lastIndexOf('\n')};
}

function reveal(d) {
  const v = view.value;
  if (!v) return;
  const length = v.state.doc.length;
  v.dispatch({selection: {anchor: Math.min(d.start, length), head: Math.min(Math.max(d.end, d.start), length)}, scrollIntoView: true});
  v.focus();
}

function download() {
  if (!result.value?.url) return;
  const link = document.createElement('a');
  link.href = result.value.url;
  link.download = result.value.file;
  link.click();
}

function build() {
  if (state.value !== 'ready') return;
  if (result.value?.url) URL.revokeObjectURL(result.value.url);
  result.value = null;
  state.value = 'compiling';
  const isModule = module.value;
  worker.postMessage({
    id: ++nextId,
    source: source(),
    options: {
      fileName: isModule ? '/app.mjs' : '/app.js',
      target: target.value,
      module: isModule,
      ...(target.value === 'win32-x64' && gui.value ? {subsystem: 'windows'} : {}),
    },
  });
}

function onMessage({data}) {
  if (data.ready) { state.value = 'ready'; return; }
  if (data.id !== nextId) return;
  state.value = 'ready';
  if (data.ok) {
    const blob = new Blob([data.image], {type: 'application/octet-stream'});
    result.value = {ok: true, ms: data.ms, size: data.image.byteLength, url: URL.createObjectURL(blob), file: fileName.value, target: target.value};
    download();
  } else {
    result.value = {ok: false, diagnostics: (data.diagnostics ?? []).map(d => ({...d, ...lineColumn(d.start)})), error: data.error};
  }
}

function startWorker() {
  worker = new Worker(withBase('/playground-worker.js'));
  worker.onmessage = onMessage;
  worker.onerror = event => {
    state.value = 'ready';
    result.value = {ok: false, error: event.message || 'The compiler failed to load.'};
  };
}

onMounted(async () => {
  startWorker();
  const [{EditorView, basicSetup}, {keymap}, {indentWithTab}, {javascript}, {Compartment, Prec}, theme] = await Promise.all([
    import('codemirror'), import('@codemirror/view'), import('@codemirror/commands'),
    import('@codemirror/lang-javascript'), import('@codemirror/state'), import('@codemirror/theme-one-dark'),
  ]);
  oneDark = theme.oneDark;
  themeCompartment = new Compartment();
  const initial = await initialState();
  target.value = initial.target ?? 'win32-x64';
  module.value = !!initial.module;
  gui.value = !!initial.gui;
  name.value = initial.name || 'app';
  example.value = initial.example ?? '';
  view.value = new EditorView({
    doc: initial.source,
    parent: editorElement.value,
    extensions: [
      basicSetup,
      Prec.highest(keymap.of([{key: 'Mod-Enter', run: () => { build(); return true; }}, indentWithTab])),
      javascript(),
      themeCompartment.of(isDark.value ? oneDark : []),
      EditorView.updateListener.of(update => { if (update.docChanged) save(); }),
    ],
  });
});

watch(isDark, dark => view.value?.dispatch({effects: themeCompartment.reconfigure(dark ? oneDark : [])}));
watch(example, id => { if (id) loadExample(id); save(); });
watch([target, module, gui, name], save);

onBeforeUnmount(() => {
  worker?.terminate();
  view.value?.destroy();
  if (result.value?.url) URL.revokeObjectURL(result.value.url);
});

const megabytes = bytes => (bytes / 1024 / 1024).toFixed(1) + ' MB';
const seconds = ms => ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s';
</script>

<template>
  <div class="playground">
    <div class="toolbar">
      <label>
        <span>Example</span>
        <select v-model="example">
          <option value="" disabled>Your code</option>
          <option v-for="e in examples" :key="e.id" :value="e.id">{{ e.title }}</option>
        </select>
      </label>
      <label>
        <span>Target</span>
        <select v-model="target">
          <option value="win32-x64">Windows x64 (.exe)</option>
          <option value="linux-x64">Linux x64</option>
        </select>
      </label>
      <label>
        <span>Program</span>
        <select v-model="module">
          <option :value="false">Script</option>
          <option :value="true">ES module</option>
        </select>
      </label>
      <label v-if="target === 'win32-x64'" class="check">
        <input v-model="gui" type="checkbox">
        <span>No console window</span>
      </label>
      <label>
        <span>File name</span>
        <input v-model="name" class="name" spellcheck="false">
      </label>
    </div>

    <div ref="editorElement" class="editor" />

    <div class="actions">
      <button class="build" :disabled="state !== 'ready'" @click="build">
        <template v-if="state === 'loading'">Loading the compiler…</template>
        <template v-else-if="state === 'compiling'">Compiling…</template>
        <template v-else>Build {{ fileName }}</template>
      </button>
      <span class="hint">Ctrl+Enter</span>
      <button class="secondary" :disabled="!view" @click="share">{{ copied ? 'Link copied' : 'Copy link' }}</button>
    </div>

    <div v-if="result?.ok" class="result ok">
      Compiled in {{ seconds(result.ms) }} · {{ result.file }}, {{ megabytes(result.size) }} ·
      <a href="#" @click.prevent="download">download again</a>
      <div v-if="result.target === 'linux-x64'" class="note">Run it with <code>chmod +x {{ result.file }} &amp;&amp; ./{{ result.file }}</code>.</div>
      <div v-else class="note">Windows SmartScreen may warn about an unsigned program downloaded from the internet: choose <b>More info → Run anyway</b>. Run console programs from a terminal to see their output.</div>
    </div>
    <div v-else-if="result" class="result error">
      <template v-if="result.diagnostics?.length">
        <div v-for="(d, i) in result.diagnostics" :key="i" class="diagnostic" @click="reveal(d)">
          <code>{{ d.line }}:{{ d.column }}</code> <b>{{ d.code }}</b> {{ d.message }}
        </div>
      </template>
      <pre v-else>{{ result.error }}</pre>
    </div>
  </div>
</template>

<style scoped>
.playground { margin-top: 24px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 12px 16px; align-items: flex-end; margin-bottom: 12px; }
.toolbar label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--vp-c-text-2); }
.toolbar label.check { flex-direction: row; align-items: center; gap: 6px; padding-bottom: 8px; }
.toolbar select, .toolbar input.name {
  height: 36px; padding: 0 10px; border: 1px solid var(--vp-c-divider); border-radius: 8px;
  background: var(--vp-c-bg-soft); color: var(--vp-c-text-1); font-size: 14px;
}
.toolbar select { padding-right: 28px; appearance: auto; }
.toolbar input.name { width: 120px; font-family: var(--vp-font-family-mono); }
.editor { border: 1px solid var(--vp-c-divider); border-radius: 12px; overflow: hidden; min-height: 360px; }
.editor :deep(.cm-editor) { height: 460px; font-size: 14px; }
.editor :deep(.cm-editor.cm-focused) { outline: none; }
.editor :deep(.cm-scroller) { font-family: var(--vp-font-family-mono); }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; }
.actions button {
  height: 40px; padding: 0 20px; border-radius: 20px; font-size: 14px; font-weight: 600;
  transition: background-color 0.25s;
}
.actions .build { background: var(--vp-button-brand-bg); color: var(--vp-button-brand-text); }
.actions .build:not(:disabled):hover { background: var(--vp-button-brand-hover-bg); }
.actions .secondary { background: var(--vp-button-alt-bg); color: var(--vp-button-alt-text); }
.actions .secondary:not(:disabled):hover { background: var(--vp-button-alt-hover-bg); }
.actions button:disabled { opacity: 0.6; cursor: default; }
.actions .hint { font-size: 12px; color: var(--vp-c-text-3); }
.result { margin-top: 16px; padding: 12px 16px; border-radius: 8px; font-size: 14px; line-height: 1.6; }
.result.ok { background: var(--vp-c-tip-soft); }
.result.error { background: var(--vp-c-danger-soft); }
.result .note { margin-top: 4px; color: var(--vp-c-text-2); }
.result pre { margin: 0; white-space: pre-wrap; font-size: 12px; }
.diagnostic { cursor: pointer; }
.diagnostic:hover { text-decoration: underline; }
</style>
