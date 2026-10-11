/* ============================================================================
 * carmodel.js — 程序化写实车模
 *   用「沿车身长度方向放样截面」的方式生成车身：腰线以下一个放样体，
 *   座舱另做一个放样体（两端高度收到腰线 → 自然形成前后风挡倾角）。
 *   配合清漆材质（clearcoat）+ HDRI 反射，接近真车漆面质感。
 * ==========================================================================*/
(function () {
  'use strict';
  var A = window.APEX;

  /* ------------------------------------------------------------ 材质 --- */
  var MAT = {
    tire: new THREE.MeshStandardMaterial({ color: 0x131417, roughness: 0.95, metalness: 0.0 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xc4cad0, roughness: 0.22, metalness: 0.95, envMapIntensity: 1.2 }),
    rimDark: new THREE.MeshStandardMaterial({ color: 0x2a2d32, roughness: 0.35, metalness: 0.8 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x191b1e, roughness: 0.72, metalness: 0.12 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd6dbe0, roughness: 0.16, metalness: 1.0 }),
    interior: new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.85, metalness: 0.05 }),
    brake: new THREE.MeshStandardMaterial({ color: 0x6e7378, roughness: 0.45, metalness: 0.85 }),
    lightW: new THREE.MeshStandardMaterial({
      color: 0xdce8f5, emissive: 0xc8e4ff, emissiveIntensity: 0.5, roughness: 0.16, metalness: 0.25
    }),
    lightR: new THREE.MeshStandardMaterial({
      color: 0x4a0a12, emissive: 0xff2233, emissiveIntensity: 0.75, roughness: 0.22, metalness: 0.1
    })
  };
  function paintMat(color) {
    return new THREE.MeshPhysicalMaterial({
      color: color, metalness: 0.55, roughness: 0.30,
      clearcoat: 1.0, clearcoatRoughness: 0.055, envMapIntensity: 1.3
    });
  }
  function glassMat() {
    return new THREE.MeshPhysicalMaterial({
      color: 0x0d1216, metalness: 0.25, roughness: 0.05,
      transparent: true, opacity: 0.80, envMapIntensity: 1.7, side: THREE.DoubleSide
    });
  }
  A.carGlassMat = glassMat;
  A.carPaintMat = paintMat;

  /* --------------------------------------------------------- 车身样式 --- */
  /* u: 0 = 车尾, 1 = 车头。长度单位米，y 以地面为 0 */
  A.CAR_STYLES = {
    /* 电动轿车（特斯拉 Model 3 那种溜背） */
    ev_sedan: {
      L: 4.72, W: 1.85, H: 1.44, wb: 2.88, track: 1.58, wheelR: 0.335, wheelW: 0.235,
      yb: [[0, 0.50], [0.07, 0.28], [0.22, 0.22], [0.78, 0.22], [0.93, 0.28], [1, 0.48]],
      yd: [[0, 0.98], [0.07, 1.02], [0.22, 1.03], [0.40, 1.03], [0.62, 1.02], [0.78, 0.98], [0.90, 0.92], [1, 0.88]],
      wf: [[0, 0.80], [0.06, 0.93], [0.18, 0.99], [0.50, 1.0], [0.82, 0.99], [0.93, 0.94], [1, 0.86]],
      cabin: {
        u0: 0.30, u1: 0.76, roofH: 0.42,
        roof: [[0.30, 0.0], [0.35, 0.58], [0.42, 0.96], [0.62, 1.0], [0.70, 0.76], [0.76, 0.0]],
        wc: [[0.30, 0.86], [0.40, 0.94], [0.66, 0.94], [0.76, 0.84]]
      },
      face: 'ev', wing: false, spoiler: 'lip'
    },
    /* 电动 SUV（Model Y 那种） */
    ev_suv: {
      L: 4.78, W: 1.94, H: 1.62, wb: 2.89, track: 1.63, wheelR: 0.365, wheelW: 0.25,
      yb: [[0, 0.58], [0.07, 0.34], [0.22, 0.28], [0.78, 0.28], [0.93, 0.34], [1, 0.56]],
      yd: [[0, 1.10], [0.07, 1.16], [0.22, 1.18], [0.40, 1.18], [0.62, 1.17], [0.78, 1.12], [0.90, 1.04], [1, 1.00]],
      wf: [[0, 0.82], [0.06, 0.94], [0.18, 0.99], [0.50, 1.0], [0.82, 1.0], [0.93, 0.96], [1, 0.88]],
      cabin: {
        u0: 0.28, u1: 0.84, roofH: 0.44,
        roof: [[0.28, 0.0], [0.34, 0.60], [0.42, 0.96], [0.64, 1.0], [0.76, 0.80], [0.84, 0.0]],
        wc: [[0.28, 0.88], [0.40, 0.95], [0.70, 0.95], [0.84, 0.86]]
      },
      face: 'ev', wing: false, spoiler: 'lip'
    },
    /* 中置跑车 */
    coupe: {
      L: 4.52, W: 1.96, H: 1.24, wb: 2.62, track: 1.66, wheelR: 0.345, wheelW: 0.275,
      yb: [[0, 0.34], [0.07, 0.20], [0.22, 0.15], [0.78, 0.15], [0.93, 0.20], [1, 0.32]],
      yd: [[0, 0.84], [0.07, 0.90], [0.22, 0.92], [0.40, 0.92], [0.58, 0.90], [0.74, 0.82], [0.88, 0.72], [1, 0.66]],
      wf: [[0, 0.84], [0.06, 0.95], [0.20, 1.0], [0.50, 1.0], [0.80, 0.99], [0.93, 0.92], [1, 0.80]],
      cabin: {
        u0: 0.30, u1: 0.70, roofH: 0.36,
        roof: [[0.30, 0.0], [0.36, 0.66], [0.44, 0.98], [0.58, 1.0], [0.66, 0.72], [0.70, 0.0]],
        wc: [[0.30, 0.82], [0.40, 0.90], [0.58, 0.90], [0.70, 0.80]]
      },
      face: 'sport', wing: true, spoiler: null
    },
    /* 钢炮掀背 */
    hatch: {
      L: 4.12, W: 1.78, H: 1.46, wb: 2.60, track: 1.53, wheelR: 0.315, wheelW: 0.22,
      yb: [[0, 0.48], [0.07, 0.28], [0.22, 0.22], [0.78, 0.22], [0.93, 0.28], [1, 0.46]],
      yd: [[0, 1.06], [0.06, 1.09], [0.22, 1.10], [0.42, 1.09], [0.62, 1.07], [0.78, 1.02], [0.90, 0.94], [1, 0.88]],
      wf: [[0, 0.84], [0.07, 0.94], [0.20, 0.99], [0.50, 1.0], [0.80, 0.98], [0.93, 0.92], [1, 0.82]],
      cabin: {
        u0: 0.18, u1: 0.74, roofH: 0.42,
        roof: [[0.18, 0.0], [0.24, 0.66], [0.32, 1.0], [0.58, 1.0], [0.68, 0.76], [0.74, 0.0]],
        wc: [[0.18, 0.88], [0.30, 0.94], [0.62, 0.94], [0.74, 0.84]]
      },
      face: 'sport', wing: false, spoiler: 'roof'
    },
    /* 皮卡（u=0 是货箱尾门，u=1 是车头） */
    pickup: {
      L: 5.42, W: 2.03, H: 1.90, wb: 3.34, track: 1.70, wheelR: 0.395, wheelW: 0.285,
      yb: [[0, 0.66], [0.07, 0.42], [0.22, 0.36], [0.78, 0.36], [0.93, 0.42], [1, 0.64]],
      yd: [[0, 1.00], [0.10, 1.02], [0.22, 1.06], [0.34, 1.12], [0.50, 1.14], [0.60, 1.10], [0.68, 1.06], [0.82, 1.06], [1, 1.08]],
      wf: [[0, 0.88], [0.07, 0.96], [0.20, 1.0], [0.50, 1.0], [0.80, 1.0], [0.93, 0.96], [1, 0.90]],
      cabin: {
        u0: 0.34, u1: 0.62, roofH: 0.78,
        roof: [[0.34, 0.0], [0.40, 0.62], [0.45, 0.98], [0.54, 1.0], [0.58, 0.80], [0.62, 0.0]],
        wc: [[0.34, 0.88], [0.42, 0.94], [0.54, 0.94], [0.62, 0.86]]
      },
      face: 'truck', wing: false, spoiler: null
    }
  };

  /* --------------------------------------------------------- 几何工具 --- */
  /* 车身下半部截面（底部中心 → 右侧 → 顶面中心）。侧面保持较直，才像真车 */
  function bodyHalfSection(w, yb, yd) {
    var h = Math.max(yd - yb, 0.02);
    return [
      [0, yb],
      [w * 0.62, yb],
      [w * 0.90, yb + h * 0.09],
      [w * 0.985, yb + h * 0.26],
      [w * 1.0, yb + h * 0.62],
      [w * 0.94, yd - h * 0.07],
      [w * 0.60, yd],
      [0, yd]
    ];
  }
  /* 轮拱：在前后轮位置把车身底面抬起来，让轮子露出来（相当于挖轮眉） */
  function archBump(u, wb, L, wheelR) {
    var uF = 0.5 + (wb * 0.5) / L, uR = 0.5 - (wb * 0.5) / L;
    var span = (wheelR + 0.05) / L;
    var peak = wheelR + 0.17;
    var b = 0;
    var dF = Math.abs(u - uF) / span;
    if (dF < 1) b = peak * (1 - dF * dF);
    var dR = Math.abs(u - uR) / span;
    if (dR < 1) b = Math.max(b, peak * (1 - dR * dR));
    return b;
  }
  /* 座舱截面（腰线 → 车顶中心） */
  function cabinHalfSection(wc, yb, yt) {
    var h = Math.max(yt - yb, 0.004);
    return [
      [wc, yb],
      [wc * 0.97, yb + h * 0.34],
      [wc * 0.85, yb + h * 0.80],
      [wc * 0.50, yt],
      [0, yt]
    ];
  }
  /* 把「右半 + 中心点」的截面镜像成闭合环 */
  function closeLoop(half) {
    var out = [], n = half.length, i;
    for (i = 0; i < n; i++) out.push([half[i][0], half[i][1]]);
    for (i = n - 2; i >= 1; i--) out.push([-half[i][0], half[i][1]]);
    return out;
  }
  /* 放样：stations = [{z, pts:[[x,y],...]}] */
  function loft(stations, capBoth) {
    var n = stations[0].pts.length, m = stations.length;
    var pos = [], idx = [], i, j;
    for (i = 0; i < m; i++) {
      var st = stations[i];
      for (j = 0; j < n; j++) pos.push(st.pts[j][0], st.pts[j][1], st.z);
    }
    for (i = 0; i < m - 1; i++) {
      var a = i * n, b = (i + 1) * n;
      for (j = 0; j < n; j++) {
        var j2 = (j + 1) % n;
        idx.push(a + j, a + j2, b + j);
        idx.push(a + j2, b + j2, b + j);
      }
    }
    if (capBoth) {
      var c0 = 0, c1 = 0, k;
      for (k = 0; k < n; k++) { c0 += stations[0].pts[k][0]; c1 += stations[0].pts[k][1]; }
      pos.push(c0 / n, c1 / n, stations[0].z);
      var i0 = m * n;
      for (k = 0; k < n; k++) idx.push(i0, (k + 1) % n, k);
      var c2 = 0, c3 = 0;
      for (k = 0; k < n; k++) { c2 += stations[m - 1].pts[k][0]; c3 += stations[m - 1].pts[k][1]; }
      pos.push(c2 / n, c3 / n, stations[m - 1].z);
      var i1 = i0 + 1, base = (m - 1) * n;
      for (k = 0; k < n; k++) idx.push(i1, base + k, base + (k + 1) % n);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  /* -------------------------------------------------------------- 车轮 --- */
  function makeWheel(R, W, rimDark) {
    var g = new THREE.Group();
    var hw = W / 2;
    var prof = [
      new THREE.Vector2(R * 0.70, -hw),
      new THREE.Vector2(R * 0.95, -hw),
      new THREE.Vector2(R, -hw * 0.55),
      new THREE.Vector2(R, hw * 0.55),
      new THREE.Vector2(R * 0.95, hw),
      new THREE.Vector2(R * 0.70, hw)
    ];
    var tire = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), MAT.tire);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    g.add(tire);

    var rimMat = rimDark ? MAT.rimDark : MAT.rim;
    var barrel = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.70, R * 0.70, W * 0.86, 20), rimMat);
    barrel.rotation.z = Math.PI / 2;
    g.add(barrel);
    var face = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.70, R * 0.66, 0.03, 20), rimMat);
    face.rotation.z = Math.PI / 2;
    face.position.x = hw * 0.88;
    g.add(face);
    for (var i = 0; i < 6; i++) {
      var sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, R * 1.26, 0.065), rimMat);
      sp.rotation.x = (i / 6) * Math.PI;
      sp.position.x = hw * 0.92;
      g.add(sp);
    }
    var disc = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.56, R * 0.56, 0.03, 18), MAT.brake);
    disc.rotation.z = Math.PI / 2;
    disc.position.x = -hw * 0.30;
    g.add(disc);
    var cal = new THREE.Mesh(new THREE.BoxGeometry(0.06, R * 0.52, 0.16), MAT.trim);
    cal.position.set(-hw * 0.30, R * 0.42, -R * 0.42);
    g.add(cal);
    return g;
  }

  /* ---------------------------------------------------------- 构建整车 --- */
  var BODY_STATIONS = 30, CABIN_STATIONS = 18;

  A.buildProceduralCar = function (spec, tint) {
    var st = A.CAR_STYLES[spec.style || spec.fallbackStyle];
    if (!st) st = A.CAR_STYLES.ev_sedan;

    var root = new THREE.Group();
    var bodyPivot = new THREE.Group();
    root.add(bodyPivot);

    var L = st.L, halfW = st.W / 2, R = st.wheelR, WW = st.wheelW;
    var zBack = -L / 2, zFront = L / 2;
    var roofTop = 0;
    var i, u, z;

    /* ---- 车身 ---- */
    var bodyStations = [];
    for (i = 0; i < BODY_STATIONS; i++) {
      u = i / (BODY_STATIONS - 1);
      z = zBack + u * L;
      var w = halfW * A.sampleKeys(st.wf, u);
      var yb = A.sampleKeys(st.yb, u);
      /* 轮拱处抬高底面 */
      yb = Math.max(yb, archBump(u, st.wb, L, R));
      var yd = A.sampleKeys(st.yd, u);
      /* 腰线必须高于底面 */
      if (yd < yb + 0.16) yd = yb + 0.16;
      bodyStations.push({ z: z, pts: closeLoop(bodyHalfSection(w, yb, yd)) });
    }
    var bodyMesh = new THREE.Mesh(loft(bodyStations, true), paintMat(tint === undefined ? 0xffffff : tint));
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    bodyPivot.add(bodyMesh);

    /* ---- 座舱（玻璃） ---- */
    var c0 = st.cabin.u0, c1 = st.cabin.u1;
    var cabStations = [], innerStations = [];
    for (i = 0; i < CABIN_STATIONS; i++) {
      var cu = c0 + (i / (CABIN_STATIONS - 1)) * (c1 - c0);
      z = zBack + cu * L;
      var belt = A.sampleKeys(st.yd, cu);
      var rf = A.sampleKeys(st.cabin.roof, cu);
      var yt = belt + rf * st.cabin.roofH;
      if (yt > roofTop) roofTop = yt;
      var wc = halfW * A.sampleKeys(st.cabin.wc, cu) * 0.90;
      cabStations.push({ z: z, pts: closeLoop(cabinHalfSection(wc, belt - 0.06, yt)) });
      /* 内衬（深色），让玻璃有厚度感 */
      var iw = wc * 0.90;
      innerStations.push({ z: z, pts: closeLoop(cabinHalfSection(iw, belt - 0.02, Math.max(yt - 0.05, belt + 0.02))) });
    }
    var innerMesh = new THREE.Mesh(loft(innerStations, true), MAT.interior);
    bodyPivot.add(innerMesh);
    var cabMesh = new THREE.Mesh(loft(cabStations, true), glassMat());
    cabMesh.renderOrder = 2;
    bodyPivot.add(cabMesh);

    /* ---- 前后灯 ---- */
    var frontY = A.sampleKeys(st.yd, 1) - 0.16;
    var rearY = A.sampleKeys(st.yd, 0) - 0.14;
    var frontW = halfW * A.sampleKeys(st.wf, 1);
    var rearW = halfW * A.sampleKeys(st.wf, 0);

    var hl = new THREE.BoxGeometry(0.36, 0.10, 0.10);
    for (var sgn = -1; sgn <= 1; sgn += 2) {
      var lm = new THREE.Mesh(hl, MAT.lightW);
      lm.position.set(sgn * frontW * 0.66, frontY, zFront - 0.07);
      bodyPivot.add(lm);
    }
    /* 贯穿式尾灯 */
    var tl = new THREE.Mesh(new THREE.BoxGeometry(rearW * 1.72, 0.085, 0.07), MAT.lightR);
    tl.position.set(0, rearY, zBack + 0.05);
    bodyPivot.add(tl);
    for (var sgn2 = -1; sgn2 <= 1; sgn2 += 2) {
      var ts = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.07), MAT.lightR);
      ts.position.set(sgn2 * rearW * 0.84, rearY + 0.06, zBack + 0.05);
      bodyPivot.add(ts);
    }

    /* ---- 前脸 ---- */
    var ybFront = A.sampleKeys(st.yb, 1);
    if (st.face === 'grille' || st.face === 'sport' || st.face === 'truck') {
      var gW = frontW * (st.face === 'truck' ? 1.5 : 1.25);
      var grille = new THREE.Mesh(new THREE.BoxGeometry(gW, 0.20, 0.09), MAT.trim);
      grille.position.set(0, ybFront + 0.20, zFront - 0.05);
      bodyPivot.add(grille);
    }
    /* 下唇 / 侧裙 */
    var skirtL = L * 0.62;
    for (var sg3 = -1; sg3 <= 1; sg3 += 2) {
      var skirt = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.10, skirtL), MAT.trim);
      skirt.position.set(sg3 * halfW * 0.985, A.sampleKeys(st.yb, 0.5) + 0.05, 0);
      bodyPivot.add(skirt);
    }
    var lip = new THREE.Mesh(new THREE.BoxGeometry(frontW * 1.5, 0.07, 0.16), MAT.trim);
    lip.position.set(0, ybFront + 0.04, zFront - 0.10);
    bodyPivot.add(lip);

    /* ---- 后视镜 ---- */
    var mirZ = zBack + (c0 + 0.02) * L;
    var mirY = A.sampleKeys(st.yd, c0 + 0.02) + 0.06;
    for (var sg4 = -1; sg4 <= 1; sg4 += 2) {
      var stalk = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.05), MAT.trim);
      stalk.position.set(sg4 * (halfW * 0.98 + 0.05), mirY, mirZ);
      bodyPivot.add(stalk);
      var mir = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.10, 0.20), paintMat(tint === undefined ? 0xffffff : tint));
      mir.position.set(sg4 * (halfW * 0.98 + 0.12), mirY + 0.01, mirZ - 0.02);
      bodyPivot.add(mir);
    }

    /* ---- 尾翼 / 小鸭尾 ---- */
    if (st.wing) {
      var wingW = rearW * 1.85;
      var wingY = A.sampleKeys(st.yd, 0.06) + 0.20;
      var blade = new THREE.Mesh(new THREE.BoxGeometry(wingW, 0.05, 0.34), MAT.trim);
      blade.position.set(0, wingY, zBack + 0.16);
      blade.rotation.x = -0.10;
      blade.castShadow = true;
      bodyPivot.add(blade);
      for (var sg5 = -1; sg5 <= 1; sg5 += 2) {
        var stay = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.20, 0.22), MAT.trim);
        stay.position.set(sg5 * wingW * 0.36, wingY - 0.11, zBack + 0.14);
        bodyPivot.add(stay);
      }
    } else if (st.spoiler === 'lip') {
      var lip2 = new THREE.Mesh(new THREE.BoxGeometry(rearW * 1.6, 0.045, 0.16), MAT.trim);
      lip2.position.set(0, A.sampleKeys(st.yd, 0.03) + 0.02, zBack + 0.06);
      bodyPivot.add(lip2);
    } else if (st.spoiler === 'roof') {
      var roofSpoiler = new THREE.Mesh(new THREE.BoxGeometry(halfW * 1.55, 0.06, 0.22), paintMat(tint === undefined ? 0xffffff : tint));
      roofSpoiler.position.set(0, A.sampleKeys(st.yd, c1 - 0.01) + st.cabin.roofH * 0.92, zBack + c1 * L);
      bodyPivot.add(roofSpoiler);
    }

    /* ---- 轮眉 ---- */
    var archR = R + 0.115;
    for (var sx = -1; sx <= 1; sx += 2) {
      for (var sz = -1; sz <= 1; sz += 2) {
        var arch = new THREE.Mesh(new THREE.TorusGeometry(archR, 0.055, 5, 16, Math.PI * 1.12), MAT.trim);
        arch.rotation.z = -0.26;
        arch.position.set(sx * (st.track / 2 + WW * 0.44), R + 0.01, sz * st.wb / 2);
        bodyPivot.add(arch);
      }
    }

    /* ---- 车轮 ---- */
    var wheels = [];
    for (var sx2 = -1; sx2 <= 1; sx2 += 2) {
      for (var sz2 = -1; sz2 <= 1; sz2 += 2) {
        var isFront = sz2 > 0;
        var px = sx2 * st.track / 2, pz = sz2 * st.wb / 2;
        var pivot = new THREE.Group();
        pivot.position.set(px, R, pz);
        root.add(pivot);
        var wheelMesh = makeWheel(R, WW, st.face === 'sport' && isFront);
        pivot.add(wheelMesh);
        wheels.push({
          pivot: pivot, mesh: wheelMesh, front: isFront, left: sx2 < 0,
          radius: R, baseZ: pz, baseX: px
        });
      }
    }

    return {
      root: root,
      bodyPivot: bodyPivot,
      wheels: wheels,
      wheelRadius: R,
      scale: 1,
      length: L,
      width: st.W,
      height: roofTop,
      wheelBaseZ: { f: st.wb / 2, b: -st.wb / 2 },
      halfWidth: halfW,
      procedural: true
    };
  };

})();
