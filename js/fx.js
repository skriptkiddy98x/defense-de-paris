'use strict';
// Particles, tracers, flashes, scorch marks and other effects.
const FX = (() => {
  const VS = `attribute vec3 pcolor; attribute float alpha; attribute float size; uniform float scale;
    varying vec3 vC; varying float vA;
    void main(){ vC = pcolor; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`;
  // colours are authored in display space; the post chain works in linear HDR, so convert and boost glows
  const FS = `varying vec3 vC; varying float vA; uniform float boost;
    void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
      gl_FragColor = linearToOutputTexel(vec4(pow(vC, vec3(2.2)) * boost, smoothstep(0.5, 0.0, d) * vA)); }`;

  class Particles {
    constructor(max, blending) {
      this.max = max; this.n = 0;
      const f = k => new Float32Array(max * k);
      Object.assign(this, { p: f(3), v: f(3), c: f(3), a: f(1), s: f(1), life: f(1), ml: f(1), s0: f(1), s1: f(1), a0: f(1), g: f(1), dr: f(1), fi: f(1) });
      const geo = this.geo = new THREE.BufferGeometry();
      this.attrs = [['position', this.p, 3], ['pcolor', this.c, 3], ['alpha', this.a, 1], ['size', this.s, 1]].map(([n, arr, k]) => {
        const at = new THREE.BufferAttribute(arr, k); at.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, at); return at;
      });
      geo.setDrawRange(0, 0);
      this.mat = new THREE.ShaderMaterial({ uniforms: { scale: { value: 400 }, boost: { value: blending === THREE.AdditiveBlending ? 2.6 : 1 } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending });
      this.points = new THREE.Points(geo, this.mat); this.points.frustumCulled = false;
      this.points.renderOrder = blending === THREE.AdditiveBlending ? 3 : 2;
    }
    emit(x, y, z, vx, vy, vz, r, g, b, size, life, o) {
      let i;
      if (this.n < this.max) i = this.n++; else i = (Math.random() * this.max) | 0;
      const i3 = i * 3;
      this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
      this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
      this.c[i3] = r; this.c[i3 + 1] = g; this.c[i3 + 2] = b;
      o = o || {};
      this.s0[i] = size; this.s1[i] = size * (o.grow !== undefined ? o.grow : 1);
      this.a0[i] = o.alpha !== undefined ? o.alpha : 1; this.g[i] = o.grav || 0; this.dr[i] = o.drag || 0; this.fi[i] = o.fadeIn ? 1 : 0;
      this.life[i] = this.ml[i] = life; this.s[i] = size; this.a[i] = o.fadeIn ? 0 : this.a0[i];
    }
    kill(i) {
      const j = --this.n; if (i === j) return;
      for (const arr of [this.p, this.v, this.c]) { arr[i * 3] = arr[j * 3]; arr[i * 3 + 1] = arr[j * 3 + 1]; arr[i * 3 + 2] = arr[j * 3 + 2]; }
      for (const arr of [this.a, this.s, this.life, this.ml, this.s0, this.s1, this.a0, this.g, this.dr, this.fi]) arr[i] = arr[j];
    }
    update(dt) {
      let i = 0;
      while (i < this.n) {
        this.life[i] -= dt;
        if (this.life[i] <= 0) { this.kill(i); continue; }
        const i3 = i * 3, k = 1 - this.life[i] / this.ml[i], dd = Math.max(0, 1 - this.dr[i] * dt);
        this.v[i3] *= dd; this.v[i3 + 1] = this.v[i3 + 1] * dd - this.g[i] * dt; this.v[i3 + 2] *= dd;
        this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
        if (this.p[i3 + 1] < 0.03) { this.p[i3 + 1] = 0.03; this.v[i3 + 1] *= -0.25; this.v[i3] *= 0.6; this.v[i3 + 2] *= 0.6; }
        this.s[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
        this.a[i] = this.a0[i] * (1 - k) * (this.fi[i] ? Math.min(1, k * 6) : 1);
        i++;
      }
      this.geo.setDrawRange(0, this.n);
      for (const at of this.attrs) at.needsUpdate = true;
    }
  }

  class Tracers {
    constructor(max) {
      this.max = max; this.n = 0;
      this.p = new Float32Array(max * 6); this.c = new Float32Array(max * 6); this.base = new Float32Array(max * 3); this.life = new Float32Array(max); this.ml = new Float32Array(max);
      const geo = this.geo = new THREE.BufferGeometry();
      this.pa = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage);
      this.ca = new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', this.pa); geo.setAttribute('color', this.ca); geo.setDrawRange(0, 0);
      this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      this.lines.frustumCulled = false; this.lines.renderOrder = 4;
    }
    add(ax, ay, az, bx, by, bz, col, life) {
      const i = this.n < this.max ? this.n++ : (Math.random() * this.max) | 0, i6 = i * 6;
      // draw only the far 75% so the streak starts ahead of the muzzle
      const sx = ax + (bx - ax) * 0.04, sy = ay + (by - ay) * 0.04, sz = az + (bz - az) * 0.04;
      this.p.set([sx, sy, sz, bx, by, bz], i6);
      this.base.set([col[0] * col[0] * 3, col[1] * col[1] * 3, col[2] * col[2] * 3], i * 3); this.life[i] = this.ml[i] = life || 0.07;
    }
    update(dt) {
      let i = 0;
      while (i < this.n) {
        this.life[i] -= dt;
        if (this.life[i] <= 0) {
          const j = --this.n;
          if (i !== j) { this.p.copyWithin(i * 6, j * 6, j * 6 + 6); this.base.copyWithin(i * 3, j * 3, j * 3 + 3); this.life[i] = this.life[j]; this.ml[i] = this.ml[j]; }
          continue;
        }
        const k = this.life[i] / this.ml[i], i6 = i * 6, i3 = i * 3;
        for (let q = 0; q < 3; q++) { this.c[i6 + q] = this.base[i3 + q] * k * 0.25; this.c[i6 + 3 + q] = this.base[i3 + q] * k; }
        i++;
      }
      this.geo.setDrawRange(0, this.n * 2);
      this.pa.needsUpdate = this.ca.needsUpdate = true;
    }
  }

  let scene, add, norm, tracers, lights = [], li = 0, decals = [], rings = [], beams = [], camLight;
  const rnd = (a, b) => a + (b - a) * Math.random();

  function init(sc, renderer, camera) {
    scene = sc;
    add = new Particles(2600, THREE.AdditiveBlending); norm = new Particles(1800, THREE.NormalBlending);
    scene.add(norm.points); scene.add(add.points);
    tracers = new Tracers(160); scene.add(tracers.lines);
    for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xffa040, 0, 26, 2); l.userData = { t: 0, d: 1, i: 0 }; scene.add(l); lights.push(l); }
    camLight = new THREE.PointLight(0xffc070, 0, 9, 2); camLight.userData = { t: 0, d: 1, i: 0 }; camera.add(camLight); camLight.position.set(0.2, -0.1, -0.8);
    const ringMat = () => new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), ringMat()); r.rotation.x = -Math.PI / 2; r.visible = false; r.userData = { t: 0 }; scene.add(r); rings.push(r); }
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 40, 18, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6ff7ff).multiplyScalar(2.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      b.visible = false; b.userData = { t: 0 }; scene.add(b); beams.push(b);
    }
  }
  function setScale(hPx, fovDeg) { const s = hPx / (2 * Math.tan(fovDeg * Math.PI / 360)); add.mat.uniforms.scale.value = s; norm.mat.uniforms.scale.value = s; }

  function burst(x, y, z, n, col, spd, size, life, additive, o) {
    const sys = additive ? add : norm;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * 6.283, rr = Math.sqrt(1 - u * u), s = spd * (0.4 + Math.random() * 0.6);
      sys.emit(x, y, z, Math.cos(th) * rr * s, u * s + (o && o.up || 0), Math.sin(th) * rr * s, col[0], col[1], col[2], size * rnd(0.7, 1.3), life * rnd(0.7, 1.3), o);
    }
  }
  function light(x, y, z, color, intensity, dur) {
    const l = lights[li++ % lights.length];
    l.position.set(x, y, z); l.color.setHex(color); l.userData = { t: dur, d: dur, i: intensity }; l.intensity = intensity;
  }
  function muzzle(x, y, z, dx, dy, dz, big) {
    for (let i = 0; i < (big ? 8 : 4); i++) { const s = rnd(2, 9); add.emit(x, y, z, dx * s + rnd(-1, 1), dy * s + rnd(-1, 1), dz * s + rnd(-1, 1), 1, 0.72, 0.3, big ? 0.32 : 0.2, 0.05); }
    norm.emit(x + dx * 0.3, y + dy * 0.3, z + dz * 0.3, dx * 0.8, 0.5, dz * 0.8, 0.55, 0.55, 0.55, 0.3, 0.6, { grow: 4, alpha: 0.25, fadeIn: true });
  }
  function playerFlash(intensity) { camLight.intensity = intensity; camLight.userData = { t: 0.05, d: 0.05, i: intensity }; }
  function impact(x, y, z) {
    burst(x, y, z, 6, [1, 0.75, 0.4], 6, 0.12, 0.25, true, { grav: 12 });
    burst(x, y, z, 4, [0.5, 0.46, 0.42], 1.4, 0.35, 0.7, false, { grow: 3, alpha: 0.5, fadeIn: true });
  }
  function blood(x, y, z, dx, dz, kind) {
    if (kind === 'zombie') {
      for (let i = 0; i < 9; i++) { const s = rnd(1.5, 5); norm.emit(x, y, z, dx * s + rnd(-1.5, 1.5), rnd(0.5, 3), dz * s + rnd(-1.5, 1.5), rnd(0.28, 0.38), rnd(0.08, 0.14), 0.04, rnd(0.12, 0.22), rnd(0.4, 0.8), { grav: 14 }); }
      norm.emit(x, y, z, dx, 0.3, dz, 0.3, 0.1, 0.05, 0.4, 0.35, { grow: 2.2, alpha: 0.7 });
    } else {
      for (let i = 0; i < 10; i++) { const s = rnd(1.5, 6); add.emit(x, y, z, dx * s + rnd(-2, 2), rnd(0.5, 3.5), dz * s + rnd(-2, 2), 0.35, 1, 0.55, rnd(0.12, 0.2), rnd(0.3, 0.6), { grav: 10 }); }
    }
  }
  function explosion(x, y, z, s) {
    s = s || 1;
    burst(x, y + 0.6, z, 34 * s, [1, 0.6, 0.18], 9 * s, 1.3 * s, 0.5, true, { grow: 2.2, drag: 3, up: 2 });
    burst(x, y + 0.6, z, 18 * s, [1, 0.9, 0.55], 5 * s, 0.9 * s, 0.3, true, { grow: 2, drag: 3 });
    burst(x, y + 0.5, z, 24 * s, [1, 0.7, 0.3], 22 * s, 0.14, 0.9, true, { grav: 18 });
    for (let i = 0; i < 22 * s; i++) norm.emit(x + rnd(-1.5, 1.5) * s, y + rnd(0.5, 2.5), z + rnd(-1.5, 1.5) * s, rnd(-2, 2), rnd(1.5, 4.5), rnd(-2, 2), rnd(0.12, 0.2), rnd(0.1, 0.17), rnd(0.1, 0.15), rnd(2, 3.4) * s, rnd(1.8, 3.2), { grow: 2.8, drag: 1.2, alpha: 0.85, fadeIn: true });
    light(x, y + 2, z, 0xffa040, 9 * s, 0.45);
    scorch(x, z, 2.6 * s);
  }
  function scorch(x, z, r) {
    let d = decals.length < 24 ? null : decals.shift();
    if (!d) { d = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0x0a0806, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); d.rotation.x = -Math.PI / 2; scene.add(d); }
    d.position.set(x, 0.03, z); d.scale.setScalar(r * rnd(0.85, 1.15)); d.userData.t = 25; d.material.opacity = 0.7; decals.push(d);
  }
  function flame(x, y, z, dx, dy, dz) {
    // a tongue of fire: thin and hot at the nozzle, orange and see-through further out
    for (let i = 0; i < 4; i++) {
      const s = rnd(12, 17), sp = 0.075, hot = Math.random();
      add.emit(x + dx * 0.25, y + dy * 0.25, z + dz * 0.25, (dx + rnd(-sp, sp)) * s, (dy + rnd(-sp, sp)) * s + 0.4, (dz + rnd(-sp, sp)) * s, 1, 0.3 + hot * 0.35, 0.04 + hot * 0.08, rnd(0.1, 0.16), rnd(0.4, 0.55), { grow: 6, drag: 1.7, grav: -2.5, alpha: 0.5 });
    }
    if (Math.random() < 0.5) norm.emit(x + dx * 6, y + dy * 6 + 0.4, z + dz * 6, dx * 3, 1.8, dz * 3, 0.15, 0.12, 0.11, 1.0, 1.4, { grow: 3.5, alpha: 0.5, fadeIn: true, drag: 0.8 });
  }
  function fire(x, y, z, s) {
    s = s || 1;
    add.emit(x, y, z, rnd(-0.4, 0.4), rnd(1.5, 3.2), rnd(-0.4, 0.4), 1, rnd(0.4, 0.65), 0.12, rnd(0.4, 0.8) * s, rnd(0.4, 0.75), { grow: 0.3, drag: 0.5 });
    if (Math.random() < 0.3) norm.emit(x, y + 0.8, z, rnd(-0.3, 0.3), rnd(1.4, 2.4), rnd(-0.3, 0.3), 0.12, 0.1, 0.1, 0.8 * s, rnd(1.8, 2.8), { grow: 4, alpha: 0.55, fadeIn: true, drag: 0.3 });
  }
  function water(x, y, z) {
    const a = Math.random() * 6.283, s = rnd(0.6, 1.3);
    norm.emit(x, y, z, Math.cos(a) * s, rnd(2.2, 3.2), Math.sin(a) * s, 0.72, 0.84, 0.92, 0.12, 0.9, { grav: 6, alpha: 0.6 });
  }
  function smoke(x, y, z, col, size) { norm.emit(x, y, z, rnd(-0.3, 0.3), rnd(1, 2), rnd(-0.3, 0.3), col[0], col[1], col[2], size, rnd(1.5, 2.5), { grow: 3, alpha: 0.75, fadeIn: true }); }
  function tracer(ax, ay, az, bx, by, bz, col, life) { tracers.add(ax, ay, az, bx, by, bz, col || [1, 0.8, 0.45], life); }
  function ring(x, z, maxR, color) {
    const r = rings.find(q => !q.visible) || rings[0];
    r.visible = true; r.position.set(x, 0.25, z); r.userData = { t: 0, max: maxR, dur: 0.55 }; r.material.color.setHex(color || 0xffd27a).multiplyScalar(3);
  }
  function beam(x, z) {
    const b = beams.find(q => !q.visible) || beams[0];
    b.visible = true; b.position.set(x, 20, z); b.userData = { t: 0, dur: 1.1 };
    burst(x, 0.6, z, 30, [0.4, 1, 1], 5, 0.4, 0.8, true, { up: 2 });
  }

  function update(dt) {
    add.update(dt); norm.update(dt); tracers.update(dt);
    for (const l of [...lights, camLight]) { const u = l.userData; if (u.t > 0) { u.t -= dt; l.intensity = Math.max(0, u.i * u.t / u.d); } else l.intensity = 0; }
    for (const d of decals) { d.userData.t -= dt; d.material.opacity = Math.max(0, Math.min(0.7, d.userData.t / 6)); }
    for (const r of rings) if (r.visible) { const u = r.userData; u.t += dt; const k = u.t / u.dur; r.scale.setScalar(0.5 + k * u.max); r.material.opacity = Math.max(0, 0.9 * (1 - k)); if (k >= 1) r.visible = false; }
    for (const b of beams) if (b.visible) { const u = b.userData; u.t += dt; const k = u.t / u.dur; b.scale.set(1.6 * (1 - k * 0.8), 1, 1.6 * (1 - k * 0.8)); b.material.opacity = 0.55 * Math.sin(Math.min(1, k) * Math.PI); if (k >= 1) b.visible = false; }
  }

  return { init, setScale, update, burst, light, muzzle, playerFlash, impact, blood, explosion, scorch, flame, fire, water, smoke, tracer, ring, beam, get add() { return add; }, get norm() { return norm; } };
})();
