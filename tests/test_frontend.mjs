import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Exercise request races without a browser or model weights. Rendering is covered
// by the real localhost browser checks; fetch deliberately ignores abort here.
function harness() {
  const nodes = new Map();
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {
      hidden: false, disabled: false, checked: true, value: '0', textContent: '',
      selectedOptions: [{ textContent: 'Cosine' }], listeners: {},
      addEventListener(name, handler) { this.listeners[name] = handler; },
      setAttribute(name, value) { this[name] = value; },
      removeAttribute(name) { delete this[name]; },
      replaceChildren() {}, focus() {}, scrollIntoView() {},
      classList: { remove() {}, add() {}, toggle() {} },
    });
    return nodes.get(selector);
  }
  node('#model').value = 'SFace'; node('#metric').value = 'cosine';
  node('#beard-threshold').value = '50';
  const actions = [{ checked: true, value: 'beard' }];
  const controls = [node('#run-button'), node('#mode-select'), node('#model')];
  const cancelled = ['#cancel-run', '#cancel-processing', '#mobile-cancel'].map(node);
  const requests = [], timers = new Map(); let timerId = 0, now = 0;
  const sandbox = {
    localStorage: { getItem() { return null; }, setItem() {} },
    document: {
      documentElement: { lang: 'ru' },
      querySelector: node,
      querySelectorAll(selector) {
        if (selector.startsWith('input[name=action]')) return actions;
        if (selector === '.cancel-request') return cancelled;
        if (selector === '.nav-item') return [];
        if (selector.startsWith('form input')) return controls;
        return [];
      },
      addEventListener() {},
    },
    window: { matchMedia: () => ({ matches: false }), addEventListener() {} },
    navigator: {}, URL: { revokeObjectURL() {} }, AbortController,
    FormData: class { append() {} },
    performance: { now: () => now },
    setInterval(fn) { timers.set(++timerId, fn); return timerId; },
    clearInterval(id) { timers.delete(id); },
    fetch(url, options) {
      if (url === '/api/health') return Promise.resolve({ ok: true, json: async () => ({ ready: true, beard_downloaded: true }) });
      return new Promise((resolve, reject) => requests.push({ resolve, reject, options }));
    },
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('../web/i18n.js', import.meta.url), 'utf8'), context);
  const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace('applyLanguage(I18n.language, false); health();', 'updateRunContext(); health();'), context);
  vm.runInContext(`
    stopCamera = () => {};
    renderPreviews = () => {};
    showLastResult = () => { state.result = state.lastRun?.data || null; };
    state.images = [{ name: 'selected.jpg' }];
  `, context);
  const read = (expression) => vm.runInContext(expression, context);
  return { node, requests, timers, read,
    run: () => node('#work-form').listeners.submit({ preventDefault() {} }),
    cancel: () => read('cancelRequest()'),
    tick(seconds) { now += seconds * 1000; [...timers.values()].forEach((fn) => fn()); },
  };
}
function answer(name) {
  return { mode: 'analyze', marker: name, options: { actions: ['beard'] }, elapsed_seconds: 1, results: [] };
}
function success(data) { return { ok: true, json: async () => data }; }

test('cancel aborts the wait, preserves files/output and releases controls/timer', async () => {
  const h = harness();
  h.read("state.lastRun = { data: { marker: 'previous', options: options() }, inputFiles: [...state.images], galleryFiles: [] }");
  const pending = h.run();
  h.tick(65);
  assert.equal(h.node('#processing-elapsed').textContent, '1:05');
  assert.equal(h.node('#cancel-run').hidden, false);
  h.cancel();
  assert.equal(h.requests[0].options.signal.aborted, true);
  assert.equal(h.read('state.busy'), false);
  assert.equal(h.read('state.images[0].name'), 'selected.jpg');
  assert.equal(h.read('state.result.marker'), 'previous');
  assert.equal(h.node('#mode-select').disabled, false);
  assert.equal(h.timers.size, 0);
  assert.match(h.node('#status-message').textContent, /может продолжаться/);
  h.requests[0].reject(new Error('late transport error'));
  await pending;
  assert.equal(h.node('#error').textContent, '');
});

test('late cancelled response cannot overwrite or unlock a newer request', async () => {
  const h = harness();
  const first = h.run(); h.cancel();
  const second = h.run();
  h.requests[0].resolve(success(answer('cancelled')));
  await first;
  assert.equal(h.read('state.busy'), true);
  assert.equal(h.node('#mode-select').disabled, true);
  assert.equal(h.read('state.lastRun'), null);
  assert.equal(h.timers.size, 1);
  h.requests[1].resolve(success(answer('current')));
  await second;
  assert.equal(h.read('state.result.marker'), 'current');
  assert.equal(h.read('state.busy'), false);
  assert.equal(h.timers.size, 0);
});

test('cancelled rejection cannot disturb a later success; busy retry preserves output', async () => {
  const h = harness();
  const first = h.run(); h.cancel();
  const second = h.run();
  h.requests[1].resolve(success(answer('current'))); await second;
  h.requests[0].reject(new Error('late transport error')); await first;
  assert.equal(h.read('state.result.marker'), 'current');
  assert.equal(h.node('#error').textContent, '');
  const third = h.run();
  h.requests[2].resolve({ ok: false, status: 409, json: async () => ({ error: 'busy' }) });
  await third;
  assert.equal(h.read('state.result.marker'), 'current');
  assert.match(h.node('#error').textContent, /повторите попытку позже/);
  assert.equal(h.read('state.busy'), false);
  assert.equal(h.timers.size, 0);
});

test('oversized selection retains the first eight photos in order', () => {
  const h = harness();
  h.read("state.images = []; addFiles(Array.from({ length: 10 }, (_, i) => ({ name: `photo-${i}.jpg`, type: 'image/jpeg', size: 100 })))");
  assert.deepEqual(Array.from(h.read('state.images.map(file => file.name)')), Array.from({ length: 8 }, (_, i) => `photo-${i}.jpg`));
  assert.match(h.node('#error').textContent, /8 из 10/);
});

test('adding too many fills remaining slots and preserves existing photos and result', () => {
  const h = harness();
  h.read("state.images = Array.from({ length: 5 }, (_, i) => ({ name: `old-${i}.jpg`, type: 'image/jpeg', size: 100 })); state.lastRun = { data: { marker: 'previous', options: options() } }; addFiles(Array.from({ length: 5 }, (_, i) => ({ name: `new-${i}.jpg`, type: 'image/jpeg', size: 100 })))");
  assert.deepEqual(Array.from(h.read('state.images.map(file => file.name)')), ['old-0.jpg', 'old-1.jpg', 'old-2.jpg', 'old-3.jpg', 'old-4.jpg', 'new-0.jpg', 'new-1.jpg', 'new-2.jpg']);
  assert.equal(h.read('state.lastRun.data.marker'), 'previous');
  assert.match(h.node('#error').textContent, /3 из 5/);
  h.read("addFiles([{ name: 'extra.jpg', type: 'image/jpeg', size: 100 }])");
  assert.equal(h.read('state.images.length'), 8);
  assert.equal(h.read('state.images[7].name'), 'new-2.jpg');
  h.read("state.images.splice(2, 1); addFiles([{ name: 'replacement.jpg', type: 'image/jpeg', size: 100 }])");
  assert.equal(h.read('state.images.length'), 8);
  assert.equal(h.read('state.images[7].name'), 'replacement.jpg');
  assert.equal(h.node('#error').hidden, true);
});

test('gallery keeps first twelve and ignored overflow cannot invalidate accepted photos', () => {
  const h = harness();
  h.read("state.gallery = []; addFiles(Array.from({ length: 14 }, (_, i) => ({ name: `gallery-${i}.jpg`, type: 'image/jpeg', size: 100 })), 'gallery')");
  assert.equal(h.read('state.gallery.length'), 12);
  assert.equal(h.read('state.gallery[11].name'), 'gallery-11.jpg');
  h.read("state.images = []; addFiles([...Array.from({ length: 8 }, (_, i) => ({ name: `photo-${i}.jpg`, type: 'image/jpeg', size: 100 })), { name: 'ignored.txt', type: 'text/plain', size: 100 }])");
  assert.equal(h.read('state.images.length'), 8);
  assert.match(h.node('#error').textContent, /8 из 9/);
});

test('language switching preserves state and retranslates an existing missing-photo error', async () => {
  const h = harness();
  h.read("state.mode = 'verify'; state.pair = [state.images[0], null]");
  await h.run();
  assert.equal(h.node('#error').textContent, 'Добавьте фото B для сравнения.');
  h.read("applyLanguage('en')");
  assert.equal(h.node('#page-title').textContent, 'Compare photographs');
  assert.equal(h.node('#error').textContent, 'Add photo B for comparison.');
  assert.equal(h.read('state.images[0].name'), 'selected.jpg');
  assert.equal(h.read('state.pair[0].name'), 'selected.jpg');
  h.read("applyLanguage('ru')");
  assert.equal(h.node('#error').textContent, 'Добавьте фото B для сравнения.');
});

test('English upload overflow and cancellation keep their message identity', () => {
  const h = harness();
  h.read("applyLanguage('en'); state.images = []; addFiles(Array.from({ length: 10 }, (_, i) => ({ name: `photo-${i}.jpg`, type: 'image/jpeg', size: 100 })))");
  assert.equal(h.read('state.images.length'), 8);
  assert.match(h.node('#error').textContent, /Added 8 of 10 new photos/);
  h.read("applyLanguage('ru')");
  assert.match(h.node('#error').textContent, /8 из 10/);
  h.read("showStatus(m('Фотографии возвращены.')); applyLanguage('en')");
  assert.equal(h.node('#status-message').textContent, 'Photos have been restored.');
});

test('server errors and numbers use the selected language', () => {
  const h = harness();
  h.read("I18n.setLanguage('en')");
  assert.equal(h.read("t(I18n.serverMessage('Лицо не найдено. Выберите чёткий снимок анфас или измените детектор.'))"), 'No face found. Choose a clear, front-facing photo or change the detector.');
  assert.equal(h.read("t(I18n.serverMessage('Настройка beard_threshold вне допустимого диапазона.'))"), 'The beard_threshold setting is outside its allowed range.');
  assert.doesNotMatch(h.read("t(I18n.serverMessage('Unexpected private detail'))"), /private detail|[А-Яа-яЁё]/);
  assert.equal(h.read('decimal(0.3681)'), '0.3681');
  h.read("I18n.setLanguage('ru')");
  assert.equal(h.read('decimal(0.3681)'), '0,3681');
});

test('language preference survives a new document and blocked storage is harmless', () => {
  const source = readFileSync(new URL('../web/i18n.js', import.meta.url), 'utf8');
  const saved = new Map();
  const storage = { getItem: (key) => saved.get(key), setItem: (key, value) => saved.set(key, value) };
  const first = vm.createContext({ localStorage: storage }); vm.runInContext(source, first);
  vm.runInContext("I18n.setLanguage('en')", first);
  const second = vm.createContext({ localStorage: storage }); vm.runInContext(source, second);
  assert.equal(vm.runInContext('I18n.language', second), 'en');
  const blocked = vm.createContext({ localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } });
  vm.runInContext(source, blocked); vm.runInContext("I18n.setLanguage('en')", blocked);
  assert.equal(vm.runInContext("I18n.t('Результаты')", blocked), 'Results');
});

test('catalogue covers static copy and preserves all interpolation slots', () => {
  const source = readFileSync(new URL('../web/i18n.js', import.meta.url), 'utf8');
  const english = JSON.parse(source.match(/const english = (\{[\s\S]*?\n\});/)[1]);
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  for (const [, raw] of html.matchAll(/data-i18n(?:-(?:aria-label|title|alt))?="([^"]+)"/g)) {
    const key = raw.replaceAll('&quot;', '"').replaceAll('&amp;', '&');
    assert.ok(Object.hasOwn(english, key), key);
  }
  for (const [key, value] of Object.entries(english)) {
    assert.ok(value.trim(), key);
    assert.doesNotMatch(value, /[А-Яа-яЁё]/, key);
    assert.deepEqual([...key.matchAll(/\{\d+\}/g)].map(([slot]) => slot).sort(), [...value.matchAll(/\{\d+\}/g)].map(([slot]) => slot).sort(), key);
  }
});

test('age estimates use Russian and English plural forms', () => {
  const h = harness();
  assert.equal(h.read('I18n.ageEstimate(1)'), '≈ 1 год');
  assert.equal(h.read('I18n.ageEstimate(2)'), '≈ 2 года');
  assert.equal(h.read('I18n.ageEstimate(5)'), '≈ 5 лет');
  assert.equal(h.read('I18n.ageEstimate(21)'), '≈ 21 год');
  h.read("I18n.setLanguage('en')");
  assert.equal(h.read('I18n.ageEstimate(1)'), '≈ 1 year');
  assert.equal(h.read('I18n.ageEstimate(21)'), '≈ 21 years');
});
