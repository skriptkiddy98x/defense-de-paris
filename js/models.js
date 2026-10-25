'use strict';
const rand = (a, b) => a + (b - a) * Math.random();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;

// Tangent-space normal map from the luminance of a canvas (used for cloth, mail, skin, stone)
function makeNormalMap(src, strength) {
  const w = src.width, h = src.height, d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const og = out.getContext('2d'), img = og.createImageData(w, h), o = img.data, L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xl = (x - 1 + w) % w, xr = (x + 1) % w, yu = (y - 1 + h) % h, yd = (y + 1) % h;
    const dx = (L[y * w + xr] - L[y * w + xl]) * strength, dy = (L[yd * w + x] - L[yu * w + x]) * strength;
    const len = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    o[i] = (-dx / len * 0.5 + 0.5) * 255; o[i + 1] = (dy / len * 0.5 + 0.5) * 255; o[i + 2] = (0.5 / len + 0.5) * 255; o[i + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

// Procedurally textured characters, weapons and the first-person viewmodel.
const Models = (() => {
  const lin = h => new THREE.Color(h).convertSRGBToLinear();
  const mats = {}, geos = {}, TEX = {};

  // ---------- textures ----------
  function seeded(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function canvasFor(name) {
    const S = ['zskin', 'camo', 'alien', 'alienGlow', 'rag'].includes(name) ? 256 : 128;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), R = seeded(name.length * 131 + name.charCodeAt(0));
    const wrapArc = (x, y, r) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { if (x + ox + r < 0 || x + ox - r > S || y + oy + r < 0 || y + oy - r > S) continue; g.beginPath(); g.arc(x + ox, y + oy, r, 0, 7); g.fill(); } };
    const blot = (n, col, r0, r1) => { for (let i = 0; i < n; i++) { const x = R() * S, y = R() * S, r = r0 + R() * (r1 - r0); g.globalAlpha = 0.5 + R() * 0.5; g.fillStyle = col; wrapArc(x, y, r); } g.globalAlpha = 1; };
    const speck = (n, rgb, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${rgb},${(R() * a).toFixed(3)})`; g.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2); } };
    const weave = a => { g.fillStyle = `rgba(0,0,0,${a})`; for (let i = 0; i < S; i += 2) { g.fillRect(0, i, S, 1); g.fillRect(i, 0, 1, S); } };
    const panels = () => { const r = seeded(77), list = []; for (let y = 0; y < S; y += 32) { let x = 0; while (x < S) { const w = 24 + r() * 56; list.push([x, y, Math.min(w, S - x), 32, r()]); x += w; } } return list; };
    switch (name) {
      case 'skin': g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, S, S); blot(40, 'rgba(215,160,150,.25)', 5, 16); speck(900, '120,80,70', 0.12); break;
      case 'zskin':
        g.fillStyle = '#ecece4'; g.fillRect(0, 0, S, S);
        blot(70, 'rgba(150,175,110,.45)', 10, 40); blot(45, 'rgba(125,85,115,.4)', 8, 30); blot(18, 'rgba(110,20,20,.65)', 3, 12);
        g.strokeStyle = 'rgba(80,30,70,.5)'; g.lineWidth = 1.3;
        for (let i = 0; i < 30; i++) { let x = R() * S, y = R() * S; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 7; k++) { x += R() * 24 - 12; y += R() * 24 - 12; g.lineTo(x, y); } g.stroke(); }
        speck(3000, '40,40,30', 0.25); break;
      case 'cloth': g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, S, S); weave(0.06); speck(900, '0,0,0', 0.08); break;
      case 'rag':
        g.fillStyle = '#eeeeee'; g.fillRect(0, 0, S, S); weave(0.07);
        blot(36, 'rgba(70,50,30,.4)', 8, 30); blot(16, 'rgba(95,15,10,.55)', 4, 16);
        g.fillStyle = 'rgba(25,18,12,.8)';
        for (let i = 0; i < 9; i++) { const x = R() * S, y = R() * S; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) g.lineTo(x + R() * 26 - 13, y + R() * 26 - 13); g.fill(); }
        speck(1500, '0,0,0', 0.15); break;
      case 'camo':
        g.fillStyle = '#7d7c54'; g.fillRect(0, 0, S, S);
        for (const col of ['#56603a', '#7d6747', '#2f2e26']) for (let i = 0; i < 26; i++) {
          const x = R() * S, y = R() * S; g.fillStyle = col;
          for (let k = 0; k < 4; k++) { const a = R() * 6.28, rx = 6 + R() * 18, ry = 4 + R() * 9; for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.beginPath(); g.ellipse(x + ox + Math.cos(a) * 8, y + oy + Math.sin(a) * 8, rx, ry, a, 0, 7); g.fill(); } }
        }
        weave(0.06); speck(1500, '0,0,0', 0.1); break;
      case 'mail': {
        g.fillStyle = '#2e2e2e'; g.fillRect(0, 0, S, S); g.strokeStyle = '#dadada'; g.lineWidth = 1.5;
        const st = 8; let row = 0;
        for (let y = 0; y < S + st; y += st * 0.6, row++) for (let x = (row % 2) * st / 2; x < S + st; x += st) { g.beginPath(); g.arc(x, y, st * 0.42, 0, 7); g.stroke(); }
        break;
      }
      case 'leather': g.fillStyle = '#e2dace'; g.fillRect(0, 0, S, S); blot(50, 'rgba(60,40,20,.18)', 4, 18); speck(1600, '0,0,0', 0.16); break;
      case 'metal':
        g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, S, S);
        for (let i = 0; i < 300; i++) { g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.08)'; g.fillRect(0, R() * S, S, 1); }
        blot(10, 'rgba(90,70,50,.14)', 5, 18); break;
      case 'alien': g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; for (const [x, y, w, h] of panels()) g.strokeRect(x + 2, y + 2, w - 4, h - 4); speck(1200, '0,0,0', 0.1); break;
      case 'alienGlow': g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.strokeStyle = '#fff'; g.lineWidth = 1.6; for (const [x, y, w, h, r] of panels()) if (r < 0.3) g.strokeRect(x + 5, y + 5, w - 10, h - 10); break;
    }
    return c;
  }
  function tex(name) {
    if (!TEX[name]) {
      const c = canvasFor(name), t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
      if (name !== 'alienGlow') t.encoding = THREE.sRGBEncoding;
      TEX[name] = t; TEX[name + ':c'] = c;
    }
    return TEX[name];
  }
  function ntex(name, s) { const k = name + ':n' + s; if (!TEX[k]) { tex(name); TEX[k] = makeNormalMap(TEX[name + ':c'], s); } return TEX[k]; }
  function M(hex, o) {
    o = o || {};
    const key = hex + '|' + JSON.stringify(o);
    if (!mats[key]) {
      const m = new THREE.MeshStandardMaterial({ color: lin(hex), roughness: o.r !== undefined ? o.r : 0.85, metalness: o.m || 0, flatShading: !!o.flat, side: o.ds ? THREE.DoubleSide : THREE.FrontSide });
      if (o.map) m.map = tex(o.map);
      if (o.n) { m.normalMap = ntex(o.n, o.ns || 2); }
      if (o.e !== undefined) { m.emissive = lin(o.e); m.emissiveIntensity = o.ei || 1.5; if (o.emap) m.emissiveMap = tex(o.emap); }
      mats[key] = m;
    }
    return mats[key];
  }

  // ---------- geometry ----------
  function box(w, h, d) { const k = 'b' + w + ',' + h + ',' + d; return geos[k] || (geos[k] = new THREE.BoxGeometry(w, h, d)); }
  function cyl(rt, rb, len, seg) { const k = `c${rt},${rb},${len},${seg}`; if (!geos[k]) { const g = new THREE.CylinderGeometry(rt, rb, len, seg || 14, 1); g.translate(0, -len / 2, 0); geos[k] = g; } return geos[k]; }
  function sph(r, ws, hs) { const k = `s${r},${ws},${hs}`; return geos[k] || (geos[k] = new THREE.SphereGeometry(r, ws || 18, hs || 14)); }
  function capG(r) { const k = 'cap' + r; return geos[k] || (geos[k] = new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)); }
  function halfDisc(r, t) { const k = `hd${r},${t}`; if (!geos[k]) { const g = new THREE.CylinderGeometry(r, r, t, 28, 1, false, 0, Math.PI); g.rotateX(Math.PI / 2); g.rotateZ(Math.PI / 2); geos[k] = g; } return geos[k]; }
  function part(geo, mat, x, y, z, parent, shadow) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow !== false; parent.add(m); return m; }
  const FLASH = new THREE.MeshBasicMaterial({ color: 0xfff0e8 });

  // Bake a character into one skinned mesh per material: every joint is a Bone, every part is
  // rigidly weighted to its joint, so the box-and-capsule rig animates as before at a fraction of the draw calls
  const skinMats = new Map();
  function skinMat(m) { if (!skinMats.has(m)) { const c = m.clone(); c.skinning = true; skinMats.set(m, c); } return skinMats.get(m); }
  const FLASH_SKIN = skinMat(FLASH);
  function shown(o, root) { for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false; return true; }
  function skinify(root) {
    root.updateMatrixWorld(true);
    const bones = [], meshes = [];
    root.traverse(o => { if (o.isBone) bones.push(o); else if (o.isMesh && !o.isSkinnedMesh) meshes.push(o); });
    const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert(), tm = new THREE.Matrix4(), byMat = new Map();
    for (const m of meshes) {
      let b = m.parent; while (b && !b.isBone) b = b.parent;
      if (!b) continue;
      if (shown(m, root)) {
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        g.applyMatrix4(tm.multiplyMatrices(rootInv, m.matrixWorld));
        if (!byMat.has(m.material)) byMat.set(m.material, []);
        byMat.get(m.material).push({ g, bi: bones.indexOf(b), shadow: m.castShadow });
      }
      m.parent.remove(m);
    }
    const skeleton = new THREE.Skeleton(bones);
    for (const [mat, list] of byMat) {
      let n = 0; for (const p of list) n += p.g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      let o = 0;
      for (const p of list) {
        const c = p.g.attributes.position.count;
        pos.set(p.g.attributes.position.array, o * 3); nor.set(p.g.attributes.normal.array, o * 3);
        if (p.g.attributes.uv) uv.set(p.g.attributes.uv.array, o * 2);
        for (let i = 0; i < c; i++) { si[(o + i) * 4] = p.bi; sw[(o + i) * 4] = 1; }
        o += c; p.g.dispose();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      geo.computeBoundingSphere(); geo.boundingSphere.radius += 1.2;
      const sm = new THREE.SkinnedMesh(geo, skinMat(mat));
      sm.castShadow = list.some(p => p.shadow); sm.receiveShadow = true;
      root.add(sm); sm.updateMatrixWorld(true); sm.bind(skeleton, sm.matrixWorld);
    }
    return root;
  }

  // Two-bone arm IK: points the hand (0.6 m from the shoulder) at a target given in torso space
  const UP = new THREE.Vector3(0, -1, 0), XA = new THREE.Vector3(1, 0, 0), tq = new THREE.Quaternion();
  function ikArm(sh, el, tx, ty, tz) {
    const a = 0.3, b = 0.3, D = new THREE.Vector3(tx, ty, tz).sub(sh.position);
    const d = clamp(D.length(), 0.08, a + b - 0.002); D.normalize();
    const A = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1)), B = Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
    sh.quaternion.setFromUnitVectors(UP, D).multiply(tq.setFromAxisAngle(XA, A));
    el.rotation.set(-(Math.PI - B), 0, 0);
  }

  // feet at y=0, faces +z; the character's right side is -x
  function humanoid(o) {
    const root = new THREE.Group(); root.rotation.order = 'YXZ';
    const body = new THREE.Bone(); root.add(body);
    const hipY = 0.93, legs = [], arms = [];
    part(sph(0.16), o.pants, 0, hipY, 0, body).scale.set(1.12, 0.72, 0.82);
    for (const s of [1, -1]) {
      const hip = new THREE.Bone(); hip.position.set(s * 0.095, hipY, 0); body.add(hip);
      part(cyl(0.086, 0.064, 0.45), o.pants, 0, 0, 0, hip);
      const knee = new THREE.Bone(); knee.position.y = -0.45; hip.add(knee);
      part(sph(0.064, 12, 10), o.shin || o.pants, 0, 0, 0, knee);
      part(cyl(0.063, 0.047, 0.42), o.shin || o.pants, 0, 0, 0, knee);
      part(box(0.105, 0.08, 0.26), o.boots, 0, -0.44, 0.045, knee);
      legs.push({ hip, knee });
    }
    const torso = new THREE.Bone(); torso.position.y = hipY; body.add(torso);
    part(cyl(0.16, 0.142, 0.3), o.shirt, 0, 0.3, 0, torso);
    const chest = part(sph(0.2), o.shirt, 0, 0.42, 0, torso); chest.scale.set(1.2, 1.02, 0.8);
    for (const s of [1, -1]) part(sph(0.078, 12, 10), o.sleeve || o.shirt, s * 0.215, 0.53, 0, torso);
    if (o.neckMat !== null) part(cyl(0.05, 0.058, 0.12), o.neckMat || o.skin, 0, 0.68, 0, torso);
    const neck = new THREE.Bone(); neck.position.set(0, 0.62, 0); torso.add(neck);
    const head = part(sph(0.112), o.headMat || o.skin, 0, 0.14, 0, neck); head.scale.set(0.9, 1.08, 1);
    if (o.face !== false) {
      part(sph(0.08, 12, 10), o.skin, 0, 0.065, 0.03, neck).scale.set(0.95, 0.8, 0.9);
      const eyeW = o.eyeMat || M(0xf0ece4, { r: 0.25 }), iris = o.irisMat || M(0x2a1d14, { r: 0.2 });
      for (const s of [1, -1]) {
        part(sph(0.019, 10, 8), eyeW, s * 0.038, 0.155, 0.096, neck, false);
        part(sph(0.011, 8, 6), iris, s * 0.038, 0.155, 0.111, neck, false);
        if (o.brow) part(box(0.042, 0.01, 0.012), o.brow, s * 0.04, 0.184, 0.106, neck, false).rotation.z = -s * 0.12;
        part(sph(0.026, 8, 6), o.skin, s * 0.1, 0.14, 0, neck).scale.set(0.45, 1, 0.8);
      }
      part(box(0.024, 0.045, 0.035), o.skin, 0, 0.128, 0.115, neck, false).rotation.x = -0.25;
      part(box(0.046, o.mouthH || 0.008, 0.012), o.mouth || M(0x6a3a34), 0, 0.077, 0.103, neck, false);
    }
    if (o.hair) { const hr = part(capG(0.121), o.hair, 0, 0.15, -0.012, neck); hr.scale.set(0.93, 1, 1.02); hr.rotation.x = -0.32; }
    for (const s of [1, -1]) {
      const sh = new THREE.Bone(); sh.position.set(s * 0.235, 0.53, 0); torso.add(sh);
      part(cyl(0.062, 0.052, 0.3), o.sleeve || o.shirt, 0, 0, 0, sh);
      const el = new THREE.Bone(); el.position.y = -0.3; sh.add(el);
      part(sph(0.052, 10, 8), o.forearm || o.sleeve || o.shirt, 0, 0, 0, el);
      part(cyl(0.05, 0.04, 0.26), o.forearm || o.sleeve || o.shirt, 0, 0, 0, el);
      const hand = part(sph(0.046, 10, 8), o.hands || o.skin, 0, -0.3, 0.005, el); hand.scale.set(0.75, 1.15, 0.55);
      arms.push({ sh, el, hand });
    }
    root.scale.setScalar(o.scale || 1);
    return { root, body, torso, chest, neck, head, armL: arms[0].sh, armR: arms[1].sh, elbowL: arms[0].el, elbowR: arms[1].el, handL: arms[0].hand, handR: arms[1].hand, legL: legs[0].hip, legR: legs[1].hip, kneeL: legs[0].knee, kneeR: legs[1].knee };
  }

  // third-person rifle carried at the chest (bullpup FAMAS shape)
  function carbine(parent, x, y, z) {
    const metal = M(0x25272b, { r: 0.35, m: 0.75 }), poly = M(0x30332c, { map: 'leather', r: 0.75 });
    const g = new THREE.Bone(); g.position.set(x, y, z); parent.add(g);
    part(box(0.06, 0.11, 0.6), poly, 0, 0, 0.1, g);
    part(box(0.022, 0.05, 0.32), metal, 0, 0.08, 0.16, g);
    part(box(0.045, 0.15, 0.07), metal, 0, -0.11, -0.04, g).rotation.x = 0.15;
    part(box(0.04, 0.1, 0.05), poly, 0, -0.09, 0.2, g).rotation.x = -0.3;
    const br = part(cyl(0.012, 0.012, 0.22, 8), metal, 0, 0.02, 0.4, g); br.rotation.x = Math.PI / 2;
    const mz = new THREE.Object3D(); mz.position.set(0, 0.02, 0.64); g.add(mz);
    return { g, muzzle: mz };
  }

  const pick = a => a[(Math.random() * a.length) | 0];
  const ZSKIN = [0x9aa882, 0xa3a88c, 0x8d9c78, 0xa79f86, 0xb0ae94];
  const ZSHIRT = [0x6b5a48, 0x4a5a72, 0x7a3a36, 0x5d6a48, 0x7a7466, 0x3a4652, 0x8a7a5e];
  const ZPANTS = [0x464650, 0x5a4e40, 0x363e4c, 0x625848];
  function zombie(type) {
    const brute = type === 'brute', runner = type === 'runner', bloater = type === 'bloater';
    const skin = M(bloater ? 0x9aae6e : pick(ZSKIN), { map: 'zskin', n: 'zskin', ns: 3, r: 0.7 });
    const shirtless = brute || bloater || Math.random() < 0.22;
    const shirt = shirtless ? skin : M(pick(ZSHIRT), { map: 'rag', n: 'cloth', ns: 1.5, r: 0.95 });
    const sleeve = shirtless || Math.random() < 0.5 ? skin : shirt;
    const pants = M(pick(ZPANTS), { map: 'rag', n: 'cloth', ns: 1.5, r: 0.95 });
    const eye = M(brute ? 0xff6a3a : 0xffe08a, { e: brute ? 0xff4a1a : 0xffc93a, ei: 3.2 });
    const h = humanoid({
      skin, shirt, sleeve, forearm: skin, pants, shin: Math.random() < 0.4 ? skin : pants, boots: M(0x2a2622, { map: 'leather', r: 0.8 }), hands: skin,
      hair: Math.random() < 0.65 ? M(0x2b2620, { r: 0.95 }) : null, eyeMat: eye, irisMat: M(0x3a0a0a, { e: 0x400000, ei: 1 }), mouth: M(0x1e0606), mouthH: 0.028,
      scale: brute ? 1.5 : runner ? 0.94 : bloater ? 1.08 : 1
    });
    if (bloater) {
      // swollen, glowing gut full of gas: it bursts when killed or when it reaches you
      const gut = M(0xa6c46a, { map: 'zskin', n: 'zskin', ns: 3, r: 0.45, e: 0x6fd12a, ei: 0.7 }), boil = M(0xd2ff5a, { e: 0xb8ff3a, ei: 3.5 });
      h.belly = part(sph(0.31, 20, 16), gut, 0, 0.3, 0.08, h.torso); h.belly.scale.set(1.15, 1.05, 1.1);
      for (let i = 0; i < 7; i++) { const a = rand(-1.3, 1.3); part(sph(rand(0.035, 0.06), 8, 6), boil, Math.sin(a) * 0.3, rand(0.12, 0.5), 0.1 + Math.cos(a) * 0.27, h.torso, false); }
    }
    part(box(0.04, 0.008, 0.012), M(0xcfc49a, { r: 0.5 }), 0, 0.089, 0.106, h.neck, false);
    const gore = M(0x5a0f0c, { r: 0.4 });
    for (let i = 0; i < 3 + (Math.random() * 3 | 0); i++) { const a = rand(-0.9, 0.9); part(sph(rand(0.025, 0.05), 8, 6), gore, Math.sin(a) * 0.2, rand(0.15, 0.55), Math.cos(a) * 0.15, h.torso, false).scale.z = 0.4; }
    if (shirtless && !brute) { const bone = M(0xd9cfb0, { r: 0.5 }); for (let i = 0; i < 4; i++) part(box(0.1, 0.012, 0.02), bone, 0.09, 0.32 + i * 0.05, 0.13, h.torso, false).rotation.y = -0.5; }
    if (brute) {
      h.chest.scale.set(1.45, 1.15, 1.0);
      h.armL.position.x = 0.3; h.armR.position.x = -0.3; h.armL.scale.setScalar(1.3); h.armR.scale.setScalar(1.3);
      const rust = M(0x6a4a32, { map: 'metal', r: 0.6, m: 0.6 });
      part(box(0.2, 0.05, 0.22), rust, 0.24, 0.62, 0, h.torso).rotation.z = -0.4;
      part(cyl(0.17, 0.17, 0.04, 16), rust, 0, 0.04, 0, h.torso);
    }
    skinify(h.root);
    return h;
  }

  function alien() {
    const armor = M(0x6a48a8, { map: 'alien', n: 'alien', ns: 3, r: 0.32, m: 0.6, e: 0x6ff7ff, ei: 1.8, emap: 'alienGlow' });
    const skin = M(0x9fd9c8, { map: 'zskin', r: 0.5 }), dark = M(0x2a2240, { map: 'alien', r: 0.4, m: 0.5 });
    const glow = M(0x5ff6ff, { e: 0x5ff6ff, ei: 3 }), gun = M(0x8dff6a, { e: 0x8dff6a, ei: 3 });
    const h = humanoid({ skin, headMat: armor, shirt: armor, sleeve: dark, forearm: armor, pants: dark, shin: armor, boots: armor, hands: skin, face: false, neckMat: dark, scale: 1.1 });
    h.head.scale.set(0.95, 1.35, 1.2); h.head.position.y = 0.17;
    part(box(0.2, 0.045, 0.04), glow, 0, 0.2, 0.122, h.neck, false);
    part(box(0.03, 0.12, 0.24), armor, 0, 0.33, -0.02, h.neck);
    for (const s of [1, -1]) part(sph(0.1, 12, 8), armor, s * 0.24, 0.58, 0, h.torso).scale.set(1.1, 0.6, 1.15);
    part(sph(0.04, 10, 8), glow, 0, 0.44, 0.165, h.torso, false);
    part(box(0.3, 0.36, 0.16), dark, 0, 0.4, -0.2, h.torso);
    for (const s of [1, -1]) part(cyl(0.025, 0.025, 0.32, 8), glow, s * 0.08, 0.56, -0.29, h.torso, false);
    part(cyl(0.068, 0.072, 0.34, 12), armor, 0, -0.02, 0.01, h.elbowR);
    part(sph(0.05, 10, 8), gun, 0, -0.38, 0.01, h.elbowR, false);
    h.muzzle = new THREE.Object3D(); h.muzzle.position.set(0, -0.44, 0.01); h.elbowR.add(h.muzzle);
    skinify(h.root);
    return h;
  }

  function boss() {
    const root = new THREE.Group(); root.rotation.order = 'YXZ';
    const armor = M(0x5a3c92, { map: 'alien', n: 'alien', ns: 3, r: 0.3, m: 0.65, e: 0xff5ad8, ei: 1.6, emap: 'alienGlow', flat: true });
    const skin = M(0x8fcfbc, { map: 'zskin', n: 'zskin', ns: 3, r: 0.5 }), dark = M(0x231c36, { r: 0.4, m: 0.5 });
    const eyeM = M(0xff5ad8, { e: 0xff3ad0, ei: 4 }), orbM = M(0x6ff7ff, { e: 0x6ff7ff, ei: 3.5 });
    const core = new THREE.Group(); root.add(core);
    part(new THREE.IcosahedronGeometry(2.0, 1), armor, 0, 0, 0, core);
    part(sph(1.5, 20, 14), skin, 0, -0.8, 0, core);
    const eye = part(sph(0.62, 20, 14), eyeM, 0, 0.1, 1.72, core, false);
    part(new THREE.TorusGeometry(0.75, 0.12, 10, 24), dark, 0, 0.1, 1.68, core);
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, sp = part(new THREE.ConeGeometry(0.28, 1.2, 6), armor, Math.cos(a) * 1.5, 1.4, Math.sin(a) * 1.5, core); sp.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); }
    const ring = new THREE.Group(); root.add(ring);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; part(sph(0.34, 14, 10), orbM, Math.cos(a) * 3.3, 0.3, Math.sin(a) * 3.3, ring, false); }
    const tentacles = [];
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2; let parent = new THREE.Group(); parent.position.set(Math.cos(a), -1.7, Math.sin(a)); core.add(parent);
      const chain = [];
      for (let j = 0; j < 7; j++) { const seg = new THREE.Group(); seg.position.y = j === 0 ? 0 : -0.4; parent.add(seg); part(cyl(0.15 - j * 0.017, 0.13 - j * 0.017, 0.44, 10), j % 2 ? skin : dark, 0, 0, 0, seg); chain.push(seg); parent = seg; }
      tentacles.push(chain);
    }
    return { root, core, ring, eye, tentacles };
  }

  function soldier(skinHex) {
    const camo = M(0xffffff, { map: 'camo', n: 'cloth', ns: 1.5, r: 0.9 }), vest = M(0x4a5140, { map: 'cloth', n: 'cloth', ns: 2, r: 0.85 });
    const helm = M(0x5a6444, { map: 'leather', r: 0.75 }), skin = M(skinHex, { map: 'skin', n: 'skin', ns: 0.8, r: 0.6 });
    const boot = M(0x2a2520, { map: 'leather', n: 'leather', r: 0.6 }), glove = M(0x2b2b2b, { map: 'leather', r: 0.7 });
    const h = humanoid({ skin, shirt: camo, sleeve: camo, pants: camo, boots: boot, hands: glove, brow: M(0x2a2018) });
    // plate carrier: front and back plates with straps and magazine pouches
    part(box(0.36, 0.34, 0.06), vest, 0, 0.42, 0.14, h.torso);
    part(box(0.36, 0.38, 0.06), vest, 0, 0.42, -0.14, h.torso);
    for (const s of [1, -1]) { part(box(0.07, 0.03, 0.3), vest, s * 0.14, 0.6, 0, h.torso); part(box(0.03, 0.22, 0.24), vest, s * 0.2, 0.36, 0, h.torso); }
    for (let i = 0; i < 3; i++) part(box(0.1, 0.12, 0.05), vest, -0.12 + i * 0.12, 0.31, 0.19, h.torso);
    part(box(0.07, 0.07, 0.05), M(0x1a1a1a, { r: 0.5 }), 0.1, 0.5, 0.17, h.torso);
    const hel = part(capG(0.138), helm, 0, 0.165, -0.004, h.neck); hel.scale.set(1, 0.92, 1.08);
    part(cyl(0.141, 0.146, 0.03, 20), helm, 0, 0.18, -0.004, h.neck);
    part(box(0.17, 0.045, 0.03), M(0x15181c, { r: 0.15, m: 0.6 }), 0, 0.265, 0.105, h.neck, false);
    [0x1f3a8f, 0xefe9dc, 0xc8302a].forEach((c, i) => part(box(0.006, 0.07, 0.03), M(c), 0.066, -0.12, -0.03 + i * 0.03, h.armL, false));
    const gun = carbine(h.torso, -0.05, 0.36, 0.16);
    h.muzzle = gun.muzzle;
    ikArm(h.armR, h.elbowR, -0.05, 0.3, 0.32);
    ikArm(h.armL, h.elbowL, -0.03, 0.36, 0.55);
    skinify(h.root);
    return h;
  }

  // ---------- heroes ----------
  function napoleon(mode) {
    const coat = M(0x1d2a55, { map: 'cloth', n: 'cloth', ns: 1.5, r: 0.85 }), white = M(0xeeebe2, { map: 'cloth', n: 'cloth', ns: 1, r: 0.8 });
    const gold = M(0xd8ad4e, { map: 'metal', r: 0.3, m: 0.85 }), red = M(0x8e1d1d, { map: 'cloth', r: 0.8 }), boot = M(0x121214, { map: 'leather', n: 'leather', r: 0.25, m: 0.1 });
    const skin = M(0xe3bf9c, { map: 'skin', n: 'skin', ns: 0.8, r: 0.6 }), hair = M(0x3a2a1e, { r: 0.9 }), felt = M(0x141416, { map: 'cloth', n: 'cloth', r: 0.85 });
    const h = humanoid({ skin, shirt: coat, sleeve: coat, pants: white, shin: boot, boots: boot, hands: white, hair, brow: hair });
    part(box(0.18, 0.32, 0.02), white, 0, 0.37, 0.157, h.torso, false);
    for (let i = 0; i < 4; i++) for (const s of [1, -1]) part(sph(0.012, 8, 6), gold, s * 0.11, 0.28 + i * 0.075, 0.152, h.torso, false);
    for (const s of [1, -1]) part(box(0.05, 0.34, 0.02), red, s * 0.12, 0.39, 0.148, h.torso, false).rotation.z = -s * 0.12;
    part(cyl(0.085, 0.095, 0.09, 16), red, 0, 0.72, 0, h.torso);
    for (const s of [1, -1]) { part(box(0.15, 0.56, 0.03), coat, s * 0.075, 0.02, -0.14, h.torso).rotation.x = 0.12; part(box(0.1, 0.3, 0.03), coat, s * 0.16, 0.0, 0.11, h.torso).rotation.set(-0.1, 0, s * 0.1); }
    for (const s of [1, -1]) {
      part(new THREE.CylinderGeometry(0.085, 0.085, 0.025, 18), gold, s * 0.22, 0.61, 0, h.torso);
      part(new THREE.CylinderGeometry(0.09, 0.105, 0.075, 18, 1, true), M(0xd8ad4e, { map: 'metal', r: 0.4, m: 0.8, ds: true }), s * 0.22, 0.565, 0, h.torso);
    }
    part(cyl(0.165, 0.165, 0.05, 18), white, 0, 0.075, 0, h.torso);
    const crown = part(capG(0.123), felt, 0, 0.17, 0, h.neck); crown.scale.set(0.95, 0.85, 1);
    for (const s of [1, -1]) { const b = part(halfDisc(0.3, 0.022), felt, 0, 0.19, s * 0.07, h.neck); b.rotation.x = -s * 0.22; b.scale.y = 0.68; }
    [[0xc8302a, 0.065], [0xefe9dc, 0.045], [0x1f3a8f, 0.025]].forEach(([c, r], i) => { const k = part(new THREE.CylinderGeometry(r, r, 0.012, 16), M(c), 0.14, 0.3, 0.104 + i * 0.006, h.neck, false); k.rotation.x = Math.PI / 2; });
    const sab = part(cyl(0.018, 0.012, 0.85, 8), M(0x1e1e22, { map: 'leather', r: 0.4, m: 0.3 }), 0.2, 0.08, 0.06, h.torso); sab.rotation.x = 0.35;
    h.gun = carbine(h.torso, -0.05, 0.36, 0.16); h.gun.g.visible = false;
    h.pose = mode => {
      if (mode === 'armed') { h.gun.g.visible = true; ikArm(h.armR, h.elbowR, -0.05, 0.3, 0.32); ikArm(h.armL, h.elbowL, -0.03, 0.36, 0.55); }
      else { h.gun.g.visible = false; ikArm(h.armR, h.elbowR, 0.02, 0.4, 0.2); h.armL.rotation.set(0.1, 0, -0.12); h.elbowL.rotation.set(-0.15, 0, 0); }
    };
    h.pose(mode || 'idle');
    skinify(h.root);
    return h;
  }

  function crusader(mode) {
    const mail = M(0xa3a9b0, { map: 'mail', n: 'mail', ns: 6, r: 0.42, m: 0.75 }), tabard = M(0xece6d6, { map: 'cloth', n: 'cloth', ns: 1.5, r: 0.85 });
    const red = M(0xa81e18, { map: 'cloth', r: 0.8 }), steel = M(0xc4c9d0, { map: 'metal', r: 0.24, m: 0.92 }), leather = M(0x6a4a2e, { map: 'leather', n: 'leather', r: 0.6 });
    const dark = M(0x0b0b0c, { r: 0.5 }), brass = M(0xc89a42, { map: 'metal', r: 0.3, m: 0.85 }), cape = M(0x7a1a17, { map: 'cloth', n: 'cloth', ns: 1.5, r: 0.85, ds: true });
    const h = humanoid({ skin: steel, headMat: steel, shirt: tabard, sleeve: mail, forearm: mail, pants: mail, shin: mail, boots: steel, hands: steel, face: false, neckMat: mail });
    h.head.visible = false;
    part(cyl(0.135, 0.14, 0.28, 22), steel, 0, 0.31, 0.005, h.neck);
    part(new THREE.CylinderGeometry(0.11, 0.135, 0.04, 22), steel, 0, 0.33, 0.005, h.neck);
    part(box(0.21, 0.02, 0.02), dark, 0, 0.19, 0.137, h.neck, false);
    part(box(0.026, 0.2, 0.012), brass, 0, 0.12, 0.143, h.neck, false);
    part(box(0.1, 0.022, 0.012), brass, 0, 0.11, 0.143, h.neck, false);
    for (let i = 0; i < 5; i++) part(box(0.012, 0.012, 0.01), dark, -0.05 - (i % 2) * 0.025, 0.07 + Math.floor(i / 2) * 0.03, 0.135, h.neck, false);
    const skirt = new THREE.CylinderGeometry(0.17, 0.27, 0.56, 22, 1, true); skirt.translate(0, -0.28, 0);
    part(skirt, M(0xece6d6, { map: 'cloth', n: 'cloth', ns: 1.5, r: 0.85, ds: true }), 0, 0.06, 0, h.torso);
    for (const z of [1, -1]) { part(box(0.055, 0.32, 0.012), red, 0, 0.42, z * 0.158, h.torso, false); part(box(0.19, 0.055, 0.012), red, 0, 0.47, z * 0.156, h.torso, false); }
    part(cyl(0.168, 0.168, 0.05, 18), leather, 0, 0.09, 0, h.torso);
    const cp = part(box(0.44, 1.06, 0.02), cape, 0, 0.6, -0.19, h.torso); cp.geometry = cp.geometry.clone().translate(0, -0.53, 0); cp.rotation.x = 0.1;
    const shape = new THREE.Shape(); shape.moveTo(-0.22, 0.25); shape.lineTo(0.22, 0.25); shape.quadraticCurveTo(0.24, -0.12, 0, -0.36); shape.quadraticCurveTo(-0.24, -0.12, -0.22, 0.25);
    const shield = new THREE.Bone(); shield.position.set(0.07, -0.13, 0.02); shield.rotation.y = Math.PI / 2; h.elbowL.add(shield);
    part(new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 2 }), M(0xe9e3d2, { map: 'leather', n: 'leather', r: 0.6 }), 0, 0, 0, shield);
    part(box(0.06, 0.5, 0.012), red, 0, -0.04, 0.046, shield, false); part(box(0.36, 0.06, 0.012), red, 0, 0.1, 0.046, shield, false);
    const sword = new THREE.Bone(); sword.position.set(0, -0.3, 0.02); h.elbowR.add(sword);
    part(cyl(0.017, 0.017, 0.15, 8), leather, 0, 0.07, 0, sword);
    part(sph(0.028, 10, 8), brass, 0, 0.09, 0, sword);
    part(box(0.24, 0.025, 0.04), steel, 0, -0.085, 0, sword);
    const blade = part(cyl(0.024, 0.006, 0.88, 4), steel, 0, -0.095, 0, sword); blade.scale.z = 0.28;
    sword.rotation.x = -0.5;
    h.gun = carbine(h.torso, -0.05, 0.36, 0.16); h.gun.g.visible = false;
    h.pose = mode => {
      if (mode === 'armed') {
        h.gun.g.visible = true; sword.visible = false; shield.parent.remove(shield); h.torso.add(shield); shield.position.set(0, 0.35, -0.24); shield.rotation.set(0, Math.PI, 0);
        ikArm(h.armR, h.elbowR, -0.05, 0.3, 0.32); ikArm(h.armL, h.elbowL, -0.03, 0.36, 0.55);
      } else { h.armR.rotation.set(-0.25, 0, 0.08); h.elbowR.rotation.set(-0.35, 0, 0); h.armL.rotation.set(-0.35, 0, -0.2); h.elbowL.rotation.set(-1.25, 0, 0); }
    };
    h.pose(mode || 'idle');
    skinify(h.root);
    return h;
  }

  function nameTag(text, color) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true, fog: false }));
    s.scale.set(1.4, 0.35, 1);
    s.userData.set = (txt, col) => {
      g.clearRect(0, 0, 256, 64); g.font = '600 36px "Barlow Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = 'rgba(8,10,16,.85)'; g.strokeText(txt, 128, 34); g.fillStyle = col; g.fillText(txt, 128, 34); t.needsUpdate = true;
    };
    s.userData.set(text, color);
    return s;
  }

  // Glowing drops: supplies sit low and spin, power-ups also send a light pillar into the sky
  const PICK = {
    health: [0xff5a4a, 'HEALTH'], ammo: [0xe8bd5a, 'AMMO'], grenade: [0x9ccf5a, 'GRENADE'],
    insta: [0xff4a6a, 'INSTA-KILL'], double: [0xffd23a, 'DOUBLE POINTS'], maxammo: [0x5ac8ff, 'MAX AMMO'], nuke: [0xfff3d0, 'NUKE'], rage: [0xff8a2a, 'RAGE']
  };
  const PILLAR = new THREE.CylinderGeometry(0.22, 0.32, 9, 10, 1, true); PILLAR.translate(0, 4.5, 0);
  function pickup(kind) {
    const [col, label] = PICK[kind], power = !['health', 'ammo', 'grenade'].includes(kind);
    const root = new THREE.Group(), spin = new THREE.Group(); root.add(spin);
    const m = M(col, { e: col, ei: power ? 2.6 : 1.6, r: 0.3, m: 0.35 });
    if (kind === 'health') { part(box(0.5, 0.16, 0.16), m, 0, 0, 0, spin, false); part(box(0.16, 0.5, 0.16), m, 0, 0, 0, spin, false); }
    else if (kind === 'ammo') { part(box(0.5, 0.3, 0.3), m, 0, 0, 0, spin, false); part(box(0.52, 0.06, 0.32), M(0x2a2c31, { r: 0.4, m: 0.7 }), 0, 0.08, 0, spin, false); }
    else if (kind === 'grenade') part(sph(0.18, 14, 10), m, 0, 0, 0, spin, false);
    else part(new THREE.OctahedronGeometry(0.36, 0), m, 0, 0, 0, spin, false);
    spin.position.y = 0.75;
    if (power) {
      const pm = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.6), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      root.add(new THREE.Mesh(PILLAR, pm));
    }
    const tag = nameTag(label, '#' + new THREE.Color(col).getHexString()); tag.position.y = 1.45; tag.scale.set(1.6, 0.4, 1); root.add(tag);
    return { root, spin, tag, power };
  }

  function flashTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(255,250,220,1)'); grd.addColorStop(0.25, 'rgba(255,190,90,.9)'); grd.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(255,220,150,.9)'; g.lineWidth = 3;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30); g.stroke(); }
    return new THREE.CanvasTexture(c);
  }

  // First-person weapons with the hero's own sleeves and gloves
  function viewmodel(ch) {
    const root = new THREE.Group(), metalSleeve = ch.key === 'crusader';
    const sleeve = metalSleeve ? M(0xa3a9b0, { map: 'mail', n: 'mail', ns: 6, r: 0.42, m: 0.75 }) : M(ch.sleeve, { map: 'cloth', n: 'cloth', ns: 1.5, r: 0.85 });
    const cuff = M(ch.cuff, { map: 'cloth', r: 0.8 }), glove = metalSleeve ? M(0xc4c9d0, { map: 'metal', r: 0.24, m: 0.92 }) : M(ch.glove, { map: 'leather', n: 'leather', r: 0.7 });
    const gm = M(0x2a2c31, { map: 'metal', r: 0.32, m: 0.8 }), poly = M(0x31342d, { map: 'leather', n: 'leather', r: 0.7 }), olive = M(0x4b5038, { map: 'leather', r: 0.55, m: 0.2 });
    const black = M(0x111214, { r: 0.3, m: 0.6 }), brass = M(0xa0803a, { map: 'metal', r: 0.3, m: 0.85 }), redTank = M(0xa83228, { map: 'metal', r: 0.35, m: 0.5 });
    const flashMat = new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const armGeo = new THREE.CylinderGeometry(0.042, 0.05, 1, 12); armGeo.rotateX(Math.PI / 2);
    function armTo(g, a, b) {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), v = B.clone().sub(A), len = v.length();
      const arm = new THREE.Mesh(armGeo, sleeve); arm.scale.z = len; arm.position.copy(A).addScaledVector(v, 0.5); arm.lookAt(B); g.add(arm);
      const cf = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 12).rotateX(Math.PI / 2), cuff); cf.position.copy(A).addScaledVector(v, 0.86); cf.lookAt(B); g.add(cf);
      const gl = new THREE.Mesh(sph(0.05, 12, 10), glove); gl.scale.set(0.85, 0.8, 1.35); gl.position.copy(B); gl.lookAt(B.clone().add(v)); g.add(gl);
    }
    function addFlash(g, z, y, s) { const f = new THREE.Mesh(new THREE.PlaneGeometry(s, s), flashMat); f.position.set(0, y, z); f.visible = false; g.add(f); return f; }
    const b = (g, w, h, d, m, x, y, z) => { const mesh = new THREE.Mesh(box(w, h, d), m); mesh.position.set(x, y, z); g.add(mesh); return mesh; };
    const cy = (g, r, len, m, x, y, z) => { const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), m); mesh.rotation.x = Math.PI / 2; mesh.position.set(x, y, z); g.add(mesh); return mesh; };

    const rifle = new THREE.Group();
    b(rifle, 0.07, 0.1, 0.36, gm, 0, 0, -0.05);
    b(rifle, 0.075, 0.08, 0.26, poly, 0, -0.005, -0.33);
    cy(rifle, 0.013, 0.22, black, 0, 0.012, -0.56);
    b(rifle, 0.03, 0.03, 0.06, black, 0, 0.012, -0.68);
    b(rifle, 0.05, 0.18, 0.08, poly, 0, -0.12, -0.13).rotation.x = 0.2;
    b(rifle, 0.045, 0.12, 0.05, poly, 0, -0.1, 0.06).rotation.x = -0.3;
    b(rifle, 0.05, 0.08, 0.24, poly, 0, -0.015, 0.25);
    b(rifle, 0.022, 0.045, 0.32, gm, 0, 0.075, -0.1);
    b(rifle, 0.012, 0.03, 0.012, M(0xff3a2a, { e: 0xff2a1a, ei: 4 }), 0, 0.1, -0.24);
    armTo(rifle, [0.16, -0.34, 0.42], [0.0, -0.1, 0.07]);
    armTo(rifle, [-0.24, -0.36, 0.12], [-0.02, -0.06, -0.33]);
    const rifleFlash = addFlash(rifle, -0.74, 0.012, 0.28);

    const sniper = new THREE.Group();
    b(sniper, 0.06, 0.09, 0.56, olive, 0, 0, -0.12);
    cy(sniper, 0.015, 0.46, black, 0, 0.012, -0.62);
    cy(sniper, 0.028, 0.3, black, 0, 0.095, -0.1);
    cy(sniper, 0.038, 0.06, black, 0, 0.095, -0.27);
    cy(sniper, 0.034, 0.05, black, 0, 0.095, 0.06);
    b(sniper, 0.03, 0.03, 0.03, gm, 0, 0.055, -0.1);
    b(sniper, 0.05, 0.11, 0.26, olive, 0, -0.025, 0.28);
    b(sniper, 0.06, 0.02, 0.02, gm, 0.05, 0.02, 0.06);
    armTo(sniper, [0.16, -0.34, 0.45], [0.0, -0.1, 0.1]);
    armTo(sniper, [-0.24, -0.36, 0.1], [-0.02, -0.06, -0.3]);
    const sniperFlash = addFlash(sniper, -0.88, 0.012, 0.36);

    const flamer = new THREE.Group();
    b(flamer, 0.08, 0.1, 0.4, gm, 0, 0, -0.15);
    cy(flamer, 0.025, 0.3, brass, 0, 0.005, -0.48);
    cy(flamer, 0.035, 0.04, brass, 0, 0.005, -0.63);
    cy(flamer, 0.07, 0.36, redTank, 0, -0.13, -0.1);
    b(flamer, 0.045, 0.12, 0.05, poly, 0, -0.1, 0.06).rotation.x = -0.3;
    const pilot = new THREE.Mesh(sph(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0x7ab8ff })); pilot.position.set(0, -0.03, -0.66); flamer.add(pilot);
    armTo(flamer, [0.16, -0.34, 0.4], [0.0, -0.1, 0.06]);
    armTo(flamer, [-0.24, -0.38, 0.1], [-0.03, -0.1, -0.24]);

    const sword = new THREE.Group();
    const bladeM = M(ch.blade, { map: 'metal', r: 0.2, m: 0.9 }), hiltM = M(ch.hilt, { map: 'metal', r: 0.4, m: 0.5 });
    const bl = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.03, ch.key === 'crusader' ? 0.95 : 0.8, 4), bladeM); bl.scale.z = 0.3; bl.position.y = 0.55; sword.add(bl);
    b(sword, ch.key === 'crusader' ? 0.24 : 0.12, 0.03, 0.04, hiltM, 0, 0.1, 0);
    b(sword, 0.035, 0.14, 0.035, hiltM, 0, 0, 0);
    armTo(sword, [0.2, -0.42, 0.42], [0, -0.04, 0]);
    sword.visible = false;

    root.add(rifle, sniper, flamer, sword);
    return { root, guns: [rifle, sniper, flamer], flashes: [rifleFlash, sniperFlash, null], sword, pilot };
  }

  return { lin, M, box, FLASH, FLASH_SKIN, humanoid, ikArm, zombie, alien, boss, soldier, napoleon, crusader, nameTag, viewmodel, pickup, PICK };
})();
