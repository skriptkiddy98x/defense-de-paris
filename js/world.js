'use strict';
// Paris map: Place de la Concorde with four avenues, Haussmann blocks, landmarks, colliders.
const World = (() => {
  const AV = 10, PL = 28, END = 148, VIS = 236, DEPTH = 32;
  const colliders = [], avoid = [], emitters = [], ships = [];
  const STREETS = { P: 'Place de la Concorde', E: 'Champs-Élysées', W: 'Rue de Rivoli', N: 'Quai Branly', S: 'Boulevard Saint-Germain' };
  const ENTRY = { E: { x: 20, z: 0 }, W: { x: -20, z: 0 }, N: { x: 0, z: -20 }, S: { x: 0, z: 20 }, P: { x: 0, z: 0 }, X: { x: 0, z: 0 } };
  const sunDir = new THREE.Vector3(-0.82, 0.2, 0.36).normalize();
  let sky, sun, beam, beamPulse = 0, time = 0;

  function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const rnd = rng(1789);
  const R = (a, b) => a + (b - a) * rnd();
  const lin = h => new THREE.Color(h).convertSRGBToLinear();
  function std(hex, o) {
    o = o || {};
    const m = new THREE.MeshStandardMaterial({ color: lin(hex), roughness: o.r !== undefined ? o.r : 0.9, metalness: o.m || 0, side: o.side || THREE.FrontSide });
    if (o.e !== undefined) { m.emissive = lin(o.e); m.emissiveIntensity = o.ei || 1.5; }
    if (o.map) m.map = o.map;
    return m;
  }
  function addBox(minX, maxX, minZ, maxZ, h) { colliders.push({ minX, maxX, minZ, maxZ, h }); }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function canvasTex(c, renderer, repeat) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; if (repeat) t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  // ---------- textures ----------
  function facadeTexture(variant, renderer) {
    const W = 256, H = 576, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), r = rng(variant * 97 + 11);
    const ec = document.createElement('canvas'); ec.width = W; ec.height = H;
    const eg = ec.getContext('2d'); eg.fillStyle = '#000'; eg.fillRect(0, 0, W, H);
    g.fillStyle = ['#dacdb1', '#d5c7a9', '#ddd2ba', '#d1c3a4'][variant]; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${90 + r() * 60 | 0},${80 + r() * 50 | 0},${60 + r() * 40 | 0},${0.06 * r()})`; g.fillRect(r() * W, r() * H, 2 + r() * 6, 1 + r() * 3); }
    const shopTop = H * 0.8, top = H * 0.04, floors = 5, fh = (shopTop - top) / floors, cols = 3, cw = W / cols;
    g.fillStyle = '#c4b596'; g.fillRect(0, 0, W, top);
    g.fillStyle = 'rgba(60,48,34,.35)'; g.fillRect(0, top, W, 3);
    for (let f = 0; f < floors; f++) {
      const y0 = top + f * fh;
      g.fillStyle = 'rgba(70,56,40,.22)'; g.fillRect(0, y0 + fh - 5, W, 3);
      for (let k = 0; k < cols; k++) {
        const wx = k * cw + cw * 0.27, ww = cw * 0.46, wy = y0 + fh * 0.2, wh = fh * 0.62;
        g.fillStyle = '#b9a986'; g.fillRect(wx - 4, wy - 5, ww + 8, wh + 9);
        const lit = r() < 0.24, grd = g.createLinearGradient(0, wy, 0, wy + wh);
        if (lit) { grd.addColorStop(0, '#ffd98c'); grd.addColorStop(1, '#e8963a'); } else { grd.addColorStop(0, '#3b475a'); grd.addColorStop(1, '#1b222d'); }
        g.fillStyle = grd; g.fillRect(wx, wy, ww, wh);
        if (lit) { eg.fillStyle = r() < 0.5 ? '#ffb45a' : '#e88a3a'; eg.fillRect(wx, wy, ww, wh); }
        g.fillStyle = 'rgba(235,228,210,.85)'; g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); g.fillRect(wx, wy + wh * 0.62, ww, 2.5);
        if (f === 3) { g.fillStyle = '#c9b994'; g.beginPath(); g.moveTo(wx - 6, wy - 6); g.lineTo(wx + ww / 2, wy - 16); g.lineTo(wx + ww + 6, wy - 6); g.fill(); }
      }
      g.fillStyle = '#26262b';
      if (f === 3 || f === 0) { // Haussmann: continuous balconies on 2nd and 5th floor
        const by = y0 + fh * 0.82;
        g.fillRect(0, by - 14, W, 2.5); g.fillRect(0, by, W, 3);
        for (let x = 2; x < W; x += 6) g.fillRect(x, by - 14, 1.6, 14);
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, by + 3, W, 4);
      } else {
        for (let k = 0; k < cols; k++) {
          const wx = k * cw + cw * 0.27, ww = cw * 0.46, by = y0 + fh * 0.82;
          g.fillRect(wx - 3, by - 9, ww + 6, 2); g.fillRect(wx - 3, by, ww + 6, 2);
          for (let x = wx - 2; x < wx + ww + 3; x += 5) g.fillRect(x, by - 9, 1.3, 9);
        }
      }
    }
    g.fillStyle = '#bfb090'; g.fillRect(0, shopTop, W, H - shopTop);
    g.strokeStyle = 'rgba(80,64,44,.2)'; g.lineWidth = 1;
    for (let y = shopTop; y < H; y += 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const awn = ['#7a1f24', '#1f4a3a', '#1d2f5c', '#6a4a1f'][variant];
    for (let k = 0; k < cols; k++) {
      const x = k * cw + 8, w = cw - 16, y = shopTop + H * 0.06, h = H - y - 4;
      const shopLit = r() < 0.5;
      g.fillStyle = shopLit ? '#e7b765' : '#262b33'; g.fillRect(x, y, w, h);
      if (shopLit) { eg.fillStyle = '#d88a3a'; eg.fillRect(x, y, w, h); }
      g.fillStyle = 'rgba(20,18,16,.6)'; g.fillRect(x + w * 0.45, y, 3, h);
      eg.fillStyle = '#000'; eg.fillRect(x + w * 0.45, y, 3, h);
      g.fillStyle = awn; g.fillRect(x - 4, shopTop + 4, w + 8, H * 0.045);
      g.fillStyle = 'rgba(255,255,255,.18)'; for (let s = 0; s < w + 8; s += 12) g.fillRect(x - 4 + s, shopTop + 4, 6, H * 0.045);
    }
    const map = canvasTex(c, renderer, false), emap = canvasTex(ec, renderer, false);
    const nmap = makeNormalMap(c, 2.5); nmap.wrapT = THREE.ClampToEdgeWrapping;
    return { map, emap, nmap };
  }
  function stoneTexture(renderer, rows, l0, l1, seed, base) {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), r = rng(seed), h = S / rows;
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    for (let y = 0; y < rows; y++) {
      let x = (y % 2) * h * 0.6;
      while (x < S + h) {
        const w = h * (0.9 + r() * 0.7);
        g.fillStyle = `hsl(32,7%,${l0 + r() * (l1 - l0)}%)`;
        for (const ox of [-S, 0]) { rr(g, x + ox + 1.2, y * h + 1.2, w - 2.4, h - 2.4, h * 0.22); g.fill(); }
        x += w;
      }
    }
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(15,12,10,${r() * 0.07})`; g.beginPath(); g.arc(r() * S, r() * S, 3 + r() * 14, 0, 7); g.fill(); }
    return canvasTex(c, renderer, true);
  }
  function flagTexture(renderer) {
    const c = document.createElement('canvas'); c.width = 96; c.height = 192; const g = c.getContext('2d');
    ['#1f3a8f', '#efe9dc', '#c8302a'].forEach((col, i) => { g.fillStyle = col; g.fillRect(i * 32, 0, 32, 192); });
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < 192; y += 24) g.fillRect(0, y, 96, 6);
    return canvasTex(c, renderer, false);
  }

  // Box whose side UVs repeat the facade every 9 m
  function facadeBox(w, h, d) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) {
      const ext = f < 2 ? d : f >= 4 ? w : 0;
      if (!ext) continue;
      const rep = Math.max(1, Math.round(ext / 9));
      for (let i = 0; i < 4; i++) uv.setX(f * 4 + i, uv.getX(f * 4 + i) * rep);
    }
    return g;
  }
  // slices of a non-indexed geometry, picked by material group
  function geoParts(g, pick) {
    const P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv.array, out = { p: [], n: [], u: [] };
    for (const gr of g.groups) if (pick(gr.materialIndex)) {
      out.p.push(P.subarray(gr.start * 3, (gr.start + gr.count) * 3));
      out.n.push(N.subarray(gr.start * 3, (gr.start + gr.count) * 3));
      out.u.push(U.subarray(gr.start * 2, (gr.start + gr.count) * 2));
    }
    return out;
  }
  function mergeParts(list) {
    let n = 0; for (const o of list) for (const a of o.p) n += a.length / 3;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let k = 0;
    for (const o of list) for (let i = 0; i < o.p.length; i++) { pos.set(o.p[i], k * 3); nor.set(o.n[i], k * 3); uv.set(o.u[i], k * 2); k += o.p[i].length / 3; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    return g;
  }
  function instanced(geo, mat, list, shadow) {
    const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
    list.forEach((p, i) => { o.position.set(p[0], p[1], p[2]); o.scale.set(p[3] || 1, p[4] || 1, p[5] || 1); o.rotation.set(0, p[6] || 0, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.castShadow = !!shadow; m.receiveShadow = true;
    return m;
  }
  function beamBetween(group, mat, a, b, r0, r1) {
    const v = new THREE.Vector3().subVectors(b, a), len = v.length();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 4), mat);
    mesh.position.copy(a).addScaledVector(v, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    mesh.rotateY(Math.PI / 4);
    group.add(mesh); return mesh;
  }

  // ---------- build ----------
  function build(scene, renderer) {
    const fogCol = new THREE.Color().setRGB(0.86, 0.5, 0.4).convertSRGBToLinear();
    scene.fog = new THREE.Fog(fogCol, 50, 430);

    sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sunDir: { value: sunDir } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP; uniform vec3 sunDir;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
        void main(){
          vec3 d = normalize(vP); float h = d.y;
          vec3 zen = vec3(0.07,0.07,0.18), mid = vec3(0.34,0.19,0.36), hor = vec3(0.92,0.52,0.36);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, h)); c = mix(c, zen, smoothstep(0.18, 0.7, h));
          float s = max(dot(d, sunDir), 0.0);
          c += vec3(1.0,0.5,0.22) * pow(s, 6.0) * 0.55 + vec3(1.0,0.86,0.6) * pow(s, 500.0) * 3.0;
          c += vec3(step(0.9972, hash(floor(d * 380.0))) * smoothstep(0.3, 0.8, h) * 0.8);
          if (h < 0.0) c = mix(hor * 0.9, vec3(0.2,0.13,0.14), smoothstep(0.0, -0.25, h));
          gl_FragColor = linearToOutputTexel(vec4(pow(c, vec3(2.2)), 1.0));
        }`
    }));
    sky.renderOrder = -1; scene.add(sky);
    // image-based lighting from the dusk sky, so metal, glass and wet stone pick up reflections
    const pmrem = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(sky.geometry, sky.material));
    scene.environment = pmrem.fromScene(envScene, 0, 1, 1000).texture;
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight(lin(0x9a9ad8), lin(0x4a3a30), 0.35));
    sun = new THREE.DirectionalLight(lin(0xffb47e), 2.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 420 });
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target);

    // ground
    // damp cobblestones: low roughness + normal map catch the sky and street lamps
    const cob = stoneTexture(renderer, 16, 30, 44, 7, '#2b2725'); cob.repeat.set(400, 400);
    const cobN = makeNormalMap(cob.image, 5); cobN.repeat.set(400, 400);
    const groundMat = std(0xffffff, { map: cob, r: 0.55, m: 0.05 }); groundMat.normalMap = cobN; groundMat.normalScale.set(1.2, 1.2);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const pav = stoneTexture(renderer, 6, 52, 64, 9, '#6c645a'); pav.repeat.set(9, 9);
    const pavN = makeNormalMap(pav.image, 4); pavN.repeat.set(9, 9);
    const plazaMat = std(0xffffff, { map: pav, r: 0.62 }); plazaMat.normalMap = pavN;
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(PL * 2, PL * 2), plazaMat);
    plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.015; plaza.receiveShadow = true; scene.add(plaza);

    // Haussmann blocks, lit windows glow after dark
    const facadeMats = [0, 1, 2, 3].map(v => {
      const t = facadeTexture(v, renderer), m = std(0xffffff, { map: t.map, r: 0.88 });
      m.normalMap = t.nmap; m.emissive = new THREE.Color(1, 1, 1); m.emissiveMap = t.emap; m.emissiveIntensity = 1.6;
      return m;
    });
    const roofTop = std(0x464c56, { r: 0.85 }), slate = std(0x58616e, { r: 0.65, m: 0.15 }), cornice = std(0xcdbf9f), chimneyMat = std(0xa0705a);
    const chim = [], sideParts = [[], [], [], []], topParts = [], slateParts = [], ledgeParts = [];
    // every block is baked into a few merged meshes (one per facade material) to keep draw calls low
    function building(x0, x1, z0, z1, h) {
      const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const g = facadeBox(w, h, d).toNonIndexed(); g.translate(cx, h / 2, cz);
      sideParts[(rnd() * 4) | 0].push(geoParts(g, mi => mi !== 2 && mi !== 3));
      topParts.push(geoParts(g, mi => mi === 2));
      const lg = new THREE.BoxGeometry(w + 0.5, 0.35, d + 0.5).toNonIndexed(); lg.translate(cx, h, cz); ledgeParts.push(geoParts(lg, () => true));
      const mh = 3.6, rg = new THREE.BoxGeometry(w - 0.4, mh, d - 0.4), p = rg.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * Math.max(0.2, (w - 4.4) / (w - 0.4))); p.setZ(i, p.getZ(i) * Math.max(0.2, (d - 4.4) / (d - 0.4))); }
      rg.computeVertexNormals();
      const rgn = rg.toNonIndexed(); rgn.translate(cx, h + mh / 2 + 0.17, cz); slateParts.push(geoParts(rgn, () => true));
      for (let i = 0; i < 3; i++) chim.push([x0 + 2 + rnd() * (w - 4), h + mh + 0.6, z0 + 2 + rnd() * (d - 4), 0.9 + rnd() * 0.6, 1.8 + rnd() * 1.2, 0.7]);
      addBox(x0, x1, z0, z1, h + mh);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (let a = PL; a < VIS;) { // facing the east-west avenue
        const len = Math.min(VIS - a, R(16, 26)), h = R(17, 24);
        building(sx > 0 ? a : -(a + len), sx > 0 ? a + len : -a, sz > 0 ? AV : -(AV + DEPTH), sz > 0 ? AV + DEPTH : -AV, h); a += len;
      }
      for (let a = PL; a < VIS;) { // facing the north-south avenue
        const len = Math.min(VIS - a, R(16, 26)), h = R(17, 24);
        building(sx > 0 ? AV : -(AV + DEPTH), sx > 0 ? AV + DEPTH : -AV, sz > 0 ? a : -(a + len), sz > 0 ? a + len : -a, h); a += len;
      }
    }
    const baked = (parts, mat, shadow) => { const m = new THREE.Mesh(mergeParts(parts), mat); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); };
    sideParts.forEach((parts, i) => baked(parts, facadeMats[i], true));
    baked(topParts, roofTop, false); baked(ledgeParts, cornice, false); baked(slateParts, slate, true);
    scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), chimneyMat, chim, true));

    // sidewalks, trees, lamps along each avenue
    const walkMat = std(0x8f877c, { r: 0.95 });
    const arms = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const trees = [], canopies = [], poles = [], lanterns = [];
    for (const [ax, az] of arms) {
      for (const s of [-1, 1]) {
        const len = VIS - PL, mid = PL + len / 2;
        const walk = new THREE.Mesh(new THREE.BoxGeometry(ax ? len : 3, 0.14, ax ? 3 : len), walkMat);
        walk.position.set(ax ? ax * mid : s * 8.5, 0.07, ax ? s * 8.5 : az * mid); walk.receiveShadow = true; scene.add(walk);
        for (let t = PL + 6; t < VIS; t += 14) {
          const tx = ax ? ax * t : s * 7.9, tz = ax ? s * 7.9 : az * t;
          const lx = ax ? ax * (t + 7) : s * 7.9, lz = ax ? s * 7.9 : az * (t + 7);
          trees.push([tx, 2.1, tz]); canopies.push([tx, 5.4 + rnd(), tz, 1 + rnd() * 0.3, 0.8, 1 + rnd() * 0.3, rnd() * 6]);
          poles.push([lx, 2.1, lz]); lanterns.push([lx, 4.4, lz]);
          if (t < END) { addBox(tx - 0.3, tx + 0.3, tz - 0.3, tz + 0.3, 4); addBox(lx - 0.15, lx + 0.15, lz - 0.15, lz + 0.15, 4.2); }
        }
      }
    }
    scene.add(instanced(new THREE.CylinderGeometry(0.2, 0.28, 4.2, 7), std(0x6d6050), trees, true));
    const can = instanced(new THREE.IcosahedronGeometry(2.6, 1), std(0xffffff, { r: 0.95 }), canopies, true);
    const cc = new THREE.Color();
    canopies.forEach((_, i) => { cc.setHSL(0.24 + rnd() * 0.05, 0.38, 0.22 + rnd() * 0.08).convertSRGBToLinear(); can.setColorAt(i, cc); });
    scene.add(can);
    scene.add(instanced(new THREE.CylinderGeometry(0.07, 0.11, 4.2, 6), std(0x1d2420, { r: 0.5, m: 0.6 }), poles, false));
    scene.add(instanced(new THREE.BoxGeometry(0.42, 0.62, 0.42), std(0xffd18a, { e: 0xffc06a, ei: 5 }), lanterns, false));

    // tricolour banners on the plaza facades
    const flagMat = std(0xffffff, { map: flagTexture(renderer), side: THREE.DoubleSide, r: 0.8 });
    const flagGeo = new THREE.PlaneGeometry(1.8, 4.2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const a = new THREE.Mesh(flagGeo, flagMat); a.position.set(sx * (PL - 0.06), 12, sz * 19); a.rotation.y = -sx * Math.PI / 2; scene.add(a);
      const b = new THREE.Mesh(flagGeo, flagMat); b.position.set(sx * 19, 12, sz * (PL - 0.06)); b.rotation.y = sz > 0 ? Math.PI : 0; scene.add(b);
    }

    // obelisk of Luxor
    const granite = std(0xc49a78, { r: 0.7 }), stone = std(0xb9ae96), gold = std(0xe0b54a, { r: 0.3, m: 0.7 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(5, 2.4, 5), stone); base.position.y = 1.2; base.castShadow = base.receiveShadow = true; scene.add(base);
    const step = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.5, 6.4), stone); step.position.y = 0.25; step.receiveShadow = true; scene.add(step);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.25, 16, 4), granite); shaft.rotation.y = Math.PI / 4; shaft.position.y = 10.4; shaft.castShadow = true; scene.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.6, 4), gold); tip.rotation.y = Math.PI / 4; tip.position.y = 19.2; scene.add(tip);
    addBox(-3.2, 3.2, -3.2, 3.2, 20); avoid.push({ x: 0, z: 0, r: 4.2 });

    // fountains in the plaza corners
    const basinMat = std(0xa79c86), waterMat = std(0x3d6a86, { r: 0.15, m: 0.3, e: 0x0f2a3a, ei: 1 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const fx = sx * 17, fz = sz * 17;
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.8, 0.9, 28), basinMat); basin.position.set(fx, 0.45, fz); basin.receiveShadow = basin.castShadow = true; scene.add(basin);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 0.1, 28), waterMat); water.position.set(fx, 0.82, fz); scene.add(water);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 2.6, 10), basinMat); col.position.set(fx, 2, fz); col.castShadow = true; scene.add(col);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.6, 0.45, 18), basinMat); bowl.position.set(fx, 3.2, fz); bowl.castShadow = true; scene.add(bowl);
      addBox(fx - 3.7, fx + 3.7, fz - 3.7, fz + 3.7, 1); avoid.push({ x: fx, z: fz, r: 4.4 });
      emitters.push({ type: 'water', x: fx, y: 3.5, z: fz });
    }

    // sandbag barricades at the plaza entrances (low: you can shoot and jump over them)
    const bags = [];
    function bagRun(x0, z0, x1, z1) {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.85), ry = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
      for (let layer = 0; layer < 2; layer++) for (let i = 0; i <= n - layer; i++) {
        const k = (i + layer * 0.5) / n;
        bags.push([x0 + (x1 - x0) * k, 0.18 + layer * 0.34, z0 + (z1 - z0) * k, 1, 1, 1, ry + (rnd() - 0.5) * 0.2]);
      }
      addBox(Math.min(x0, x1) - 0.35, Math.max(x0, x1) + 0.35, Math.min(z0, z1) - 0.35, Math.max(z0, z1) + 0.35, 0.85);
    }
    bagRun(33, -9, 33, -3); bagRun(36, 3, 36, 9);
    bagRun(-33, 3, -33, 9); bagRun(-36, -9, -36, -3);
    bagRun(-9, -33, -3, -33); bagRun(3, -36, 9, -36);
    bagRun(3, 33, 9, 33); bagRun(-9, 36, -3, 36);
    const bagGeo = new THREE.BoxGeometry(0.9, 0.36, 0.55); bagGeo.translate(0, 0, 0);
    scene.add(instanced(bagGeo, std(0x9a8a62, { r: 1 }), bags, true));

    // abandoned cars, two of them burning
    const carCols = [0x7a1e1e, 0xe8e2d0, 0x1f3550, 0x3c4a3a, 0x8a7a5a, 0x2d2d33, 0x9a6a2a];
    const glass = std(0x1b2330, { r: 0.2, m: 0.5 }), tyre = std(0x161616), charred = std(0x2a2420, { r: 1 });
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12); wheelGeo.rotateX(Math.PI / 2);
    const carList = [[48, -4, 0], [70, 3, 0], [104, -1, 1], [128, 4, 0], [-46, 4, 0], [-80, -3, 0], [-112, 2, 1], [-3.5, 52, 1], [4, 84, 1], [0, 118, 0], [3, -50, 1], [-4, -88, 1], [2, -124, 0]];
    carList.forEach(([x, z, rot], i) => {
      const burnt = i === 2 || i === 9, g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.85, 1.9), burnt ? charred : std(carCols[i % carCols.length], { r: 0.45, m: 0.4 }));
      body.position.y = 0.78; body.castShadow = body.receiveShadow = true; g.add(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.72, 1.72), burnt ? charred : glass); cab.position.set(-0.2, 1.55, 0); cab.castShadow = true; g.add(cab);
      for (const [wx, wz] of [[1.3, 0.85], [-1.3, 0.85], [1.3, -0.85], [-1.3, -0.85]]) { const w = new THREE.Mesh(wheelGeo, tyre); w.position.set(wx, 0.38, wz); g.add(w); }
      g.position.set(x, 0, z); g.rotation.y = rot * Math.PI / 2 + (rnd() - 0.5) * 0.2; scene.add(g);
      const hx = rot ? 1.05 : 2.2, hz = rot ? 2.2 : 1.05;
      addBox(x - hx, x + hx, z - hz, z + hz, 1.9);
      if (burnt) emitters.push({ type: 'fire', x, y: 1.4, z });
    });

    landmarks(scene);
    motherships(scene);
  }

  function landmarks(scene) {
    // Eiffel tower at the end of Quai Branly
    const iron = std(0x6b4a33, { r: 0.75, m: 0.25 }), V = (x, y, z) => new THREE.Vector3(x, y, z);
    const tower = new THREE.Group();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      beamBetween(tower, iron, V(sx * 26, 0, sz * 26), V(sx * 11, 38, sz * 11), 3.4, 2.4);
      beamBetween(tower, iron, V(sx * 11, 40, sz * 11), V(sx * 5, 80, sz * 5), 2.0, 1.3);
      beamBetween(tower, iron, V(sx * 5, 82, sz * 5), V(sx * 1.1, 140, sz * 1.1), 1.1, 0.45);
    }
    const plat = (w, h, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), iron); m.position.y = y; tower.add(m); };
    plat(31, 3, 38.5); plat(14, 2, 81); plat(4.4, 3, 141);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 18, 6), iron); spire.position.y = 151; tower.add(spire);
    const arch = new THREE.TorusGeometry(17, 0.9, 6, 22, Math.PI);
    for (let i = 0; i < 4; i++) { const a = new THREE.Mesh(arch, iron); a.position.y = 17; a.rotation.y = i * Math.PI / 2; a.translateZ(24.5); tower.add(a); }
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd27a).multiplyScalar(4) })); beacon.position.y = 160; tower.add(beacon);
    tower.position.set(0, 0, -300); scene.add(tower);

    // Arc de Triomphe at the top of the Champs-Élysées
    const arcStone = std(0xcfc3a6);
    const arc = new THREE.Group();
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(13, 21, 9), arcStone); p.position.set(0, 10.5, s * 9); arc.add(p); }
    const topA = new THREE.Mesh(new THREE.BoxGeometry(13, 10, 27), arcStone); topA.position.y = 26; arc.add(topA);
    const attic = new THREE.Mesh(new THREE.BoxGeometry(13.8, 3.2, 27.8), arcStone); attic.position.y = 32.6; arc.add(attic);
    arc.position.set(300, 0, 0); scene.add(arc);

    // Sacré-Cœur on its hill at the south end
    const white = std(0xe9e4da), hillMat = std(0x4a5a40);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 12), hillMat); hill.scale.y = 0.38; hill.position.set(0, 0, 330); scene.add(hill);
    const bas = new THREE.Group();
    const nave = new THREE.Mesh(new THREE.BoxGeometry(26, 18, 36), white); nave.position.y = 9; bas.add(nave);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(8.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), white); dome.scale.y = 1.5; dome.position.y = 24; bas.add(dome);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 6, 20), white); drum.position.y = 21; bas.add(drum);
    for (const [x, z] of [[-10, -12], [10, -12], [-10, 12], [10, 12]]) { const d = new THREE.Mesh(new THREE.SphereGeometry(3.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), white); d.scale.y = 1.4; d.position.set(x, 18, z); bas.add(d); }
    bas.position.set(0, 24, 320); scene.add(bas);

    // Notre-Dame towers at the end of Rue de Rivoli
    const nd = new THREE.Group(), ndMat = std(0xa8a090);
    for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(10, 40, 10), ndMat); t.position.set(0, 20, s * 9); nd.add(t); }
    const ndBody = new THREE.Mesh(new THREE.BoxGeometry(60, 26, 22), ndMat); ndBody.position.set(-32, 13, 0); nd.add(ndBody);
    const spireN = new THREE.Mesh(new THREE.ConeGeometry(2.4, 26, 6), std(0x4e5560)); spireN.position.set(-30, 39, 0); nd.add(spireN);
    nd.position.set(-300, 0, 0); scene.add(nd);
  }

  function motherships(scene) {
    const hull = std(0x3b3548, { r: 0.4, m: 0.75 }), glowA = new THREE.MeshBasicMaterial({ color: 0x6ff7ff }), glowB = new THREE.MeshBasicMaterial({ color: 0xff5ad8 });
    glowA.color.multiplyScalar(3); glowB.color.multiplyScalar(3);
    function ship(scale) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(46, 30, 7, 48), hull));
      const dome = new THREE.Mesh(new THREE.SphereGeometry(18, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), hull); dome.position.y = 3.5; g.add(dome);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(34, 1.1, 8, 64), glowB); ring.rotation.x = Math.PI / 2; ring.position.y = -3.6; g.add(ring);
      const core = new THREE.Mesh(new THREE.SphereGeometry(8, 24, 12), glowA); core.position.y = -4; g.add(core);
      for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, l = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 2.2), i % 2 ? glowA : glowB); l.position.set(Math.cos(a) * 44, -1, Math.sin(a) * 44); g.add(l); }
      g.scale.setScalar(scale); return g;
    }
    const main = ship(1); main.position.set(-10, 85, -110); main.userData.spin = 0.03; scene.add(main); ships.push(main);
    beam = new THREE.Mesh(new THREE.CylinderGeometry(6, 16, 84, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x6ff7ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.set(-10, 42, -110); scene.add(beam);
    const s2 = ship(0.55); s2.position.set(30, 150, -330); s2.userData.spin = -0.05; scene.add(s2); ships.push(s2);
    const s3 = ship(0.45); s3.position.set(280, 120, 140); s3.userData.spin = 0.06; scene.add(s3); ships.push(s3);
  }

  // ---------- queries ----------
  function collide(p, r, y) {
    y = y || 0;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (y > c.h - 0.05) continue;
      if (p.x + r <= c.minX || p.x - r >= c.maxX || p.z + r <= c.minZ || p.z - r >= c.maxZ) continue;
      const cx = Math.max(c.minX, Math.min(p.x, c.maxX)), cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 > 1e-8) {
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2); p.x = cx + dx / d * r; p.z = cz + dz / d * r;
      } else {
        const pl = p.x - c.minX, pr = c.maxX - p.x, pb = p.z - c.minZ, pf = c.maxZ - p.z, m = Math.min(pl, pr, pb, pf);
        if (m === pl) p.x = c.minX - r; else if (m === pr) p.x = c.maxX + r; else if (m === pb) p.z = c.minZ - r; else p.z = c.maxZ + r;
      }
    }
    p.x = Math.max(-END, Math.min(END, p.x)); p.z = Math.max(-END, Math.min(END, p.z));
  }
  // distance along a ray to the first wall/obstacle or the ground
  function rayBlock(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT;
    if (dy < -1e-6) { const t = -oy / dy; if (t > 0 && t < best) best = t; }
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      let tmin = 0, tmax = best, t1, t2;
      if (Math.abs(dx) < 1e-9) { if (ox < c.minX || ox > c.maxX) continue; } else { t1 = (c.minX - ox) / dx; t2 = (c.maxX - ox) / dx; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) continue; }
      if (Math.abs(dy) < 1e-9) { if (oy < 0 || oy > c.h) continue; } else { t1 = (0 - oy) / dy; t2 = (c.h - oy) / dy; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) continue; }
      if (Math.abs(dz) < 1e-9) { if (oz < c.minZ || oz > c.maxZ) continue; } else { t1 = (c.minZ - oz) / dz; t2 = (c.maxZ - oz) / dz; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) continue; }
      if (tmin < best) best = tmin;
    }
    return best;
  }
  // 2D line of sight for AI, ignoring low cover
  function segmentClear(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.h < 1.5) continue;
      let tmin = 0, tmax = 1, t1, t2;
      if (Math.abs(dx) < 1e-9) { if (ax < c.minX || ax > c.maxX) continue; } else { t1 = (c.minX - ax) / dx; t2 = (c.maxX - ax) / dx; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) continue; }
      if (Math.abs(dz) < 1e-9) { if (az < c.minZ || az > c.maxZ) continue; } else { t1 = (c.minZ - az) / dz; t2 = (c.maxZ - az) / dz; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) continue; }
      return false;
    }
    return true;
  }
  function pointBlocked(x, y, z) {
    for (let i = 0; i < colliders.length; i++) { const c = colliders[i]; if (y < c.h && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true; }
    return false;
  }
  function region(x, z) {
    const ax = Math.abs(x), az = Math.abs(z);
    if (ax < PL && az < PL) return 'P';
    if (az < AV) return x > 0 ? 'E' : 'W';
    if (ax < AV) return z > 0 ? 'S' : 'N';
    return 'X';
  }
  function armPoint(arm, t, s) {
    if (arm === 'E') return [t, s];
    if (arm === 'W') return [-t, s];
    if (arm === 'S') return [s, t];
    return [s, -t];
  }
  function pulse() { beamPulse = 0.35; }
  // low quality drops the sun's shadow map entirely (the biggest per-frame cost on weak GPUs)
  function setShadows(on) { if (sun && sun.castShadow !== on) sun.castShadow = on; }
  function update(dt, cam, focus) {
    time += dt;
    sky.position.copy(cam);
    for (const s of ships) s.rotation.y += dt * s.userData.spin;
    sun.position.set(focus.x + sunDir.x * 150, sunDir.y * 150, focus.z + sunDir.z * 150);
    sun.target.position.set(focus.x, 0, focus.z);
    beamPulse = Math.max(0, beamPulse - dt * 0.4);
    beam.material.opacity = 0.05 + 0.03 * Math.sin(time * 2.1) + beamPulse;
  }

  return { AV, PL, END, STREETS, ENTRY, colliders, avoid, emitters, build, collide, rayBlock, segmentClear, pointBlocked, region, armPoint, pulse, setShadows, update };
})();
