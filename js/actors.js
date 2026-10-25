'use strict';
// Enemies (zombies, aliens, the alien commander) and AI squadmates.
const ENEMY = {
  walker: { hp: 70, speed: [2.2, 2.9], dmg: 12, range: 1.55, cd: 1.2, scale: 1, score: 100, kind: 'zombie' },
  runner: { hp: 40, speed: [4.8, 5.6], dmg: 8, range: 1.45, cd: 0.8, scale: 0.92, score: 120, kind: 'zombie' },
  brute: { hp: 420, speed: [1.6, 1.8], dmg: 28, range: 2.3, cd: 1.6, scale: 1.55, score: 400, kind: 'zombie' },
  bloater: { hp: 95, speed: [1.9, 2.2], dmg: 0, range: 1.9, cd: 99, scale: 1.08, score: 160, kind: 'zombie' },
  alien: { hp: 90, speed: [3.0, 3.4], dmg: 10, range: 30, cd: 2.0, scale: 1.08, score: 250, kind: 'alien' },
  boss: { hp: 2600, speed: [2.2, 2.2], dmg: 12, range: 38, cd: 2.4, scale: 1, score: 3000, kind: 'boss' }
};
const LABEL = { walker: 'Zombie', runner: 'Runner', brute: 'Brute', bloater: 'Bloater', alien: 'Alien trooper', boss: 'Invasion Commander' };

function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r, h = b * b - c;
  if (h < 0) return null;
  const s = Math.sqrt(h); let t = -b - s; if (t < 0) t = -b + s;
  return t > 0 ? t : null;
}
function steerAround(self, mv) {
  for (const c of World.avoid) {
    const sx = self.x - c.x, sz = self.z - c.z, d = Math.hypot(sx, sz), rr = c.r + self.r + 1.2;
    if (d < rr && d > 0.01) {
      const side = (sx * mv.z - sz * mv.x) > 0 ? 1 : -1, f = (rr - d) / rr * 1.6;
      mv.x += (sx / d) * f * 0.6 + (-sz / d) * side * f;
      mv.z += (sz / d) * f * 0.6 + (sx / d) * side * f;
    }
  }
}
function pushApart(self, other, minD) {
  const sx = self.x - other.x, sz = self.z - other.z, d = Math.hypot(sx, sz);
  if (d < minD && d > 1e-4) { const k = (minD - d); self.x += sx / d * k; self.z += sz / d * k; }
}

class Enemy {
  constructor(type, x, z, wave) {
    const d = ENEMY[type];
    this.type = type; this.d = d; this.kind = d.kind;
    this.maxHp = this.hp = d.hp * (1 + 0.09 * (wave - 1)) * (type === 'boss' ? 1 + 0.25 * Math.floor((wave - 5) / 5) : 1);
    this.speed = rand(d.speed[0], d.speed[1]) * (1 + Math.min(0.25, 0.025 * (wave - 1)));
    this.x = x; this.z = z; this.y = type === 'boss' ? 4.5 : 0;
    this.r = type === 'boss' ? 1.6 : type === 'brute' ? 0.6 : 0.36;
    this.yaw = Math.atan2(-x, -z); this.vx = 0; this.vz = 0; this.kx = 0; this.kz = 0;
    this.t = Math.random() * 10; this.phase = Math.random() * 6;
    this.atk = 0; this.cd = rand(0.2, 0.8); this.hitDone = true;
    this.burn = 0; this.flash = 0; this.stun = 0; this.dead = false; this.deadT = 0; this.remove = false;
    this.target = null; this.retarget = 0; this.groanT = rand(1, 7); this.shootT = rand(1.2, 2.6); this.summonT = 9;
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = rand(1, 3);
    this.lx = x; this.lz = z; this.stuckCheck = 1; this.jitT = 0; this.jx = 0; this.jz = 0;
    this.m = type === 'boss' ? Models.boss() : type === 'alien' ? Models.alien() : Models.zombie(type);
    this.root = this.m.root; this.root.position.set(x, this.y, z); this.root.rotation.y = this.yaw;
    this.meshes = []; this.root.traverse(o => { if (o.isMesh) this.meshes.push(o); });
    this.mats = this.meshes.map(m => m.material);
    G.scene.add(this.root);
  }

  hitTest(o, d) {
    if (this.dead) return null;
    let best = null;
    const test = (cx, cy, cz, r, head) => { const t = raySphere(o, d, cx, cy, cz, r); if (t !== null && (!best || t < best.t)) best = { t, head }; };
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    if (this.type === 'boss') { test(this.x, this.y, this.z, 2.1, false); test(this.x + fx * 1.7, this.y + 0.1, this.z + fz * 1.7, 0.75, true); return best; }
    const s = this.d.scale, lean = this.type === 'runner' ? 0.3 * s : 0.08 * s;
    test(this.x + fx * lean, 1.69 * s, this.z + fz * lean, 0.15 * s, true);
    test(this.x + fx * lean * 0.6, 1.33 * s, this.z + fz * lean * 0.6, 0.28 * s, false);
    test(this.x + fx * 0.08, (this.type === 'bloater' ? 1.2 : 0.95) * s, this.z + fz * 0.08, (this.type === 'bloater' ? 0.4 : 0.22) * s, false);
    test(this.x, 0.5 * s, this.z, 0.2 * s, false);
    return best;
  }

  update(dt) {
    this.t += dt;
    if (this.dead) return this.dying(dt);
    if (this.flash > 0 && (this.flash -= dt) <= 0) this.setFlash(false);
    if (this.fuse > 0) {
      // a bloater that reached its target flickers, swells and bursts
      this.fuse -= dt;
      const on = Math.sin(this.fuse * 40) > 0; if (on !== this.fuseOn) { this.fuseOn = on; this.setFlash(on); }
      this.root.scale.setScalar(1 + (0.75 - this.fuse) * 0.35);
      if (this.fuse <= 0) { this.hurt(1e6, { selfDestruct: true }); return; }
    }
    if (this.burn > 0) {
      this.burn -= dt;
      if (Math.random() < dt * 25) FX.fire(this.x + rand(-0.3, 0.3), this.y + rand(0.4, 1.7) * this.d.scale, this.z + rand(-0.3, 0.3), 0.7);
      if (this.hurt(18 * dt, { silent: true, fire: true, byPlayer: true })) return;
    }
    if ((this.retarget -= dt) <= 0 || !this.target || !this.target.alive()) { this.retarget = 0.6; this.target = G.pickTarget(this.x, this.z); }
    const T = this.target, mv = { x: 0, z: 0 };
    let faceX = 0, faceZ = 0, dist = 99;
    if (T) {
      dist = Math.hypot(T.x - this.x, T.z - this.z);
      let gx = T.x, gz = T.z;
      const rg = World.region(this.x, this.z), rt = World.region(T.x, T.z);
      if (rg !== 'P' && rg !== 'X' && rg !== rt) { gx = World.ENTRY[rg].x; gz = World.ENTRY[rg].z; }
      let dx = gx - this.x, dz = gz - this.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      faceX = T.x - this.x; faceZ = T.z - this.z;
      let move = 1;
      if (this.type === 'bloater') {
        if (dist < this.d.range + T.r && !(this.fuse > 0)) { this.fuse = 0.75; SFX.fuse(); }
        if (this.fuse > 0) move = 0.15;
      } else if (this.kind === 'zombie') {
        if (dist < this.d.range + T.r) { move = 0; if (this.atk <= 0 && this.cd <= 0) { this.atk = 0.55; this.cd = this.d.cd; this.hitDone = false; } }
      } else {
        const los = World.segmentClear(this.x, this.z, T.x, T.z);
        if (los && dist < this.d.range) {
          move = dist < 12 ? -0.7 : dist < this.d.range * 0.6 ? 0 : 0.6;
          if ((this.strafeT -= dt) <= 0) { this.strafe *= -1; this.strafeT = rand(1.2, 3); }
          mv.x += -dz * this.strafe * 0.7; mv.z += dx * this.strafe * 0.7;
          if ((this.shootT -= dt) <= 0) { this.shoot(T); this.shootT = this.type === 'boss' ? rand(1.8, 2.6) : rand(1.6, 2.8); }
        }
        if (this.type === 'boss' && (this.summonT -= dt) <= 0) { this.summonT = 13; G.summonAround(this.x, this.z, 2); }
      }
      mv.x += dx * move; mv.z += dz * move;
    }
    this.cd -= dt;
    for (const o of G.enemies) {
      if (o === this || o.dead) continue;
      const sx = this.x - o.x, sz = this.z - o.z, rr = this.r + o.r + 0.15, d2 = sx * sx + sz * sz;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), f = (rr - d) / rr * 2.2; mv.x += sx / d * f; mv.z += sz / d * f; }
    }
    if (this.type !== 'boss') steerAround(this, mv);
    if (this.jitT > 0) { this.jitT -= dt; mv.x += this.jx; mv.z += this.jz; }
    const ml = Math.hypot(mv.x, mv.z);
    if (ml > 1) { mv.x /= ml; mv.z /= ml; }
    const sp = this.stun > 0 ? 0 : this.speed * (this.atk > 0 ? 0.25 : 1), k = Math.min(1, dt * 6);
    this.vx += (mv.x * sp - this.vx) * k; this.vz += (mv.z * sp - this.vz) * k;
    if (this.stun > 0) this.stun -= dt;
    this.x += (this.vx + this.kx) * dt; this.z += (this.vz + this.kz) * dt;
    const kd = Math.max(0, 1 - dt * 5); this.kx *= kd; this.kz *= kd;
    if (this.type !== 'boss') { if (G.player.hp > 0) pushApart(this, G.player, this.r + G.player.r); for (const m of G.mates) if (!m.downed) pushApart(this, m, this.r + m.r); }
    World.collide(this, this.r, this.type === 'boss' ? 0 : this.y);
    if ((this.stuckCheck -= dt) <= 0) {
      const moved = Math.hypot(this.x - this.lx, this.z - this.lz);
      if (ml > 0.3 && moved < this.speed * 0.25 && dist > 3 && this.atk <= 0) { this.jitT = 1; const a = Math.random() * 6.283; this.jx = Math.cos(a) * 1.2; this.jz = Math.sin(a) * 1.2; }
      this.lx = this.x; this.lz = this.z; this.stuckCheck = 1;
    }
    const spd = Math.hypot(this.vx, this.vz);
    let fyaw = this.yaw;
    if ((this.kind !== 'zombie' || dist < 4) && (faceX || faceZ)) fyaw = Math.atan2(faceX, faceZ);
    else if (spd > 0.3) fyaw = Math.atan2(this.vx, this.vz);
    const dy = Math.atan2(Math.sin(fyaw - this.yaw), Math.cos(fyaw - this.yaw));
    this.yaw += dy * Math.min(1, dt * 7);
    if (this.atk > 0) {
      this.atk -= dt;
      if (!this.hitDone && this.atk < 0.28) {
        this.hitDone = true;
        if (T && T.alive() && Math.hypot(T.x - this.x, T.z - this.z) < this.d.range + T.r + 0.4) T.damage(this.d.dmg, this);
      }
    }
    if (this.kind === 'zombie' && (this.groanT -= dt) <= 0) {
      this.groanT = rand(4, 10);
      const pd = Math.hypot(G.player.x - this.x, G.player.z - this.z);
      if (pd < 32) { if (this.type === 'bloater') SFX.gurgle(1 - pd / 32); else SFX.groan(1 - pd / 32); }
    }
    if (this.type === 'bloater' && Math.random() < dt * 4) FX.norm.emit(this.x + rand(-0.3, 0.3), 1.3 * this.d.scale, this.z + rand(-0.3, 0.3), rand(-0.2, 0.2), rand(0.4, 0.9), rand(-0.2, 0.2), 0.55, 0.75, 0.25, 0.35, 1.2, { grow: 3, alpha: 0.35, fadeIn: true });
    this.animate(dt, spd, dist);
    this.root.position.set(this.x, this.y, this.z); this.root.rotation.y = this.yaw;
    // only enemies near the player cast shadows; the rest save a shadow-map draw each
    const near = Math.abs(this.x - G.player.x) + Math.abs(this.z - G.player.z) < 45;
    if (near !== this.shadowOn) { this.shadowOn = near; for (const m of this.meshes) m.castShadow = near; }
  }

  animate(dt, spd, dist) {
    const m = this.m;
    this.phase += dt * (1.5 + spd * 2.2);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    if (this.kind === 'zombie') {
      const sw = Math.min(1, spd / 2) * (this.type === 'runner' ? 0.95 : 0.55);
      m.legL.rotation.x = s * sw; m.legR.rotation.x = -s * sw;
      m.kneeL.rotation.x = Math.max(0, Math.sin(this.phase + 1.5)) * sw * 1.5 + 0.08;
      m.kneeR.rotation.x = Math.max(0, Math.sin(this.phase + 1.5 + Math.PI)) * sw * 1.5 + 0.08;
      m.body.position.y = Math.abs(c) * 0.04 - 0.02;
      if (this.type === 'runner') {
        m.torso.rotation.x = 0.5; m.armL.rotation.x = -s * 1.1 - 0.3; m.armR.rotation.x = s * 1.1 - 0.3;
        m.elbowL.rotation.x = -1.3; m.elbowR.rotation.x = -1.3; m.neck.rotation.x = -0.4;
      } else {
        m.torso.rotation.z = s * 0.08; m.torso.rotation.x = this.type === 'brute' ? 0.3 : 0.14;
        const reach = -1.4 + Math.sin(this.t * 1.7) * 0.12;
        m.armL.rotation.x = reach + s * 0.12; m.armR.rotation.x = reach - s * 0.12;
        m.elbowL.rotation.x = -0.25 + Math.sin(this.t * 2.3) * 0.1; m.elbowR.rotation.x = -0.3 + Math.cos(this.t * 2.1) * 0.1;
        m.neck.rotation.z = Math.sin(this.t * 0.9 + this.phase * 0.1) * 0.3; m.neck.rotation.x = 0.15;
      }
      if (this.atk > 0) {
        const p = 1 - this.atk / 0.55, a = p < 0.5 ? lerp(-1.4, -2.7, p * 2) : lerp(-2.7, -0.5, (p - 0.5) * 2);
        m.armL.rotation.x = a; m.armR.rotation.x = a; m.elbowL.rotation.x = m.elbowR.rotation.x = p < 0.5 ? -0.6 : -0.05;
        m.torso.rotation.x = p < 0.5 ? 0 : 0.45;
      }
    } else if (this.kind === 'alien') {
      const sw = Math.min(1, spd / 2.5) * 0.6;
      m.legL.rotation.x = s * sw; m.legR.rotation.x = -s * sw;
      m.kneeL.rotation.x = Math.max(0, Math.sin(this.phase + 1.5)) * sw * 1.4;
      m.kneeR.rotation.x = Math.max(0, Math.sin(this.phase + 1.5 + Math.PI)) * sw * 1.4;
      m.elbowL.rotation.x = -0.5;
      m.body.position.y = 0.04 * Math.sin(this.t * 3);
      m.armL.rotation.x = -s * 0.4;
      const aim = dist < this.d.range + 5;
      m.armR.rotation.x = lerp(m.armR.rotation.x, aim ? -1.5 : s * 0.4, Math.min(1, dt * 8));
    } else {
      this.y = 4.5 + Math.sin(this.t * 1.3) * 0.5;
      m.ring.rotation.y += dt * 1.5;
      m.core.rotation.z = Math.sin(this.t * 0.8) * 0.08;
      m.tentacles.forEach((chain, i) => chain.forEach((seg, j) => { seg.rotation.x = Math.sin(this.t * 2 + i * 1.3 + j * 0.6) * 0.28; seg.rotation.z = Math.cos(this.t * 1.6 + i + j * 0.5) * 0.18; }));
    }
  }

  shoot(T) {
    const from = new THREE.Vector3();
    (this.type === 'boss' ? this.m.eye : this.m.muzzle).getWorldPosition(from);
    const n = this.type === 'boss' ? 5 : 1, spd = this.type === 'boss' ? 20 : 24;
    for (let i = 0; i < n; i++) {
      const tx = T.x + rand(-0.6, 0.6), ty = (T.y || 0) + 1.1, tz = T.z + rand(-0.6, 0.6);
      const dx = tx - from.x, dy = ty - from.y, dz = tz - from.z, l = Math.hypot(dx, dy, dz);
      const a = n > 1 ? (i - 2) * 0.12 : 0, cs = Math.cos(a), sn = Math.sin(a);
      G.addBolt(from.x, from.y, from.z, (dx * cs - dz * sn) / l * spd, dy / l * spd, (dx * sn + dz * cs) / l * spd, this.d.dmg, this.type === 'boss' ? 'boss' : 'alien');
    }
    const pd = Math.hypot(G.player.x - this.x, G.player.z - this.z);
    SFX.zap(Math.max(0, 1 - pd / 70));
  }

  hurt(dmg, o) {
    if (this.dead) return false;
    o = o || {};
    if (G.pow.insta > 0 && (o.byPlayer || o.mate)) dmg = this.type === 'boss' ? dmg * 3 : this.hp + 1;
    this.hp -= dmg; this.hitT = G.t;
    if (!o.silent) { this.flash = 0.06; this.setFlash(true); }
    if (o.knock && this.type !== 'boss') { this.kx += o.knock.x; this.kz += o.knock.z; }
    if (o.stun && this.type !== 'boss') this.stun = Math.max(this.stun, o.stun);
    if (o.fire) this.burn = Math.max(this.burn, o.burnTime || 0);
    if (this.hp <= 0) { this.die(o); return true; }
    return false;
  }
  setFlash(on) { for (let i = 0; i < this.meshes.length; i++) this.meshes[i].material = on ? (this.meshes[i].isSkinnedMesh ? Models.FLASH_SKIN : Models.FLASH) : this.mats[i]; }

  die(o) {
    this.dead = true; this.deadT = 0; this.setFlash(false);
    this.burning = this.burn > 0;
    this.root.scale.setScalar(this.type === 'bloater' ? 1 : this.root.scale.x);
    G.onKill(this, o);
    if (this.type === 'bloater') {
      // the gut bursts: a toxic blast that also takes out the zombies around it (chain reactions)
      G.bloaterBurst(this.x, this.z, !!(o.byPlayer || o.chain));
      this.root.visible = false; this.fall = {};
    } else if (this.kind === 'zombie') {
      const dirx = o.dirx !== undefined ? o.dirx : -Math.sin(this.yaw), dirz = o.dirz !== undefined ? o.dirz : -Math.cos(this.yaw);
      const dir = dirx * Math.sin(this.yaw) + dirz * Math.cos(this.yaw) < 0 ? -1 : 1;
      this.fall = o.explosive ? { vx: dirx * 9, vy: 7, vz: dirz * 9, spin: rand(-8, 8), dir } : { dir };
    } else if (this.kind === 'alien') {
      this.fall = {};
      FX.burst(this.x, 1.2, this.z, 18, [0.4, 1, 1], 4, 0.3, 0.6, true);
      FX.light(this.x, 1.5, this.z, 0x6ff7ff, 5, 0.3);
    } else {
      this.fall = { boom: 0 };
    }
  }

  dying(dt) {
    this.deadT += dt;
    const m = this.m, f = this.fall;
    if (this.type === 'bloater') { this.remove = true; return; }
    if (this.kind === 'zombie') {
      if (f.vy !== undefined) {
        f.vy -= 22 * dt; this.x += f.vx * dt; this.z += f.vz * dt; this.y += f.vy * dt;
        World.collide(this, this.r, 0);
        this.root.rotation.x += f.spin * dt;
        if (this.y <= 0 && f.vy < 0) { this.y = 0; f.vy = undefined; f.landed = true; this.root.rotation.x = f.dir * Math.PI / 2; }
      } else if (!f.landed) {
        const k = Math.min(1, this.deadT / 0.55);
        this.root.rotation.x = f.dir * (Math.PI / 2) * k * k;
        m.armL.rotation.x *= 0.92; m.armR.rotation.x *= 0.92; m.legL.rotation.x *= 0.9; m.legR.rotation.x *= 0.9;
        m.kneeL.rotation.x *= 0.9; m.kneeR.rotation.x *= 0.9; m.elbowL.rotation.x *= 0.9; m.elbowR.rotation.x *= 0.9;
        if (k >= 1) f.landed = true;
      }
      if (this.burning && this.deadT < 3 && Math.random() < dt * 18) FX.fire(this.x + rand(-0.5, 0.5), 0.3, this.z + rand(-0.5, 0.5), 0.8);
      if (this.deadT > 5) this.y -= dt * 0.35;
      if (this.deadT > 8) this.remove = true;
      this.root.position.set(this.x, Math.max(this.y, f.landed ? this.y : 0), this.z);
    } else if (this.kind === 'alien') {
      const k = Math.min(1, this.deadT / 0.6);
      this.root.scale.setScalar(1.08 * (1 - k * 0.9)); this.root.position.y = k * 1.2; this.root.rotation.y += dt * 12;
      if (Math.random() < 0.6) FX.burst(this.x, 1 + k, this.z, 2, [0.4, 1, 1], 3, 0.25, 0.5, true);
      if (k >= 1) { FX.burst(this.x, 1.5, this.z, 24, [0.5, 1, 0.9], 6, 0.3, 0.7, true); this.remove = true; }
    } else {
      this.y -= dt * 1.4; this.root.rotation.z += dt * 0.6; this.root.position.y = this.y;
      if ((f.boom -= dt) <= 0) {
        f.boom = 0.28;
        const bx = this.x + rand(-2, 2), bz = this.z + rand(-2, 2), by = Math.max(0.5, this.y + rand(-1, 1));
        FX.explosion(bx, by, bz, 0.7); SFX.explosion(0.6);
      }
      if (this.deadT > 2.6) {
        FX.explosion(this.x, 1, this.z, 2); SFX.explosion(1); G.shake = Math.max(G.shake, 1);
        FX.burst(this.x, 2, this.z, 60, [1, 0.4, 0.9], 12, 0.4, 1.2, true);
        this.remove = true;
      }
    }
  }
}

class Mate {
  constructor(name, skin, slot) {
    this.name = name; this.slot = slot;
    this.m = Models.soldier(skin); this.root = this.m.root;
    this.tag = Models.nameTag(name, '#9db8ff'); this.tag.position.set(0, 2.3, 0); this.root.add(this.tag);
    this.r = 0.4; this.y = 0; this.hp = this.maxHp = 100; this.downed = false;
    const P = G.player;
    this.x = P.x + slot[0]; this.z = P.z + slot[1]; this.vx = 0; this.vz = 0; this.yaw = Math.PI;
    this.target = null; this.scan = Math.random() * 0.3; this.shootT = 1; this.burst = 3; this.phase = 0;
    this.lx = this.x; this.lz = this.z; this.stuckCheck = 1; this.jitT = 0; this.jx = 0; this.jz = 0;
    G.scene.add(this.root);
  }
  alive() { return !this.downed; }
  damage(dmg) {
    if (this.downed || G.state !== 'play') return;
    this.hp -= dmg * 0.6 / G.player.mods.mateArmor;
    if (this.hp <= 0) this.down();
  }
  down() {
    this.downed = true; this.hp = 0;
    this.tag.userData.set('▼ ' + this.name, '#ff8a7e');
    G.feed(`${this.name} is down. Hold E next to them to revive`, 'warn');
  }
  revive(hp) {
    this.downed = false; this.hp = hp;
    this.tag.userData.set(this.name, '#9db8ff');
    this.root.rotation.x = 0; this.root.position.y = 0;
  }
  update(dt) {
    const P = G.player;
    if (this.downed) {
      this.root.rotation.x = lerp(this.root.rotation.x, -Math.PI / 2, Math.min(1, dt * 6));
      this.root.position.set(this.x, 0.15, this.z);
      return;
    }
    if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + dt * 4);
    if ((this.scan -= dt) <= 0) {
      this.scan = 0.35; this.target = null; let best = 60;
      for (const e of G.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - this.x, e.z - this.z);
        if (d < best && World.segmentClear(this.x, this.z, e.x, e.z)) { best = d; this.target = e; }
      }
    }
    if (this.target && this.target.dead) this.target = null;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const goal = { x: P.x + rx * this.slot[0] - fx * this.slot[1], z: P.z + rz * this.slot[0] - fz * this.slot[1] };
    World.collide(goal, 0.7, 0);
    let gx = goal.x, gz = goal.z;
    const rg = World.region(this.x, this.z), rt = World.region(gx, gz);
    if (rg !== 'P' && rg !== 'X' && rg !== rt) { gx = World.ENTRY[rg].x; gz = World.ENTRY[rg].z; }
    const dx = gx - this.x, dz = gz - this.z, dist = Math.hypot(dx, dz);
    const mv = { x: 0, z: 0 };
    if (dist > 1.0) { mv.x = dx / dist; mv.z = dz / dist; }
    const sp = dist > 9 ? 7.6 : Math.min(5.6, dist * 2.2);
    for (const e of G.enemies) {
      if (e.dead) continue;
      const sx = this.x - e.x, sz = this.z - e.z, d = Math.hypot(sx, sz);
      if (d < 3 && d > 0.01) { mv.x += sx / d * 0.8; mv.z += sz / d * 0.8; }
    }
    steerAround(this, mv);
    if (this.jitT > 0) { this.jitT -= dt; mv.x += this.jx; mv.z += this.jz; }
    const ml = Math.hypot(mv.x, mv.z); if (ml > 1) { mv.x /= ml; mv.z /= ml; }
    const k = Math.min(1, dt * 7);
    this.vx += (mv.x * sp - this.vx) * k; this.vz += (mv.z * sp - this.vz) * k;
    this.x += this.vx * dt; this.z += this.vz * dt;
    pushApart(this, P, this.r + P.r + 0.9);
    for (const o of G.mates) if (o !== this && !o.downed) pushApart(this, o, this.r * 2 + 0.3);
    World.collide(this, this.r, 0);
    if ((this.stuckCheck -= dt) <= 0) {
      if (dist > 3 && Math.hypot(this.x - this.lx, this.z - this.lz) < 0.6) { this.jitT = 0.8; const a = Math.random() * 6.283; this.jx = Math.cos(a); this.jz = Math.sin(a); }
      this.lx = this.x; this.lz = this.z; this.stuckCheck = 1;
    }
    const spd = Math.hypot(this.vx, this.vz);
    let fyaw;
    if (this.target) fyaw = Math.atan2(this.target.x - this.x, this.target.z - this.z);
    else if (spd > 0.5) fyaw = Math.atan2(this.vx, this.vz);
    else fyaw = P.yaw + Math.PI;
    this.yaw += Math.atan2(Math.sin(fyaw - this.yaw), Math.cos(fyaw - this.yaw)) * Math.min(1, dt * 8);
    if (this.target) {
      if ((this.shootT -= dt) <= 0) {
        this.fire(this.target);
        if (--this.burst > 0) this.shootT = 0.12;
        else { this.burst = 2 + (Math.random() * 4 | 0); this.shootT = rand(0.45, 0.95); }
      }
    }
    this.phase += dt * (1 + spd * 2.4);
    const sw = Math.min(1, spd / 3) * 0.7, s = Math.sin(this.phase);
    this.m.legL.rotation.x = s * sw; this.m.legR.rotation.x = -s * sw;
    this.m.kneeL.rotation.x = Math.max(0, Math.sin(this.phase + 1.5)) * sw * 1.4;
    this.m.kneeR.rotation.x = Math.max(0, Math.sin(this.phase + 1.5 + Math.PI)) * sw * 1.4;
    this.m.body.position.y = Math.abs(Math.cos(this.phase)) * 0.04 * sw;
    this.root.position.set(this.x, 0, this.z); this.root.rotation.y = this.yaw;
  }
  fire(e) {
    const from = new THREE.Vector3(); this.m.muzzle.getWorldPosition(from);
    const ty = e.type === 'boss' ? e.y : e.y + 1.2 * e.d.scale;
    const hit = Math.random() < 0.62;
    let tx = e.x, tz = e.z, yy = ty;
    if (!hit) { tx += rand(-1.5, 1.5); tz += rand(-1.5, 1.5); yy += rand(-0.6, 1.2); }
    const dx = tx - from.x, dy = yy - from.y, dz = tz - from.z, l = Math.hypot(dx, dy, dz) || 1;
    let end = l;
    if (!hit) {
      end = World.rayBlock(from.x, from.y, from.z, dx / l, dy / l, dz / l, l + 30);
      if (end < l + 30) FX.impact(from.x + dx / l * end, from.y + dy / l * end, from.z + dz / l * end);
    }
    FX.tracer(from.x, from.y, from.z, from.x + dx / l * end, from.y + dy / l * end, from.z + dz / l * end, [1, 0.78, 0.42]);
    FX.muzzle(from.x, from.y, from.z, dx / l, dy / l, dz / l, false);
    if (hit) {
      e.hurt(14 * G.player.char.mateDmg * G.player.mods.mate, { dirx: dx / l, dirz: dz / l, mate: this });
      FX.blood(tx, yy, tz, dx / l, dz / l, e.kind);
    }
    const pd = Math.hypot(G.player.x - this.x, G.player.z - this.z);
    SFX.mate(Math.max(0, 1 - pd / 60));
  }
}
