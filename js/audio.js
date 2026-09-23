import { WorkletSynthesizer } from 'spessasynth_lib';

const ac = new (window.AudioContext || window.webkitAudioContext)();
const masterGain = ac.createGain();
masterGain.connect(ac.destination);

// 主音量默认 80%
let masterVolume = 0.8;
masterGain.gain.value = masterVolume;
// 每个乐器的音量（0~1），通过 MIDI CC7（通道音量）实现，
// 因为同一 sf2 文件的多个乐器共享一个合成器，无法用增益节点区分
const instrumentVolumes = new Map();

// 乐器配置，sf2 文件放在项目根目录的 sf2/ 文件夹下。
//   file:    sf2 文件名；同一个文件的多个预设共享一个合成器，只加载一次
//   program: 预设号（GM 程序号），bankMSB/bankLSB 仅当预设不在 bank 0 时才需要
//   name:    界面显示名
const INSTRUMENTS = {
  Key:        { file: 'Grand_Piano_127_Keys.sf2',        program: 0,  name: 'Key' },
  Bass:       { file: 'JazzBass.sf2',                    program: 0,  name: 'Bass' },
  Flute:      { file: '142-Flute.sf2',                   program: 73, name: 'Flute' },
  Oboe:       { file: '142-Oboe Stereo.sf2',             program: 68, name: 'Oboe' },
  FrenchHorn: { file: '060_Florestan_French_Horns.sf2',  program: 60, name: 'French Horn' },
  Violin:     { file: '040_Florestan_String_Quartet.sf2', program: 40, name: 'Violin' },
  Viola:      { file: '040_Florestan_String_Quartet.sf2', program: 41, name: 'Viola' },
  Cello:      { file: '040_Florestan_String_Quartet.sf2', program: 42, name: 'Cello' },
  Contrabass: { file: '040_Florestan_String_Quartet.sf2', program: 43, name: 'Contrabass' },
};

// 每件乐器的音域范围（MIDI 音符号），用于出题与试听
const INSTRUMENT_RANGES = {
  Key:        { min: 45, max: 81 },   // A2 – A5
  Bass:       { min: 21, max: 57 },   // A0 – A3
  Flute:      { min: 60, max: 89 },   // C4 – F6
  Oboe:       { min: 50, max: 89 },   // D3 – F6
  FrenchHorn: { min: 47, max: 77 },   // B2 – F5
  Violin:     { min: 55, max: 91 },   // G3 – G6
  Viola:      { min: 48, max: 93 },  // C3 – A6
  Cello:      { min: 36, max: 81 },   // C2 – A5
  Contrabass: { min: 40, max: 64 },   // E2 – E4
};

// 以本模块（js/audio.js）为基准解析相对路径，避免受文档 base 影响
const SF2_DIR = new URL('../sf2/', import.meta.url);
const WORKLET_URL = new URL('./vendor/spessasynth/spessasynth_processor.min.js', import.meta.url).href;

const VELOCITY = 100;

const ids = Object.keys(INSTRUMENTS);

// 每个乐器占用一个独立 MIDI 通道，同一文件的不同预设互不干扰
function channelOf(id) {
  const i = ids.indexOf(id);
  return i < 9 ? i : i + 1; // 通道 9 默认是打击乐通道，跳过
}

const loaded = new Map(); // id -> { synth, channel }
let workletReady = null;

export function getInstruments() {
  return ids;
}

export function instrumentName(id) {
  return INSTRUMENTS[id]?.name || id;
}

export function instrumentRange(id) {
  return INSTRUMENT_RANGES[id] || { min: 48, max: 84 };
}

function ensureWorklet() {
  if (!workletReady) workletReady = ac.audioWorklet.addModule(WORKLET_URL);
  return workletReady;
}

export async function preloadAll(onProgress) {
  await ensureWorklet();
  const total = ids.length;
  let done = 0;

  // 按文件去重，一个 sf2 文件只创建一个合成器
  const files = [...new Set(ids.map(id => INSTRUMENTS[id].file))];
  await Promise.all(files.map(async (file) => {
    const synth = await loadSoundfont(file);
    // 文件就绪后，为使用该文件的每个乐器在自己的通道上选中预设
    for (const id of ids) {
      const cfg = INSTRUMENTS[id];
      if (cfg.file !== file) continue;
      const channel = channelOf(id);
      if (cfg.bankMSB) synth.controllerChange(channel, 0, cfg.bankMSB);   // CC0  Bank Select MSB
      if (cfg.bankLSB) synth.controllerChange(channel, 32, cfg.bankLSB);  // CC32 Bank Select LSB
      synth.programChange(channel, cfg.program);
      loaded.set(id, { synth, channel });
      done++;
      onProgress?.(done, total, id);
    }
  }));
}

async function loadSoundfont(file) {
  const url = new URL(file, SF2_DIR);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`无法加载音色文件 ${file}（HTTP ${res.status}）`);
  const buffer = await res.arrayBuffer();

  const synth = new WorkletSynthesizer(ac);
  synth.connect(masterGain);
  await synth.soundBankManager.addSoundBank(buffer, file);
  await synth.isReady;
  return synth;
}

export async function ensureResume() {
  if (ac.state === 'suspended') await ac.resume();
}

export function getVolume() {
  return masterVolume;
}

export function setVolume(gain) {
  masterVolume = gain;
  masterGain.gain.value = gain;
}

export function getInstrumentVolume(id) {
  return instrumentVolumes.get(id) ?? 1;
}

// gain: 0~1，映射到 CC7 的 0~127
export function setInstrumentVolume(id, gain) {
  instrumentVolumes.set(id, gain);
  const entry = loaded.get(id);
  if (entry) entry.synth.controllerChange(entry.channel, 7, Math.round(gain * 127)); // CC7 Channel Volume
}

export function playNote(instrumentId, midiNote, duration = 1.2) {
  const entry = loaded.get(instrumentId);
  if (!entry) return;
  entry.synth.noteOn(entry.channel, midiNote, VELOCITY);
  setTimeout(() => entry.synth.noteOff(entry.channel, midiNote), duration * 1000);
}

export function playSequence(instrumentId, notes, gap = 1.4, onIndexChange) {
  return new Promise(resolve => {
    notes.forEach((midi, i) => {
      setTimeout(() => {
        playNote(instrumentId, midi);
        onIndexChange?.(i);
      }, i * gap * 1000);
    });
    setTimeout(() => {
      onIndexChange?.(-1);
      resolve();
    }, notes.length * gap * 1000);
  });
}
