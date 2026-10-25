'use strict';
// Synthesized sound effects and a procedural combat score (WebAudio), no audio files needed.
const SFX = (() => {
  let ctx = null, master = null, musicBus = null, noiseBuf = null, flame = null, vol = 0.8, musicOn = true;
  const mus = { on: false, next: 0, step: 0, intensity: 0, want: 0 };

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.55 * vol;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp); comp.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.32 : 0; musicBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  }
  const ok = () => ctx && ctx.state === 'running';

  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function noise({ dur = 0.2, type = 'lowpass', f = 1000, f1 = 0, q = 1, vol = 0.5, a = 0.003, delay = 0, at = 0, out = null }) {
    if (!ok() || vol < 0.004) return;
    const t = at || ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, a, vol, dur);
    src.connect(fl); fl.connect(g); g.connect(out || master);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }
  function tone({ type = 'sine', f = 440, f1 = 0, dur = 0.2, vol = 0.3, a = 0.005, delay = 0, at = 0, out = null, lp = 0 }) {
    if (!ok() || vol < 0.004) return;
    const t = at || ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, a, vol, dur);
    if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(lp, t); fl.frequency.exponentialRampToValueAtTime(Math.max(80, lp * 0.25), t + dur); o.connect(fl); fl.connect(g); } else o.connect(g);
    g.connect(out || master); o.start(t); o.stop(t + dur + 0.05);
  }

  // ---------- music: 124 BPM minor-key march, sparse between waves, full drums in combat ----------
  const BPM = 124, S16 = 60 / BPM / 4;
  const ROOTS = [45, 41, 43, 40]; // A F G E
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function scheduleStep(step, t) {
    const I = mus.intensity, bar = Math.floor(step / 16), s = step % 16, root = ROOTS[bar % 4], out = musicBus;
    if (s === 0) {
      for (const m of [root + 12, root + 15, root + 19]) tone({ type: 'triangle', f: hz(m), dur: S16 * 16, vol: 0.05, a: 0.4, at: t, out });
    }
    if (I < 0.05) return;
    if (s === 0 || s === 8 || (I > 0.5 && (s === 10 || (bar % 2 && s === 14)))) tone({ type: 'sine', f: 140, f1: 42, dur: 0.32, vol: 0.55 * Math.min(1, I + 0.3), at: t, out });
    if (I > 0.45 && (s === 4 || s === 12)) { noise({ dur: 0.16, type: 'bandpass', f: 1800, q: 0.7, vol: 0.32, at: t, out }); tone({ type: 'triangle', f: 190, f1: 120, dur: 0.1, vol: 0.18, at: t, out }); }
    if (I > 0.3 && s % 2 === 0) noise({ dur: s % 4 === 2 ? 0.05 : 0.03, type: 'highpass', f: 7000, vol: s % 4 === 2 ? 0.1 : 0.06, at: t, out });
    if (s === 0 || s === 6 || (I > 0.5 && s === 11)) tone({ type: 'sawtooth', f: hz(root - 12 + (s === 11 ? 7 : 0)), dur: S16 * (s === 0 ? 5 : 3), vol: 0.22 * Math.min(1, I + 0.4), lp: 600, at: t, out });
    if (I > 0.85 && s % 2 === 0) {
      const arp = [0, 3, 7, 12, 7, 3, 10, 7][(s / 2) | 0];
      tone({ type: 'square', f: hz(root + 24 + arp), dur: S16 * 1.6, vol: 0.045, lp: 2400, at: t, out });
    }
  }
  function musicTick(dt) {
    if (!ok() || !mus.on) return;
    mus.intensity += (mus.want - mus.intensity) * Math.min(1, dt * 0.8);
    if (mus.next < ctx.currentTime) mus.next = ctx.currentTime + 0.05;
    while (mus.next < ctx.currentTime + 0.25) { scheduleStep(mus.step, mus.next); mus.next += S16; mus.step++; }
  }

  return {
    init,
    setVolume(v) { vol = v; if (master) master.gain.value = 0.55 * v; },
    setMusic(on) { musicOn = on; if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.32 : 0, ctx.currentTime, 0.1); },
    music(intensity) { mus.on = true; mus.want = intensity; },
    musicStop() { mus.on = false; mus.intensity = 0; },
    tick: musicTick,
    rifle() { noise({ dur: 0.11, type: 'bandpass', f: 1800, f1: 600, q: 0.8, vol: 0.5 }); tone({ type: 'triangle', f: 160, f1: 45, dur: 0.12, vol: 0.4 }); },
    sniper() {
      noise({ dur: 0.5, type: 'lowpass', f: 3200, f1: 200, vol: 0.9 });
      tone({ type: 'triangle', f: 110, f1: 30, dur: 0.4, vol: 0.6 });
      noise({ dur: 0.9, type: 'lowpass', f: 600, f1: 100, vol: 0.25, delay: 0.08 });
    },
    mate(v) { noise({ dur: 0.09, type: 'bandpass', f: 1400, f1: 500, vol: 0.22 * v }); },
    explosion(v = 1) { noise({ dur: 1.4, type: 'lowpass', f: 900, f1: 60, vol: v, a: 0.005 }); tone({ type: 'sine', f: 70, f1: 25, dur: 0.9, vol: 0.8 * v }); },
    squelch(v = 1) { noise({ dur: 0.35, type: 'bandpass', f: 500, f1: 180, q: 4, vol: 0.5 * v }); tone({ type: 'sine', f: 220, f1: 60, dur: 0.3, vol: 0.4 * v }); },
    groan(v) {
      const f = 70 + Math.random() * 50;
      tone({ type: 'sawtooth', f, f1: f * 0.7, dur: 0.9, vol: 0.1 * v, a: 0.15 });
      noise({ dur: 0.8, type: 'bandpass', f: 380, q: 3, vol: 0.08 * v, a: 0.2 });
    },
    gurgle(v) { tone({ type: 'sawtooth', f: 55, f1: 40, dur: 0.7, vol: 0.12 * v, a: 0.1, lp: 400 }); noise({ dur: 0.6, type: 'bandpass', f: 260, q: 6, vol: 0.12 * v, a: 0.1 }); },
    fuse() { tone({ type: 'square', f: 900, f1: 1800, dur: 0.6, vol: 0.08 }); },
    zap(v) { tone({ type: 'square', f: 1400, f1: 180, dur: 0.22, vol: 0.11 * v }); },
    hit() { tone({ type: 'sine', f: 2200, dur: 0.04, vol: 0.12 }); },
    kill() { tone({ type: 'sine', f: 1500, dur: 0.07, vol: 0.14 }); tone({ type: 'sine', f: 2300, dur: 0.08, vol: 0.1, delay: 0.04 }); },
    hurt() { tone({ type: 'sine', f: 120, f1: 50, dur: 0.25, vol: 0.5 }); noise({ dur: 0.15, f: 500, vol: 0.3 }); },
    horn() { tone({ type: 'sawtooth', f: 220, dur: 0.6, vol: 0.12, a: 0.05 }); tone({ type: 'sawtooth', f: 330, dur: 0.9, vol: 0.1, a: 0.05, delay: 0.35 }); },
    fanfare() { [392, 523, 659, 784].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.5, vol: 0.12, a: 0.02, delay: i * 0.12 })); },
    whistle() { tone({ type: 'sine', f: 1900, f1: 500, dur: 1.0, vol: 0.12, a: 0.05 }); },
    swoosh() { noise({ dur: 0.25, type: 'bandpass', f: 600, f1: 2400, q: 2, vol: 0.4 }); },
    holy() {
      [262, 330, 392, 523].forEach((f, i) => tone({ type: 'triangle', f, dur: 1.6, vol: 0.09, a: 0.08, delay: i * 0.03 }));
      tone({ type: 'sine', f: 60, f1: 30, dur: 0.8, vol: 0.6 });
    },
    // rising sting for kill streaks; level 0..7 climbs the scale
    combo(level) {
      const base = [523, 587, 659, 784, 880, 988, 1175, 1319][Math.min(7, level)];
      tone({ type: 'triangle', f: base, dur: 0.18, vol: 0.13 }); tone({ type: 'triangle', f: base * 1.5, dur: 0.28, vol: 0.1, delay: 0.07 });
      if (level >= 4) tone({ type: 'sawtooth', f: base / 2, dur: 0.4, vol: 0.06, delay: 0.02, lp: 1800 });
    },
    pickup() { tone({ type: 'sine', f: 880, f1: 1760, dur: 0.14, vol: 0.14 }); tone({ type: 'sine', f: 1320, dur: 0.12, vol: 0.08, delay: 0.08 }); },
    power() {
      [440, 554, 659, 880].forEach((f, i) => tone({ type: 'square', f, dur: 0.22, vol: 0.06, delay: i * 0.06, lp: 3000 }));
      tone({ type: 'sine', f: 110, f1: 55, dur: 0.6, vol: 0.4 });
    },
    nuke() { tone({ type: 'sine', f: 1200, f1: 80, dur: 1.1, vol: 0.15 }); noise({ dur: 2.6, type: 'lowpass', f: 1400, f1: 40, vol: 1.1, delay: 0.5 }); tone({ type: 'sine', f: 50, f1: 20, dur: 2, vol: 0.9, delay: 0.5 }); },
    perk() { [523, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.35, vol: 0.1, delay: i * 0.05 })); },
    reload() { tone({ type: 'square', f: 900, dur: 0.03, vol: 0.06 }); tone({ type: 'square', f: 600, dur: 0.04, vol: 0.06, delay: 0.35 }); },
    empty() { tone({ type: 'square', f: 1200, dur: 0.02, vol: 0.05 }); },
    throwG() { noise({ dur: 0.15, type: 'bandpass', f: 900, q: 1, vol: 0.2 }); },
    bounce(v) { tone({ type: 'triangle', f: 500, dur: 0.05, vol: 0.12 * v }); },
    beam(v) { tone({ type: 'sine', f: 200, f1: 1200, dur: 0.7, vol: 0.12 * v, a: 0.05 }); },
    flame(on) {
      if (!ok()) return;
      const now = ctx.currentTime;
      if (on && !flame) {
        const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 700;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.45, now + 0.08);
        src.connect(fl); fl.connect(g); g.connect(master); src.start();
        flame = { src, g };
      } else if (!on && flame) {
        const f = flame; flame = null;
        f.g.gain.cancelScheduledValues(now);
        f.g.gain.setValueAtTime(Math.max(0.0002, f.g.gain.value), now);
        f.g.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
        f.src.stop(now + 0.2);
      }
    }
  };
})();
