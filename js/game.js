'use strict';
// Game loop, player, weapons, waves, upgrades, pickups, streaks, HUD, touch controls, menus and the post-processing chain.
const G = {
  state: 'menu', sel: 'napoleon', scene: null,
  enemies: [], mates: [], bolts: [], grenades: [], shells: [], flares: [], dmgInd: [], pickups: [], popups: [], timers: [],
  t: 0, runT: 0, wave: 0, phase: 'break', breakT: 0, queue: [], spawnT: 0, maxAlive: 16, spawnGap: 1.4, arms: ['E', 'W'], waveT: 0, strayT: 4,
  hurtFlash: 0, whiteFlash: 0, shake: 0, hm: null, locked: false, freeMouse: false, boss: null, swayX: 0, swayY: 0, vm: null,
  tp: true, hero: null, heroPhase: 0, camDist: 3, aimDist: 0, aimed: null, aimedDist: 99, aimScan: 0, baseFov: 75,
  pow: { insta: 0, double: 0, rage: 0 }, combo: { n: 0, last: -99 }, perkOpen: false, perkDelay: 0, choices: [],
  touch: false, lastTouch: -9, move: { x: 0, y: 0 }, adsToggle: false, mx: 0, my: 0, mouseIn: false, specialWasReady: false,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches
};
const CHARS = {
  napoleon: { key: 'napoleon', name: 'Napoleon Bonaparte', short: 'Napoleon', hp: 100, speed: 6.6, armor: 0, regen: 24, melee: 110, meleeR: 3.0, special: 'Artillery', specialCd: 35, mateDmg: 1.35, reload: 0.8, cry: "Vive l'Empereur!", sleeve: 0x1d2a55, cuff: 0xeeebe2, glove: 0xeeebe2, blade: 0xd8d2c0, hilt: 0xd6ab4c },
  crusader: { key: 'crusader', name: 'The Crusader', short: 'the Crusader', hp: 160, speed: 6.0, armor: 0.2, regen: 16, melee: 170, meleeR: 3.4, special: 'Holy Wrath', specialCd: 28, mateDmg: 1, reload: 1, cry: 'Deus vult!', sleeve: 0xa3a9b0, cuff: 0xece6d6, glove: 0xc4c9d0, blade: 0xc9ced6, hilt: 0x6a4a2e }
};
const WEAPONS = [
  { id: 'rifle', name: 'FAMAS', kind: 'auto', dmg: 30, rate: 11, mag: 30, reserve: 240, spread: 0.02, adsSpread: 0.003, reload: 1.9, recoil: 0.011, range: 220 },
  { id: 'sniper', name: 'FR-F2 sniper', kind: 'bolt', dmg: 190, rate: 1.15, mag: 5, reserve: 35, spread: 0.06, adsSpread: 0, reload: 2.6, recoil: 0.05, range: 400, pierce: 3 },
  { id: 'flamer', name: 'Flamethrower', kind: 'flame', dmg: 85, mag: 100, reserve: 300, use: 16, reload: 2.2, range: 11, spread: 0, adsSpread: 0 }
];
// upgrades offered after every wave; each can stack up to `max` times
const PERKS = [
  { id: 'dmg', name: 'Hollow Points', desc: 'Your guns deal 20% more damage.', max: 5, apply: m => { m.dmg += 0.2; } },
  { id: 'head', name: 'Sharpshooter', desc: 'Headshots deal 50% more damage.', max: 3, apply: m => { m.head += 0.5; } },
  { id: 'reload', name: 'Quick Hands', desc: 'Reload 25% faster.', max: 3, apply: m => { m.reload *= 0.75; } },
  { id: 'mag', name: 'Extended Mags', desc: 'Every weapon holds 50% more per magazine.', max: 2, apply: m => { m.mag += 0.5; } },
  { id: 'hp', name: 'Iron Constitution', desc: '30 more maximum health, and a full heal now.', max: 4, apply: () => { P.maxHp += 30; P.hp = P.maxHp; } },
  { id: 'leech', name: 'Field Medic', desc: 'Every kill heals you 5 health.', max: 3, apply: m => { m.leech += 5; } },
  { id: 'gren', name: 'Grenadier', desc: 'Carry 2 more grenades, get 2 now, and blasts grow 20%.', max: 3, apply: m => { m.grenMax += 2; m.blast += 0.2; P.grenades = Math.min(m.grenMax, P.grenades + 2); } },
  { id: 'squad', name: 'Esprit de Corps', desc: 'Squadmates hit 40% harder and take 30% less damage.', max: 3, apply: m => { m.mate += 0.4; m.mateArmor *= 1.43; } },
  { id: 'speed', name: 'Forced March', desc: 'Move 12% faster.', max: 3, apply: m => { m.speed += 0.12; } },
  { id: 'flame', name: 'Firestarter', desc: 'The flamethrower burns 40% hotter and longer.', max: 3, apply: m => { m.flame += 0.4; } },
  { id: 'cd', name: 'Battle Hymn', desc: 'Your hero ability recharges 25% faster.', max: 3, apply: m => { m.cd *= 0.75; P.specialT *= 0.75; } },
  { id: 'luck', name: 'Lucky Charm', desc: 'Enemies drop pickups 60% more often.', max: 3, apply: m => { m.luck += 0.6; } },
  { id: 'pierce', name: 'Armour Piercing', desc: 'Rifle bullets pass through one more enemy.', max: 2, apply: m => { m.pierce += 1; } },
  { id: 'boom', name: 'Volatile Rounds', desc: 'Your kills have a 12% chance to explode.', max: 3, apply: m => { m.boom += 0.12; } },
  { id: 'last', name: 'Last Stand', desc: 'Once per wave, a killing blow leaves you at 40% health.', max: 1, apply: m => { m.last = true; } }
];
const baseMods = () => ({ dmg: 1, head: 0, reload: 1, mag: 1, leech: 0, grenMax: 6, blast: 1, mate: 1, mateArmor: 1, speed: 1, flame: 1, cd: 1, luck: 1, pierce: 0, boom: 0, last: false });
const POWERS = { insta: { name: 'Insta-Kill', dur: 15, sub: 'Every hit kills' }, double: { name: 'Double Points', dur: 20, sub: 'Every kill scores twice' }, rage: { name: 'Rage', dur: 12, sub: 'Faster fire, no reloads' } };
const STREAKS = { 2: 'Double kill', 3: 'Triple kill', 5: 'Multi kill', 8: 'Mega kill', 12: 'Rampage', 18: 'Unstoppable', 25: 'Légendaire' };
const RANKS = [[0, 'Conscript'], [3, 'Fusilier'], [5, 'Grenadier'], [7, 'Captain'], [10, 'Colonel'], [13, 'General'], [16, 'Marshal of France'], [20, 'Emperor of Paris']];
const COMBO_WIN = 3.2;
const rankFor = w => RANKS.filter(r => w >= r[0]).pop()[1];
const comboMult = n => n >= 35 ? 4 : n >= 20 ? 3 : n >= 10 ? 2 : n >= 5 ? 1.5 : 1;
const roman = n => ['', 'I', 'II', 'III', 'IV', 'V'][n] || String(n);
const S = { sens: 1, vol: 0.8, music: true, quality: 'auto', autofire: true };
try { Object.assign(S, JSON.parse(localStorage.getItem('ddp-settings') || '{}')); } catch (e) { }
const $ = id => document.getElementById(id);
const keys = {};
let mouseL = false, mouseR = false, clickL = false;
let renderer, scene, camera, vmScene, vmCam, hctx, rctx, composer = null, vmPass = null, gradePass = null, bloomPass = null, last = performance.now();
const Q = { level: 2, slow: 0, ema: 1 / 60 };
const heroes = {}, hudDim = { w: 1, h: 1, dpr: 1 };
const tmpD = new THREE.Vector3(), tmpM = new THREE.Vector3(), tmpO = new THREE.Vector3(), tmpP = new THREE.Vector3();
const BOLT_GEO = new THREE.SphereGeometry(0.16, 10, 8);
const BOLT_MAT = { alien: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9dff7a).multiplyScalar(3) }), boss: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6ae0).multiplyScalar(3) }) };
const BOLT_COL = { alien: [0.55, 1, 0.42], boss: [1, 0.42, 0.88] };
const GREN_GEO = new THREE.SphereGeometry(0.11, 10, 8);
const fmt = n => n.toLocaleString('en-US');
const enemyCol = e => e.type === 'bloater' ? '#b6f04a' : e.kind === 'zombie' ? '#e1493f' : e.kind === 'alien' ? '#9dff7a' : '#ff6ae0';

// Final pass: ACES tone mapping, gamma, cool-shadow / warm-highlight grade, vignette and film grain
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, exposure: { value: 1.05 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, exposure; varying vec2 vUv;
    vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = aces(texture2D(tDiffuse, vUv).rgb * exposure);
      c = pow(c, vec3(1.0 / 2.2));
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c *= mix(vec3(0.93, 0.98, 1.07), vec3(1.05, 1.0, 0.93), smoothstep(0.15, 0.75, l));
      c = mix(vec3(l), c, 1.1);
      vec2 q = vUv - 0.5; c *= clamp(1.0 - dot(q, q) * 0.9, 0.0, 1.0);
      c += (hash(vUv * 900.0 + fract(time) * 17.0) - 0.5) * 0.03;
      gl_FragColor = vec4(c, 1.0);
    }`
};

const P = G.player = {
  x: 0, y: 0, z: 22, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0, r: 0.4, hp: 100, maxHp: 100, char: CHARS.napoleon, mods: baseMods(), perks: {},
  ammo: WEAPONS.map(w => ({ mag: w.mag, res: w.reserve })), w: 0, ads: 0, spreadNow: 0, sprintAmt: 0,
  alive() { return this.hp > 0; },
  damage(dmg, src) {
    if (G.state !== 'play' || this.hp <= 0 || this.inv > 0) return;
    const d = dmg * (1 - this.char.armor);
    this.hp -= d; this.lastHurt = G.t;
    G.hurtFlash = Math.min(1, G.hurtFlash + d / 35);
    G.shake = Math.max(G.shake, 0.25);
    if (src) G.dmgInd.push({ ang: Math.atan2(src.x - this.x, src.z - this.z), t: 1.2 });
    SFX.hurt();
    if (this.hp <= 0) {
      if (this.mods.last && !this.lastUsed) {
        this.lastUsed = true; this.hp = this.maxHp * 0.4; this.inv = 2.5;
        announce('Last stand', 'Back on your feet', 'gold'); SFX.holy(); FX.ring(this.x, this.z, 6, 0xffd27a);
        return;
      }
      this.hp = 0; gameOver();
    }
  }
};
const magSize = i => Math.round(WEAPONS[i].mag * P.mods.mag);

// ---------- setup ----------
function init() {
  const canvas = $('gl');
  G.touch = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !G.touch, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false;
  scene = G.scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 1400);
  camera.rotation.order = 'YXZ'; scene.add(camera);
  World.build(scene, renderer);
  FX.init(scene, renderer, camera);
  vmScene = new THREE.Scene();
  vmScene.environment = scene.environment;
  vmCam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);
  vmScene.add(new THREE.HemisphereLight(Models.lin(0xb8b8e0), Models.lin(0x40302a), 0.5));
  const vl = new THREE.DirectionalLight(Models.lin(0xffc896), 2.2); vl.position.set(-1, 1.5, 0.8); vmScene.add(vl);
  if (THREE.EffectComposer && THREE.UnrealBloomPass) {
    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    composer = new THREE.EffectComposer(renderer, rt);
    composer.addPass(new THREE.RenderPass(scene, camera));
    vmPass = new THREE.RenderPass(vmScene, vmCam); vmPass.clear = false; vmPass.clearDepth = true; composer.addPass(vmPass);
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.45, 1.0); composer.addPass(bloomPass);
    gradePass = new THREE.ShaderPass(GradeShader); composer.addPass(gradePass);
  } else {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }
  heroes.napoleon = Models.napoleon(); heroes.crusader = Models.crusader();
  heroes.napoleon.root.position.set(1.7, 0, 30); heroes.crusader.root.position.set(3.4, 0, 30);
  for (const k in heroes) { heroes[k].root.rotation.y = -0.45; scene.add(heroes[k].root); }
  hctx = $('hudc').getContext('2d'); rctx = $('radar').getContext('2d');
  if (G.touch) document.body.classList.add('touch');
  bindUI(); bindTouch(); bindSettings();
  addEventListener('resize', resize);
  SFX.setVolume(S.vol); SFX.setMusic(S.music);
  setQuality(initialQuality());
  showBest();
  requestAnimationFrame(frame);
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
  camera.aspect = w / h; vmCam.aspect = w / h; vmCam.updateProjectionMatrix();
  // portrait phones get a taller field of view so the street does not shrink to a slit
  const a = w / h; G.baseFov = a >= 1 ? 75 : clamp(2 * Math.atan(Math.tan(35 * Math.PI / 180) / a) * 180 / Math.PI, 75, 100);
  if (G.state !== 'play' && G.state !== 'pause') camera.fov = G.baseFov;
  camera.updateProjectionMatrix();
  const dpr = Math.min(window.devicePixelRatio || 1, 2), c = $('hudc');
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  Object.assign(hudDim, { w, h, dpr });
  FX.setScale(h * renderer.getPixelRatio(), camera.fov);
}
const QUALITY_PR = () => G.touch ? [0.7, 1, 1.35] : [0.6, 0.8, 1];
function initialQuality() { return S.quality === 'auto' ? (G.touch ? 1 : 2) : { low: 0, medium: 1, high: 2 }[S.quality]; }
function setQuality(level) {
  Q.level = level; Q.slow = 0; Q.ema = 1 / 60;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY_PR()[level]));
  if (bloomPass) bloomPass.enabled = level > 0;
  World.setShadows(level > 0);
  resize();
}
function showBest() {
  let best = 0, bw = 0; try { best = +localStorage.getItem('ddp-best') || 0; bw = +localStorage.getItem('ddp-best-wave') || 0; } catch (e) { }
  $('best').textContent = best ? `Your best: ${fmt(best)} points${bw ? ` · wave ${bw}` : ''}` : 'First defence of Paris. No record yet.';
}
function select(k) {
  G.sel = k;
  for (const id of ['napoleon', 'crusader']) $('pick-' + id).setAttribute('aria-checked', String(id === k));
}

// ---------- input ----------
function look(mx, my) {
  const W = WEAPONS[P.w];
  const sens = 0.0022 * S.sens * (W.id === 'sniper' && P.ads > 0.85 ? 0.3 : 1 - 0.3 * P.ads);
  P.yaw -= mx * sens; P.pitch = clamp(P.pitch - my * sens, -1.4, 1.4);
  G.swayX = clamp(G.swayX - mx * 0.0006, -0.06, 0.06); G.swayY = clamp(G.swayY - my * 0.0006, -0.06, 0.06);
}
function bindUI() {
  for (const id of ['napoleon', 'crusader']) $('pick-' + id).addEventListener('click', () => select(id));
  $('start').addEventListener('click', startGame);
  $('resume').addEventListener('click', resume);
  $('tomenu').addEventListener('click', toMenu);
  $('again').addEventListener('click', startGame);
  $('change').addEventListener('click', toMenu);
  $('share').addEventListener('click', share);
  $('perk-cards').addEventListener('click', e => { const c = e.target.closest('[data-i]'); if (c) pickPerk(+c.dataset.i); });
  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (G.state !== 'play') { if (G.state === 'pause' && e.code === 'KeyP') resume(); return; }
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (G.perkOpen) {
      const i = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
      if (i !== undefined) { pickPerk(i); return; }
    }
    switch (e.code) {
      case 'Digit1': switchWeapon(0); break;
      case 'Digit2': switchWeapon(1); break;
      case 'Digit3': switchWeapon(2); break;
      case 'KeyR': reload(); break;
      case 'KeyG': throwGrenade(); break;
      case 'KeyQ': special(); break;
      case 'KeyV': melee(); break;
      case 'KeyT': G.tp = !G.tp; break;
      case 'KeyM': S.music = !S.music; SFX.setMusic(S.music); saveSettings(); syncSettings(); G.feed(S.music ? 'Music on' : 'Music off'); break;
      case 'Enter': case 'NumpadEnter': startEarly(); break;
      case 'Escape': case 'KeyP': if (!G.locked) pause(); break;
    }
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseL = mouseR = false; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  $('gl').addEventListener('mousedown', e => {
    if (performance.now() - G.lastTouch < 900) return;
    SFX.init();
    if (G.state !== 'play') return;
    if (!G.locked) lockPointer();
    if (e.button === 0) { mouseL = true; clickL = true; }
    if (e.button === 2) mouseR = true;
  });
  addEventListener('mouseup', e => { if (e.button === 0) mouseL = false; if (e.button === 2) mouseR = false; });
  addEventListener('contextmenu', e => { if (G.state === 'play') e.preventDefault(); });
  addEventListener('mousemove', e => {
    G.mx = e.clientX; G.my = e.clientY; G.mouseIn = true;
    if (G.state !== 'play' || !(G.locked || G.freeMouse) || G.touch) return;
    look(clamp(e.movementX || 0, -250, 250), clamp(e.movementY || 0, -250, 250));
  });
  document.documentElement.addEventListener('mouseleave', () => { G.mouseIn = false; });
  addEventListener('wheel', e => { if (G.state === 'play') switchWeapon((P.w + (e.deltaY > 0 ? 1 : 2)) % 3); }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    const was = G.locked; G.locked = document.pointerLockElement === $('gl');
    if (G.locked) G.freeMouse = false;
    if (was && !G.locked && G.state === 'play') pause();
  });
  document.addEventListener('pointerlockerror', () => { G.freeMouse = true; });
}
function lockPointer() {
  if (G.touch) return;
  const c = $('gl');
  if (!c.requestPointerLock) { G.freeMouse = true; return; }
  try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => { G.freeMouse = true; }); } catch (e) { G.freeMouse = true; }
}
function enableTouch() {
  G.lastTouch = performance.now();
  if (G.touch) return;
  G.touch = true; document.body.classList.add('touch');
  if (G.state === 'play') $('touch').hidden = false;
  if (S.quality === 'auto') setQuality(Math.min(Q.level, 1));
}
// Touch: a floating stick on the left, drag anywhere else to look, buttons on the right.
function bindTouch() {
  const gl = $('gl'), stick = $('stick'), knob = $('knob'), roles = new Map(), R = 56;
  const resetStick = () => { stick.classList.remove('on'); stick.style.left = stick.style.top = ''; knob.style.transform = ''; G.move.x = G.move.y = 0; };
  addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') enableTouch(); }, { capture: true });
  gl.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || G.state !== 'play') return;
    e.preventDefault(); SFX.init();
    const hasStick = [...roles.values()].some(r => r.role === 'stick');
    if (e.clientX < innerWidth * 0.42 && !hasStick) {
      const x = clamp(e.clientX, R + 12, innerWidth * 0.42), y = clamp(e.clientY, R + 12, innerHeight - R - 12);
      roles.set(e.pointerId, { role: 'stick', ox: x, oy: y });
      stick.classList.add('on'); stick.style.left = x + 'px'; stick.style.top = y + 'px';
    } else roles.set(e.pointerId, { role: 'look', x: e.clientX, y: e.clientY });
    try { gl.setPointerCapture(e.pointerId); } catch (er) { }
  });
  gl.addEventListener('pointermove', e => {
    const r = roles.get(e.pointerId); if (!r) return;
    if (r.role === 'stick') {
      let dx = e.clientX - r.ox, dy = e.clientY - r.oy; const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`; G.move.x = dx / R; G.move.y = dy / R;
    } else { look((e.clientX - r.x) * 1.9, (e.clientY - r.y) * 1.9); r.x = e.clientX; r.y = e.clientY; }
  });
  const up = e => { const r = roles.get(e.pointerId); if (!r) return; roles.delete(e.pointerId); if (r.role === 'stick') resetStick(); };
  gl.addEventListener('pointerup', up); gl.addEventListener('pointercancel', up);
  const btn = (id, down, upFn, drag) => {
    const el = $(id); let lx = 0, ly = 0;
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); SFX.init(); enableTouch();
      try { el.setPointerCapture(e.pointerId); } catch (er) { }
      el.classList.add('down'); lx = e.clientX; ly = e.clientY; down();
    });
    if (drag) el.addEventListener('pointermove', e => { if (!el.classList.contains('down')) return; look((e.clientX - lx) * 1.9, (e.clientY - ly) * 1.9); lx = e.clientX; ly = e.clientY; });
    const end = () => { if (!el.classList.contains('down')) return; el.classList.remove('down'); if (upFn) upFn(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  };
  // the fire button doubles as a look pad: hold it and slide your thumb to aim
  btn('t-fire', () => { mouseL = true; clickL = true; }, () => { mouseL = false; }, true);
  btn('t-aim', () => { G.adsToggle = !G.adsToggle; mouseR = G.adsToggle; $('t-aim').classList.toggle('on', G.adsToggle); });
  btn('t-reload', reload); btn('t-gren', throwGrenade); btn('t-special', special); btn('t-melee', melee);
  btn('t-jump', () => { P.jumpReq = true; });
  btn('t-pause', pause);
  btn('t-next', startEarly);
  document.querySelectorAll('.slots [data-s]').forEach(el => el.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; e.preventDefault(); switchWeapon(+el.dataset.s); }));
}

// ---------- settings ----------
function saveSettings() { try { localStorage.setItem('ddp-settings', JSON.stringify(S)); } catch (e) { } }
function syncSettings() {
  $('set-sens').value = S.sens; $('set-sens-v').textContent = S.sens.toFixed(2) + '×';
  $('set-vol').value = S.vol; $('set-vol-v').textContent = Math.round(S.vol * 100) + '%';
  $('set-music').checked = S.music; $('set-auto').checked = S.autofire; $('set-q').value = S.quality;
}
function bindSettings() {
  syncSettings();
  let back = 'menu';
  const open = from => { back = from; $(from).hidden = true; $('settings').hidden = false; $('set-done').focus(); };
  $('opt-menu').addEventListener('click', () => open('menu'));
  $('opt-pause').addEventListener('click', () => open('pause'));
  $('set-done').addEventListener('click', () => { $('settings').hidden = true; $(back).hidden = false; });
  $('set-sens').addEventListener('input', e => { S.sens = +e.target.value; syncSettings(); saveSettings(); });
  $('set-vol').addEventListener('input', e => { S.vol = +e.target.value; SFX.setVolume(S.vol); syncSettings(); saveSettings(); });
  $('set-music').addEventListener('change', e => { S.music = e.target.checked; SFX.setMusic(S.music); saveSettings(); });
  $('set-auto').addEventListener('change', e => { S.autofire = e.target.checked; saveSettings(); });
  $('set-q').addEventListener('change', e => { S.quality = e.target.value; saveSettings(); setQuality(initialQuality()); });
}

// ---------- game flow ----------
function clearWorld() {
  for (const e of G.enemies) scene.remove(e.root);
  for (const m of G.mates) scene.remove(m.root);
  for (const b of G.bolts) scene.remove(b.mesh);
  for (const g of G.grenades) scene.remove(g.mesh);
  for (const p of G.pickups) scene.remove(p.m.root);
  if (G.hero) { scene.remove(G.hero.root); G.hero = null; }
  G.enemies = []; G.mates = []; G.bolts = []; G.grenades = []; G.shells = []; G.flares = []; G.dmgInd = []; G.pickups = []; G.popups = []; G.timers = [];
  G.boss = null; G.aimed = null;
}
function startGame() {
  SFX.init();
  clearWorld();
  const ch = CHARS[G.sel];
  Object.assign(P, {
    x: 0, y: 0, z: 22, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: -0.05, hp: ch.hp, maxHp: ch.hp, char: ch, inv: 0, lastHurt: -99, mods: baseMods(), perks: {}, lastUsed: false,
    w: 0, grenades: 4, ads: 0, reloadT: 0, reloadDur: 1, fireT: 0, meleeT: 0, meleeAnim: 0, meleeHit: 0, specialT: 8, switchT: 0, grenT: 0, throwAnim: 0, jumpReq: false,
    kills: 0, score: 0, heads: 0, shots: 0, hits: 0, bestCombo: 0, bobT: 0, recoil: 0, kick: 0, flashT: 0, onGround: true, moving: false, sprinting: false, sprintAmt: 0, flaming: false, reviveP: 0
  });
  P.ammo = WEAPONS.map(w => ({ mag: w.mag, res: w.reserve }));
  for (const k in heroes) heroes[k].root.visible = false;
  G.hero = Models[ch.key]('armed'); scene.add(G.hero.root);
  G.mates = [new Mate('Pierre', 0xd9a77f, [-3.2, 2.6]), new Mate('Amélie', 0x8a5a3c, [3.2, 2.6]), new Mate('Jacques', 0xe8bf98, [0, 4.6])];
  $('squad').innerHTML = G.mates.map((m, i) => `<div class="mate" id="mate${i}"><span>${m.name}</span><div class="bar"><i id="matefill${i}"></i></div></div>`).join('');
  if (G.vm) vmScene.remove(G.vm.root);
  G.vm = Models.viewmodel(ch); vmScene.add(G.vm.root);
  Object.assign(G, { wave: 0, phase: 'break', breakT: 6, queue: [], t: 0, runT: 0, hurtFlash: 0, whiteFlash: 0, shake: 0, hm: null, perkOpen: false, perkDelay: 0, adsToggle: false, specialWasReady: false });
  G.pow = { insta: 0, double: 0, rage: 0 }; G.combo = { n: 0, last: -99 };
  $('cname').textContent = ch.name; $('t-aim').classList.remove('on');
  $('menu').hidden = true; $('over').hidden = true; $('pause').hidden = true; $('perks').hidden = true; $('hud').hidden = false; $('touch').hidden = !G.touch;
  camera.fov = G.baseFov; camera.updateProjectionMatrix(); FX.setScale(hudDim.h * renderer.getPixelRatio(), camera.fov);
  G.state = 'play'; last = performance.now();
  updateSlots();
  banner('Defend Paris!', 'First wave in 6 seconds. Stay close to your squad on Place de la Concorde.');
  G.feed(G.touch ? 'Left thumb moves, right thumb aims. Hold Fire and slide to aim while shooting' : 'Press T to switch between third and first person', 'gold');
  lockPointer();
}
function pause() {
  if (G.state !== 'play') return;
  G.state = 'pause'; mouseL = mouseR = false; G.adsToggle = false; $('t-aim').classList.remove('on');
  SFX.flame(false); P.flaming = false; SFX.musicStop();
  const owned = PERKS.filter(p => P.perks[p.id]).map(p => p.name + (P.perks[p.id] > 1 ? ' ' + roman(P.perks[p.id]) : ''));
  $('pause-perks').textContent = owned.length ? 'Upgrades: ' + owned.join(' · ') : 'No upgrades yet. Clear a wave to choose one.';
  $('pause-hint').textContent = G.touch ? 'Tap Continue to get back into the fight.' : 'Press Continue and the mouse locks back into the game.';
  $('pause').hidden = false;
}
function resume() {
  $('pause').hidden = true; G.state = 'play'; last = performance.now();
  lockPointer();
}
function toMenu() {
  clearWorld(); SFX.musicStop();
  if (G.vm) { vmScene.remove(G.vm.root); G.vm = null; }
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { }
  G.state = 'menu';
  for (const k in heroes) heroes[k].root.visible = true;
  camera.fov = G.baseFov; camera.updateProjectionMatrix(); FX.setScale(hudDim.h * renderer.getPixelRatio(), camera.fov);
  $('hud').hidden = true; $('touch').hidden = true; $('pause').hidden = true; $('over').hidden = true; $('perks').hidden = true; $('menu').hidden = false;
  showBest();
}
function gameOver() {
  G.state = 'over'; SFX.flame(false); P.flaming = false; mouseL = mouseR = false; SFX.musicStop();
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { }
  let best = 0, bw = 0;
  try {
    best = +localStorage.getItem('ddp-best') || 0; bw = +localStorage.getItem('ddp-best-wave') || 0;
    if (P.score > best) localStorage.setItem('ddp-best', String(P.score));
    if (G.wave > bw) localStorage.setItem('ddp-best-wave', String(G.wave));
  } catch (e) { }
  const mins = Math.floor(G.runT / 60), secs = Math.floor(G.runT % 60);
  $('o-rank').textContent = rankFor(G.wave);
  $('o-title').textContent = G.wave >= 10 ? 'Paris remembers you' : 'Paris has fallen';
  $('o-wave').textContent = String(G.wave); $('o-score').textContent = fmt(P.score);
  $('o-kills').textContent = String(P.kills); $('o-heads').textContent = String(P.heads);
  $('o-streak').textContent = String(P.bestCombo); $('o-acc').textContent = P.shots ? Math.round(P.hits / P.shots * 100) + '%' : '–';
  $('o-time').textContent = `${mins}:${String(secs).padStart(2, '0')}`;
  $('o-best').textContent = P.score > best ? 'New record!' : `Best: ${fmt(best)} points`;
  $('share-msg').textContent = ''; $('sharetext').hidden = true;
  $('hud').hidden = true; $('touch').hidden = true; $('perks').hidden = true; $('over').hidden = false;
}
const SHARE_URL = () => { const m = document.querySelector('meta[name="ddp-share-url"]'); return (m && m.content) || location.href.split('#')[0]; };
async function share() {
  const url = SHARE_URL();
  const text = `I held Paris until wave ${G.wave} as ${P.char.short}: ${fmt(P.score)} points, ${P.kills} kills, best streak ${P.bestCombo}. Rank: ${rankFor(G.wave)}. Can you beat me?`;
  const msg = $('share-msg');
  if (navigator.share) {
    try { await navigator.share({ title: 'Défense de Paris', text, url }); msg.textContent = 'Shared.'; return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(`${text} ${url}`); msg.textContent = 'Copied. Paste it into any chat or post.'; }
  catch (e) { const ta = $('sharetext'); ta.hidden = false; ta.value = `${text} ${url}`; ta.focus(); ta.select(); msg.textContent = 'Copy the text above and paste it anywhere.'; }
}
function banner(t, s, cls) {
  $('banner-t').textContent = t; $('banner-s').textContent = s || '';
  const b = $('banner'); b.className = 'show ' + (cls || '');
  clearTimeout(G.bannerTO); G.bannerTO = setTimeout(() => { b.className = ''; }, 4200);
}
// big centre call-outs for streaks, power-ups and other moments
function announce(t, s, cls) {
  const a = $('announce');
  $('ann-t').textContent = t; $('ann-s').textContent = s || '';
  a.className = ''; void a.offsetWidth; a.className = 'go ' + (cls || '');
}
G.feed = (text, cls) => {
  const f = $('feed'), el = document.createElement('div');
  el.className = 'fi ' + (cls || ''); el.textContent = text; f.prepend(el);
  while (f.children.length > 5) f.lastChild.remove();
  setTimeout(() => el.classList.add('out'), 3600); setTimeout(() => el.remove(), 4300);
};
G.later = (t, fn) => { G.timers.push({ t, fn }); };
function updateTimers(dt) {
  for (let i = G.timers.length - 1; i >= 0; i--) { const tm = G.timers[i]; if ((tm.t -= dt) <= 0) { G.timers.splice(i, 1); tm.fn(); } }
}

// ---------- waves ----------
function buildQueue(n) {
  const q = [], total = 8 + n * 5;
  for (let i = 0; i < total; i++) {
    const r = Math.random(); let t = 'walker';
    if (n >= 4 && r < 0.05 + n * 0.008) t = 'brute';
    else if (n >= 3 && r < 0.17) t = 'bloater';
    else if (n >= 3 && r < 0.38) t = 'alien';
    else if (n >= 2 && r < 0.6) t = 'runner';
    q.push(t);
  }
  if (n === 2) q.splice(6, 0, 'bloater');
  if (n % 5 === 0) q.splice(Math.floor(q.length / 3), 0, 'boss');
  return q;
}
const HINTS = {
  1: [[5, 'Kill fast to build a streak. Streaks multiply your points'], [14, 'Glowing drops are pickups. Walk over them'], [24, () => G.touch ? 'Grenade and Ability are on the right. Ability recharges over time' : 'G throws a grenade. Q calls your hero ability']],
  2: [[4, 'A Bloater is coming. Shoot it when other zombies crowd around it']],
  3: [[4, () => G.touch ? 'Aliens shoot from range. Tap 2 for the sniper' : 'Aliens shoot from range. Press 2 for the sniper and right-click to scope']]
};
function startWave(n) {
  Object.assign(G, { wave: n, phase: 'fight', queue: buildQueue(n), spawnT: 1.2, maxAlive: Math.min(32, 12 + n * 3), spawnGap: Math.max(0.3, 1.25 - n * 0.09), waveT: 0, strayT: 4 });
  P.lastUsed = false;
  const arms = ['E', 'W', 'N', 'S'].sort(() => Math.random() - 0.5);
  G.arms = arms.slice(0, Math.min(4, 1 + Math.ceil(n / 2)));
  const from = G.arms.map(a => World.STREETS[a]).join(', ');
  banner(`Wave ${n}`, `Zombies attacking from ${from}` + (n >= 3 ? ' · aliens are landing in the streets' : ''));
  SFX.horn();
  for (const [t, h] of HINTS[n] || []) G.later(t, () => { if (G.state === 'play' && G.wave === n) G.feed(typeof h === 'function' ? h() : h, 'gold'); });
}
function spawnEnemy(type) {
  let x = 0, z = 0;
  if (type === 'alien' || type === 'boss') {
    for (let k = 0; k < 20; k++) {
      [x, z] = World.armPoint(['E', 'W', 'N', 'S'][Math.random() * 4 | 0], rand(40, 120), rand(-6, 6));
      if (Math.hypot(x - P.x, z - P.z) > 32) break;
    }
    FX.beam(x, z); World.pulse();
    SFX.beam(Math.max(0, 1 - Math.hypot(x - P.x, z - P.z) / 90));
  } else {
    // zombies shamble in from down an avenue, close enough that the wave never drags
    const t = rand(46, 76);
    const far = G.arms.filter(a => { const [ex, ez] = World.armPoint(a, t, 0); return Math.hypot(ex - P.x, ez - P.z) > 34; });
    const list = far.length ? far : G.arms, arm = list[Math.random() * list.length | 0];
    [x, z] = World.armPoint(arm, far.length ? t : World.END - rand(2, 10), rand(-7, 7));
  }
  const e = new Enemy(type, x, z, G.wave);
  G.enemies.push(e);
  if (type === 'boss') { G.boss = e; banner('The Invasion Commander descends', 'Aim for the glowing eye. That is where hits hurt it most.', 'alien'); }
  return e;
}
G.summonAround = (x, z, n) => {
  for (let i = 0; i < n; i++) {
    const p = { x: x + rand(-8, 8), z: z + rand(-8, 8) }; World.collide(p, 0.6, 0);
    FX.beam(p.x, p.z); G.enemies.push(new Enemy('alien', p.x, p.z, G.wave));
  }
};
function endWave() {
  G.phase = 'break'; G.breakT = 8;
  P.ammo.forEach((a, i) => { a.mag = magSize(i); a.res = WEAPONS[i].reserve; });
  P.grenades = Math.min(P.mods.grenMax, P.grenades + 2);
  for (const m of G.mates) { if (m.downed) m.revive(100); else m.hp = m.maxHp; }
  P.hp = P.maxHp;
  const bonus = 250 * G.wave; P.score += bonus;
  banner(`Wave ${G.wave} cleared`, `+${fmt(bonus)} points · ammo and grenades restocked`, 'gold');
  SFX.fanfare();
  G.choices = rollPerks();
  if (G.choices.length) { G.perkOpen = true; G.perkDelay = 1.3; }
}
function rollPerks() {
  const pool = PERKS.filter(p => (P.perks[p.id] || 0) < p.max);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, 3);
}
function showPerks() {
  $('perk-title').textContent = `Wave ${G.wave} cleared · choose an upgrade`;
  $('perk-hint').textContent = G.touch ? 'Tap a card' : 'Press 1, 2 or 3, or click a card';
  $('perk-cards').innerHTML = G.choices.map((p, i) => {
    const lv = (P.perks[p.id] || 0) + 1;
    return `<button class="perk" data-i="${i}"><span class="pk-key">${i + 1}</span><span class="pk-name">${p.name}</span><span class="pk-desc">${p.desc}</span><span class="pk-lv">${p.max > 1 ? `Level ${lv} of ${p.max}` : 'One time'}</span></button>`;
  }).join('');
  $('perks').hidden = false;
}
function pickPerk(i) {
  if (!G.perkOpen || G.perkDelay > 0 || !G.choices[i]) return;
  const p = G.choices[i];
  P.perks[p.id] = (P.perks[p.id] || 0) + 1; p.apply(P.mods);
  if (p.id === 'mag') P.ammo.forEach((a, k) => { a.mag = magSize(k); });
  if (p.id === 'squad') for (const m of G.mates) { m.maxHp += 25; m.hp = m.maxHp; }
  G.perkOpen = false; $('perks').hidden = true; G.breakT = 8;
  G.feed(`${p.name}${P.perks[p.id] > 1 ? ' ' + roman(P.perks[p.id]) : ''}: ${p.desc}`, 'gold');
  SFX.perk();
}
function startEarly() {
  if (G.state !== 'play' || G.phase !== 'break' || G.perkOpen || G.breakT < 1) return;
  const bonus = Math.round(G.breakT) * 10 * Math.max(1, G.wave);
  P.score += bonus; G.breakT = 0;
  G.feed(`Early start +${fmt(bonus)}`, 'gold');
}
function updateWaves(dt) {
  if (G.phase === 'break') {
    if (G.perkOpen) { if (G.perkDelay > 0 && (G.perkDelay -= dt) <= 0) showPerks(); return; }
    if ((G.breakT -= dt) <= 0) startWave(G.wave + 1);
    return;
  }
  G.waveT += dt;
  let alive = 0; for (const e of G.enemies) if (!e.dead) alive++;
  if (G.queue.length && (G.spawnT -= dt) <= 0 && alive < G.maxAlive) { spawnEnemy(G.queue.shift()); G.spawnT = G.spawnGap * rand(0.6, 1.4); }
  // the last few stragglers of a long wave hurry up so nobody hunts for one lost zombie
  if ((G.strayT -= dt) <= 0) {
    G.strayT = 4;
    if (!G.queue.length && alive <= 4 && G.waveT > 30) for (const e of G.enemies) if (!e.dead && e.kind === 'zombie') { e.speed = Math.max(e.speed, 4.6); e.hitT = G.t; }
  }
  if (!G.queue.length && alive === 0) endWave();
}
G.pickTarget = (x, z) => {
  let best = null, bd = 1e9;
  if (P.hp > 0) { bd = Math.hypot(P.x - x, P.z - z) * 0.8; best = P; }
  for (const m of G.mates) if (!m.downed) { const d = Math.hypot(m.x - x, m.z - z); if (d < bd) { bd = d; best = m; } }
  return best;
};
G.onKill = (e, o) => {
  if (e.type === 'boss') { G.boss = null; }
  if (o.selfDestruct) return;
  const mine = !!(o.byPlayer || o.chain);
  let pts = e.d.score;
  if (o.head) pts *= 1.5;
  if (o.melee) pts *= 1.5;
  if (mine) {
    const c = G.combo;
    c.n = G.t - c.last < COMBO_WIN ? c.n + 1 : 1; c.last = G.t;
    if (c.n > P.bestCombo) P.bestCombo = c.n;
    pts *= comboMult(c.n);
    const call = STREAKS[c.n] || (c.n >= 40 && c.n % 20 === 0 ? P.char.cry : null);
    if (call) { announce(call, `${c.n} kill streak · points ×${comboMult(c.n)}`, c.n >= 12 ? 'gold' : ''); SFX.combo(Math.min(7, Object.keys(STREAKS).indexOf(String(c.n)) + (c.n >= 40 ? 7 : 0))); }
  }
  if (G.pow.double > 0) pts *= 2;
  if (!mine && !o.mate) pts = 0;
  pts = Math.round(pts); P.score += pts;
  if (mine) {
    P.kills++; if (o.head) P.heads++;
    if (P.mods.leech && P.hp > 0) P.hp = Math.min(P.maxHp, P.hp + P.mods.leech);
    const top = e.type === 'boss' ? e.y + 2.6 : e.y + 1.9 * e.d.scale;
    G.popups.push({ x: e.x, y: top, z: e.z, text: '+' + fmt(pts), t: 0, col: o.head ? '#ffd773' : G.pow.double > 0 ? '#ffe9a0' : '#f4efe2' });
    if (G.popups.length > 24) G.popups.shift();
    if (o.head || o.melee || e.type !== 'walker' && e.type !== 'runner') G.feed(`You → ${LABEL[e.type]}${o.head ? ' · headshot' : o.melee ? ' · melee' : ''} +${fmt(pts)}`, o.head ? 'gold' : '');
    if (P.mods.boom && !o.explosive && Math.random() < P.mods.boom) G.later(0.12, () => explode(e.x, 0.8, e.z, 4.5, 160));
  } else if (o.mate && e.type !== 'walker' && e.type !== 'runner') G.feed(`${o.mate.name} → ${LABEL[e.type]} +${fmt(pts)}`, 'blue');
  dropLoot(e);
  if (e.type === 'boss') banner('Invasion Commander destroyed!', `+${fmt(pts)} points · Paris can breathe, but not for long`, 'gold');
};

// ---------- pickups and power-ups ----------
function dropLoot(e) {
  if (e.type === 'boss') { spawnPickup('maxammo', e.x + 2, e.z); spawnPickup(['insta', 'double', 'rage'][Math.random() * 3 | 0], e.x - 2, e.z); return; }
  if (G.pickups.length >= 10) return;
  const L = P.mods.luck, low = P.hp < P.maxHp * 0.5 ? 2 : 1;
  const table = [[(e.type === 'brute' ? 0.35 : 0.022) * L, 'power'], [0.04 * L * low, 'health'], [0.04 * L, 'ammo'], [0.018 * L, 'grenade']];
  let r = Math.random();
  for (const [p, k] of table) {
    if (r < p) { spawnPickup(k === 'power' ? weighted({ insta: 3, double: 3, maxammo: 3, rage: 2, nuke: 1.4 }) : k, e.x, e.z); return; }
    r -= p;
  }
}
function weighted(w) { let s = 0; for (const k in w) s += w[k]; let r = Math.random() * s; for (const k in w) { if ((r -= w[k]) <= 0) return k; } return Object.keys(w)[0]; }
function spawnPickup(kind, x, z) {
  const m = Models.pickup(kind), p = { kind, x, z, t: 0, life: m.power ? 25 : 20, m };
  World.collide(p, 0.6, 0);
  m.root.position.set(p.x, 0, p.z); scene.add(m.root); G.pickups.push(p);
  if (m.power) G.feed(`${Models.PICK[kind][1]} dropped nearby`, 'gold');
  return p;
}
function updatePickups(dt) {
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i]; p.t += dt;
    p.m.spin.rotation.y += dt * 2.4; p.m.spin.position.y = 0.75 + Math.sin(p.t * 3) * 0.12;
    const left = p.life - p.t, d = Math.hypot(p.x - P.x, p.z - P.z);
    p.m.root.visible = left > 5 || Math.sin(p.t * 16) > -0.2;
    if (P.hp > 0 && d < 3.5 && d > 0.01) { const k = Math.min(d, dt * 7) / d; p.x += (P.x - p.x) * k; p.z += (P.z - p.z) * k; p.m.root.position.set(p.x, 0, p.z); }
    if (P.hp > 0 && d < 1.2) { G.pickups.splice(i, 1); scene.remove(p.m.root); collect(p); continue; }
    if (left <= 0) { G.pickups.splice(i, 1); scene.remove(p.m.root); }
  }
}
function collect(p) {
  const col = Models.PICK[p.kind][0], c = new THREE.Color(col);
  FX.burst(p.x, 1, p.z, 18, [c.r, c.g, c.b], 4, 0.25, 0.5, true, { up: 1.5 }); FX.ring(p.x, p.z, 3, col);
  switch (p.kind) {
    case 'health': P.hp = Math.min(P.maxHp, P.hp + 40); G.feed('+40 health', 'blue'); SFX.pickup(); break;
    case 'ammo': P.ammo.forEach((a, i) => { a.res = Math.max(a.res, WEAPONS[i].reserve); }); G.feed('Ammo restocked', 'blue'); SFX.pickup(); break;
    case 'grenade': P.grenades = Math.min(P.mods.grenMax, P.grenades + 2); G.feed('+2 grenades', 'blue'); SFX.pickup(); break;
    case 'maxammo':
      P.ammo.forEach((a, i) => { a.mag = magSize(i); a.res = WEAPONS[i].reserve; }); P.grenades = P.mods.grenMax;
      announce('Max Ammo', 'Every weapon full, grenades topped up', 'blue'); SFX.power(); break;
    case 'nuke': nuke(); break;
    default:
      G.pow[p.kind] = POWERS[p.kind].dur;
      announce(POWERS[p.kind].name, POWERS[p.kind].sub, p.kind); SFX.power();
  }
}
function nuke() {
  announce('Nuke', 'Everything in the street burns', 'nuke'); SFX.nuke();
  G.later(0.5, () => {
    G.whiteFlash = 0.85; G.shake = Math.max(G.shake, 1.3);
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (e.type === 'boss') { e.hurt(700, { byPlayer: true, explosive: true }); continue; }
      const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz) || 1;
      G.later(Math.min(1.1, d / 70), () => {
        if (e.dead) return;
        FX.burst(e.x, 1.2, e.z, 10, [1, 0.85, 0.55], 5, 0.3, 0.5, true, { up: 2 });
        e.hurt(1e6, { byPlayer: true, explosive: true, dirx: dx / d, dirz: dz / d });
      });
    }
  });
}
function updatePowers(dt) {
  for (const k in G.pow) if (G.pow[k] > 0 && (G.pow[k] -= dt) <= 0) { G.pow[k] = 0; G.feed(`${POWERS[k].name} wore off`); }
}

// ---------- player ----------
function camDir(out) { return out.set(0, 0, -1).applyQuaternion(camera.quaternion); }
function thirdPerson() { return G.tp && !(WEAPONS[P.w].id === 'sniper' && P.ads > 0.85); }
// shots start at the player, not behind them, so the third-person camera never shoots its own hero
function aimOrigin(dir) { return tmpO.copy(camera.position).addScaledVector(dir, thirdPerson() ? G.aimDist + 0.3 : 0); }
function muzzleWorld() {
  if (thirdPerson() && G.hero) return G.hero.gun.muzzle.getWorldPosition(tmpM);
  camDir(tmpD);
  const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw), side = 0.2 * (1 - P.ads), down = 0.15 * (1 - P.ads * 0.6);
  return tmpM.set(camera.position.x + tmpD.x * 0.75 + rx * side, camera.position.y + tmpD.y * 0.75 - down, camera.position.z + tmpD.z * 0.75 + rz * side);
}
function updatePlayer(dt) {
  const ch = P.char;
  if (keys.ArrowLeft) P.yaw += 2.2 * dt;
  if (keys.ArrowRight) P.yaw -= 2.2 * dt;
  if (keys.ArrowUp) P.pitch = clamp(P.pitch + 1.4 * dt, -1.4, 1.4);
  if (keys.ArrowDown) P.pitch = clamp(P.pitch - 1.4 * dt, -1.4, 1.4);
  // without pointer lock (some embeds refuse it) the screen edges keep turning the view
  if (G.freeMouse && !G.locked && !G.touch && G.mouseIn) {
    const ex = G.mx / innerWidth;
    if (ex < 0.05) P.yaw += 2.4 * dt; else if (ex > 0.95) P.yaw -= 2.4 * dt;
  }
  let f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const analog = G.move.x || G.move.y;
  if (analog) { f = -G.move.y; s = G.move.x; }
  const firing = mouseL || G.autoFiring;
  const sprintKey = analog ? Math.hypot(G.move.x, G.move.y) > 0.92 && f > 0.7 : !!(keys.ShiftLeft || keys.ShiftRight) && f > 0;
  P.sprinting = sprintKey && !mouseR && !firing && P.meleeAnim <= 0;
  const spd = ch.speed * P.mods.speed * (P.sprinting ? 1.45 : 1) * (P.ads > 0.5 ? 0.55 : 1);
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  let mx = fx * f + rx * s, mz = fz * f + rz * s;
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const acc = Math.min(1, (P.onGround ? 12 : 3) * dt);
  P.vx += (mx * spd - P.vx) * acc; P.vz += (mz * spd - P.vz) * acc;
  P.x += P.vx * dt; P.z += P.vz * dt;
  World.collide(P, P.r, P.y);
  if ((keys.Space || P.jumpReq) && P.onGround) { P.vy = 6.4; P.onGround = false; }
  P.jumpReq = false;
  P.vy -= 18 * dt; P.y += P.vy * dt;
  if (P.y <= 0) { P.y = 0; P.vy = 0; P.onGround = true; }
  P.moving = ml > 0.05 && P.onGround;
  P.bobT += dt * (P.moving ? Math.hypot(P.vx, P.vz) * 1.5 : 0);
  if (P.inv > 0) P.inv -= dt;
  if (G.t - P.lastHurt > 3.5 && P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + ch.regen * dt);
  if (P.specialT > 0) P.specialT -= dt;
  const ready = P.specialT <= 0;
  if (ready && !G.specialWasReady && G.t > 1) G.feed(`${ch.special} is ready · ${G.touch ? 'tap Ability' : 'press Q'}`, 'gold');
  G.specialWasReady = ready;
  let near = null;
  for (const m of G.mates) if (m.downed && Math.hypot(m.x - P.x, m.z - P.z) < 2.4) { near = m; break; }
  // on touch screens standing next to a downed squadmate revives them, no extra button needed
  if (near && (keys.KeyE || G.touch)) {
    P.reviveP += dt;
    if (P.reviveP >= 1.6) { near.revive(60); P.reviveP = 0; P.score += 100; G.feed(`${near.name} is back in the fight +100`, 'blue'); }
  } else P.reviveP = 0;
  G.reviveTarget = near;
}
function switchWeapon(i) {
  if (i === P.w || P.meleeAnim > 0) return;
  P.w = i; P.switchT = 0.35; P.reloadT = 0; P.ads = 0;
  if (P.flaming) { SFX.flame(false); P.flaming = false; }
  updateSlots();
}
function updateSlots() { document.querySelectorAll('.slots [data-s]').forEach(el => el.classList.toggle('on', +el.dataset.s === P.w)); }
function reload() {
  const W = WEAPONS[P.w], A = P.ammo[P.w];
  if (P.reloadT > 0 || A.mag >= magSize(P.w) || A.res <= 0 || P.meleeAnim > 0) return;
  P.reloadT = P.reloadDur = W.reload * P.char.reload * P.mods.reload; SFX.reload();
}
function updateWeapons(dt) {
  const W = WEAPONS[P.w], A = P.ammo[P.w], rage = G.pow.rage > 0;
  P.fireT -= dt; P.meleeT -= dt; P.grenT -= dt;
  if (P.switchT > 0) P.switchT -= dt;
  if (P.meleeAnim > 0) P.meleeAnim -= dt;
  if (P.meleeHit > 0 && (P.meleeHit -= dt) <= 0) meleeStrike();
  if (P.reloadT > 0 && (P.reloadT -= dt) <= 0) { const take = Math.min(magSize(P.w) - A.mag, A.res); A.mag += take; A.res -= take; }
  const busy = P.reloadT > 0 || P.switchT > 0 || P.meleeAnim > 0;
  // touch auto-fire: the gun shoots while the crosshair rests on an enemy in range
  G.autoFiring = G.touch && S.autofire && !!G.aimed && !G.aimed.dead && G.aimedDist < Math.min(W.range, 75) && !busy;
  const trigger = mouseL || G.autoFiring;
  const adsWant = mouseR && W.kind !== 'flame' && !busy && !P.sprinting;
  P.ads = clamp(P.ads + (adsWant ? 1 : -1) * dt * (W.id === 'sniper' ? 5 : 7), 0, 1);
  P.spreadNow = lerp(W.spread, W.adsSpread, P.ads) * (P.moving ? 1.6 : 1) * (P.onGround ? 1 : 2);
  let flaming = false;
  if (!busy && !P.sprinting) {
    if (W.kind === 'auto' && trigger && P.fireT <= 0) {
      if (A.mag > 0) { fireBullet(W); if (!rage) A.mag--; P.fireT = 1 / (W.rate * (rage ? 1.7 : 1)); }
      else { SFX.empty(); P.fireT = 0.3; reload(); }
    } else if (W.kind === 'bolt' && (clickL || G.autoFiring) && P.fireT <= 0) {
      if (A.mag > 0) { fireBullet(W); if (!rage) A.mag--; P.fireT = 1 / (W.rate * (rage ? 1.7 : 1)); }
      else { SFX.empty(); reload(); }
    } else if (W.kind === 'flame' && trigger) {
      if (A.mag > 0) { flaming = true; if (!rage) A.mag = Math.max(0, A.mag - W.use * dt); flameTick(W, dt); }
      else reload();
    }
  }
  clickL = false;
  if (flaming !== P.flaming) { P.flaming = flaming; SFX.flame(flaming); }
  P.recoil *= Math.max(0, 1 - dt * 6);
  P.kick *= Math.max(0, 1 - dt * 12);
}
function hitmarker(kill, head) {
  if (kill) SFX.kill(); else if (!G.hm || G.hm.t < 0.1) SFX.hit();
  G.hm = { t: 0.18, kill: kill || (G.hm && G.hm.kill && G.hm.t > 0.1), head };
}
function hitscan(o, d, range, dmg, opts) {
  const block = World.rayBlock(o.x, o.y, o.z, d.x, d.y, d.z, range), hits = [];
  for (const e of G.enemies) { const h = e.hitTest(o, d); if (h && h.t < block) hits.push({ e, t: h.t, head: h.head }); }
  hits.sort((a, b) => a.t - b.t);
  const n = Math.min(hits.length, opts.pierce);
  let endT = block;
  if (n) P.hits++;
  for (let i = 0; i < n; i++) {
    const h = hits[i], px = o.x + d.x * h.t, py = o.y + d.y * h.t, pz = o.z + d.z * h.t;
    const killed = h.e.hurt(dmg * (h.head ? opts.headMul : 1) * Math.pow(0.75, i), { head: h.head, dirx: d.x, dirz: d.z, byPlayer: true });
    FX.blood(px, py, pz, d.x, d.z, h.e.kind);
    hitmarker(killed, h.head);
    if (i === n - 1 && n === opts.pierce) endT = h.t;
  }
  if (endT === block && block < range) FX.impact(o.x + d.x * block, o.y + d.y * block, o.z + d.z * block);
  return { x: o.x + d.x * endT, y: o.y + d.y * endT, z: o.z + d.z * endT };
}
function fireBullet(W) {
  camDir(tmpD);
  const sp = P.spreadNow;
  if (sp > 0) { tmpD.x += rand(-sp, sp); tmpD.y += rand(-sp, sp); tmpD.z += rand(-sp, sp); tmpD.normalize(); }
  const dir = tmpD.clone(), o = aimOrigin(dir).clone(), sn = W.id === 'sniper';
  P.shots++;
  const end = hitscan(o, dir, W.range, W.dmg * P.mods.dmg, { pierce: (W.pierce || 1) + (sn ? 0 : P.mods.pierce), headMul: (sn ? 2.5 : 2) + P.mods.head });
  const mz = muzzleWorld();
  FX.tracer(mz.x, mz.y, mz.z, end.x, end.y, end.z, sn ? [1, 0.92, 0.75] : G.pow.rage > 0 ? [1, 0.55, 0.25] : [1, 0.78, 0.42], sn ? 0.12 : 0.06);
  if (!(sn && P.ads > 0.85)) FX.muzzle(mz.x, mz.y, mz.z, dir.x, dir.y, dir.z, sn);
  if (thirdPerson()) FX.light(mz.x, mz.y, mz.z, 0xffb060, sn ? 6 : 3.5, 0.05); else FX.playerFlash(sn && P.ads > 0.85 ? 0.8 : sn ? 6 : 3.5);
  P.recoil += W.recoil * (1 - 0.5 * P.ads); P.yaw += rand(-1, 1) * W.recoil * 0.35; P.kick = 1; P.flashT = 0.045;
  G.shake = Math.max(G.shake, sn ? 0.18 : 0.05);
  if (sn) SFX.sniper(); else SFX.rifle();
}
function flameTick(W, dt) {
  camDir(tmpD);
  const dir = tmpD.clone(), mz = muzzleWorld(), cp = tmpP.set(P.x, P.y + 1.55, P.z);
  FX.flame(mz.x, mz.y, mz.z, dir.x, dir.y, dir.z);
  if (thirdPerson()) FX.light(mz.x, mz.y, mz.z, 0xff8a30, 2, 0.06); else FX.playerFlash(1.2);
  const heat = P.mods.dmg * P.mods.flame;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const ex = e.x - cp.x, ey = (e.type === 'boss' ? e.y : e.y + 1.1 * e.d.scale) - cp.y, ez = e.z - cp.z, dist = Math.hypot(ex, ey, ez);
    if (dist > W.range + e.r) continue;
    const dot = (ex * dir.x + ey * dir.y + ez * dir.z) / (dist || 1);
    if (dot < 0.9 - Math.min(0.2, 1 / (dist + 1))) continue;
    if (!World.segmentClear(P.x, P.z, e.x, e.z)) continue;
    const killed = e.hurt(W.dmg * heat * dt * (1 - dist / (W.range * 2.2)), { silent: true, fire: true, burnTime: 3 * P.mods.flame, byPlayer: true, dirx: dir.x, dirz: dir.z });
    if (!killed && Math.random() < dt * 2) { e.flash = 0.05; e.setFlash(true); }
    if (killed || Math.random() < dt * 5) hitmarker(killed, false);
  }
}
function melee() {
  if (P.meleeT > 0 || G.state !== 'play') return;
  P.meleeT = 0.7; P.meleeAnim = 0.38; P.meleeHit = 0.12; P.reloadT = 0;
  if (P.flaming) { SFX.flame(false); P.flaming = false; }
  SFX.swoosh();
}
function meleeStrike() {
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  let any = false;
  for (const e of G.enemies) {
    if (e.dead || e.type === 'boss') continue;
    const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz);
    if (d > P.char.meleeR + e.r || (dx * fx + dz * fz) / (d || 1) < 0.35) continue;
    const killed = e.hurt(P.char.melee, { dirx: fx, dirz: fz, knock: { x: fx * 7, z: fz * 7 }, byPlayer: true, melee: true });
    FX.blood(e.x, 1.2 * e.d.scale, e.z, fx, fz, e.kind); hitmarker(killed, false); any = true;
  }
  if (any) G.shake = Math.max(G.shake, 0.2);
}
function throwGrenade() {
  if (G.state !== 'play' || P.grenades <= 0 || P.grenT > 0 || P.meleeAnim > 0) return;
  P.grenades--; P.grenT = 0.9; P.throwAnim = 0.4;
  camDir(tmpD);
  const g = { x: P.x + tmpD.x * 0.6, y: P.y + 1.6 + tmpD.y * 0.6, z: P.z + tmpD.z * 0.6, vx: tmpD.x * 17 + P.vx, vy: tmpD.y * 17 + 4.5, vz: tmpD.z * 17 + P.vz, fuse: 2.1, mesh: new THREE.Mesh(GREN_GEO, Models.M(0x3d4a2c, { r: 0.6, m: 0.3 })) };
  g.mesh.castShadow = true; g.mesh.position.set(g.x, g.y, g.z); scene.add(g.mesh); G.grenades.push(g);
  SFX.throwG();
}
// o.byPlayer: false keeps the kills off your streak; o.self hurts you a little (your own grenade); o.toxic is a bloater burst
function explode(x, y, z, R, dmg, o) {
  o = o || {};
  const credit = o.byPlayer !== false;
  FX.explosion(x, y, z, R / 7);
  if (o.toxic) {
    FX.burst(x, 1.1, z, 46, [0.62, 1, 0.3], 8, 0.5, 0.75, true, { grav: 3, drag: 1.5 });
    for (let i = 0; i < 10; i++) FX.smoke(x + rand(-2, 2), 0.6, z + rand(-2, 2), [0.4, 0.55, 0.2], 2.2);
  }
  const pd = Math.hypot(P.x - x, P.z - z, P.y + 1 - y);
  if (o.toxic) SFX.squelch(Math.max(0.2, 1 - pd / 50));
  SFX.explosion(Math.max(0.15, 1 - pd / 90));
  G.shake = Math.max(G.shake, Math.max(0, 1.2 - pd / 25));
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.x - x, dz = e.z - z, d = Math.hypot(dx, dz, e.y + 1 - y);
    if (d >= R + e.r) continue;
    const k = Math.max(0.15, 1 - d / (R + e.r)), dl = Math.hypot(dx, dz) || 1;
    e.hurt(dmg * k, { explosive: true, dirx: dx / dl, dirz: dz / dl, knock: { x: dx / dl * 12 * k, z: dz / dl * 12 * k }, byPlayer: credit, chain: credit });
  }
  if (o.self && pd < R) P.damage(dmg * (1 - pd / R) * 0.3, { x, z });
  if (o.hurtAll) {
    if (pd < R) P.damage(o.hurtAll * (1 - pd / R), { x, z });
    for (const m of G.mates) { const d = Math.hypot(m.x - x, m.z - z); if (!m.downed && d < R) m.damage(o.hurtAll * (1 - d / R)); }
  }
}
// a short, uneven fuse makes a cluster of bloaters go off as a rolling chain instead of one flash
G.bloaterBurst = (x, z, credit) => { G.later(0.1 + Math.random() * 0.1, () => explode(x, 0.5, z, 6, 260, { toxic: true, byPlayer: credit, hurtAll: 32 })); };
function special() {
  if (P.specialT > 0 || G.state !== 'play') return;
  const ch = P.char; P.specialT = ch.specialCd * P.mods.cd;
  if (ch.key === 'napoleon') {
    camDir(tmpD);
    const o = aimOrigin(tmpD), t = World.rayBlock(o.x, o.y, o.z, tmpD.x, tmpD.y, tmpD.z, 120);
    const p = t >= 120 ? { x: P.x - Math.sin(P.yaw) * 45, z: P.z - Math.cos(P.yaw) * 45 } : { x: o.x + tmpD.x * t, z: o.z + tmpD.z * t };
    World.collide(p, 1, 0);
    G.flares.push({ x: p.x, z: p.z, t: 2.8 });
    for (let i = 0; i < 8; i++) G.shells.push({ x: p.x + rand(-7, 7), z: p.z + rand(-7, 7), t: 1.4 + i * 0.2, w: i % 2 === 1 });
    G.feed('Artillery is aiming at the red smoke', 'gold');
  } else {
    FX.ring(P.x, P.z, 10, 0xffd27a);
    FX.burst(P.x, 1, P.z, 50, [1, 0.85, 0.45], 9, 0.35, 0.7, true);
    FX.light(P.x, 2, P.z, 0xffd27a, 8, 0.6);
    for (const e of G.enemies) {
      if (e.dead) continue;
      const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz) || 0.01;
      if (d < 9 + e.r) e.hurt(300 * P.mods.dmg * (1 - d / 12), { dirx: dx / d, dirz: dz / d, knock: { x: dx / d * 16, z: dz / d * 16 }, stun: 1.2, byPlayer: true, explosive: true });
    }
    P.inv = 5; P.hp = Math.min(P.maxHp, P.hp + 50);
    SFX.holy(); G.shake = Math.max(G.shake, 0.5);
  }
}

// ---------- projectiles ----------
G.addBolt = (x, y, z, vx, vy, vz, dmg, kind) => {
  const mesh = new THREE.Mesh(BOLT_GEO, BOLT_MAT[kind]); mesh.position.set(x, y, z); scene.add(mesh);
  G.bolts.push({ x, y, z, vx, vy, vz, dmg, kind, life: 3.5, mesh });
};
function updateBolts(dt) {
  for (let i = G.bolts.length - 1; i >= 0; i--) {
    const b = G.bolts[i], col = BOLT_COL[b.kind];
    b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.mesh.position.set(b.x, b.y, b.z);
    FX.add.emit(b.x, b.y, b.z, 0, 0, 0, col[0], col[1], col[2], 0.4, 0.22);
    let hit = false;
    if (P.hp > 0 && Math.abs(b.y - (P.y + 1)) < 1 && Math.hypot(b.x - P.x, b.z - P.z) < 0.55) { P.damage(b.dmg, b); hit = true; }
    if (!hit) for (const m of G.mates) if (!m.downed && b.y < 2 && Math.hypot(b.x - m.x, b.z - m.z) < 0.55) { m.damage(b.dmg); hit = true; break; }
    if (hit || b.y < 0.05 || b.life <= 0 || World.pointBlocked(b.x, b.y, b.z)) {
      FX.burst(b.x, b.y, b.z, 10, col, 4, 0.3, 0.4, true);
      scene.remove(b.mesh); G.bolts.splice(i, 1);
    }
  }
}
function updateGrenades(dt) {
  for (let i = G.grenades.length - 1; i >= 0; i--) {
    const g = G.grenades[i];
    g.vy -= 20 * dt;
    let nx = g.x + g.vx * dt, ny = g.y + g.vy * dt, nz = g.z + g.vz * dt;
    if (World.pointBlocked(nx, g.y, g.z)) { g.vx *= -0.4; nx = g.x; }
    if (World.pointBlocked(g.x, g.y, nz)) { g.vz *= -0.4; nz = g.z; }
    if (World.pointBlocked(nx, ny, nz) && g.vy < 0) { g.vy = -g.vy * 0.3; ny = g.y; }
    if (ny < 0.11) {
      ny = 0.11;
      if (g.vy < -2) SFX.bounce(Math.max(0, 1 - Math.hypot(g.x - P.x, g.z - P.z) / 30));
      g.vy = -g.vy * 0.35; g.vx *= 0.65; g.vz *= 0.65;
    }
    g.x = nx; g.y = ny; g.z = nz;
    g.mesh.position.set(g.x, g.y, g.z); g.mesh.rotation.x += dt * 8;
    if ((g.fuse -= dt) <= 0) { scene.remove(g.mesh); G.grenades.splice(i, 1); explode(g.x, g.y, g.z, 7.5 * P.mods.blast, 320 * P.mods.blast, { self: true }); }
  }
}
function updateShells(dt) {
  for (let i = G.shells.length - 1; i >= 0; i--) {
    const s = G.shells[i]; s.t -= dt;
    if (s.w && s.t < 0.95) { s.w = false; SFX.whistle(); }
    if (s.t <= 0) { G.shells.splice(i, 1); explode(s.x, 0.3, s.z, 6.5 * P.mods.blast, 280 * P.mods.blast); }
  }
  for (let i = G.flares.length - 1; i >= 0; i--) {
    const f = G.flares[i];
    if (Math.random() < dt * 22) FX.smoke(f.x + rand(-0.3, 0.3), 0.3, f.z + rand(-0.3, 0.3), [0.85, 0.22, 0.16], 0.9);
    if ((f.t -= dt) <= 0) G.flares.splice(i, 1);
  }
}
function ambient(dt) {
  for (const e of World.emitters) {
    if (e.type === 'fire') { if (Math.random() < dt * 45) FX.fire(e.x + rand(-1.2, 1.2), e.y, e.z + rand(-0.6, 0.6), 1.4); }
    else if (Math.random() < dt * 30) FX.water(e.x, e.y, e.z);
  }
  if (Math.random() < dt * 5) {
    const c = camera.position;
    FX.norm.emit(c.x + rand(-12, 12), c.y + rand(2, 6), c.z + rand(-12, 12), rand(-0.3, 0.3), -0.4, rand(-0.3, 0.3), 0.3, 0.28, 0.27, 0.06, 6, { alpha: 0.7 });
  }
}

// ---------- per frame ----------
function updateCamera(dt) {
  const W = WEAPONS[P.w], base = G.baseFov;
  const pitch = clamp(P.pitch + P.recoil, -1.4, 1.4);
  camera.rotation.set(pitch, P.yaw, 0);
  if (!thirdPerson()) {
    const bob = P.moving ? Math.sin(P.bobT * 2) * 0.035 * (1 - P.ads * 0.85) : 0;
    camera.position.set(P.x, P.y + 1.62 + bob, P.z);
    G.aimDist = 0;
  } else {
    // over-the-shoulder camera that pulls in when a wall is behind the hero
    const cp = Math.cos(pitch), fx = -Math.sin(P.yaw) * cp, fy = Math.sin(pitch), fz = -Math.cos(P.yaw) * cp;
    const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const side = lerp(0.9, 0.55, P.ads), back = lerp(3.4, 1.8, P.ads);
    const st = World.rayBlock(P.x, P.y + 1.7, P.z, rx, 0, rz, side + 0.3);
    const sd = Math.max(0, Math.min(side, st - 0.3));
    const px = P.x + rx * sd, py = P.y + 1.82, pz = P.z + rz * sd;
    let dx = -fx, dy = -fy + 0.15, dz = -fz; const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
    const t = World.rayBlock(px, py, pz, dx, dy, dz, back + 0.3);
    const want = Math.max(0.35, Math.min(back, t - 0.3));
    G.camDist = want < G.camDist ? want : lerp(G.camDist, want, Math.min(1, dt * 6));
    camera.position.set(px + dx * G.camDist, py + dy * G.camDist, pz + dz * G.camDist);
    G.aimDist = G.camDist;
  }
  const sh = G.shake * (G.reduced ? 0.3 : 1) * 0.08;
  if (sh > 0) camera.position.add(tmpP.set(rand(-sh, sh), rand(-sh, sh), rand(-sh, sh)));
  G.shake = Math.max(0, G.shake - dt * 2.2);
  const scope = base * 0.267;
  let fov = base;
  if (W.id === 'sniper') fov = P.ads > 0.85 ? scope : lerp(base, base * 0.827, P.ads);
  else if (W.id === 'rifle') fov = lerp(base, base * (thirdPerson() ? 0.827 : 0.733), P.ads);
  if (P.sprinting) fov += 5;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = (W.id === 'sniper' && (fov === scope || camera.fov < base * 0.53)) ? fov : lerp(camera.fov, fov, Math.min(1, dt * 14));
    camera.updateProjectionMatrix(); FX.setScale(hudDim.h * renderer.getPixelRatio(), camera.fov);
  }
}
function updateHero(dt) {
  const h = G.hero; if (!h) return;
  h.root.visible = thirdPerson();
  if (!h.root.visible) return;
  h.root.position.set(P.x, P.y, P.z); h.root.rotation.y = P.yaw + Math.PI;
  const spd = Math.hypot(P.vx, P.vz), fwd = P.vx * -Math.sin(P.yaw) + P.vz * -Math.cos(P.yaw), dir = fwd < -0.5 ? -1 : 1;
  G.heroPhase += dt * (1.2 + spd * 1.7);
  const s = Math.sin(G.heroPhase), sw = Math.min(1, spd / 4) * (P.sprinting ? 0.85 : 0.6);
  if (P.onGround) {
    h.legL.rotation.x = s * sw * dir; h.legR.rotation.x = -s * sw * dir;
    h.kneeL.rotation.x = Math.max(0, Math.sin(G.heroPhase + 1.5)) * sw * 1.5 + 0.05;
    h.kneeR.rotation.x = Math.max(0, Math.sin(G.heroPhase + 1.5 + Math.PI)) * sw * 1.5 + 0.05;
  } else { h.legL.rotation.x = -0.6; h.kneeL.rotation.x = 1.0; h.legR.rotation.x = 0.25; h.kneeR.rotation.x = 0.5; }
  h.body.position.y = Math.abs(Math.cos(G.heroPhase)) * 0.045 * sw;
  const aim = clamp(P.pitch, -0.9, 0.9);
  h.torso.rotation.x = -aim * 0.55 + (P.sprinting ? 0.18 : 0.04);
  h.neck.rotation.x = -aim * 0.35;
  h.torso.rotation.y = P.meleeAnim > 0 ? Math.sin((1 - P.meleeAnim / 0.38) * Math.PI) * 0.9 : 0;
  h.gun.g.position.z = 0.16 - P.kick * 0.05;
  h.gun.g.rotation.x = P.reloadT > 0 ? Math.sin((1 - P.reloadT / P.reloadDur) * Math.PI) * 0.6 : 0;
}
function updateViewmodel(dt) {
  const vm = G.vm; if (!vm) return;
  const W = WEAPONS[P.w], a = P.ads;
  vm.guns.forEach((g, i) => { g.visible = i === P.w && P.meleeAnim <= 0; });
  vm.root.visible = !G.tp && !(W.id === 'sniper' && a > 0.85);
  const hip = [0.24, -0.25, -0.5], ads = W.id === 'sniper' ? [0, -0.095, -0.34] : [0, -0.1, -0.36];
  let x = lerp(hip[0], ads[0], a), y = lerp(hip[1], ads[1], a), z = lerp(hip[2], ads[2], a), rx = 0, ry = 0, rz = 0;
  const bobAmt = (P.moving ? 1 : 0) * (1 - a * 0.85) * (P.sprinting ? 1.8 : 1);
  x += Math.sin(P.bobT) * 0.012 * bobAmt; y -= Math.abs(Math.cos(P.bobT)) * 0.012 * bobAmt;
  y += Math.sin(G.t * 1.6) * 0.003 * (1 - a);
  G.swayX *= Math.max(0, 1 - dt * 10); G.swayY *= Math.max(0, 1 - dt * 10);
  ry += G.swayX; rx += G.swayY;
  z += P.kick * (W.id === 'sniper' ? 0.08 : 0.035); rx += P.kick * (W.id === 'sniper' ? 0.18 : 0.05);
  P.sprintAmt = lerp(P.sprintAmt, P.sprinting ? 1 : 0, Math.min(1, dt * 10));
  rx -= 0.35 * P.sprintAmt; ry += 0.6 * P.sprintAmt; x -= 0.04 * P.sprintAmt; y -= 0.05 * P.sprintAmt;
  if (P.reloadT > 0) { const s = Math.sin((1 - P.reloadT / P.reloadDur) * Math.PI); rz += s * 0.6; rx += s * 0.25; y -= s * 0.08; }
  if (P.switchT > 0) { const k = P.switchT / 0.35; y -= k * 0.25; rx -= k * 0.5; }
  if (P.throwAnim > 0) { P.throwAnim -= dt; y -= Math.sin(P.throwAnim / 0.4 * Math.PI) * 0.15; }
  vm.root.position.set(x, y, z); vm.root.rotation.set(rx, ry, rz);
  vm.flashes.forEach((f, i) => { if (!f) return; f.visible = i === P.w && P.flashT > 0; if (f.visible) { f.rotation.z = Math.random() * 6; f.scale.setScalar(rand(0.8, 1.3)); } });
  if (P.flashT > 0) P.flashT -= dt;
  vm.pilot.scale.setScalar(rand(0.8, 1.3) * (P.flaming ? 2.5 : 1));
  vm.sword.visible = P.meleeAnim > 0;
  if (P.meleeAnim > 0) {
    const k = 1 - P.meleeAnim / 0.38;
    vm.root.position.set(0, 0, 0); vm.root.rotation.set(0, 0, 0);
    vm.sword.position.set(lerp(0.4, -0.3, k), lerp(-0.1, -0.35, k), -0.55); vm.sword.rotation.set(-0.5, 0, lerp(-0.9, 1.7, k));
  }
}
// which enemy is under the crosshair (checked 10x per second); touch players also get a gentle aim pull
function updateAim(dt) {
  if (G.touch && G.aimTarget && !G.aimTarget.dead && (mouseL || G.autoFiring || G.move.x || G.move.y)) {
    const e = G.aimTarget, cy = e.type === 'boss' ? e.y : e.y + 1.3 * e.d.scale, c = camera.position;
    const wantYaw = Math.atan2(-(e.x - c.x), -(e.z - c.z)), wantPitch = Math.atan2(cy - c.y, Math.hypot(e.x - c.x, e.z - c.z));
    const dy = Math.atan2(Math.sin(wantYaw - P.yaw), Math.cos(wantYaw - P.yaw)), dp = wantPitch - P.pitch;
    if (Math.abs(dy) < 0.12 && Math.abs(dp) < 0.12) { const k = Math.min(1, dt * 3); P.yaw += dy * k; P.pitch += dp * k * 0.7; }
  }
  if ((G.aimScan -= dt) > 0) return;
  G.aimScan = 0.1;
  camDir(tmpD); const o = aimOrigin(tmpD), block = World.rayBlock(o.x, o.y, o.z, tmpD.x, tmpD.y, tmpD.z, 150);
  let best = null, bt = block;
  for (const e of G.enemies) { const h = e.hitTest(o, tmpD); if (h && h.t < bt) { bt = h.t; best = e; } }
  G.aimed = best; G.aimedDist = best ? Math.hypot(best.x - P.x, best.z - P.z) : 99;
  if (G.touch) {
    let bestA = 0.12; G.aimTarget = null;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const dx = e.x - o.x, dz = e.z - o.z, d = Math.hypot(dx, dz); if (d > 90) continue;
      const a = Math.abs(Math.atan2(Math.sin(Math.atan2(-dx, -dz) - P.yaw), Math.cos(Math.atan2(-dx, -dz) - P.yaw)));
      if (a < bestA && World.segmentClear(P.x, P.z, e.x, e.z)) { bestA = a; G.aimTarget = e; }
    }
  }
}
function setText(id, v) { const el = $(id); if (el.textContent !== v) el.textContent = v; }
function updateHUD() {
  const W = WEAPONS[P.w], A = P.ammo[P.w];
  setText('score', fmt(P.score)); setText('kills', String(P.kills)); setText('heads', String(P.heads));
  $('hpfill').style.transform = `scaleX(${clamp(P.hp / P.maxHp, 0, 1)})`; setText('hpnum', String(Math.ceil(P.hp)));
  $('hpbox').classList.toggle('low', P.hp / P.maxHp < 0.3);
  const cd = P.char.specialCd * P.mods.cd;
  $('spfill').style.transform = `scaleX(${clamp(1 - Math.max(0, P.specialT) / cd, 0, 1)})`;
  $('spbox').classList.toggle('ready', P.specialT <= 0);
  $('t-special').classList.toggle('ready', P.specialT <= 0);
  setText('sp-name', P.specialT <= 0 ? `${P.char.special} · ready` : `${P.char.special} · ${Math.ceil(P.specialT)} s`);
  setText('wname', W.name + (P.reloadT > 0 ? ' · reloading' : G.pow.rage > 0 ? ' · rage' : ''));
  setText('mag', G.pow.rage > 0 ? '∞' : String(Math.ceil(A.mag))); setText('res', String(Math.floor(A.res)));
  $('ammobox').classList.toggle('empty', A.mag <= 0);
  setText('gren', String(P.grenades)); setText('t-gren-n', String(P.grenades));
  setText('view', G.tp ? 'T · first person' : 'T · third person');
  $('reloadhint').hidden = !(A.mag < magSize(P.w) * 0.25 && A.res > 0 && P.reloadT <= 0);
  setText('reloadhint', G.touch ? 'Tap Reload' : 'R · reload');
  const nb = $('t-next');
  if (G.phase === 'break') {
    setText('wave-label', G.wave === 0 ? 'Get ready' : `Wave ${G.wave} cleared`);
    setText('wave-sub', G.perkOpen ? 'Choose an upgrade' : `Next wave in ${Math.max(0, Math.ceil(G.breakT))} s${G.touch ? '' : ' · Enter to start now'}`);
    nb.hidden = G.perkOpen;
  } else {
    let left = G.queue.length; for (const e of G.enemies) if (!e.dead) left++;
    setText('wave-label', `Wave ${G.wave}`);
    setText('wave-sub', `${left} ${left === 1 ? 'enemy' : 'enemies'} left`);
    nb.hidden = true;
  }
  $('bossbar').hidden = !G.boss;
  if (G.boss) $('bossfill').style.transform = `scaleX(${clamp(G.boss.hp / G.boss.maxHp, 0, 1)})`;
  for (const k in G.pow) { const el = $('pw-' + k); el.hidden = G.pow[k] <= 0; if (G.pow[k] > 0) setText('pw-' + k + '-t', String(Math.ceil(G.pow[k]))); }
  const c = G.combo, cl = COMBO_WIN - (G.t - c.last);
  if (cl <= 0 && c.n) c.n = 0;
  $('combo').hidden = c.n < 2;
  if (c.n >= 2) { setText('combo-n', String(c.n)); setText('combo-x', comboMult(c.n) > 1 ? `×${comboMult(c.n)}` : ''); $('combo-fill').style.transform = `scaleX(${clamp(cl / COMBO_WIN, 0, 1)})`; }
  setText('place', World.STREETS[World.region(P.x, P.z)] || World.STREETS.P);
  G.mates.forEach((m, i) => { const row = $('mate' + i); if (!row) return; row.classList.toggle('down', m.downed); $('matefill' + i).style.transform = `scaleX(${m.downed ? 1 : m.hp / m.maxHp})`; });
  const low = P.hp / P.maxHp < 0.35 ? (0.35 - P.hp / P.maxHp) * 2.2 * (0.75 + 0.25 * Math.sin(G.t * 6)) : 0;
  $('hurt').style.opacity = String(Math.min(1, Math.max(G.hurtFlash, low)));
  $('holy').style.opacity = String(P.inv > 0 ? Math.min(1, P.inv) * 0.9 : G.pow.insta > 0 ? 0.35 : 0);
  $('white').style.opacity = String(G.whiteFlash);
  const pr = $('prompt');
  if (G.reviveTarget) { pr.hidden = false; setText('prompt', P.reviveP > 0 ? `Reviving ${G.reviveTarget.name} ${Math.round(P.reviveP / 1.6 * 100)}%` : G.touch ? `Stay next to ${G.reviveTarget.name} to revive` : `Hold E to revive ${G.reviveTarget.name}`); }
  else pr.hidden = true;
  $('lockhint').hidden = G.locked || !G.freeMouse || G.touch;
}
function enemyTag(c, e, w, h, full) {
  const s = e.type === 'boss' ? 1 : e.d.scale, top = e.type === 'boss' ? e.y + 2.8 : e.y + 2.05 * s;
  tmpP.set(e.x, top, e.z).project(camera);
  if (tmpP.z > 1 || Math.abs(tmpP.x) > 1.1 || Math.abs(tmpP.y) > 1.1) return;
  const sx = (tmpP.x + 1) / 2 * w, sy = (1 - tmpP.y) / 2 * h, bw = full ? 74 : 44, k = clamp(e.hp / e.maxHp, 0, 1);
  const col = enemyCol(e);
  c.fillStyle = 'rgba(8,10,16,.7)'; c.fillRect(sx - bw / 2 - 1, sy - 1, bw + 2, 6);
  c.fillStyle = col; c.fillRect(sx - bw / 2, sy, bw * k, 4);
  if (full) {
    c.font = '700 15px "Barlow Condensed", "Arial Narrow", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'bottom';
    c.lineWidth = 4; c.strokeStyle = 'rgba(8,10,16,.85)'; c.strokeText(LABEL[e.type].toUpperCase(), sx, sy - 3);
    c.fillStyle = col; c.fillText(LABEL[e.type].toUpperCase(), sx, sy - 3);
  }
}
function drawHUD() {
  const c = hctx, { w, h, dpr } = hudDim;
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
  if (G.state !== 'play') return;
  const cx = w / 2, cy = h / 2, W = WEAPONS[P.w];
  const scoped = W.id === 'sniper' && P.ads > 0.85;
  if (!scoped) {
    for (const e of G.enemies) if (!e.dead && e !== G.aimed && G.t - (e.hitT || -9) < 3) enemyTag(c, e, w, h, false);
    if (G.aimed && !G.aimed.dead) enemyTag(c, G.aimed, w, h, true);
    // floating score numbers above each of your kills
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = G.popups.length - 1; i >= 0; i--) {
      const p = G.popups[i];
      tmpP.set(p.x, p.y + p.t * 0.9, p.z).project(camera);
      if (tmpP.z > 1) continue;
      const k = p.t / 0.9, sx = (tmpP.x + 1) / 2 * w, sy = (1 - tmpP.y) / 2 * h, sz = 22 * (k < 0.15 ? 0.6 + k / 0.15 * 0.4 : 1);
      c.globalAlpha = clamp((1 - k) * 2.2, 0, 1);
      c.font = `700 ${sz}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      c.lineWidth = 4; c.strokeStyle = 'rgba(8,10,16,.85)'; c.strokeText(p.text, sx, sy); c.fillStyle = p.col; c.fillText(p.text, sx, sy);
    }
    c.globalAlpha = 1;
  }
  if (scoped) {
    const R = Math.min(w, h) * 0.44, ox = cx + Math.sin(G.t * 1.1) * 3, oy = cy + Math.sin(G.t * 1.7) * 2.5;
    c.fillStyle = '#000'; c.beginPath(); c.rect(0, 0, w, h); c.arc(ox, oy, R, 0, Math.PI * 2, true); c.fill();
    const g = c.createRadialGradient(ox, oy, R * 0.72, ox, oy, R); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.9)');
    c.fillStyle = g; c.beginPath(); c.arc(ox, oy, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.92)'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(ox - R, oy); c.lineTo(ox + R, oy); c.moveTo(ox, oy - R); c.lineTo(ox, oy + R); c.stroke();
    c.lineWidth = 5; c.beginPath();
    c.moveTo(ox - R, oy); c.lineTo(ox - R * 0.14, oy); c.moveTo(ox + R * 0.14, oy); c.lineTo(ox + R, oy); c.moveTo(ox, oy + R * 0.14); c.lineTo(ox, oy + R);
    c.stroke();
    c.fillStyle = 'rgba(0,0,0,.92)';
    for (let i = 1; i <= 4; i++) { const o = R * 0.028 * i; for (const [dx, dy] of [[o, 0], [-o, 0], [0, o], [0, -o]]) { c.beginPath(); c.arc(ox + dx, oy + dy, 1.6, 0, 7); c.fill(); } }
    c.fillStyle = '#ff3a2a'; c.beginPath(); c.arc(ox, oy, 1.5, 0, 7); c.fill();
  } else if (W.id === 'rifle' && P.ads > 0.6 && !G.tp) {
    c.fillStyle = 'rgba(255,60,40,.95)'; c.shadowColor = 'rgba(255,40,20,.85)'; c.shadowBlur = 6;
    c.beginPath(); c.arc(cx, cy, 2.2, 0, 7); c.fill(); c.shadowBlur = 0;
  } else if (P.meleeAnim <= 0 && !P.sprinting) {
    const gap = 6 + P.spreadNow * 650, len = 8;
    const col = G.aimed ? 'rgba(255,90,70,.95)' : 'rgba(245,240,225,.95)';
    const lines = () => { c.beginPath(); c.moveTo(cx - gap - len, cy); c.lineTo(cx - gap, cy); c.moveTo(cx + gap, cy); c.lineTo(cx + gap + len, cy); c.moveTo(cx, cy - gap - len); c.lineTo(cx, cy - gap); c.moveTo(cx, cy + gap); c.lineTo(cx, cy + gap + len); c.stroke(); };
    c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 4; lines();
    c.strokeStyle = col; c.lineWidth = 2; lines();
  }
  if (G.hm) {
    const k = G.hm.t / 0.18, s = 7 + (1 - k) * 4;
    c.strokeStyle = G.hm.kill ? `rgba(255,80,60,${k})` : G.hm.head ? `rgba(255,215,120,${k})` : `rgba(255,255,255,${k})`;
    c.lineWidth = 2.5; c.beginPath();
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { c.moveTo(cx + sx * 4, cy + sy * 4); c.lineTo(cx + sx * (s + 4), cy + sy * (s + 4)); }
    c.stroke();
  }
  const facing = Math.atan2(-Math.sin(P.yaw), -Math.cos(P.yaw));
  for (const d of G.dmgInd) {
    const a = facing - d.ang - Math.PI / 2;
    c.strokeStyle = `rgba(230,40,30,${Math.min(1, d.t) * 0.9})`; c.lineWidth = 7;
    c.beginPath(); c.arc(cx, cy, 120, a - 0.32, a + 0.32); c.stroke();
  }
  if (P.reviveP > 0) {
    c.strokeStyle = 'rgba(106,144,240,.95)'; c.lineWidth = 4;
    c.beginPath(); c.arc(cx, cy, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (P.reviveP / 1.6)); c.stroke();
  }
  drawRadar();
}
function drawRadar() {
  const c = rctx, S2 = 300, R = 150, sc = R / 75;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, S2, S2);
  c.save();
  c.beginPath(); c.arc(R, R, R - 4, 0, Math.PI * 2); c.fillStyle = 'rgba(11,14,21,.66)'; c.fill(); c.clip();
  c.translate(R, R); c.rotate(P.yaw); c.scale(sc, sc); c.translate(-P.x, -P.z);
  c.fillStyle = 'rgba(236,228,207,.13)';
  c.fillRect(-28, -28, 56, 56); c.fillRect(-160, -10, 320, 20); c.fillRect(-10, -160, 20, 320);
  for (const p of G.pickups) { c.fillStyle = p.m.power ? '#dcb058' : '#ece4cf'; c.fillRect(p.x - 1.8, p.z - 1.8, 3.6, 3.6); }
  for (const m of G.mates) { c.fillStyle = m.downed ? '#e1493f' : '#6a90f0'; c.beginPath(); c.arc(m.x, m.z, 2.2, 0, 7); c.fill(); }
  for (const e of G.enemies) {
    if (e.dead) continue;
    c.fillStyle = enemyCol(e);
    c.beginPath(); c.arc(e.x, e.z, e.type === 'boss' ? 5 : e.type === 'brute' ? 3.4 : 2.4, 0, 7); c.fill();
  }
  for (const f of G.flares) { c.strokeStyle = '#dcb058'; c.lineWidth = 1.2; c.beginPath(); c.arc(f.x, f.z, 7, 0, 7); c.stroke(); }
  c.restore();
  c.strokeStyle = 'rgba(236,228,207,.35)'; c.lineWidth = 2; c.beginPath(); c.arc(R, R, R - 4, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#ece4cf'; c.beginPath(); c.moveTo(R, R - 10); c.lineTo(R + 7, R + 8); c.lineTo(R, R + 4); c.lineTo(R - 7, R + 8); c.closePath(); c.fill();
  const nx = R + (R - 18) * Math.sin(P.yaw), ny = R - (R - 18) * Math.cos(P.yaw);
  c.font = '700 22px "Barlow Condensed", "Arial Narrow", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#dcb058'; c.fillText('N', nx, ny);
}
function updateMenu(dt) {
  G.t += dt;
  const t = G.t, sway = G.reduced ? 0 : Math.sin(t * 0.22) * 0.4;
  camera.position.set(sway, 1.45, 34.1); camera.lookAt(0.9 + sway * 0.3, 1.4, 26);
  for (const k in heroes) {
    const h = heroes[k], on = G.sel === k;
    h.root.position.z = lerp(h.root.position.z, on ? 30.7 : 30, Math.min(1, dt * 6));
    h.root.rotation.y = on ? -0.45 + Math.sin(t * 0.7) * 0.45 : lerp(h.root.rotation.y, -0.45, Math.min(1, dt * 4));
  }
  World.update(dt, camera.position, { x: 0, z: 20 });
  ambient(dt); FX.update(dt);
}
function update(dt) {
  G.t += dt; G.runT += dt;
  updateTimers(dt);
  updatePlayer(dt); updateWeapons(dt);
  for (const m of G.mates) m.update(dt);
  for (let i = G.enemies.length - 1; i >= 0; i--) { const e = G.enemies[i]; e.update(dt); if (e.remove) { scene.remove(e.root); G.enemies.splice(i, 1); } }
  updateBolts(dt); updateGrenades(dt); updateShells(dt); updatePickups(dt); updatePowers(dt);
  if (G.state === 'play') updateWaves(dt);
  ambient(dt);
  updateCamera(dt); updateHero(dt); updateViewmodel(dt); updateAim(dt);
  World.update(dt, camera.position, P);
  FX.update(dt);
  G.hurtFlash = Math.max(0, G.hurtFlash - dt * 1.4);
  G.whiteFlash = Math.max(0, G.whiteFlash - dt * 2.2);
  if (G.hm && (G.hm.t -= dt) <= 0) G.hm = null;
  G.dmgInd = G.dmgInd.filter(d => (d.t -= dt) > 0);
  G.popups = G.popups.filter(p => (p.t += dt) < 0.9);
  if (G.state === 'play') { SFX.music(G.phase === 'fight' ? (G.boss ? 1 : 0.75) : 0.12); SFX.tick(dt); updateHUD(); }
}
function frame(now) {
  if (window.CAPTURE) return;
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (G.state === 'play') { update(dt); adaptQuality(dt); }
  else if (G.state === 'menu') updateMenu(dt);
  render();
}
// step quality down (resolution, then bloom and shadows) when the GPU cannot hold ~36 fps
function adaptQuality(dt) {
  if (S.quality !== 'auto') return;
  Q.ema = lerp(Q.ema, dt, 0.05);
  if (Q.ema > 1 / 36) Q.slow += dt; else Q.slow = Math.max(0, Q.slow - dt * 0.5);
  if (Q.slow > 3 && Q.level > 0) setQuality(Q.level - 1);
}
function render() {
  const showVm = (G.state === 'play' || G.state === 'pause') && G.vm && G.vm.root.visible;
  if (composer) {
    vmPass.enabled = !!showVm;
    gradePass.uniforms.time.value = G.t;
    composer.render();
  } else {
    renderer.clear(); renderer.render(scene, camera);
    if (showVm) { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
  }
  drawHUD();
}

// a small handle for the reel capture rig and for debugging from the console
window.DDP = { G, P, S, WEAPONS, update, render, startGame, startWave, spawnEnemy, spawnPickup, special, throwGrenade, switchWeapon, melee, reload, explode, nuke, pickPerk, select, look, setQuality, announce, camera: () => camera, input: (l, r) => { mouseL = l; mouseR = r; if (l) clickL = true; } };

init();
