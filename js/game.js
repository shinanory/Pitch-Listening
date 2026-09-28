import { instrumentRange } from './audio.js';

// 题目类型，开始页下拉框设置：'highest' = 选出最高音；'trend' = 判断音高走势
let mode = 'highest';

export function getMode() {
  return mode;
}

export function setMode(m) {
  mode = m;
}

// 每题音符数量，可在开始页调整；下限 3，上限 6
const NOTE_COUNT_MIN = 3;
const NOTE_COUNT_MAX = 6;
let noteCount = 3;

export function getNoteCount() {
  return noteCount;
}

// 设置每题音符数量，自动夹到 [NOTE_COUNT_MIN, NOTE_COUNT_MAX]，返回生效值
export function setNoteCount(n) {
  noteCount = Math.min(NOTE_COUNT_MAX, Math.max(NOTE_COUNT_MIN, n));
  return noteCount;
}

// 同一题内所有音符的最大音高跨度（单位：半音）。
// 例如 12 表示最低音与最高音相差不能超过一个八度。
// 生成时先随机选一个基准音，所有音符都落在 [基准音, 基准音 + MAX_SPAN] 窗口内，
// 窗口本身不会超出乐器音域。若设为 Infinity 则等效于不限制跨度。
const MAX_SPAN = 12;

let score = 0;
let round = 0;
let currentQuestion = null;

export function getState() {
  return { score, round, currentQuestion };
}

export function nextRound(instrumentId) {
  round++;
  const notes = generateNotes(instrumentId);
  const maxMidi = Math.max(...notes.map(n => n.midi));
  const highestIndex = notes.findIndex(n => n.midi === maxMidi);
  currentQuestion = { notes, highestIndex, instrumentId, mode };
  return currentQuestion;
}

export function submitAnswer(index) {
  const correct = index === currentQuestion.highestIndex;
  if (correct) score++;
  return {
    correct,
    highestIndex: currentQuestion.highestIndex,
    highestMidi: currentQuestion.notes[currentQuestion.highestIndex].midi,
    chosenMidi: currentQuestion.notes[index].midi,
  };
}

export function getScore() {
  return { score, round };
}

// 走势题判分：inputs 为 'up'/'down' 序列，与题目相邻音符的音高变化逐一比对
// （音符互不相同，所以不存在"持平"）
export function submitTrend(inputs) {
  const notes = currentQuestion.notes;
  const expected = [];
  for (let i = 1; i < notes.length; i++) {
    expected.push(notes[i].midi > notes[i - 1].midi ? 'up' : 'down');
  }
  const correct = inputs.length === expected.length && inputs.every((v, i) => v === expected[i]);
  if (correct) score++;
  return { correct, expected, inputs: [...inputs] };
}

// 返回开始页时清零进度，下次 Start Training 从头计分
export function resetProgress() {
  score = 0;
  round = 0;
  currentQuestion = null;
}

function generateNotes(instrumentId) {
  const { min, max } = instrumentRange(instrumentId);
  // 基准音（窗口下沿）的取值范围：保证窗口整体不超出乐器音域；
  // 若乐器音域本身小于 MAX_SPAN，则基准音固定为 min
  const baseHigh = Math.max(min, max - MAX_SPAN);
  const base = min + Math.floor(Math.random() * (baseHigh - min + 1));
  const top = Math.min(base + MAX_SPAN, max);

  const midis = new Set();
  while (midis.size < noteCount) {
    midis.add(base + Math.floor(Math.random() * (top - base + 1)));
  }
  return [...midis].map(midi => ({ midi, name: midiToName(midi) }));
}

function midiToName(midi) {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const octave = Math.floor(midi / 12) - 1;
  return names[midi % 12] + octave;
}
