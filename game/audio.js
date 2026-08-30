// ============================================================================
// audio.js — synthesized soundscape, v2.
// Rewritten after human feedback: no noise/static layers, felt-not-heard UI
// ticks, and a proper little mixer (ambience / interface / master).
// ============================================================================
"use strict";

const Audio2 = (() => {
  let ac = null, started = false, muted = false;
  let master = null, ambBus = null, uiBus = null, dangerGain = null;
  const vol = { master: 0.7, ambience: 0.6, ui: 0.5 };

  function applyVol() {
    if (!started) return;
    master.gain.value = muted ? 0 : vol.master * 0.8;
    ambBus.gain.value = vol.ambience;
    uiBus.gain.value = vol.ui;
  }

  function ensure() {
    if (started || muted) return started;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.connect(ac.destination);
      ambBus = ac.createGain(); ambBus.connect(master);
      uiBus = ac.createGain(); uiBus.connect(master);

      // --- hull drone: two soft detuned lows, slow breathing, no buzz
      const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 110; lp.Q.value = 0.5;
      const o1 = ac.createOscillator(); o1.type = "triangle"; o1.frequency.value = 42;
      const o2 = ac.createOscillator(); o2.type = "sine"; o2.frequency.value = 63.3;
      const og = ac.createGain(); og.gain.value = 0.05;
      o1.connect(og); o2.connect(og); og.connect(lp); lp.connect(ambBus);
      o1.start(); o2.start();
      // breathing LFO on the drone
      const lfo = ac.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.06;
      const lfoG = ac.createGain(); lfoG.gain.value = 0.018;
      lfo.connect(lfoG); lfoG.connect(og.gain); lfo.start();

      // --- danger pulse (low o2): soft sub thump, gated by dangerGain
      dangerGain = ac.createGain(); dangerGain.gain.value = 0; dangerGain.connect(ambBus);
      const beat = ac.createOscillator(); beat.type = "sine"; beat.frequency.value = 48;
      const beatG = ac.createGain(); beatG.gain.value = 0;
      beat.connect(beatG); beatG.connect(dangerGain); beat.start();
      setInterval(() => {
        if (!ac || dangerGain.gain.value < 0.05) return;
        const t = ac.currentTime;
        beatG.gain.cancelScheduledValues(t);
        beatG.gain.setValueAtTime(0.3, t);
        beatG.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      }, 1100);

      // --- rare distant hull groans (pure tones, no noise)
      function creak() {
        if (ac && !muted) {
          const t = ac.currentTime;
          const o = ac.createOscillator(); o.type = "sine";
          o.frequency.setValueAtTime(70 + Math.random() * 90, t);
          o.frequency.exponentialRampToValueAtTime(34 + Math.random() * 30, t + 1.6);
          const g = ac.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.02 + Math.random() * 0.015, t + 0.5);
          g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
          const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 220;
          o.connect(f); f.connect(g); g.connect(ambBus);
          o.start(t); o.stop(t + 2.4);
        }
        setTimeout(creak, 20000 + Math.random() * 35000);
      }
      setTimeout(creak, 12000);

      started = true;
      applyVol();
    } catch (e) { /* audio unavailable; play silent */ }
    return started;
  }

  function tone(bus, freq, gain, dur, type = "sine", toFreq = null) {
    if (!ensure()) return;
    const t = ac.currentTime;
    const o = ac.createOscillator(); o.type = type; o.frequency.value = freq;
    if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function blip(freq) { tone(uiBus, freq, 0.06, 0.22, "sine"); }

  // felt, not heard: a low soft tap, only occasionally
  let tickN = 0;
  function typeTick() {
    if (((tickN++) & 3) !== 0) return; // every 4th call
    tone(uiBus, 170 + Math.random() * 40, 0.012, 0.045, "sine");
  }

  // ECHO's voice: a soft rounded murmur, low register
  let echoN = 0;
  function echoVoiceTick() {
    if (((echoN++) & 1) !== 0) return;
    const base = 130 + Math.random() * 90;
    tone(uiBus, base, 0.016, 0.11, "sine", base * 0.82);
  }

  function doorHiss() {
    // pneumatic door as a falling pure tone, no noise burst
    tone(ambBus, 320, 0.03, 0.5, "sine", 90);
  }

  function openChord() {
    if (!ensure()) return;
    const t = ac.currentTime;
    [220, 277, 330].forEach((fq, i) => {
      const o = ac.createOscillator(); o.type = "sine"; o.frequency.value = fq;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t + i * 0.09);
      g.gain.linearRampToValueAtTime(0.04, t + i * 0.09 + 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.9);
      o.connect(g); g.connect(uiBus); o.start(t + i * 0.09); o.stop(t + 2);
    });
  }

  function sadChord() {
    if (!ensure()) return;
    const t = ac.currentTime;
    [196, 233, 294].forEach((fq, i) => {
      const o = ac.createOscillator(); o.type = "sine"; o.frequency.value = fq;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t + i * 0.12);
      g.gain.linearRampToValueAtTime(0.035, t + i * 0.12 + 0.22);
      g.gain.exponentialRampToValueAtTime(0.001, t + 2.8);
      o.connect(g); g.connect(uiBus); o.start(t + i * 0.12); o.stop(t + 3);
    });
  }

  function deathSwell() { tone(ambBus, 150, 0.07, 2.3, "sine", 36); }

  function setDanger(on) {
    if (!started || !dangerGain) return;
    dangerGain.gain.linearRampToValueAtTime(on ? 1 : 0, ac.currentTime + 0.8);
  }

  function toggleMute() {
    muted = !muted;
    if (!muted) ensure();
    applyVol();
    return muted;
  }

  function setVolume(channel, v) {
    vol[channel] = Math.max(0, Math.min(1, v));
    if (muted && vol[channel] > 0 && channel === "master") muted = false;
    ensure();
    applyVol();
  }

  return {
    ensure, blip, typeTick, echoVoiceTick, doorHiss, openChord, sadChord,
    deathSwell, setDanger, toggleMute, setVolume,
    get muted() { return muted; },
    get volumes() { return Object.assign({}, vol); },
  };
})();
if (typeof module !== "undefined") module.exports = Audio2;
