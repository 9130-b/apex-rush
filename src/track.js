/* ============================================================================
 * track.js — 赛道生成（预设驱动，支持多张地图）
 *   · 极坐标谐波生成闭合中心线（保证不自交），起点区域拉直成大直道
 *   · 弧长重采样 + 切线/法线标架 + 带符号曲率 + 弯道倾斜
 *   · 生成路面 / 路肩 / 缓冲区 / 护栏 / 地形 / 场景道具
 *   · 地图预设可配置：赛道形状、起伏、路宽、地表材质、天空、雾、道具主题
 * ==========================================================================*/
(function () {
  'use strict';
  var A = window.APEX, TAU = Math.PI * 2;
  var UP = new THREE.Vector3(0, 1, 0);

  /* ==========================================================================
   * 地图预设
   * ========================================================================*/
  A.MAP_PRESETS = [
    {
      id: 'green', name: '绿野环道', desc: '丘陵森林 · 高速流畅',
      hdri: 'assets/hdri/sky_2k.hdr', hdriKey: 'sky',
      ground: 'grass', groundTint: '#6f8f52', groundBlend: 0.30, groundTile: 20,
      roadTint: '#6b6d68', roadBlend: 0.60, roadTile: 9,
      fog: [0xbfd2dc, 0.00082], exposure: 0.94,
      sun: { color: 0xfff2dd, intensity: 1.6, pos: [-90, 150, 60] },
      hemi: { sky: 0xcfe4f2, ground: 0x53603f, intensity: 0.55 },
      shape: { r0: 252, harms: [[2, 54, 0.62], [3, 41, 2.12], [4, 19, -0.80]], straight: 130 },
      elev: [[2, 10, 1.0], [3, 5.5, -0.5], [5, 2, 2.2]],
      widths: { road: 8.5, kerb: 1.3, verge: 14, inset: 1.5 },
      terrain: {
        drop: 2.6, size: 3000, seg: 300, coast: null,
        far: { from: 680, to: 1560, base: 90, amps: [[3, 78, 0.7], [5, 46, -1.3], [2, 26, 2.2]] }
      },
      props: {
        tree: { kind: 'forest', density: 1.0, near: 32 }, bush: 1.0, rock: 0.35,
        stands: 2, pit: true, lights: 'race', ads: true, city: false, water: null,
        marshals: true, boards: true
      }
    },
    {
      id: 'desert', name: '沙漠峡谷', desc: '巨石荒原 · 大起伏长弯',
      hdri: 'assets/hdri/desert_2k.hdr', hdriKey: 'desert',
      ground: 'sand', groundTint: '#c2a878', groundBlend: 0.35, groundTile: 26,
      roadTint: '#7a7264', roadBlend: 0.62, roadTile: 10,
      fog: [0xdcc9a6, 0.00095], exposure: 0.90,
      sun: { color: 0xffe9c4, intensity: 1.5, pos: [-70, 165, 90] },
      hemi: { sky: 0xf2e0c0, ground: 0x8a7a5a, intensity: 0.44 },
      shape: { r0: 300, harms: [[3, 72, 0.4], [5, 44, 2.0], [2, 26, -1.1]], straight: 150 },
      elev: [[3, 22, 0.3], [5, 11, 1.4], [2, 7, -0.8]],
      widths: { road: 9.0, kerb: 1.2, verge: 18, inset: 1.5 },
      terrain: {
        drop: 3.2, size: 3400, seg: 300, coast: null,
        far: { from: 700, to: 1700, base: 60, amps: [[3, 96, 0.2], [5, 58, -1.0], [7, 30, 2.6]] }
      },
      props: {
        tree: { kind: 'desert', density: 0.34, near: 42 }, bush: 0.35, rock: 1.7,
        stands: 1, pit: true, lights: 'race', ads: true, city: false, water: null,
        marshals: true, boards: true
      }
    },
    {
      id: 'coast', name: '黄昏海岸', desc: '海边长直道 · 落日低角度',
      hdri: 'assets/hdri/sunset_2k.hdr', hdriKey: 'sunset',
      ground: 'beach', groundTint: '#d8c9a4', groundBlend: 0.34, groundTile: 24,
      roadTint: '#6e6a62', roadBlend: 0.58, roadTile: 9,
      fog: [0xe8b98a, 0.00110], exposure: 0.88,
      sun: { color: 0xffd2a0, intensity: 1.15, pos: [-150, 62, 130] },
      hemi: { sky: 0xffd9b0, ground: 0x6a5f4a, intensity: 0.42 },
      shape: { r0: 285, harms: [[2, 62, 0.2], [3, 34, 2.4], [4, 22, -0.6]], straight: 175 },
      elev: [[2, 6, 1.6], [3, 3.4, -0.9]],
      widths: { road: 9.0, kerb: 1.2, verge: 13, inset: 1.5 },
      terrain: {
        drop: 2.4, size: 3200, seg: 300,
        coast: { angle: 2.35, span: 1.05, depth: 46, r0: 430, r1: 900, level: -13 },
        far: { from: 700, to: 1600, base: 22, amps: [[3, 28, 0.9], [2, 18, 2.1]] }
      },
      props: {
        tree: { kind: 'palm', density: 0.62, near: 30 }, bush: 0.5, rock: 0.7,
        stands: 1, pit: true, lights: 'race', ads: true, city: false,
        water: { level: -13 }, marshals: true, boards: true
      }
    },
    {
      id: 'snow', name: '雪原赛道', desc: '雪原针叶林 · 湿滑低抓地',
      hdri: 'assets/hdri/winter_2k.hdr', hdriKey: 'winter',
      ground: 'snow', groundTint: '#eef4fa', groundBlend: 0.45, groundTile: 22,
      roadTint: '#767c84', roadBlend: 0.55, roadTile: 9,
      fog: [0xdfe9f2, 0.00160], exposure: 1.00,
      sun: { color: 0xfff4e2, intensity: 1.35, pos: [-80, 95, 45] },
      hemi: { sky: 0xe8f2ff, ground: 0xa8b4c0, intensity: 0.75 },
      shape: { r0: 262, harms: [[2, 48, 1.1], [3, 38, 2.8], [4, 17, 0.3]], straight: 140 },
      elev: [[2, 13, 0.4], [3, 7, 2.0], [5, 3, -1.2]],
      widths: { road: 8.5, kerb: 1.3, verge: 16, inset: 1.5 },
      terrain: {
        drop: 2.8, size: 3200, seg: 300, coast: null,
        far: { from: 680, to: 1600, base: 85, amps: [[3, 84, 1.1], [5, 44, -0.6], [2, 30, 2.4]] }
      },
      props: {
        tree: { kind: 'snow', density: 1.15, near: 30 }, bush: 0.18, rock: 0.5,
        stands: 1, pit: true, lights: 'race', ads: true, city: false, water: null,
        marshals: true, boards: true
      }
    },
    {
      id: 'night', name: '夜色都市', desc: '街道夜赛 · 窄路贴墙',
      hdri: 'assets/hdri/night_2k.hdr', hdriKey: 'night', night: true,
      ground: 'concrete', groundTint: '#3a3d42', groundBlend: 0.45, groundTile: 14,
      roadTint: '#4a4c50', roadBlend: 0.50, roadTile: 8,
      fog: [0x141c2a, 0.00220], exposure: 1.18,
      sun: { color: 0x9fb4d8, intensity: 0.28, pos: [-60, 120, 80] },
      hemi: { sky: 0x2a3550, ground: 0x14171c, intensity: 0.5 },
      shape: { r0: 238, harms: [[2, 44, 0.9], [3, 34, 2.6], [4, 24, 0.2], [6, 12, 1.7]], straight: 110 },
      elev: [[2, 2.2, 0.7], [3, 1.2, -1.1]],
      widths: { road: 8.0, kerb: 1.0, verge: 5.5, inset: 0.6 },
      terrain: {
        drop: 1.2, size: 2400, seg: 220, coast: null,
        far: { from: 700, to: 1500, base: 12, amps: [[3, 14, 1.3], [2, 9, 0.4]] }
      },
      props: {
        tree: { kind: 'none', density: 0, near: 30 }, bush: 0, rock: 0,
        stands: 1, pit: true, lights: 'street', ads: true, city: true, water: null,
        marshals: false, boards: false
      }
    }
  ];

  A.MAP_BY_ID = {};
  for (var _i = 0; _i < A.MAP_PRESETS.length; _i++) A.MAP_BY_ID[A.MAP_PRESETS[_i].id] = A.MAP_PRESETS[_i];

  /* ==========================================================================
   * 小工具
   * ========================================================================*/
  function smoothArray(arr, win) {
    var n = arr.length, out = new Float32Array(n), half = win >> 1;
    for (var i = 0; i < n; i++) {
      var s = 0;
      for (var k = -half; k <= half; k++) {
        var j = ((i + k) % n + n) % n;
        s += arr[j];
      }
      out[i] = s / (half * 2 + 1);
    }
    return out;
  }

  /* 关键点 → 平滑曲线（用于生成车身/地形轮廓） */
  function sampleKeys(keys, u) {
    if (u <= keys[0][0]) return keys[0][1];
    for (var i = 0; i < keys.length - 1; i++) {
      var a = keys[i], b = keys[i + 1];
      if (u <= b[0]) {
        var t = (u - a[0]) / Math.max(b[0] - a[0], 1e-6);
        t = t * t * (3 - 2 * t);
        return a[1] + (b[1] - a[1]) * t;
      }
    }
    return keys[keys.length - 1][1];
  }
  A.sampleKeys = sampleKeys;

  /* ==========================================================================
   * Track
   * ========================================================================*/
  function Track(preset, assets) {
    this.p = preset;
    this.assets = assets;
    var w = preset.widths;
    this.roadHalf = w.road;
    this.kerbW = w.kerb;
    this.vergeW = w.verge;
    this.wallAt = w.road + w.kerb + w.verge - w.inset;
    this.terrainDrop = preset.terrain.drop;
    this.N = preset.samples || 1400;
    this.night = !!preset.night;

    /* 起伏谐波 */
    this.elevKeys = preset.elev;

    this.group = new THREE.Group();
    this.group.name = 'track-' + preset.id;

    this._buildGroundTextures();
    this._buildCenterline();
    this._buildFrames();
    this._buildSpeedProfile();
    this._buildRoad();
    this._buildBarriers();
    this._buildTerrain();
    this._buildProps();
    this._buildStartArea();
    if (preset.props.water) this._buildWater();
    this._smoothSurf = null;
  }

  /* ------------------------------------------------------- 地表贴图 --- */
  Track.prototype._buildGroundTextures = function () {
    var p = this.p, a = this.assets;
    var rawGround = (a.groundTex && (a.groundTex[p.ground] || a.groundTex.grass)) || A.makeGrass();
    this.groundMap = A.reduceContrast(rawGround, p.groundTint, p.groundBlend);
    var rawRoad = a.roadTex || A.makeAsphalt();
    this.roadMap = A.reduceContrast(rawRoad, p.roadTint, p.roadBlend);
  };

  /* ------------------------------------------------------- 高度函数 --- */
  Track.prototype._radiusAt = function (th) {
    var h = this.p.shape.harms, r = this.p.shape.r0;
    for (var i = 0; i < h.length; i++) r += h[i][1] * Math.sin(h[i][0] * th + h[i][2]);
    return r;
  };
  Track.prototype._elevAt = function (th) {
    var e = this.elevKeys, v = 0;
    for (var i = 0; i < e.length; i++) v += e[i][1] * Math.sin(e[i][0] * th + e[i][2]);
    return v;
  };
  Track.prototype._terrainH = function (x, z) {
    var t = this.p.terrain;
    var r = Math.sqrt(x * x + z * z);
    var th = Math.atan2(z, x);
    var h = this._elevAt(th) * A.smoothstep(0, 130, r);
    /* 海岸：某个方位角方向让地面沉到海平面以下 */
    var c = t.coast;
    if (c) {
      var da = Math.abs(A.wrapPi(th - c.angle));
      var dip = A.smoothstep(c.span, c.span * 0.42, da);
      h -= dip * A.smoothstep(c.r0, c.r1, r) * c.depth;
    }
    /* 远景群山 */
    var far = A.smoothstep(t.far.from, t.far.to, r);
    if (far > 0) {
      var fv = t.far.base, amps = t.far.amps;
      for (var i = 0; i < amps.length; i++) fv += amps[i][1] * Math.sin(amps[i][0] * th + amps[i][2]);
      h += far * fv;
    }
    return h - t.drop;
  };

  /* ------------------------------------------------------------ 中心线 --- */
  Track.prototype._buildCenterline = function () {
    var N = this.N, sh = this.p.shape;
    var M = 900, i, th, r, pts = [];
    for (i = 0; i < M; i++) {
      th = i / M * TAU;
      r = this._radiusAt(th);
      pts.push(new THREE.Vector3(r * Math.cos(th), this._elevAt(th), r * Math.sin(th)));
    }

    /* 找曲率最小处作为起点 */
    var bestI = 0, bestK = Infinity;
    for (i = 0; i < M; i++) {
      var a = pts[(i - 3 + M) % M], b = pts[i], c = pts[(i + 3) % M];
      var v1 = new THREE.Vector2(b.x - a.x, b.z - a.z).normalize();
      var v2 = new THREE.Vector2(c.x - b.x, c.z - b.z).normalize();
      var k = Math.abs(v1.cross(v2));
      if (k < bestK) { bestK = k; bestI = i; }
    }
    this.startTheta = bestI / M * TAU;

    /* 起点区域拉直成大直道 */
    var P0 = pts[bestI].clone();
    var T0 = new THREE.Vector3(pts[(bestI + 1) % M].x - pts[(bestI - 1 + M) % M].x, 0,
      pts[(bestI + 1) % M].z - pts[(bestI - 1 + M) % M].z).normalize();
    var cum = [0], total = 0;
    for (i = 1; i <= M; i++) {
      total += pts[i % M].distanceTo(pts[i - 1]);
      cum.push(total);
    }
    var L = sh.straight, s0 = cum[bestI];
    var straight = [];
    var proj = new THREE.Vector3();
    for (i = 0; i < M; i++) {
      var d = cum[i] - s0;
      if (d > total / 2) d -= total;
      if (d < -total / 2) d += total;
      var w = 1 - A.smoothstep(0, L, Math.abs(d));
      var p = pts[i];
      proj.copy(T0).multiplyScalar((p.x - P0.x) * T0.x + (p.z - P0.z) * T0.z).add(P0);
      straight.push(new THREE.Vector3(
        A.lerp(p.x, proj.x, w), p.y, A.lerp(p.z, proj.z, w)
      ));
    }

    var curve = new THREE.CatmullRomCurve3(straight, true, 'centripetal', 0.5);
    var spaced = curve.getSpacedPoints(N);
    this.P = [];
    for (i = 0; i < N; i++) this.P.push(spaced[i].clone());

    this.S = new Float32Array(N);
    var acc = 0;
    for (i = 0; i < N; i++) {
      this.S[i] = acc;
      acc += this.P[i].distanceTo(this.P[(i + 1) % N]);
    }
    this.length = acc;
    this.ds = acc / N;

    /* 旋转数组，让起点线位于索引 0 */
    var minD = Infinity, si = 0;
    for (i = 0; i < N; i++) {
      var dx = this.P[i].x - P0.x, dz = this.P[i].z - P0.z;
      var dd = dx * dx + dz * dz;
      if (dd < minD) { minD = dd; si = i; }
    }
    this.startIndex = si;
    this.P = this.P.slice(si).concat(this.P.slice(0, si));
    var S2 = new Float32Array(N);
    for (i = 0; i < N; i++) S2[i] = this.S[(i + si) % N];
    var off = S2[0];
    for (i = 0; i < N; i++) S2[i] = (S2[i] - off + this.length) % this.length;
    this.S = S2;
  };

  /* -------------------------------------------------------------- 坐标系 --- */
  Track.prototype._buildFrames = function () {
    var i, N = this.N;
    this.T = []; this.R = []; this.U = [];
    var t, r, u;

    for (i = 0; i < N; i++) {
      t = new THREE.Vector3().subVectors(this.P[(i + 1) % N], this.P[(i - 1 + N) % N]).normalize();
      this.T.push(t);
      r = new THREE.Vector3().crossVectors(t, UP).normalize();
      this.R.push(r);
      this.U.push(new THREE.Vector3().crossVectors(r, t).normalize());
    }

    var K = new Float32Array(N);
    for (i = 0; i < N; i++) {
      var a = this.T[(i - 1 + N) % N], b = this.T[(i + 1) % N];
      var dt = new THREE.Vector3().subVectors(b, a);
      K[i] = dt.dot(this.R[i]) / (2 * this.ds);
    }
    this.K = smoothArray(K, 21);

    /* 弯道倾斜 */
    this.bank = new Float32Array(N);
    var maxBank = 0.115;
    for (i = 0; i < N; i++) {
      var m = A.clamp(Math.abs(this.K[i]) * 165, 0, 1);
      this.bank[i] = A.sign(this.K[i]) * m * maxBank;
    }
    this.bank = smoothArray(this.bank, 31);

    for (i = 0; i < N; i++) {
      var tn = Math.tan(this.bank[i]);
      var u0 = this.U[i], r0 = this.R[i];
      u = new THREE.Vector3().copy(u0).addScaledVector(r0, tn).normalize();
      r = new THREE.Vector3().copy(r0).addScaledVector(u0, -tn).normalize();
      this.U[i] = u; this.R[i] = r;
    }

    this.lineOffset = new Float32Array(N);
    for (i = 0; i < N; i++) {
      var inside = A.sign(this.K[i]);
      this.lineOffset[i] = inside * (this.roadHalf - 3.0);
    }
    this.lineOffset = smoothArray(this.lineOffset, 121);
  };

  /* ----------------------------------------------------- 速度剖面（AI） --- */
  Track.prototype._buildSpeedProfile = function () {
    var N = this.N, i, k;
    var vMax = 92, aLat = 21, aBrake = 17.0;
    var v = new Float32Array(N);
    for (i = 0; i < N; i++) {
      var kk = Math.max(Math.abs(this.K[i]), 1e-5);
      v[i] = Math.min(vMax, Math.sqrt(aLat / kk));
    }
    for (var pass = 0; pass < 3; pass++) {
      for (k = 0; k < N; k++) {
        i = (N - 1 - k + N) % N;
        var nxt = (i + 1) % N;
        var lim = Math.sqrt(v[nxt] * v[nxt] + 2 * aBrake * this.ds);
        if (v[i] > lim) v[i] = lim;
      }
    }
    var aAcc = 7.0;
    for (var pass2 = 0; pass2 < 2; pass2++) {
      for (i = 0; i < N; i++) {
        var pv = (i - 1 + N) % N;
        var lim2 = Math.sqrt(v[pv] * v[pv] + 2 * aAcc * this.ds);
        if (v[i] > lim2) v[i] = lim2;
      }
    }
    this.vProfile = smoothArray(v, 9);
  };

  /* ---------------------------------------------------------------- 路面 --- */
  Track.prototype._buildRoad = function () {
    var N = this.N, i, j, RH = this.roadHalf, KW = this.kerbW, VW = this.vergeW;
    var TILE = this.p.roadTile;

    /* --- 主路面 --- */
    var pos = [], uv = [], nor = [], idx = [];
    var LAT = [-1, -0.5, 0, 0.5, 1];
    var cols = LAT.length;
    for (i = 0; i < N; i++) {
      var p = this.P[i], r = this.R[i], u = this.U[i];
      var arc = this.S[i];
      for (j = 0; j < cols; j++) {
        var lat = LAT[j] * RH;
        pos.push(p.x + r.x * lat, p.y + r.y * lat, p.z + r.z * lat);
        nor.push(u.x, u.y, u.z);
        uv.push((LAT[j] * 0.5 + 0.5) * (RH * 2 / TILE), arc / TILE);
      }
    }
    var colArr = new Float32Array(N * cols * 3);
    for (i = 0; i < N; i++) {
      for (j = 0; j < cols; j++) {
        var k3 = (i * cols + j) * 3;
        var bv = 0.88 + A.fbm(pos[k3] * 0.03, pos[k3 + 2] * 0.03, 2, 0.5) * 0.24;
        colArr[k3] = bv; colArr[k3 + 1] = bv; colArr[k3 + 2] = bv;
      }
    }
    for (i = 0; i < N; i++) {
      var a = i * cols, b = ((i + 1) % N) * cols;
      for (j = 0; j < cols - 1; j++) {
        idx.push(a + j, a + j + 1, b + j);
        idx.push(a + j + 1, b + j + 1, b + j);
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();

    var roadMat = new THREE.MeshStandardMaterial({
      map: this.roadMap, roughness: 0.9, metalness: 0.0,
      vertexColors: true, color: 0xffffff
    });
    this.roadMat = roadMat;
    var road = new THREE.Mesh(g, roadMat);
    road.receiveShadow = true;
    road.name = 'road';
    this.group.add(road);

    /* --- 路肩（红白） --- */
    var kpos = [], kuv = [], knor = [], kidx = [];
    for (i = 0; i < N; i++) {
      var pp = this.P[i], rr = this.R[i], uu = this.U[i], arc2 = this.S[i];
      for (var side = 0; side < 2; side++) {
        var sgn = side === 0 ? -1 : 1;
        var base = kpos.length / 3;
        var l0 = sgn * RH, l1 = sgn * (RH + KW);
        kpos.push(pp.x + rr.x * l0, pp.y + rr.y * l0 + 0.035, pp.z + rr.z * l0);
        kpos.push(pp.x + rr.x * l1, pp.y + rr.y * l1 + 0.055, pp.z + rr.z * l1);
        knor.push(uu.x, uu.y, uu.z, uu.x, uu.y, uu.z);
        kuv.push(0, arc2 / 2.6, 1, arc2 / 2.6);
        var n2 = ((i + 1) % N) * 4 + side * 2;
        if (side === 0) {
          kidx.push(base, n2, base + 1); kidx.push(base + 1, n2, n2 + 1);
        } else {
          kidx.push(base, base + 1, n2); kidx.push(base + 1, n2 + 1, n2);
        }
      }
    }
    var kg = new THREE.BufferGeometry();
    kg.setAttribute('position', new THREE.Float32BufferAttribute(kpos, 3));
    kg.setAttribute('normal', new THREE.Float32BufferAttribute(knor, 3));
    kg.setAttribute('uv', new THREE.Float32BufferAttribute(kuv, 2));
    kg.setIndex(kidx);
    kg.computeBoundingSphere();
    var kerb = new THREE.Mesh(kg, new THREE.MeshStandardMaterial({
      map: this.assets.stripe, roughness: 0.85, metalness: 0, side: THREE.DoubleSide
    }));
    kerb.receiveShadow = true;
    kerb.name = 'kerb';
    this.group.add(kerb);

    /* --- 缓冲区 --- */
    var gpos = [], guv = [], gnor = [], gidx = [], gcol = [];
    var edgeLat = RH + KW;
    for (i = 0; i < N; i++) {
      var gp = this.P[i], gr = this.R[i], gu = this.U[i], garc = this.S[i];
      var base2 = gpos.length / 3;
      for (var s2 = 0; s2 < 2; s2++) {
        var sg = s2 === 0 ? -1 : 1;
        var la = sg * edgeLat;
        var lb = sg * (edgeLat + VW);
        var ax = gp.x + gr.x * la, ay = gp.y + gr.y * la + 0.02, az = gp.z + gr.z * la;
        var bx = gp.x + gr.x * lb, bz = gp.z + gr.z * lb;
        var by = this._terrainH(bx, bz);
        gpos.push(ax, ay, az, bx, by, bz);
        gnor.push(gu.x, gu.y, gu.z, 0, 1, 0);
        guv.push(0, garc / this.p.groundTile, VW / this.p.groundTile, garc / this.p.groundTile);
        var gv1 = 0.90 + A.fbm(ax * 0.011, az * 0.011, 3, 0.55) * 0.42;
        var gv2 = 0.90 + A.fbm(bx * 0.011, bz * 0.011, 3, 0.55) * 0.42;
        gcol.push(gv1, gv1 * 1.02, gv1 * 0.96, gv2, gv2 * 1.02, gv2 * 0.96);
        var n3 = ((i + 1) % N) * 4 + s2 * 2;
        if (s2 === 0) {
          gidx.push(base2, n3, base2 + 1); gidx.push(base2 + 1, n3, n3 + 1);
        } else {
          gidx.push(base2, base2 + 1, n3); gidx.push(base2 + 1, n3 + 1, n3);
        }
      }
    }
    var gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
    gg.setAttribute('normal', new THREE.Float32BufferAttribute(gnor, 3));
    gg.setAttribute('uv', new THREE.Float32BufferAttribute(guv, 2));
    gg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(gcol), 3));
    gg.setIndex(gidx);
    gg.computeBoundingSphere();
    var vergeTex = this.groundMap.clone();
    vergeTex.needsUpdate = true;
    vergeTex.wrapS = vergeTex.wrapT = THREE.RepeatWrapping;
    vergeTex.repeat.set(1, 1);
    var verge = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({
      map: vergeTex, vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide, color: 0xffffff
    }));
    verge.receiveShadow = true;
    verge.name = 'verge';
    this.group.add(verge);

    /* --- 起跑线棋盘 --- */
    var cpos = [], cuv = [], cnor = [], cidx = [], ci = 0;
    var cw = 3.2, segs = 22;
    for (i = 0; i <= 1; i++) {
      var idx2 = i * 2 % N;
      var cp = this.P[idx2], cr = this.R[idx2], cu = this.U[idx2], ct = this.T[idx2];
      for (var q = 0; q < 2; q++) {
        for (var wv = 0; wv < segs; wv++) {
          var t0 = wv / segs, t1 = (wv + 1) / segs;
          var L0 = (t0 * 2 - 1) * RH, L1 = (t1 * 2 - 1) * RH;
          var oy = q * cw * 0.5, oy2 = oy + cw * 0.5;
          cpos.push(
            cp.x + cr.x * L0 + ct.x * oy, cp.y + cr.y * L0 + 0.045 + ct.y * oy, cp.z + cr.z * L0 + ct.z * oy,
            cp.x + cr.x * L1 + ct.x * oy, cp.y + cr.y * L1 + 0.045 + ct.y * oy, cp.z + cr.z * L1 + ct.z * oy,
            cp.x + cr.x * L0 + ct.x * oy2, cp.y + cr.y * L0 + 0.045 + ct.y * oy2, cp.z + cr.z * L0 + ct.z * oy2,
            cp.x + cr.x * L1 + ct.x * oy2, cp.y + cr.y * L1 + 0.045 + ct.y * oy2, cp.z + cr.z * L1 + ct.z * oy2
          );
          var u0 = (wv & 1) ? 0.5 : 0, u1 = (wv & 1) ? 1 : 0.5;
          var v0 = q ? 0 : 0.5, v1 = q ? 0.5 : 1;
          cuv.push(u0, v0, u1, v0, u0, v1, u1, v1);
          for (var z2 = 0; z2 < 4; z2++) cnor.push(cu.x, cu.y, cu.z);
          var bb = ci * 4;
          cidx.push(bb, bb + 1, bb + 2, bb + 1, bb + 3, bb + 2);
          ci++;
        }
      }
    }
    var cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
    cg.setAttribute('normal', new THREE.Float32BufferAttribute(cnor, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(cuv, 2));
    cg.setIndex(cidx);
    cg.computeBoundingSphere();
    var start = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({
      map: this.assets.checker, roughness: 0.75, metalness: 0, polygonOffset: true,
      polygonOffsetFactor: -2, polygonOffsetUnits: -2
    }));
    start.receiveShadow = true;
    start.name = 'startline';
    this.group.add(start);
  };

  /* -------------------------------------------------------------- 护栏 --- */
  Track.prototype._buildBarriers = function () {
    var N = this.N, i, WALL = this.wallAt;
    var pos = [], uv = [], nor = [], idx = [], vcount = 0;
    var H = this.p.props.lights === 'street' ? 1.35 : 1.15;
    for (var side = 0; side < 2; side++) {
      var sg = side === 0 ? -1 : 1;
      var base = vcount;
      for (i = 0; i < N; i++) {
        var p = this.P[i], r = this.R[i], arc = this.S[i];
        var l = sg * WALL;
        var x = p.x + r.x * l, z = p.z + r.z * l;
        var y = p.y + r.y * l;
        pos.push(x, y, z, x, y + H, z);
        var nx = -sg * r.x, nz = -sg * r.z;
        nor.push(nx, 0.15, nz, nx, 0.15, nz);
        uv.push(0, arc / 1.6, 1, arc / 1.6);
        vcount += 2;
      }
      for (i = 0; i < N; i++) {
        var a = base + i * 2, b = base + ((i + 1) % N) * 2;
        if (side === 0) idx.push(a, a + 1, b, a + 1, b + 1, b);
        else idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    var wall = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      map: this.assets.stripe, roughness: 0.6, metalness: 0.25, side: THREE.DoubleSide
    }));
    wall.castShadow = true; wall.receiveShadow = true;
    wall.name = 'barrier';
    this.group.add(wall);

    /* 立柱 */
    var step = 7;
    var count = Math.floor(N / step) * 2;
    var postGeo = new THREE.BoxGeometry(0.22, H + 0.3, 0.22);
    var postMat = new THREE.MeshStandardMaterial({ color: 0x2b3238, roughness: 0.55, metalness: 0.5 });
    var posts = new THREE.InstancedMesh(postGeo, postMat, count);
    posts.castShadow = true;
    var mtx = new THREE.Matrix4(), qi = 0, quat = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    for (var s2 = 0; s2 < 2; s2++) {
      var sg2 = s2 === 0 ? -1 : 1;
      for (i = 0; i < N; i += step) {
        var pp = this.P[i], rr = this.R[i], tt = this.T[i];
        var ll = sg2 * WALL;
        var yaw = Math.atan2(tt.x, tt.z);
        quat.setFromAxisAngle(UP, yaw);
        mtx.compose(new THREE.Vector3(pp.x + rr.x * ll, pp.y + rr.y * ll + (H + 0.3) / 2 - 0.1, pp.z + rr.z * ll), quat, sc);
        posts.setMatrixAt(qi++, mtx);
      }
    }
    posts.count = qi;
    posts.instanceMatrix.needsUpdate = true;
    this.group.add(posts);
  };

  /* -------------------------------------------------------------- 地形 --- */
  Track.prototype._buildTerrain = function () {
    var t = this.p.terrain;
    var SIZE = t.size, SEG = t.seg;
    var geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    var p = geo.attributes.position;
    var colors = new Float32Array(p.count * 3);
    var c = new THREE.Color();
    var farC = new THREE.Color(this.night ? 0x1b2430 : 0x9fb6c4);
    var farMix = this.night ? 0.5 : 0.78;
    var self = this;
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i), z = p.getZ(i);
      p.setY(i, self._terrainH(x, z));
      var r = Math.sqrt(x * x + z * z);
      var n = A.fbm(x * 0.011, z * 0.011, 3, 0.55);
      var b = 0.90 + n * 0.42;
      var tt = A.smoothstep(420, 1500, r);
      c.setRGB(b, b * 1.02, b * 0.96).lerp(farC, tt * farMix);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    var mat = new THREE.MeshStandardMaterial({
      map: this.groundMap, vertexColors: true, roughness: 1, metalness: 0, color: 0xffffff
    });
    mat.map.repeat.set(SIZE / (this.p.groundTile * 1.3), SIZE / (this.p.groundTile * 1.3));
    var mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this.group.add(mesh);
    this.terrain = mesh;
  };

  /* -------------------------------------------------------------- 海面 --- */
  Track.prototype._buildWater = function () {
    var lvl = this.p.props.water.level;
    var geo = new THREE.PlaneGeometry(4000, 4000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    var mat = new THREE.MeshStandardMaterial({
      color: this.night ? 0x0a1a2a : 0x1d4a63,
      roughness: 0.12, metalness: 0.55, envMapIntensity: 1.4
    });
    var sea = new THREE.Mesh(geo, mat);
    sea.position.y = lvl;
    sea.name = 'water';
    this.group.add(sea);
  };

  /* -------------------------------------------------------------- 道具 --- */
  function mkInst(g, m, arr, shadow) {
    var im = new THREE.InstancedMesh(g, m, arr.length);
    for (var q = 0; q < arr.length; q++) im.setMatrixAt(q, arr[q]);
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = !!shadow;
    return im;
  }
  A.mkInst = mkInst;

  Track.prototype._buildProps = function () {
    var N = this.N, i, self = this;
    var P = this.p.props;
    var rnd = A.rng(20260410 + this.p.shape.r0);
    var tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion();
    var tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
    this._zones = [];

    /* 道具几何体兜底 */
    if (!this.assets.propGeo) this.assets.propGeo = {};
    var pg = this.assets.propGeo;
    if (!pg.cone) { pg.cone = new THREE.ConeGeometry(0.26, 0.62, 10); pg.cone.translate(0, 0.31, 0); }
    if (!pg.box) { pg.box = new THREE.BoxGeometry(0.72, 0.72, 0.72); pg.box.translate(0, 0.36, 0); }
    if (!pg.tire) { pg.tire = new THREE.TorusGeometry(0.3, 0.13, 8, 14); pg.tire.rotateX(Math.PI / 2); }
    if (!this.assets.propMat) this.assets.propMat = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.8 });

    function place(px, pz, yOff, scale, arr) {
      tmpQ.setFromAxisAngle(UP, rnd() * TAU);
      tmpS.copy(scale);
      tmpP.set(px, yOff, pz);
      tmpM.compose(tmpP, tmpQ, tmpS);
      arr.push(tmpM.clone());
    }

    /* ============ 1. 树木（按地图主题） ============ */
    var treeKind = P.tree.kind;
    if (treeKind !== 'none' && P.tree.density > 0) {
      var treeMats = [], treeBroad = [];

      function placeTree(x, z, scale) {
        var y = self.groundY(x, z) - 0.35;
        tmpQ.setFromAxisAngle(UP, rnd() * TAU);
        tmpS.set(scale * (0.85 + rnd() * 0.3), scale * (0.9 + rnd() * 0.45), scale * (0.85 + rnd() * 0.3));
        tmpP.set(x, y, z);
        tmpM.compose(tmpP, tmpQ, tmpS);
        treeMats.push(tmpM.clone());
        treeBroad.push(rnd() < 0.38);
      }

      /* 沿赛道两侧成簇 */
      var near = P.tree.near;
      var lim = this.p.terrain.size * 0.24;
      for (i = 0; i < N; i += 4) {
        if (rnd() < 0.40 / P.tree.density) continue;
        var p = this.P[i], r = this.R[i], t = this.T[i];
        var cluster = 1 + Math.floor(rnd() * 3);
        for (var s = 0; s < 2; s++) {
          var sg = s === 0 ? -1 : 1;
          var n0 = near + rnd() * 22;
          for (var k = 0; k < cluster; k++) {
            var lat = sg * (n0 + k * (10 + rnd() * 9));
            var jit = (rnd() - 0.5) * 11;
            var tx = p.x + r.x * lat + t.x * jit;
            var tz = p.z + r.z * lat + t.z * jit;
            if (Math.sqrt(tx * tx + tz * tz) > lim) continue;
            if (this._nearZone(tx, tz, 8)) continue;
            if (P.water && this.groundY(tx, tz) < P.water.level + 0.5) continue;
            placeTree(tx, tz, 0.8 + rnd() * 0.75);
          }
        }
      }
      /* 场外散布 */
      var scatter = Math.round(620 * P.tree.density);
      for (i = 0; i < scatter; i++) {
        var ang = rnd() * TAU, rad = 130 + rnd() * (lim - 130);
        var x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
        if (this.distanceToTrack(x, z) < 40) continue;
        if (this._nearZone(x, z, 12)) continue;
        if (P.water && this.groundY(x, z) < P.water.level + 0.5) continue;
        placeTree(x, z, 0.85 + rnd() * 0.9);
      }

      function addSet(geo, mat, shadow, filterFn) {
        var arr = [];
        for (var q = 0; q < treeMats.length; q++) {
          if (!filterFn || filterFn(treeBroad[q])) arr.push(treeMats[q]);
        }
        if (arr.length) self.group.add(mkInst(geo, mat, arr, shadow));
      }
      function flat(c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }); }
      var notBroad = function (b) { return !b; };
      var isBroad = function (b) { return b; };

      var trunkGeo = new THREE.CylinderGeometry(0.3, 0.46, 4.4, 6);
      trunkGeo.translate(0, 0.9, 0);
      var trunkMat = new THREE.MeshStandardMaterial({ color: 0x453323, roughness: 1 });

      if (treeKind === 'forest') {
        addSet(trunkGeo, trunkMat, true, null);
        var g1 = new THREE.ConeGeometry(2.5, 5.6, 7); g1.translate(0, 4.4, 0);
        var g2 = new THREE.ConeGeometry(1.8, 4.0, 7); g2.translate(0, 6.9, 0);
        var b1 = new THREE.IcosahedronGeometry(2.7, 0); b1.scale(1, 0.82, 1); b1.translate(0, 5.1, 0);
        var b2 = new THREE.IcosahedronGeometry(1.85, 0); b2.translate(1.15, 6.3, 0.45);
        addSet(g1, flat(0x21401c), true, notBroad);
        addSet(g2, flat(0x2b5023), false, notBroad);
        addSet(b1, flat(0x35682c), true, isBroad);
        addSet(b2, flat(0x2b5023), false, isBroad);
      } else if (treeKind === 'snow') {
        addSet(trunkGeo, trunkMat, true, null);
        var s1 = new THREE.ConeGeometry(2.3, 6.4, 7); s1.translate(0, 4.6, 0);
        var s2 = new THREE.ConeGeometry(1.5, 4.2, 7); s2.translate(0, 7.6, 0);
        addSet(s1, flat(0x1d3a2a), true, null);
        addSet(s2, new THREE.MeshStandardMaterial({ color: 0xe8f2fa, roughness: 0.95, flatShading: true }), false, null);
      } else if (treeKind === 'palm') {
        var tr = new THREE.CylinderGeometry(0.16, 0.3, 6.4, 6); tr.translate(0, 2.8, 0);
        var fr1 = new THREE.ConeGeometry(2.5, 1.6, 6); fr1.translate(0, 6.2, 0);
        var fr2 = new THREE.ConeGeometry(2.0, 1.3, 6); fr2.translate(0, 5.5, 0);
        addSet(tr, new THREE.MeshStandardMaterial({ color: 0x6b5334, roughness: 1 }), true, null);
        addSet(fr1, flat(0x3d7a3a), true, null);
        addSet(fr2, flat(0x4c8f45), false, null);
      } else if (treeKind === 'desert') {
        var cac = new THREE.CylinderGeometry(0.34, 0.44, 3.6, 8); cac.translate(0, 1.8, 0);
        var arm = new THREE.CylinderGeometry(0.19, 0.23, 1.6, 6); arm.translate(0, 0.8, 0);
        var dead = new THREE.ConeGeometry(0.22, 2.8, 5); dead.translate(0, 1.4, 0);
        addSet(cac, flat(0x4a6b3a), true, isBroad);
        addSet(arm, flat(0x54793f), true, isBroad);
        addSet(dead, flat(0x6b5b45), true, notBroad);
      }
    }

    /* ============ 2. 灌木 / 石头 ============ */
    if (P.bush > 0 || P.rock > 0) {
      var bushGeo = new THREE.IcosahedronGeometry(1, 0);
      var bushMat = new THREE.MeshStandardMaterial({
        color: this.night ? 0x22301f : 0x2f5a26, roughness: 1, flatShading: true
      });
      var rockMat = new THREE.MeshStandardMaterial({
        color: this.night ? 0x3a3f44 : 0x8d9296, roughness: 0.95, flatShading: true
      });
      var bushArr = [], rockArr = [];
      for (i = 0; i < N; i += 5) {
        var pb = this.P[i], rb = this.R[i], tb = this.T[i];
        for (var sb = 0; sb < 2; sb++) {
          if (rnd() < 0.45) continue;
          var sgb = sb === 0 ? -1 : 1;
          var latb = sgb * ((this.roadHalf + this.kerbW + this.vergeW) + 2 + rnd() * 30);
          var bx = pb.x + rb.x * latb + tb.x * (rnd() - 0.5) * 12;
          var bz = pb.z + rb.z * latb + tb.z * (rnd() - 0.5) * 12;
          if (this._nearZone(bx, bz, 6)) continue;
          var by = this.groundY(bx, bz);
          if (P.water && by < P.water.level + 0.5) continue;
          tmpQ.setFromAxisAngle(UP, rnd() * TAU);
          var pick = rnd();
          if (pick < 0.5 * P.bush) {
            var bs = 0.7 + rnd() * 1.1;
            tmpS.set(bs * 1.25, bs * 0.8, bs * 1.25);
            tmpP.set(bx, by - bs * 0.28, bz);
            tmpM.compose(tmpP, tmpQ, tmpS);
            bushArr.push(tmpM.clone());
          } else if (pick < 0.5 * P.bush + 0.5 * P.rock) {
            var rs = 0.5 + rnd() * 1.4 * P.rock;
            tmpS.set(rs, rs * (0.55 + rnd() * 0.5), rs * (0.8 + rnd() * 0.4));
            tmpP.set(bx, by - rs * 0.3, bz);
            tmpM.compose(tmpP, tmpQ, tmpS);
            rockArr.push(tmpM.clone());
          }
        }
      }
      if (bushArr.length) this.group.add(mkInst(bushGeo, bushMat, bushArr, true));
      if (rockArr.length) this.group.add(mkInst(bushGeo, rockMat, rockArr, true));
    }

    /* ============ 3. 广告牌 ============ */
    if (P.ads) {
      var ads = this.night ? [
        ['NEON', '#0a1420', '#4df3ff', '#4df3ff'],
        ['VOLT', '#1a0a20', '#ff8af0', '#ff2d9f'],
        ['APEX', '#0b1a2b', '#dff3ff', '#4df3ff'],
        ['RUSH', '#2a0a14', '#ffd9e4', '#ff2d6f']
      ] : [
        ['APEX', '#0b1a2b', '#4df3ff', '#4df3ff'],
        ['POLY HAVEN', '#12261c', '#c8f5d8', '#3dff88'],
        ['KENNEY', '#2b1a08', '#ffd166', '#ffb300'],
        ['THREE.JS', '#12081f', '#ffffff', '#a06bff'],
        ['RUSH ENERGY', '#2a0a14', '#ffd9e4', '#ff2d6f'],
        ['GP SERIES', '#0a1f2e', '#dff3ff', '#4df3ff']
      ];
      var adMats = ads.map(function (a) {
        var m = new THREE.MeshStandardMaterial({
          map: A.makeAd(a[0], a[1], a[2], a[3]), roughness: 0.95, metalness: 0, side: THREE.DoubleSide
        });
        if (self.night) { m.emissive = new THREE.Color(a[3]); m.emissiveIntensity = 0.55; m.emissiveMap = m.map; }
        return m;
      });
      var adGeo = new THREE.PlaneGeometry(6.2, 1.65);
      var adGroups = adMats.map(function () { return []; });
      for (i = 0; i < N; i += 10) {
        for (var s3 = 0; s3 < 2; s3++) {
          var sg3 = s3 === 0 ? -1 : 1;
          var pp2 = this.P[i], rr2 = this.R[i];
          var lat2 = sg3 * (this.wallAt + 0.7);
          var ax = pp2.x + rr2.x * lat2, az = pp2.z + rr2.z * lat2;
          var ay = this.groundY(ax, az) + 0.85;
          tmpQ.setFromAxisAngle(UP, Math.atan2(-sg3 * rr2.x, -sg3 * rr2.z));
          tmpS.set(1, 1, 1);
          tmpP.set(ax, ay, az);
          tmpM.compose(tmpP, tmpQ, tmpS);
          adGroups[Math.floor(rnd() * adMats.length)].push(tmpM.clone());
        }
      }
      for (var a2 = 0; a2 < adMats.length; a2++) {
        if (adGroups[a2].length) this.group.add(mkInst(adGeo, adMats[a2], adGroups[a2], false));
      }
    }

    /* ============ 4. 弯道外侧的锥桶与轮胎墙 ============ */
    var coneSrc = this.assets.propGeo.cone, boxSrc = this.assets.propGeo.box, tireSrc = this.assets.propGeo.tire;
    var coneArr = [], tireArr = [], boxArr = [];
    for (i = 0; i < N; i += 2) {
      var kv = Math.abs(this.K[i]);
      if (kv > 0.0075 && rnd() < 0.6) {
        var out = -A.sign(this.K[i]);
        var p3 = this.P[i], r3 = this.R[i];
        var lat3 = out * (this.roadHalf + this.kerbW + 1.8);
        var cx = p3.x + r3.x * lat3, cz = p3.z + r3.z * lat3;
        tmpQ.identity(); tmpS.set(1.2, 1.2, 1.2);
        tmpP.set(cx, this.groundY(cx, cz) + 0.02, cz);
        tmpM.compose(tmpP, tmpQ, tmpS);
        coneArr.push(tmpM.clone());
      }
      if (kv > 0.010 && i % 8 === 0) {
        var out2 = -A.sign(this.K[i]);
        var p4 = this.P[i], r4 = this.R[i];
        var lat4 = out2 * (this.roadHalf + this.kerbW + 5.2);
        for (var t2 = 0; t2 < 3; t2++) {
          var tx2 = p4.x + r4.x * (lat4 + t2 * 1.15), tz2 = p4.z + r4.z * (lat4 + t2 * 1.15);
          var gy = this.groundY(tx2, tz2);
          for (var stack = 0; stack < 3; stack++) {
            tmpQ.setFromAxisAngle(UP, rnd() * TAU);
            tmpS.set(1.55, 1.55, 1.55);
            tmpP.set(tx2, gy + 0.26 + stack * 0.47, tz2);
            tmpM.compose(tmpP, tmpQ, tmpS);
            tireArr.push(tmpM.clone());
          }
        }
      }
    }
    if (coneArr.length) this.group.add(mkInst(coneSrc, this.assets.propMat, coneArr, true));
    if (tireArr.length) this.group.add(mkInst(tireSrc, this.assets.propMat, tireArr, true));

    /* ============ 5. 裁判岗亭 + 旗子 ============ */
    if (P.marshals) {
      var postGeo = new THREE.BoxGeometry(0.95, 1.15, 0.95);
      var postMat = new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.8 });
      var poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6); poleGeo.translate(0, 1.3, 0);
      var poleMat = new THREE.MeshStandardMaterial({ color: 0x333a40, roughness: 0.7, metalness: 0.3 });
      var flagGeo = new THREE.PlaneGeometry(0.85, 0.52);
      var flagMats = [0xffd166, 0x3dff88, 0x4df3ff, 0xff2d6f].map(function (c) {
        return new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, side: THREE.DoubleSide });
      });
      var postArr = [], poleArr = [], flagArrs = flagMats.map(function () { return []; });
      for (i = 12; i < N; i += 46) {
        for (var s4 = 0; s4 < 2; s4++) {
          if ((i / 46 + s4) % 2 < 1) continue;
          var sg4 = s4 === 0 ? -1 : 1;
          var pp5 = this.P[i], rr5 = this.R[i];
          var lat5 = sg4 * (this.wallAt + 2.6);
          var px = pp5.x + rr5.x * lat5, pz = pp5.z + rr5.z * lat5;
          var py = this.groundY(px, pz);
          tmpQ.setFromAxisAngle(UP, Math.atan2(-sg4 * rr5.x, -sg4 * rr5.z));
          tmpS.set(1, 1, 1);
          tmpP.set(px, py + 0.55, pz); tmpM.compose(tmpP, tmpQ, tmpS); postArr.push(tmpM.clone());
          tmpP.set(px, py + 1.1, pz); tmpM.compose(tmpP, tmpQ, tmpS); poleArr.push(tmpM.clone());
          tmpP.set(px + 0.44 * -sg4 * rr5.z, py + 3.5, pz + 0.44 * sg4 * rr5.x);
          tmpM.compose(tmpP, tmpQ, tmpS);
          flagArrs[Math.floor(rnd() * flagMats.length)].push(tmpM.clone());
        }
      }
      if (postArr.length) this.group.add(mkInst(postGeo, postMat, postArr, true));
      if (poleArr.length) this.group.add(mkInst(poleGeo, poleMat, poleArr, true));
      for (var f2 = 0; f2 < flagMats.length; f2++) {
        if (flagArrs[f2].length) this.group.add(mkInst(flagGeo, flagMats[f2], flagArrs[f2], false));
      }
    }

    /* ============ 6. 弯前刹车距离牌 ============ */
    if (P.boards) {
      var cands = [];
      for (i = 0; i < N; i++) cands.push({ i: i, v: this.vProfile[i] });
      cands.sort(function (a, b) { return a.v - b.v; });
      var corners = [];
      for (var ci2 = 0; ci2 < cands.length && corners.length < 3; ci2++) {
        var okc = true;
        for (var cj = 0; cj < corners.length; cj++) {
          var dd2 = Math.abs(cands[ci2].i - corners[cj]);
          dd2 = Math.min(dd2, N - dd2);
          if (dd2 < 160) { okc = false; break; }
        }
        if (okc) corners.push(cands[ci2].i);
      }
      var signMats = [
        new THREE.MeshStandardMaterial({ map: A.makeAd('150', '#0d3d1f', '#eafff2', '#3dff88'), roughness: 0.7, side: THREE.DoubleSide }),
        new THREE.MeshStandardMaterial({ map: A.makeAd('100', '#3d3208', '#fff8e0', '#ffd166'), roughness: 0.7, side: THREE.DoubleSide }),
        new THREE.MeshStandardMaterial({ map: A.makeAd('50', '#3d0d16', '#ffe6ec', '#ff2d6f'), roughness: 0.7, side: THREE.DoubleSide })
      ];
      var signGeo = new THREE.PlaneGeometry(1.5, 1.1);
      var signArrs = signMats.map(function () { return []; });
      var post2Geo = new THREE.CylinderGeometry(0.07, 0.07, 1.7, 6); post2Geo.translate(0, 0.85, 0);
      var post2Arr = [];
      var poleMat2 = new THREE.MeshStandardMaterial({ color: 0x333a40, roughness: 0.7, metalness: 0.3 });
      for (var cn = 0; cn < corners.length; cn++) {
        var cIdx = corners[cn];
        var outSign = -A.sign(this.K[cIdx]);
        if (outSign === 0) outSign = 1;
        for (var bi = 0; bi < 3; bi++) {
          var back = [120, 75, 40][bi];
          var si = ((cIdx - Math.round(back / this.ds)) % N + N) % N;
          var pp6 = this.P[si], rr6 = this.R[si];
          var lat6 = outSign * (this.wallAt + 2.0);
          var sx = pp6.x + rr6.x * lat6, sz = pp6.z + rr6.z * lat6;
          var sy = this.groundY(sx, sz);
          tmpQ.setFromAxisAngle(UP, Math.atan2(-outSign * rr6.x, -outSign * rr6.z));
          tmpS.set(1, 1, 1);
          tmpP.set(sx, sy + 1.75, sz); tmpM.compose(tmpP, tmpQ, tmpS); signArrs[bi].push(tmpM.clone());
          tmpP.set(sx, sy, sz); tmpM.compose(tmpP, tmpQ, tmpS); post2Arr.push(tmpM.clone());
        }
      }
      for (var b2 = 0; b2 < signMats.length; b2++) {
        if (signArrs[b2].length) this.group.add(mkInst(signGeo, signMats[b2], signArrs[b2], false));
      }
      if (post2Arr.length) this.group.add(mkInst(post2Geo, poleMat2, post2Arr, true));
    }

    /* ============ 7. 照明灯杆 ============ */
    var street = P.lights === 'street';
    if (P.lights && P.lights !== 'none') {
      var lpPole = new THREE.CylinderGeometry(street ? 0.11 : 0.14, street ? 0.15 : 0.2, street ? 7.6 : 9.5, 7);
      var poleH = street ? 7.6 : 9.5;
      lpPole.translate(0, poleH / 2, 0);
      var lpHead = new THREE.BoxGeometry(street ? 1.15 : 1.5, 0.28, street ? 0.5 : 0.6);
      var lampCol = street ? 0xffe6b0 : 0xdfe6ea;
      var lpLamp = new THREE.MeshStandardMaterial({
        color: lampCol, roughness: 0.4, metalness: 0.2,
        emissive: street ? 0xffd27a : 0x2a2a24, emissiveIntensity: street ? 1.6 : 1.0
      });
      var lpArr = [], lhArr = [];
      var step2 = street ? 26 : 84;
      for (i = 20; i < N; i += step2) {
        for (var s5 = 0; s5 < 2; s5++) {
          var sg5 = s5 === 0 ? -1 : 1;
          var pp7 = this.P[i], rr7 = this.R[i];
          var lat7 = sg5 * (this.wallAt + (street ? 1.2 : 3.6));
          var lx = pp7.x + rr7.x * lat7, lz = pp7.z + rr7.z * lat7;
          var ly = this.groundY(lx, lz);
          tmpQ.setFromAxisAngle(UP, Math.atan2(-sg5 * rr7.x, -sg5 * rr7.z));
          tmpS.set(1, 1, 1);
          tmpP.set(lx, ly, lz); tmpM.compose(tmpP, tmpQ, tmpS); lpArr.push(tmpM.clone());
          tmpP.set(lx - 0.5 * sg5 * rr7.x, ly + poleH, lz - 0.5 * sg5 * rr7.z);
          tmpM.compose(tmpP, tmpQ, tmpS); lhArr.push(tmpM.clone());
        }
      }
      if (lpArr.length) {
        this.group.add(mkInst(lpPole, this.assets.propMat && new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.6, metalness: 0.4 }), lpArr, true));
        this.group.add(mkInst(lpHead, lpLamp, lhArr, true));
      }
    }

    /* ============ 8. 城市建筑（夜赛） ============ */
    if (P.city) this._buildCity(rnd);

    /* ============ 9. 看台 / 维修区 ============ */
    if (P.stands >= 1) this._buildGrandstand(rnd, -1, 40);
    if (P.stands >= 2) this._buildGrandstand(rnd, 1, 40);
    if (P.pit) this._buildPitBuilding(rnd, 1, 6);

    var pit = this._pitRef;
    if (pit) {
      for (i = 0; i < 26; i++) {
        var bx3 = pit.x + (rnd() - 0.5) * 26;
        var bz3 = pit.z + (rnd() - 0.5) * 16;
        if (this.distanceToTrack(bx3, bz3) < this.wallAt + 4) continue;
        tmpQ.setFromAxisAngle(UP, rnd() * TAU);
        var sc3 = 1.0 + rnd() * 1.3;
        tmpS.set(sc3, sc3 * (0.6 + rnd() * 0.8), sc3);
        tmpP.set(bx3, this.groundY(bx3, bz3), bz3);
        tmpM.compose(tmpP, tmpQ, tmpS);
        boxArr.push(tmpM.clone());
      }
    }
    if (boxArr.length) this.group.add(mkInst(boxSrc, this.assets.propMat, boxArr, true));
  };

  /* ---------------------------------------------------------- 城市建筑 --- */
  Track.prototype._buildCity = function (rnd) {
    var N = this.N;
    /* 窗户贴图 */
    var winTex = A.canvasTexture(128, 256, function (g, w, h) {
      g.fillStyle = '#12161c'; g.fillRect(0, 0, w, h);
      var cols = 8, rows = 16, cw = w / cols, ch = h / rows;
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          if (rnd() < 0.42) continue;
          var lit = rnd();
          g.fillStyle = lit < 0.55 ? '#ffd98a' : (lit < 0.8 ? '#cfe6ff' : '#ffb066');
          g.fillRect(x * cw + cw * 0.18, y * ch + ch * 0.2, cw * 0.62, ch * 0.5);
        }
      }
    }, { nearest: false });
    var sideMat = new THREE.MeshStandardMaterial({
      map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 1.15,
      roughness: 0.85, metalness: 0.05, color: 0x8a9099
    });
    var roofMat = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.95 });
    var boxGeo = new THREE.BoxGeometry(1, 1, 1);
    var mats = [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat];

    var arr = [];
    var tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion();
    var tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
    var lim = this.p.terrain.size * 0.22;
    for (var i = 0; i < 460; i++) {
      var ang = rnd() * TAU, rad = 120 + rnd() * (lim - 120);
      var x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      if (this.distanceToTrack(x, z) < this.wallAt + 14) continue;
      var d = Math.hypot(x, z);
      if (d < 90) continue;
      var w = 10 + rnd() * 22, dp = 10 + rnd() * 22;
      var hh = 12 + rnd() * (rad > 500 ? 70 : 34);
      tmpQ.setFromAxisAngle(UP, Math.round(rnd() * 4) * Math.PI / 4);
      tmpS.set(w, hh, dp);
      tmpP.set(x, this.groundY(x, z) + hh / 2 - 0.6, z);
      tmpM.compose(tmpP, tmpQ, tmpS);
      arr.push(tmpM.clone());
    }
    if (arr.length) {
      var im = new THREE.InstancedMesh(boxGeo, mats, arr.length);
      for (var q = 0; q < arr.length; q++) im.setMatrixAt(q, arr[q]);
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = false;
      this.group.add(im);
    }
  };

  Track.prototype._buildGrandstand = function (rnd, side, atSample) {
    var i = atSample % this.N;
    var p = this.P[i], r = this.R[i];
    var lat = side * (this.wallAt + 11);
    var baseX = p.x + r.x * lat, baseZ = p.z + r.z * lat;
    var g = new THREE.Group();
    g.position.set(baseX, this.groundY(baseX, baseZ), baseZ);
    g.rotation.y = Math.atan2(-side * r.x, -side * r.z);

    var concrete = new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.9 });
    var seatMat = new THREE.MeshStandardMaterial({ color: this.night ? 0x1e3350 : 0x2a4b7a, roughness: 0.8 });
    var roofMat = new THREE.MeshStandardMaterial({ color: 0xd8dde0, roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide });
    var pillarMat = new THREE.MeshStandardMaterial({ color: 0x6d757a, roughness: 0.6, metalness: 0.4 });

    var W = 52, rows = 7, rowD = 1.35, rowH = 0.72;
    for (var ri = 0; ri < rows; ri++) {
      var step = new THREE.Mesh(new THREE.BoxGeometry(W, rowH, rowD), seatMat);
      step.position.set(0, rowH / 2 + ri * rowH, -(ri * rowD));
      step.castShadow = true; step.receiveShadow = true;
      g.add(step);
    }
    for (var sd = -1; sd <= 1; sd += 2) {
      var wallSide = new THREE.Mesh(new THREE.BoxGeometry(0.35, rows * rowH, rows * rowD + 0.6), concrete);
      wallSide.position.set(sd * (W / 2 - 0.2), rows * rowH / 2, -(rows * rowD) / 2 + 0.3);
      wallSide.castShadow = true;
      g.add(wallSide);
    }
    var base = new THREE.Mesh(new THREE.BoxGeometry(W, 3.2, rows * rowD + 2.4), concrete);
    base.position.set(0, -1.4, -(rows * rowD) / 2 + 0.5);
    base.receiveShadow = true;
    g.add(base);
    var roof = new THREE.Mesh(new THREE.BoxGeometry(W + 3, 0.35, rows * rowD + 3.5), roofMat);
    roof.position.set(0, rows * rowH + 4.2, -(rows * rowD) / 2 + 0.6);
    roof.castShadow = true;
    g.add(roof);
    for (var px = -1; px <= 1; px += 2) {
      for (var pz = 0; pz < 2; pz++) {
        var pil = new THREE.Mesh(new THREE.BoxGeometry(0.4, rows * rowH + 4.4, 0.4), pillarMat);
        pil.position.set(px * (W / 2 - 0.6), (rows * rowH + 4.4) / 2 - 0.2, -(pz * (rows * rowD + 2)) + 0.4);
        pil.castShadow = true;
        g.add(pil);
      }
    }
    this.group.add(g);
    this._addZone(baseX, baseZ, 34);
  };

  Track.prototype._buildPitBuilding = function (rnd, side, atSample) {
    var i = atSample % this.N;
    var p = this.P[i], r = this.R[i], t = this.T[i];
    var lat = side * (this.wallAt + 12);
    var bx = p.x + r.x * lat, bz = p.z + r.z * lat;
    var g = new THREE.Group();
    g.position.set(bx, this.groundY(bx, bz), bz);
    g.rotation.y = Math.atan2(t.x, t.z);
    this._pitRef = { x: bx, z: bz };

    var body = new THREE.MeshStandardMaterial({ color: this.night ? 0x8d949c : 0xe4e8ea, roughness: 0.75 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x2b3238, roughness: 0.6, metalness: 0.3 });
    var glass = new THREE.MeshStandardMaterial({ color: 0x2b4a63, roughness: 0.15, metalness: 0.7 });

    var L = 34, D = 9, H = 5.0;
    var main = new THREE.Mesh(new THREE.BoxGeometry(D, H, L), body);
    main.position.set(0, H / 2 - 0.3, 0);
    main.castShadow = true; main.receiveShadow = true;
    g.add(main);
    var win = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.5, L - 3), glass);
    win.position.set(-D / 2 - 0.1, 3.3, 0);
    g.add(win);
    var roof = new THREE.Mesh(new THREE.BoxGeometry(D + 2.4, 0.4, L + 2), dark);
    roof.position.set(-0.6, H - 0.1, 0);
    roof.castShadow = true;
    g.add(roof);
    var wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, L + 6), body);
    wall.position.set(-D / 2 - 3.4, 0.5, 0);
    wall.castShadow = true;
    g.add(wall);
    var adMat = new THREE.MeshStandardMaterial({
      map: A.makeAd('APEX RUSH PADDOCK', '#0b1a2b', '#ffffff', '#4df3ff'),
      roughness: 0.7, side: THREE.DoubleSide
    });
    if (this.night) { adMat.emissive = new THREE.Color(0xffffff); adMat.emissiveMap = adMat.map; adMat.emissiveIntensity = 0.7; }
    var ad = new THREE.Mesh(new THREE.PlaneGeometry(L - 6, 1.6), adMat);
    ad.position.set(-D / 2 - 0.2, H - 1.4, 0);
    ad.rotation.y = -Math.PI / 2;
    g.add(ad);

    this.group.add(g);
    this._addZone(bx, bz, 30);
  };

  /* ------------------------------------------------------- 起终点门架 --- */
  Track.prototype._buildStartArea = function () {
    var N = this.N;
    var i = Math.min(6, N - 1);
    var p = this.P[i], r = this.R[i], t = this.T[i];
    var g = new THREE.Group();
    g.position.copy(p);
    g.rotation.y = Math.atan2(t.x, t.z);
    var span = this.roadHalf + 2.2;
    var steel = new THREE.MeshStandardMaterial({ color: 0x30383f, roughness: 0.45, metalness: 0.65 });
    for (var s = -1; s <= 1; s += 2) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 7.4, 1.0), steel);
      m.position.set(s * span, 3.7, 0);
      m.castShadow = true;
      g.add(m);
    }
    var beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 1.2, 1.5, 1.1), steel);
    beam.position.set(0, 7.0, 0);
    beam.castShadow = true;
    g.add(beam);

    var bannerMat = new THREE.MeshStandardMaterial({
      map: A.makeAd('START / FINISH', '#0b1018', '#ffffff', '#ff2d6f'), roughness: 0.7, side: THREE.DoubleSide
    });
    if (this.night) { bannerMat.emissive = new THREE.Color(0xffffff); bannerMat.emissiveMap = bannerMat.map; bannerMat.emissiveIntensity = 0.8; }
    var banner = new THREE.Mesh(new THREE.PlaneGeometry(span * 1.5, 1.25), bannerMat);
    banner.position.set(0, 5.5, 0.02);
    banner.rotation.y = Math.PI;
    g.add(banner);

    this.lightMeshes = [];
    var lampGeo = new THREE.SphereGeometry(0.34, 14, 10);
    for (var k = 0; k < 5; k++) {
      var lm = new THREE.Mesh(lampGeo, new THREE.MeshStandardMaterial({
        color: 0x1a1a1a, emissive: 0x220000, roughness: 0.35, metalness: 0.1
      }));
      lm.position.set(-span * 0.62 + k * (span * 1.24 / 4), 7.0, 0.62);
      this.lightMeshes.push(lm);
      g.add(lm);
    }
    var tower = new THREE.Mesh(new THREE.BoxGeometry(3.2, 5.2, 3.2),
      new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.7 }));
    tower.position.set(span + 3.2, 2.6, 0);
    tower.castShadow = true;
    g.add(tower);
    var towerRoof = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.3, 3.8),
      new THREE.MeshStandardMaterial({ color: 0x2b3238, roughness: 0.6 }));
    towerRoof.position.set(span + 3.2, 5.35, 0);
    g.add(towerRoof);

    this.group.add(g);

    /* ---------------- 发车格白线 ---------------- */
    var markPos = [], markNor = [], markIdx = [];
    var self = this;
    function quad(i2, lat0, lat1, a0, a1) {
      var pp = self.P[i2], rr = self.R[i2], tt = self.T[i2], uu = self.U[i2];
      var base = markPos.length / 3;
      var pts = [[lat0, a0], [lat1, a0], [lat0, a1], [lat1, a1]];
      for (var q = 0; q < 4; q++) {
        var la = pts[q][0], al = pts[q][1];
        markPos.push(pp.x + rr.x * la + tt.x * al + uu.x * 0.025,
          pp.y + rr.y * la + tt.y * al + uu.y * 0.025,
          pp.z + rr.z * la + tt.z * al + uu.z * 0.025);
        markNor.push(uu.x, uu.y, uu.z);
      }
      markIdx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    for (var gk = 0; gk < 8; gk++) {
      var grow = Math.floor(gk / 2), gside = (gk % 2) ? 1 : -1;
      var gi = ((0 - (7 + grow * 5)) % N + N) % N;
      var glat = gside * 2.9;
      quad(gi, glat - 1.7, glat + 1.7, 0.0, 0.4);
      quad(gi, glat - 1.7, glat - 1.35, -2.4, 0.0);
      quad(gi, glat + 1.35, glat + 1.7, -2.4, 0.0);
    }
    var mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(markPos, 3));
    mg.setAttribute('normal', new THREE.Float32BufferAttribute(markNor, 3));
    mg.setIndex(markIdx);
    mg.computeBoundingSphere();
    var marks = new THREE.Mesh(mg, new THREE.MeshStandardMaterial({
      color: 0xf2f2ef, roughness: 0.8, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
    }));
    marks.name = 'gridmarks';
    this.group.add(marks);
  };

  /* ================================================== 查询接口 ============ */
  var _proj = {
    index: 0, t: 0, lateral: 0, arc: 0, height: 0,
    normal: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(),
    onTrack: false
  };
  A.newProjection = function () {
    return {
      index: 0, t: 0, lateral: 0, arc: 0, height: 0,
      normal: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(),
      onTrack: false
    };
  };

  Track.prototype.project = function (x, z, hint, out) {
    if (hint === undefined || hint === null || !isFinite(hint)) hint = 0;
    hint = Math.floor(hint);
    out = out || _proj;
    var N = this.N, best = 0, bestD = Infinity, i, k;
    var win = 26;
    for (k = -win; k <= win + 26; k++) {
      i = (hint + k + N * 2) % N;
      var dx = x - this.P[i].x, dz = z - this.P[i].z;
      var d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    var rel = ((best - hint) % N + N) % N;
    if (rel < 3 || rel > N - 3) {
      var step = 5;
      for (i = 0; i < N; i += step) {
        var ddx = x - this.P[i].x, ddz = z - this.P[i].z;
        var dd = ddx * ddx + ddz * ddz;
        if (dd < bestD) { bestD = dd; best = i; }
      }
      for (k = -step; k <= step; k++) {
        i = (best + k + N) % N;
        var e1 = x - this.P[i].x, e2 = z - this.P[i].z;
        var e = e1 * e1 + e2 * e2;
        if (e < bestD) { bestD = e; best = i; }
      }
    }
    return this._refine(x, z, best, out);
  };

  Track.prototype.projectGlobal = function (x, z, out) {
    var N = this.N, best = 0, bestD = Infinity;
    for (var i = 0; i < N; i += 3) {
      var dx = x - this.P[i].x, dz = z - this.P[i].z;
      var d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    for (var k = -3; k <= 3; k++) {
      var j = (best + k + N) % N;
      var e1 = x - this.P[j].x, e2 = z - this.P[j].z;
      var e = e1 * e1 + e2 * e2;
      if (e < bestD) { bestD = e; best = j; }
    }
    return this._refine(x, z, best, out || _proj);
  };

  Track.prototype._refine = function (x, z, i, out) {
    var N = this.N, j = (i + 1) % N;
    var ax = this.P[i].x, az = this.P[i].z;
    var ex = this.P[j].x - ax, ez = this.P[j].z - az;
    var len2 = ex * ex + ez * ez;
    var t = len2 > 1e-9 ? A.clamp(((x - ax) * ex + (z - az) * ez) / len2, 0, 1) : 0;
    var cx = ax + ex * t, cz = az + ez * t;
    var R = this.R[i];
    var lateral = (x - cx) * R.x + (z - cz) * R.z;
    out.index = i;
    out.t = t;
    out.lateral = lateral;
    out.arc = this.S[i] + t * this.ds;
    out.height = A.lerp(this.P[i].y, this.P[j].y, t) + lateral * R.y;
    out.normal.copy(this.U[i]).lerp(this.U[j], t).normalize();
    out.tangent.copy(this.T[i]).lerp(this.T[j], t).normalize();
    out.right.copy(R);
    out.onTrack = Math.abs(lateral) <= this.roadHalf;
    return out;
  };

  Track.prototype.distanceToTrack = function (x, z) {
    var N = this.N, best = Infinity;
    for (var i = 0; i < N; i += 2) {
      var dx = x - this.P[i].x, dz = z - this.P[i].z;
      var d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };

  /* 可见地表高度：与路面 / 路肩 / 缓冲区 / 地形四层网格保持一致 */
  Track.prototype.groundY = function (x, z) {
    var pr = this.projectGlobal(x, z, _proj);
    var lat = pr.lateral;
    var sgn = lat < 0 ? -1 : 1;
    var alat = Math.abs(lat);
    var i = pr.index, j = (i + 1) % this.N;
    var cy = A.lerp(this.P[i].y, this.P[j].y, pr.t);
    var ry = this.R[i].y;
    var edgeLat = this.roadHalf + this.kerbW;
    if (alat <= edgeLat) return cy + sgn * alat * ry;
    var edgeY = cy + sgn * edgeLat * ry;
    if (alat <= edgeLat + this.vergeW) {
      var p = this.P[i], r = this.R[i];
      var ox = p.x + r.x * sgn * (edgeLat + this.vergeW);
      var oz = p.z + r.z * sgn * (edgeLat + this.vergeW);
      return A.lerp(edgeY, this._terrainH(ox, oz), (alat - edgeLat) / this.vergeW);
    }
    return this._terrainH(x, z);
  };

  Track.prototype._addZone = function (x, z, r) {
    if (!this._zones) this._zones = [];
    this._zones.push({ x: x, z: z, r: r });
  };
  Track.prototype._nearZone = function (x, z, pad) {
    if (!this._zones) return false;
    for (var i = 0; i < this._zones.length; i++) {
      var zn = this._zones[i];
      var dx = x - zn.x, dz = z - zn.z;
      var rr = zn.r + (pad || 0);
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  };

  Track.prototype.posAt = function (i, lateral, out) {
    i = ((i % this.N) + this.N) % this.N;
    var p = this.P[i], r = this.R[i];
    lateral = lateral || 0;
    out.set(p.x + r.x * lateral, p.y + r.y * lateral, p.z + r.z * lateral);
    return out;
  };

  Track.prototype.indexAtArc = function (arc) {
    var a = ((arc % this.length) + this.length) % this.length;
    return a / this.ds;
  };

  Track.prototype.lineAt = function (fi, extra) {
    var N = this.N;
    var i0 = Math.floor(fi), f = fi - i0;
    i0 = ((i0 % N) + N) % N;
    var i1 = (i0 + 1) % N;
    var v = A.lerp(this.lineOffset[i0], this.lineOffset[i1], f) + (extra || 0);
    var maxL = this.roadHalf - 1.6;
    return A.clamp(v, -maxL, maxL);
  };

  Track.prototype.speedAt = function (fi) {
    var N = this.N;
    var i0 = Math.floor(fi) % N; if (i0 < 0) i0 += N;
    var i1 = (i0 + 1) % N;
    var f = fi - Math.floor(fi);
    return A.lerp(this.vProfile[i0], this.vProfile[i1], f);
  };

  /* 释放 GPU 资源 */
  Track.prototype.dispose = function () {
    this.group.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      var m = o.material;
      if (Array.isArray(m)) m.forEach(function (x) { if (x.map && x.map.dispose) x.map.dispose(); x.dispose(); });
      else if (m) { if (m.map && m.map.dispose) m.map.dispose(); m.dispose(); }
    });
    if (this.group.parent) this.group.parent.remove(this.group);
    if (this.groundMap && this.groundMap.dispose) this.groundMap.dispose();
    if (this.roadMap && this.roadMap.dispose) this.roadMap.dispose();
  };

  A.Track = Track;

})();
