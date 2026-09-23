import { preloadAll, ensureResume, playSequence, playNote, getInstruments, setVolume, instrumentName, instrumentRange } from './audio.js';
import { nextRound, submitAnswer, getScore, getState } from './game.js';
import * as ui from './ui.js';

let currentInstrumentId = null;
let previewInstrumentId = null;
let isPlaying = false;

async function init() {
  ui.showLoading('Loading soundfonts...');
  await preloadAll((done, total, id) => {
    ui.showLoading(`Loading ${instrumentName(id)} (${done}/${total})`);
  });
  ui.showStart();
  ui.onStart(handleStart);
  ui.onNext(handleNext);
  ui.onPlayAll(handlePlayAll);
  ui.onReplayAll(handlePlayAll);
  ui.onPreview(handlePreview);
  ui.onPreviewBack(() => ui.showStart());
  ui.onResultReplay(handleResultReplay);

  const slider = document.getElementById('volume-slider');
  setVolume(slider.value / 100);
  slider.addEventListener('input', () => {
    setVolume(slider.value / 100);
  });
}

async function handleStart() {
  await ensureResume();
  startNewRound();
}

async function handleNext() {
  await ensureResume();
  startNewRound();
}

function startNewRound() {
  const instruments = getInstruments();
  currentInstrumentId = instruments[Math.floor(Math.random() * instruments.length)];
  const question = nextRound(currentInstrumentId);

  const { score, round } = getScore();
  ui.updateHeader(score, round, currentInstrumentId);
  ui.showGame();
  ui.showReplayBtn(false);
  ui.setPlayAllPlaying(false);

  ui.renderOptions(question.notes, handleChoose);
}

async function handlePlayAll() {
  if (isPlaying) return;
  isPlaying = true;
  ui.setOptionsDisabled(true);
  ui.setPlayAllPlaying(true);

  const question = getState().currentQuestion;
  await playSequence(
    currentInstrumentId,
    question.notes.map(n => n.midi),
    1.4,
    (i) => ui.setPlayingIndicator(i)
  );

  ui.setPlayAllPlaying(false);
  ui.setOptionsDisabled(false);
  ui.showReplayBtn(true);
  isPlaying = false;
}

async function handleChoose(index) {
  if (isPlaying) return;
  ui.setOptionsDisabled(true);
  ui.showReplayBtn(false);

  const question = getState().currentQuestion;
  const result = submitAnswer(index);
  result.chosenIndex = index;

  ui.highlightOptions(result);

  await new Promise(r => setTimeout(r, 600));
  ui.showResult(result.correct, result, question.notes);
}

let isResultPlaying = false;

async function handleResultReplay() {
  if (isResultPlaying) return;
  isResultPlaying = true;
  ui.setResultReplayPlaying(true);

  const question = getState().currentQuestion;
  await playSequence(currentInstrumentId, question.notes.map(n => n.midi), 1.4);

  ui.setResultReplayPlaying(false);
  isResultPlaying = false;
}

function handlePreview() {
  const instruments = getInstruments();
  previewInstrumentId = instruments[0];
  ui.renderPreviewInstruments(instruments, previewInstrumentId, handlePreviewSelect);
  renderPreviewNotes();
  ui.showPreview();
}

function handlePreviewSelect(id) {
  previewInstrumentId = id;
  ui.renderPreviewInstruments(getInstruments(), id, handlePreviewSelect);
  renderPreviewNotes();
}

function renderPreviewNotes() {
  const { min, max } = instrumentRange(previewInstrumentId);
  ui.renderPreviewNotes(whiteKeys(min, max), handlePreviewNote);
}

async function handlePreviewNote(midi) {
  await ensureResume();
  playNote(previewInstrumentId, midi);
}

// 仅白键：C D E F G A B
const WHITE_OFFSETS = new Set([0, 2, 4, 5, 7, 9, 11]);
const WHITE_NAMES = ['C', null, 'D', null, 'E', 'F', null, 'G', null, 'A', null, 'B'];

function whiteKeys(minMidi, maxMidi) {
  const notes = [];
  for (let m = minMidi; m <= maxMidi; m++) {
    if (!WHITE_OFFSETS.has(m % 12)) continue;
    notes.push({ midi: m, name: WHITE_NAMES[m % 12] + (Math.floor(m / 12) - 1) });
  }
  return notes;
}

init();
