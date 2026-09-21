'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createReaderFullscreen } = require('../src/main');

function fixture(mode = 'native') {
  const doc = new EventTarget(), dialog = new EventTarget(), button = new EventTarget();
  const attrs = new Map(), classes = new Set(), status = { textContent: '' };
  doc.fullscreenElement = null;
  dialog.open = true;
  dialog.classList = { toggle(name, active) { active ? classes.add(name) : classes.delete(name); } };
  button.setAttribute = (name, value) => attrs.set(name, value);
  let requests = 0;
  const target = { async requestFullscreen() {
    requests++;
    if (mode === 'reject') throw new Error('unsupported');
    doc.fullscreenElement = target;
    doc.dispatchEvent(new Event('fullscreenchange'));
  } };
  if (mode === 'missing') delete target.requestFullscreen;
  doc.exitFullscreen = async () => {
    doc.fullscreenElement = null;
    doc.dispatchEvent(new Event('fullscreenchange'));
  };
  const controller = createReaderFullscreen({ doc, dialog, target, button, status });
  return { ...controller, doc, dialog, target, button, status, attrs, classes, requests: () => requests };
}

test('fullscreen targets reader content and syncs after browser Escape', async () => {
  const f = fixture();
  await f.toggle();
  assert.equal(f.doc.fullscreenElement, f.target);
  assert.equal(f.attrs.get('aria-pressed'), 'true');
  assert.equal(f.attrs.get('aria-label'), 'Sair da tela cheia');
  await f.doc.exitFullscreen();
  assert.equal(f.attrs.get('aria-pressed'), 'false');
  assert.equal(f.dialog.open, true);
  await f.toggle();
  await f.toggle();
  assert.equal(f.doc.fullscreenElement, null);
});

test('unavailable fullscreen expands the reader and Escape restores it without closing', async () => {
  for (const mode of ['reject', 'missing']) {
    const f = fixture(mode);
    await f.toggle();
    assert.ok(f.classes.has('reader-expanded'));
    assert.match(f.status.textContent, /indispon/);
    const cancel = new Event('cancel', { cancelable: true });
    f.dialog.dispatchEvent(cancel);
    assert.equal(cancel.defaultPrevented, true);
    assert.equal(f.dialog.open, true);
    assert.equal(f.classes.has('reader-expanded'), false);
    assert.equal(f.attrs.get('aria-pressed'), 'false');
    assert.equal(f.status.textContent, '');
  }
});

test('closing the reader clears fullscreen state before reopening', async () => {
  const f = fixture();
  await f.toggle();
  f.dialog.open = false;
  f.dialog.dispatchEvent(new Event('close'));
  await Promise.resolve();
  assert.equal(f.doc.fullscreenElement, null);
  assert.equal(f.attrs.get('aria-pressed'), 'false');
  f.dialog.open = true;
  await f.toggle();
  assert.equal(f.doc.fullscreenElement, f.target);
});

test('rapid fullscreen clicks share a single transition and exit failures remain recoverable', async () => {
  const f = fixture();
  await Promise.all([f.toggle(), f.toggle()]);
  assert.equal(f.requests(), 1);
  f.doc.exitFullscreen = async () => { throw new Error('denied'); };
  await f.toggle();
  assert.equal(f.attrs.get('aria-pressed'), 'true');
  assert.equal(f.button.disabled, false);
  assert.match(f.status.textContent, /pressione Escape/);
});
