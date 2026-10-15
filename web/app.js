'use strict';

const t = I18n.t;
const m = I18n.message;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const modes = {
  analyze: { title: 'Анализ лица', description: 'Выберите фотографии и нужные модули. Результат будет показан для каждого найденного лица.', action: 'Запустить анализ', max: 8, settings: 'Модули анализа' },
  verify: { title: 'Сравнение фотографий', description: 'Добавьте два снимка. Модель сравнит признаки лиц и покажет расстояние между ними.', action: 'Сравнить фотографии', max: 2, settings: 'Параметры сравнения' },
  find: { title: 'Поиск в галерее', description: 'Выберите исходную фотографию и снимки галереи. Покажем совпадения по выбранной модели.', action: 'Найти совпадения', max: 1, settings: 'Параметры поиска' },
  extract: { title: 'Извлечение лиц', description: 'Найдите лица на фотографиях и скачайте отдельные выровненные фрагменты.', action: 'Извлечь лица', max: 8, settings: 'Параметры извлечения' },
  represent: { title: 'Эмбеддинги', description: 'Получите числовой вектор признаков для каждого лица. Векторы можно посмотреть и скачать в JSON.', action: 'Получить эмбеддинги', max: 8, settings: 'Параметры вектора' },
};
const state = { mode: 'analyze', images: [], pair: [null, null], gallery: [], result: null, lastRun: null, drafts: {}, busy: false, request: null, undoReset: null, stream: null, cameraToken: 0, previewURLs: [], resultURLs: [], disabled: [], health: null, photoContext: '', errorMessage: null, statusMessage: null, resultNotice: null, setupMessage: null };
const emotionLabels = { angry: 'Нахмуренное', disgust: 'Отвращение', fear: 'Испуг', happy: 'Улыбка', sad: 'Грусть', surprise: 'Удивление', neutral: 'Нейтральное' };
const metricLabels = { cosine: 'Cosine', euclidean: 'Euclidean', euclidean_l2: 'Euclidean L2', angular: 'Angular' };
const actionLabels = { beard: 'Борода', emotion: 'Выражение лица', age: 'Возраст', gender: 'Визуальные классы', Timhalland: 'Timhalland' };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function showError(message) { state.errorMessage = message; $('#error').textContent = t(message); $('#error').hidden = false; $('#error').focus({ preventScroll: false }); }
function clearError() { state.errorMessage = null; $('#error').hidden = true; $('#error').textContent = ''; }
function clearStatus() { state.statusMessage = null; state.undoReset = null; $('#work-status').hidden = true; $('#undo-clear').hidden = true; }
function showStatus(message, undo = false) {
  state.statusMessage = message; $('#status-message').textContent = t(message); $('#work-status').hidden = false; $('#undo-clear').hidden = !undo;
}
function revoke(urls) { urls.forEach((url) => URL.revokeObjectURL(url)); urls.length = 0; }
function percent(value) { return `${(value * 100).toLocaleString(I18n.locale, { maximumFractionDigits: 1 })}%`; }
function decimal(value) { return typeof value === 'number' ? value.toLocaleString(I18n.locale, { maximumFractionDigits: 4 }) : String(value ?? '—'); }
function imageURL(file, collection) { const url = URL.createObjectURL(file); collection.push(url); return url; }
function removeIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', 'm6 6 12 12M6 18 18 6'); svg.append(path); return svg;
}

function renderPreviews() {
  revoke(state.previewURLs);
  for (const key of ['images', 'gallery']) {
    const container = $(key === 'images' ? '#previews' : '#gallery-previews');
    container.replaceChildren();
    container.classList.toggle('is-single', key === 'images' && state.images.length === 1);
    if (key === 'images' && state.mode === 'verify') continue;
    state[key].forEach((file, index) => {
      const card = el('div', 'preview'); const image = el('img');
      image.src = imageURL(file, state.previewURLs); image.alt = file.name;
      const remove = el('button', 'remove-file'); remove.type = 'button'; remove.disabled = state.busy;
      remove.setAttribute('aria-label', t`Удалить ${file.name}`); remove.append(removeIcon());
      remove.addEventListener('click', () => { clearStatus(); state[key].splice(index, 1); state.photoContext = ''; renderPreviews(); });
      const filename = el('span', 'preview-name', file.name); filename.title = file.name;
      card.append(image, el('span', 'preview-number', String(index + 1)), remove, filename); container.append(card);
    });
  }
  for (const [index, name] of ['a', 'b'].entries()) {
    const file = state.mode === 'verify' ? state.pair[index] : null;
    const image = $(`#pair-${name}-preview`); image.hidden = !file;
    if (file) { image.src = imageURL(file, state.previewURLs); image.alt = t`Фото ${name.toUpperCase()}: ${file.name}`; } else image.removeAttribute('src');
    $(`#pair-${name}-drop`).classList.toggle('has-file', Boolean(file));
    $(`#pair-${name}-prompt`).textContent = t`${file ? t('Заменить') : t('Выбрать')} фото ${name.toUpperCase()}`;
    $(`#pair-${name}-name`).textContent = file ? file.name : '';
    $(`#pair-${name}-remove`).hidden = !file;
  }
  $('#selection-count').textContent = state.images.length ? t`Фото: ${state.images.length}${state.mode === 'verify' ? t(' из 2') : ''}` : t('Фото не выбраны');
  $('#dropzone').classList.toggle('has-files', state.images.length > 0);
  $('#drop-title').textContent = t('Добавьте фото');
  $('#dropzone .choose-label').textContent = state.images.length ? t('Добавить фотографии') : t('Выбрать фото');
  $('#photo-context').textContent = t(state.photoContext); $('#photo-context').hidden = !state.photoContext;
  updateRunContext(); updateResultContext();
}

function validateFiles(incoming) {
  if (incoming.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) { showError(m('Выберите изображения JPG, PNG или WebP.')); return false; }
  if (incoming.some((file) => file.size > 10 * 1024 * 1024)) { showError(m('Один из файлов больше 10 МБ. Выберите фотографию меньшего размера.')); return false; }
  return true;
}
function addFiles(files, key = 'images', slot = null) {
  if (state.busy) return;
  clearError(); const incoming = [...files]; if (!incoming.length) return;
  let overflowMessage = '';
  if (key === 'images' && state.mode === 'verify') {
    if (!validateFiles(incoming)) return;
    if (slot !== null) {
      if (incoming.length !== 1) { showError(m('Выберите одно фото для этой стороны сравнения.')); return; }
      state.pair[slot] = incoming[0];
    } else {
      if (state.images.length + incoming.length > 2) { showError(m('Для сравнения нужны два фото. Удалите или замените один из снимков.')); return; }
      incoming.forEach((file) => { state.pair[state.pair.findIndex((item) => item === null)] = file; });
    }
    state.images = state.pair.filter(Boolean);
  } else {
    const max = key === 'images' ? modes[state.mode].max : 12;
    const accepted = incoming.slice(0, Math.max(0, max - state[key].length));
    if (!accepted.length) { showError(m`Можно добавить не больше ${max} фото. Уже выбранные фото сохранены. Удалите ненужные, чтобы освободить место для новых.`); return; }
    if (!validateFiles(accepted)) return;
    state[key].push(...accepted);
    if (accepted.length < incoming.length) overflowMessage = m`Можно добавить не больше ${max} фото. Из новых фото добавлено: ${accepted.length} из ${incoming.length}. Остальные пропущены.`;
  }
  clearStatus(); state.photoContext = ''; renderPreviews();
  if (overflowMessage) showError(overflowMessage);
}
function stopCamera() {
  state.cameraToken += 1;
  if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null; $('#camera-video').srcObject = null; $('#camera-panel').hidden = true;
}

function options() {
  return {
    actions: $$('input[name=action]:checked').map((input) => input.value), model_name: $('#model').value,
    detector_backend: $('#detector').value, distance_metric: $('#metric').value, align: $('#align').checked,
    enforce_detection: $('#enforce').checked, anti_spoofing: $('#antispoof').checked,
    expand_percentage: Number($('#expand').value), beard_threshold: Number($('#beard-threshold').value) / 100,
  };
}
function applyOptions(values) {
  if (!values) return;
  $$('input[name=action]').forEach((input) => { input.checked = values.actions.includes(input.value); });
  for (const [id, key] of [['model', 'model_name'], ['detector', 'detector_backend'], ['metric', 'distance_metric'], ['expand', 'expand_percentage']]) $(`#${id}`).value = values[key];
  for (const [id, key] of [['align', 'align'], ['enforce', 'enforce_detection'], ['antispoof', 'anti_spoofing']]) $(`#${id}`).checked = values[key];
  $('#beard-threshold').value = Math.round(values.beard_threshold * 100);
}
function updateSettingsSummary() {
  const threshold = `${$('#beard-threshold').value}%`;
  $('#threshold-value').textContent = threshold; $('#threshold-summary').textContent = threshold;
  const metric = $('#metric').selectedOptions[0].textContent;
  $('#model-summary').textContent = `${$('#model').value}${state.mode === 'represent' ? '' : ` · ${metric}`}`;
}
function updateRunContext() {
  const count = state.images.length; const actionCount = $$('input[name=action]:checked').length;
  $('#run-context').textContent = state.busy ? t('Идёт обработка фотографий…')
    : count ? t`Фото: ${count}${state.mode === 'find' ? t` · В галерее: ${state.gallery.length}` : state.mode === 'analyze' ? t` · Модули: ${actionCount}` : ''}`
    : state.mode === 'verify' ? t('Добавьте фото A и фото B.') : state.mode === 'find' ? t('Добавьте исходное фото и галерею.') : t('Добавьте фотографии для обработки.');
  const label = state.busy ? t('Обработка…') : t(modes[state.mode].action);
  $('#run-label').textContent = label; $('#mobile-run-label').textContent = label;
  updateSettingsSummary();
}
function sameFiles(left, right) { return left.length === right.length && left.every((file, index) => file === right[index]); }
function resultInputsChanged() {
  if (!state.lastRun) return false;
  if (!sameFiles(state.images, state.lastRun.inputFiles) || (state.mode === 'find' && !sameFiles(state.gallery, state.lastRun.galleryFiles))) return true;
  const keys = ['detector_backend', 'align', 'enforce_detection', 'anti_spoofing', 'expand_percentage'];
  if (state.mode === 'analyze') keys.push('actions', 'beard_threshold'); else keys.push('model_name');
  if (['verify', 'find'].includes(state.mode)) keys.push('distance_metric');
  const current = options(); const previous = state.lastRun.data.options;
  return keys.some((key) => JSON.stringify(current[key]) !== JSON.stringify(previous[key]));
}
function updateResultContext(message = null) {
  state.resultNotice = message;
  const stale = state.lastRun && resultInputsChanged();
  $('#result-context').textContent = message ? t(message) : (stale ? t('Фото или настройки изменены. Ниже показан предыдущий результат. Запустите обработку, чтобы обновить его.') : '');
  $('#result-context').hidden = !$('#result-context').textContent;
}
function emptyResults(message = m('Результаты появятся после запуска обработки.')) {
  const block = el('div', 'empty-state'); block.append(el('p', '', t(message))); $('#results').replaceChildren(block);
  $('#export').hidden = true; $('#edit-settings').hidden = true; $('#elapsed').textContent = ''; $('#result-summary').textContent = ''; $('#result-context').hidden = true;
}
function showLastResult() {
  revoke(state.resultURLs);
  if (!state.lastRun) { state.result = null; emptyResults(); return; }
  const { data, inputFiles, galleryFiles } = state.lastRun; state.result = data;
  renderResults(data, inputFiles, galleryFiles);
  $('#elapsed').textContent = t`${decimal(data.elapsed_seconds)} с`; $('#export').hidden = false; $('#edit-settings').hidden = false;
  $('#result-summary').textContent = data.mode === 'analyze' ? data.options.actions.map((key) => actionLabels[key] ? t(actionLabels[key]) : key).join(' · ')
    : ['verify', 'find'].includes(data.mode) ? `${data.options.model_name} · ${metricLabels[data.options.distance_metric] || data.options.distance_metric}`
    : data.mode === 'represent' ? data.options.model_name : t('Найденные лица и фрагменты');
  updateResultContext();
}
function saveDraft() {
  state.drafts[state.mode] = { images: [...state.images], pair: [...state.pair], gallery: [...state.gallery], lastRun: state.lastRun,
    options: options(), advancedOpen: $('#advanced').open, modelOpen: $('#recognition-advanced').open, thresholdOpen: $('#threshold-options').open };
}
function refreshModeText() {
  const mode = state.mode; const config = modes[mode];
  $('#page-title').textContent = t(config.title); $('#page-description').textContent = t(config.description);
  $('#upload-title').textContent = mode === 'verify' ? t('Два снимка') : mode === 'find' ? t('Исходная фотография') : t('Фотографии');
  $('#upload-hint').textContent = t`JPG, PNG, WebP · до 10 МБ · ${config.max === 1 ? t('1 исходное фото') : t`до ${config.max} фото`}`;
  $('#images').multiple = config.max > 1;
  $('#dropzone').hidden = mode === 'verify'; $('#previews').hidden = mode === 'verify'; $('#pair-inputs').hidden = mode !== 'verify';
  $('#gallery-panel').hidden = mode !== 'find'; $('#analysis-options').hidden = mode !== 'analyze';
  $('#recognition-options').hidden = !['verify', 'find', 'represent'].includes(mode); $('.metric-field').hidden = mode === 'represent';
  $('#settings-title').textContent = t(config.settings);
  $('#model-label').textContent = mode === 'represent' ? t('Модель признаков') : mode === 'find' ? t('Модель поиска') : t('Модель сравнения');
  $('#recognition-advanced > summary [data-i18n]').textContent = mode === 'represent' ? t('Модель признаков ') : t('Модель и метрика ');
  $('#recognition-help').textContent = mode === 'represent' ? t('По умолчанию используется SFace. Размер вектора зависит от выбранной модели.') : t('По умолчанию используются SFace и Cosine. Другие варианты доступны ниже.');
}
function setMode(mode) {
  if (!Object.hasOwn(modes, mode) || state.busy || state.mode === mode) return;
  const source = [...state.images]; saveDraft(); stopCamera(); clearError(); clearStatus();
  state.mode = mode; const saved = state.drafts[mode]; const config = modes[mode];
  state.images = saved ? [...saved.images] : source.slice(0, config.max);
  state.pair = mode === 'verify' ? saved ? [...saved.pair] : [state.images[0] || null, state.images[1] || null] : [null, null];
  state.gallery = saved ? [...saved.gallery] : [];
  state.lastRun = saved ? saved.lastRun : null; state.result = state.lastRun?.data || null;
  state.photoContext = saved ? state.images.length ? m('Восстановлены фотографии этого режима.') : ''
    : source.length > config.max ? config.max === 1 ? m('Для поиска взято первое фото. Остальные сохранены в предыдущем режиме.') : m('Для сравнения взяты первые два фото. Остальные сохранены в предыдущем режиме.')
    : state.images.length ? m('Фотографии перенесены из предыдущего режима.') : '';
  applyOptions(saved?.options);
  refreshModeText();
  $('#advanced').open = saved ? saved.advancedOpen : mode === 'extract';
  $('#recognition-advanced').open = saved ? saved.modelOpen : false; $('#threshold-options').open = saved ? saved.thresholdOpen : false;
  $('#mode-select').value = mode;
  $$('.nav-item').forEach((button) => { const active = button.dataset.mode === mode; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  renderPreviews(); showLastResult(); $('#page-title').focus({ preventScroll: true });
}
function resetMode() {
  if (state.busy || (!state.images.length && !state.gallery.length && !state.lastRun)) return;
  state.undoReset = { mode: state.mode, images: [...state.images], pair: [...state.pair], gallery: [...state.gallery], lastRun: state.lastRun, photoContext: state.photoContext };
  stopCamera(); state.images = []; state.pair = [null, null]; state.gallery = []; state.lastRun = null; state.result = null; state.photoContext = '';
  renderPreviews(); showLastResult(); clearError();
  showStatus(m('Фото и результат этого режима очищены. Можно вернуть их до следующего изменения.'), true);
  $('#undo-clear').focus({ preventScroll: false });
}
function undoReset() {
  const saved = state.undoReset;
  if (state.busy || !saved || saved.mode !== state.mode) return;
  state.images = [...saved.images]; state.pair = [...saved.pair]; state.gallery = [...saved.gallery]; state.lastRun = saved.lastRun; state.photoContext = saved.photoContext;
  clearStatus(); renderPreviews(); showLastResult(); showStatus(state.lastRun ? m('Фотографии и предыдущий результат возвращены.') : m('Фотографии возвращены.'));
  $('#clear').focus({ preventScroll: false });
}
function setBusy(busy) {
  state.busy = busy;
  if (busy) {
    state.disabled = $$('form input, form select, form button:not(.cancel-request), .nav-item, #mobile-run, #mode-select, #edit-settings, #language-select').map((control) => [control, control.disabled]);
    state.disabled.forEach(([control]) => { control.disabled = true; });
  } else { state.disabled.forEach(([control, wasDisabled]) => { control.disabled = wasDisabled; }); state.disabled = []; }
  $('#run-button').hidden = busy; $('#mobile-run').hidden = busy;
  $('#cancel-run').hidden = !busy; $('#mobile-cancel').hidden = !busy;
  $('#run-help').textContent = busy ? t('Отмена ожидания сохранит фото и настройки. Вычисления на сервере могут продолжаться.') : t('Первый запуск модели может занять больше времени.');
  $('#processing').hidden = !busy; $('#results-section').setAttribute('aria-busy', String(busy)); updateRunContext();
}
function updateRunningTime(request) {
  if (state.request !== request) return;
  const seconds = Math.floor((performance.now() - request.startedAt) / 1000);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  $('#run-context').textContent = t`Идёт обработка · ${time}`;
  $('#processing-elapsed').textContent = time; $('#mobile-cancel-time').textContent = time;
}
function finishRequest(request) {
  if (state.request !== request) return;
  clearInterval(request.timer); state.request = null; setBusy(false);
}
function cancelRequest() {
  const request = state.request; if (!request) return;
  request.controller.abort(); finishRequest(request); showLastResult();
  if (state.lastRun) updateResultContext(m('Новый запуск отменён. Ниже сохранён результат предыдущего запуска.'));
  showStatus(m('Ожидание отменено. Фото и настройки сохранены. Начатая обработка на сервере может продолжаться. Если сервер занят, повторите запуск позже.'));
  $('#work-status').focus({ preventScroll: false });
}

function resultFile(name, subtitle) { const article = el('article', 'result-file'); const title = el('h3', '', name); if (subtitle) title.append(el('span', '', subtitle)); article.append(title); return article; }
function appendAttribute(container, label, value) { const item = el('div', 'attribute'); item.append(el('dt', '', label), el('dd', '', value)); container.append(item); }
function probabilityList(title, scores, translate = (key) => key) {
  const details = el('details', 'probabilities'); details.append(el('summary', '', title));
  Object.entries(scores).sort((a, b) => b[1] - a[1]).forEach(([label, score]) => {
    const row = el('div', 'probability-row'); row.append(el('span', '', translate(label)), el('span', '', `${score.toLocaleString(I18n.locale, { maximumFractionDigits: 2 })}%`)); details.append(row);
  }); return details;
}
function renderFace(face, filename, mode) {
  const row = el('div', 'face-result'); const crop = el('figure', 'face-crop'); const image = el('img'); image.src = face.crop; image.alt = t`Лицо ${face.index} на ${filename}`;
  crop.append(image, el('figcaption', '', t`Лицо ${face.index}`)); const content = el('div', 'face-details');
  const attrs = face.attributes || {}; let primaryAttribute = null;
  if (face.beard) {
    content.append(el('p', 'face-title', t('Наличие бороды')), el('h4', 'beard-answer', face.beard.has_beard ? t('Борода обнаружена') : t('Борода не обнаружена')));
    const score = el('div', 'score-row'); const meter = el('meter'); meter.min = 0; meter.max = 1; meter.value = face.beard.score;
    meter.setAttribute('aria-label', t`Оценка класса Beard: ${percent(face.beard.score)}`); score.append(meter, el('span', '', percent(face.beard.score)));
    content.append(score, el('p', 'score-help', t`Оценка класса Beard · порог ${percent(face.beard.threshold)}`));
  } else if (mode === 'extract') { content.append(el('h4', 'face-answer', t('Фрагмент лица готов'))); }
  else {
    const candidates = [
      ['dominant_emotion', t('Выражение лица'), emotionLabels[attrs.dominant_emotion] ? t(emotionLabels[attrs.dominant_emotion]) : attrs.dominant_emotion],
      ['age', t('Видимый возраст'), attrs.age === undefined ? undefined : I18n.ageEstimate(attrs.age)],
      ['dominant_gender', t('Визуальный класс модели'), attrs.dominant_gender], ['dominant_Timhalland', 'Timhalland', attrs.dominant_Timhalland],
    ];
    const first = candidates.find(([, , value]) => value !== undefined);
    if (first) { primaryAttribute = first[0]; content.append(el('p', 'face-title', first[1]), el('h4', 'face-answer', first[2])); }
    else content.append(el('h4', 'face-answer', face.errors?.length ? t('Оценка не получена') : t('Лицо найдено')));
  }
  const list = el('dl', 'attributes');
  if (attrs.age !== undefined && primaryAttribute !== 'age') appendAttribute(list, t('Видимый возраст'), I18n.ageEstimate(attrs.age));
  if (attrs.dominant_emotion && primaryAttribute !== 'dominant_emotion') appendAttribute(list, t('Выражение лица'), emotionLabels[attrs.dominant_emotion] ? t(emotionLabels[attrs.dominant_emotion]) : attrs.dominant_emotion);
  if (attrs.dominant_gender && primaryAttribute !== 'dominant_gender') appendAttribute(list, t('Визуальный класс модели'), attrs.dominant_gender);
  if (attrs.dominant_Timhalland && primaryAttribute !== 'dominant_Timhalland') appendAttribute(list, 'Timhalland', attrs.dominant_Timhalland);
  if (face.is_real !== undefined) appendAttribute(list, t('Подлинность снимка'), face.is_real ? t('Проверка пройдена') : t('Снимок отклонён'));
  content.append(list);
  const region = face.region || {}; content.append(el('p', 'face-meta', t`Область лица: ${region.w} × ${region.h} px`));
  const download = el('a', 'crop-download', t('Скачать фрагмент лица'));
  const cropBytes = Uint8Array.from(atob(face.crop.split(',')[1]), (character) => character.charCodeAt(0));
  download.href = imageURL(new Blob([cropBytes], { type: 'image/jpeg' }), state.resultURLs); download.download = `face-${face.index}.jpg`; content.append(download);
  if (attrs.emotion) content.append(probabilityList(t('Все оценки выражения лица'), attrs.emotion, (key) => emotionLabels[key] ? t(emotionLabels[key]) : key));
  if (attrs.gender) content.append(probabilityList(t('Оценки визуальных классов'), attrs.gender));
  if (attrs.Timhalland) content.append(probabilityList(t('Оценки Timhalland'), attrs.Timhalland));
  (face.errors || []).forEach((error) => content.append(el('p', 'result-error', `${actionLabels[error.module] ? t(actionLabels[error.module]) : error.module === 'anti_spoofing' ? t('Проверка подлинности снимка') : error.module}: ${t(I18n.serverMessage(error.message))}`)));
  row.append(crop, content); return row;
}
function annotatedImage(item, file) {
  if (!file || !item.faces?.length) return null;
  const figure = el('div', 'annotation'); const image = el('img'); image.src = imageURL(file, state.resultURLs); image.alt = t`Обнаруженные лица: ${item.faces.length}`; figure.append(image);
  item.faces.forEach((face) => {
    const box = el('div', 'face-box'); const r = face.region;
    box.style.left = `${r.x / item.width * 100}%`; box.style.top = `${r.y / item.height * 100}%`;
    box.style.width = `${r.w / item.width * 100}%`; box.style.height = `${r.h / item.height * 100}%`;
    box.append(el('span', '', String(face.index))); figure.append(box);
  }); return figure;
}
function comparisonPhotos(files) {
  const photos = el('div', 'comparison-photos');
  files.forEach((file, index) => { const figure = el('figure'); const image = el('img'); image.src = imageURL(file, state.resultURLs); image.alt = t`Фото ${index === 0 ? 'A' : 'B'}: ${file.name}`; figure.append(image, el('figcaption', '', t`Фото ${index === 0 ? 'A' : 'B'}`)); photos.append(figure); }); return photos;
}
function renderResults(data, inputFiles, galleryFiles) {
  const container = $('#results'); container.replaceChildren();
  if (data.comparison) {
    const article = resultFile(data.files.join(' / '), data.options.model_name); const comparison = el('div', 'comparison'); const layout = el('div', 'comparison-layout'); const content = el('div'); const result = data.comparison;
    content.append(el('h4', 'comparison-answer', result.verified ? t('Модель нашла совпадение') : t('Совпадение не найдено')), el('p', '', t('Расстояние между признаками лиц: меньше — ближе. Это не процент совпадения.')));
    const list = el('dl'); appendAttribute(list, t('Расстояние'), decimal(result.distance)); appendAttribute(list, t('Порог совпадения'), decimal(result.threshold)); appendAttribute(list, t('Метрика'), metricLabels[data.options.distance_metric] || data.options.distance_metric); content.append(list);
    layout.append(content, comparisonPhotos(inputFiles)); comparison.append(layout); article.append(comparison); container.append(article); return;
  }
  if (data.matches) {
    if (!data.matches.length) container.append(el('p', 'result-note', t('В исходной фотографии не найдено лиц для поиска.')));
    data.matches.forEach((matches, faceIndex) => {
      const article = resultFile(t`Совпадения для лица ${faceIndex + 1}`, t`В галерее: ${data.gallery_count}`);
      if (!matches.length) article.append(el('p', 'result-note', t('В галерее нет лиц с расстоянием ниже порога выбранной модели.')));
      else {
        const scroll = el('div', 'table-scroll'); const table = el('table', 'data-table'); const head = el('thead'); const header = el('tr');
        [t('Фото'), t('Файл'), t('Расстояние'), t('Порог')].forEach((label) => header.append(el('th', '', label))); head.append(header); const body = el('tbody');
        matches.forEach((match) => { const row = el('tr'); const photoCell = el('td'); const file = galleryFiles[match.gallery_index]; if (file) { const image = el('img'); image.src = imageURL(file, state.resultURLs); image.alt = ''; photoCell.append(image); } row.append(photoCell, el('td', '', match.identity), el('td', '', decimal(match.distance)), el('td', '', decimal(match.threshold))); body.append(row); });
        table.append(head, body); scroll.append(table); article.append(scroll);
      } container.append(article);
    }); return;
  }
  (data.results || []).forEach((item, index) => {
    const article = resultFile(item.filename, item.faces ? t`Лиц: ${item.faces.length}` : t('Обработка не выполнена'));
    if (item.error) article.append(el('p', 'result-error', t(I18n.serverMessage(item.error))));
    else if (data.mode === 'represent') {
      item.faces.forEach((face, faceIndex) => { const content = el('div', 'embedding'); content.append(el('p', 'face-title', t`Лицо ${faceIndex + 1}`), el('p', 'embedding-title', t`${face.embedding.length} признаков`)); const details = el('details'); details.append(el('summary', '', t('Посмотреть вектор')), el('pre', '', JSON.stringify(face.embedding, null, 2))); content.append(details); article.append(content); });
      if (!item.faces.length) article.append(el('p', 'result-note', t('На этом снимке лица не найдены.')));
    } else {
      const body = el('div', 'result-body'); const faces = el('div', 'face-list'); item.faces.forEach((face) => faces.append(renderFace(face, item.filename, data.mode)));
      if (!item.faces.length) faces.append(el('p', 'result-note', t('На этом снимке лица не найдены.')));
      body.append(faces);
      const annotated = annotatedImage(item, inputFiles[index]);
      if (annotated) { const source = el('details', 'result-source'); source.open = window.matchMedia('(min-width: 761px)').matches; source.append(el('summary', '', t('Исходное фото и области лиц')), annotated); body.append(source); }
      else body.classList.add('without-source');
      article.append(body);
    } container.append(article);
  });
}

$('#work-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (state.busy) return; clearError();
  if (state.mode === 'verify') {
    const missing = ['A', 'B'].filter((_, index) => !state.pair[index]);
    if (missing.length) { showError(missing.length === 2 ? m('Добавьте фото A и фото B для сравнения.') : m`Добавьте фото ${missing[0]} для сравнения.`); return; }
  }
  if (!state.images.length) { showError(m('Добавьте фотографию перед запуском проверки.')); return; }
  if (state.mode === 'find' && !state.gallery.length) { showError(m('Добавьте фотографии в галерею для поиска.')); return; }
  const selectedOptions = options();
  if (state.mode === 'analyze' && !selectedOptions.actions.length) { showError(m('Выберите хотя бы один модуль анализа.')); return; }
  if (!selectedOptions.actions.length) selectedOptions.actions = ['beard'];
  const inputFiles = [...state.images], galleryFiles = [...state.gallery]; const form = new FormData();
  form.append('mode', state.mode); form.append('options', JSON.stringify(selectedOptions)); inputFiles.forEach((file) => form.append('images', file)); galleryFiles.forEach((file) => form.append('gallery', file));
  clearStatus(); stopCamera(); revoke(state.resultURLs); $('#results').replaceChildren(); $('#export').hidden = true; $('#edit-settings').hidden = true; $('#elapsed').textContent = ''; $('#result-summary').textContent = ''; $('#result-context').hidden = true;
  const request = { controller: new AbortController(), startedAt: performance.now(), timer: null };
  state.request = request; setBusy(true); updateRunningTime(request);
  request.timer = setInterval(() => updateRunningTime(request), 1000);
  $(window.matchMedia('(max-width: 640px)').matches ? '#mobile-cancel' : '#cancel-run').focus({ preventScroll: true });
  try {
    const response = await fetch('/api/run', { method: 'POST', body: form, signal: request.controller.signal }); const data = await response.json();
    if (state.request !== request) return;
    if (!response.ok) throw new Error(response.status === 409 ? 'Сервер ещё обрабатывает предыдущий запуск. Фото сохранены — повторите попытку позже.' : data.error || 'Проверка не выполнена. Повторите попытку.');
    state.lastRun = { data, inputFiles, galleryFiles }; showLastResult();
    $('#results-title').focus({ preventScroll: true }); $('#results-section').scrollIntoView({ behavior: 'auto', block: 'start' });
  } catch (error) {
    if (state.request !== request) return;
    showLastResult();
    if (state.lastRun) updateResultContext(m('Новый запуск не выполнен. Ниже сохранён результат предыдущего запуска.'));
    showError(error instanceof TypeError || error instanceof SyntaxError ? m('Нет ответа от локального сервера. Проверьте, что start.cmd запущен, и повторите попытку.') : I18n.serverMessage(error.message));
  } finally { finishRequest(request); }
});

$$('.nav-item').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
$('#mode-select').addEventListener('change', (event) => setMode(event.target.value));
$('#images').addEventListener('change', (event) => { addFiles(event.target.files); event.target.value = ''; });
$('#gallery').addEventListener('change', (event) => { addFiles(event.target.files, 'gallery'); event.target.value = ''; });
for (const [index, name] of ['a', 'b'].entries()) {
  $(`#pair-${name}`).addEventListener('change', (event) => { addFiles(event.target.files, 'images', index); event.target.value = ''; });
  $(`#pair-${name}-remove`).addEventListener('click', () => { if (state.busy) return; clearStatus(); state.pair[index] = null; state.images = state.pair.filter(Boolean); state.photoContext = ''; renderPreviews(); });
}
$('#clear').addEventListener('click', resetMode);
$('#undo-clear').addEventListener('click', undoReset);
$$('.cancel-request').forEach((button) => button.addEventListener('click', cancelRequest));
$('#edit-settings').addEventListener('click', () => {
  if (state.busy) return;
  $('#settings-title').focus({ preventScroll: true }); $('.settings-panel').scrollIntoView({ behavior: 'auto', block: 'start' });
});
$('#work-form').addEventListener('input', () => { clearStatus(); updateRunContext(); updateResultContext(); });
$('#work-form').addEventListener('change', () => { clearStatus(); updateRunContext(); updateResultContext(); });
for (const zone of [$('#dropzone'), $('#pair-a-drop'), $('#pair-b-drop')]) {
  ['dragenter', 'dragover'].forEach((name) => zone.addEventListener(name, (event) => { event.preventDefault(); if (!state.busy) zone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((name) => zone.addEventListener(name, (event) => { event.preventDefault(); zone.classList.remove('dragover'); }));
  zone.addEventListener('drop', (event) => { const slot = zone.id === 'pair-a-drop' ? 0 : zone.id === 'pair-b-drop' ? 1 : null; addFiles(event.dataTransfer.files, 'images', slot); });
}
$('#camera-open').addEventListener('click', async () => {
  if (state.busy || state.stream) return; clearError();
  if (state.images.length >= modes[state.mode].max) { showError(m('Сначала удалите одну из выбранных фотографий, чтобы добавить снимок с камеры.')); return; }
  if (!navigator.mediaDevices?.getUserMedia) { showError(m('Камера недоступна в этом браузере. Откройте сайт через localhost или загрузите файл.')); return; }
  $('#camera-open').disabled = true; const ticket = ++state.cameraToken;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    if (ticket !== state.cameraToken || state.busy || document.hidden) { stream.getTracks().forEach((track) => track.stop()); return; }
    state.stream = stream; $('#camera-video').srcObject = stream; $('#camera-panel').hidden = false;
  } catch (error) {
    if (ticket === state.cameraToken) showError(error.name === 'NotAllowedError' ? m('Доступ к камере не разрешён. Разрешите его в браузере или загрузите фотографию.') : m('Не удалось открыть камеру. Проверьте её подключение или загрузите фотографию.'));
  } finally { $('#camera-open').disabled = state.busy; }
});
$('#camera-close').addEventListener('click', stopCamera);
$('#camera-capture').addEventListener('click', () => {
  const video = $('#camera-video'); if (!video.videoWidth) { showError(m('Камера ещё запускается. Подождите несколько секунд.')); return; }
  const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d').drawImage(video, 0, 0);
  const modeAtCapture = state.mode;
  canvas.toBlob((blob) => { if (blob && !state.busy && state.mode === modeAtCapture) addFiles([new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })]); stopCamera(); }, 'image/jpeg', 0.92);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
window.addEventListener('pagehide', () => { if (state.request) cancelRequest(); clearStatus(); stopCamera(); revoke(state.previewURLs); revoke(state.resultURLs); });
window.addEventListener('pageshow', (event) => { if (event.persisted) { renderPreviews(); showLastResult(); } });
$('#export').addEventListener('click', () => {
  if (!state.result) return;
  const blob = new Blob([JSON.stringify(state.result, null, 2)], { type: 'application/json;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = el('a'); link.href = url; link.download = `qaras-${state.result.mode}-${Date.now()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
async function health() {
  try {
    const response = await fetch('/api/health'); if (!response.ok) throw new Error('health'); const data = await response.json(); state.health = data;
    if (data.timhalland_ready) { const control = $('input[value=Timhalland]'); const saved = state.disabled.find(([item]) => item === control); if (saved) saved[1] = false; else control.disabled = false; $('#timhalland-label').classList.remove('unavailable'); $('#timhalland-hint').textContent = t('Пользовательская модель · 6 классов'); }
    if (!data.ready || !data.beard_downloaded) { state.setupMessage = m('Установка моделей ещё не завершена. Запустите install.ps1 из папки проекта и обновите страницу.'); $('#setup-notice').textContent = t(state.setupMessage); $('#setup-notice').hidden = false; }
  } catch (_) { state.setupMessage = m('Сервер недоступен. Запустите start.cmd из папки проекта и обновите страницу.'); $('#setup-notice').textContent = t(state.setupMessage); $('#setup-notice').hidden = false; }
}
function applyLanguage(next, persist = true) {
  if (state.busy) return;
  const notice = state.resultNotice;
  const expanded = $$('#results details').map((details) => details.open);
  if (persist) I18n.setLanguage(next);
  I18n.translateDocument(); $('#language-select').value = I18n.language;
  refreshModeText(); renderPreviews(); showLastResult();
  $$('#results details').forEach((details, index) => { if (index < expanded.length) details.open = expanded[index]; });
  if (state.lastRun) updateResultContext(notice);
  if (state.errorMessage) $('#error').textContent = t(state.errorMessage);
  if (state.statusMessage) $('#status-message').textContent = t(state.statusMessage);
  if (state.setupMessage) $('#setup-notice').textContent = t(state.setupMessage);
  if (state.health?.timhalland_ready) $('#timhalland-hint').textContent = t('Пользовательская модель · 6 классов');
}
$('#language-select').addEventListener('change', (event) => applyLanguage(event.target.value));
applyLanguage(I18n.language, false); health();
