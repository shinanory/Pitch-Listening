import { instrumentName, getInstruments, getVolume, setVolume, getInstrumentVolume, setInstrumentVolume } from './audio.js';

const $ = id => document.getElementById(id);

const screens = {
  loading: $('loading-screen'),
  start:   $('start-screen'),
  preview: $('preview-screen'),
  game:    $('game-screen'),
  result:  $('result-screen'),
};

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle('hidden', key !== name);
  });
}

export function showLoading(text) {
  showScreen('loading');
  $('loading-text').textContent = text;
}

export function showStart() {
  showScreen('start');
}

export function showPreview() {
  showScreen('preview');
}

export function renderPreviewInstruments(instruments, selectedId, onSelect) {
  const wrap = $('preview-instruments');
  wrap.innerHTML = '';
  instruments.forEach(id => {
    const btn = document.createElement('button');
    btn.className = 'instr-tab' + (id === selectedId ? ' active' : '');
    btn.textContent = instrumentName(id);
    btn.addEventListener('click', () => onSelect(id));
    wrap.appendChild(btn);
  });
}

export function renderPreviewNotes(notes, onNote) {
  const wrap = $('preview-notes');
  wrap.innerHTML = '';
  notes.forEach(({ midi, name }) => {
    const btn = document.createElement('button');
    btn.className = 'note-key';
    btn.textContent = name;
    btn.addEventListener('click', () => onNote(midi));
    wrap.appendChild(btn);
  });
}

export function showGame() {
  showScreen('game');
}

export function showResult(correct, result, notes) {
  const screen = $('result-screen');
  screen.className = 'screen ' + (correct ? 'correct-bg' : 'wrong-bg');
  $('result-icon').textContent = correct ? '✅' : '❌';
  $('result-text').textContent = correct ? 'Correct!' : 'Wrong';
  $('result-note').textContent = correct
    ? `Highest note is ${midiToName(result.highestMidi)}`
    : `You picked ${midiToName(result.chosenMidi)}, highest note is ${midiToName(result.highestMidi)}`;
  renderResultChart(notes, result.highestIndex, result.chosenIndex);
  setResultReplayPlaying(false);
  showScreen('result');
}

// 音高折线图：每个音符一个圆点，按播放顺序连线，音高越高位置越上，点旁标注音名。
// 最高音（正确答案）标绿，选错的音标红。
function renderResultChart(notes, highestIndex, chosenIndex) {
  const W = 300, H = 170, PAD_X = 40, PAD_Y = 32;
  const midis = notes.map(n => n.midi);
  const min = Math.min(...midis);
  const max = Math.max(...midis);
  const span = (max - min) || 1;

  const pts = notes.map((n, i) => {
    const x = PAD_X + (W - 2 * PAD_X) * (i / Math.max(notes.length - 1, 1));
    const y = PAD_Y + (H - 2 * PAD_Y) * (1 - (n.midi - min) / span);
    let cls = 'dot';
    if (i === highestIndex) cls += ' dot-highest';
    else if (i === chosenIndex) cls += ' dot-chosen';
    return { x, y, cls, name: midiToName(n.midi) };
  });

  const line = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const circles = pts.map(p =>
    `<circle class="${p.cls}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6"/>`
  ).join('');
  const labels = pts.map(p =>
    `<text class="dot-label" x="${p.x.toFixed(1)}" y="${(p.y - 14).toFixed(1)}">${p.name}</text>`
  ).join('');

  $('result-chart').innerHTML =
    `<svg viewBox="0 0 ${W} ${H}"><polyline class="pitch-line" points="${line}"/>${circles}${labels}</svg>`;
}

export function setResultReplayPlaying(playing) {
  const btn = $('btn-result-replay');
  btn.disabled = playing;
  btn.textContent = playing ? 'Playing…' : 'Replay';
}

export function updateHeader(score, round, instrumentId) {
  $('score-display').textContent   = `Score: ${score}`;
  $('round-display').textContent   = `Round ${round}`;
  $('instrument-display').textContent = instrumentName(instrumentId);
}

export function renderOptions(notes, onChoose) {
  const area = $('options-area');
  area.innerHTML = '';
  notes.forEach((note, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = `Note ${i + 1}`;
    btn.addEventListener('click', () => onChoose(i));
    area.appendChild(btn);
  });
  setOptionsDisabled(false);
}

export function setOptionsDisabled(disabled) {
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.classList.toggle('disabled', disabled);
  });
}

export function highlightOptions(result) {
  const btns = document.querySelectorAll('.option-btn');
  btns.forEach((btn, i) => {
    btn.classList.add('disabled');
    if (i === result.highestIndex) btn.classList.add('correct');
    else if (i === result.chosenIndex) btn.classList.add('wrong');
  });
}

export function setPlayingIndicator(index) {
  document.querySelectorAll('.option-btn').forEach((btn, i) => {
    btn.classList.toggle('playing-indicator', i === index);
  });
}

export function setPlayAllPlaying(playing) {
  const btn = $('btn-play-all');
  btn.classList.toggle('playing', playing);
  btn.textContent = playing ? '…' : '▶';
}

export function showReplayBtn(show) {
  $('btn-replay').classList.toggle('hidden', !show);
}

export function onStart(cb)       { $('btn-start').addEventListener('click', cb); }
export function onNext(cb)        { $('btn-next').addEventListener('click', cb); }
export function onPlayAll(cb)     { $('btn-play-all').addEventListener('click', cb); }
export function onReplayAll(cb)   { $('btn-replay').addEventListener('click', cb); }
export function onPreview(cb)     { $('btn-preview').addEventListener('click', cb); }
export function onPreviewBack(cb) { $('btn-preview-back').addEventListener('click', cb); }
export function onResultReplay(cb) { $('btn-result-replay').addEventListener('click', cb); }

// 音量面板：总音量 + 每个乐器的独立音量
export function initVolumePanel() {
  const wrap = $('volume-sliders');
  wrap.innerHTML = '';
  wrap.appendChild(volumeRow('Master', getVolume(), setVolume));
  getInstruments().forEach(id => {
    wrap.appendChild(volumeRow(instrumentName(id), getInstrumentVolume(id), v => setInstrumentVolume(id, v)));
  });
  $('btn-volume-close').addEventListener('click', () => showVolumePanel(false));
  // 点击遮罩空白处关闭
  $('volume-panel').addEventListener('click', e => {
    if (e.target.id === 'volume-panel') showVolumePanel(false);
  });
}

function volumeRow(label, value, onInput) {
  const row = document.createElement('div');
  row.className = 'volume-row';
  const name = document.createElement('span');
  name.className = 'volume-name';
  name.textContent = label;
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = 0;
  slider.max = 100;
  slider.value = Math.round(value * 100);
  slider.addEventListener('input', () => onInput(slider.value / 100));
  row.append(name, slider);
  return row;
}

export function showVolumePanel(show) {
  $('volume-panel').classList.toggle('hidden', !show);
}

export function onVolumeOpen(cb) {
  $('btn-volume').addEventListener('click', cb);
  $('btn-volume-preview').addEventListener('click', cb);
}

export function midiToName(midi) {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return names[midi % 12] + (Math.floor(midi / 12) - 1);
}
