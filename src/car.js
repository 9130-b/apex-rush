/* ============================================================================
 * car.js — 赛车（视觉 + 街机物理）
 * ==========================================================================*/
(function () {
  'use strict';
  var A = window.APEX;
  var UP = new THREE.Vector3(0, 1, 0);

  /* ------------------------------------------------------------ 车辆数据 ---
     style 对应 carmodel.js 里的程序化车身；有 file 的走 GLB 模型 */
  A.CAR_SPECS = [
    {
      id: 'volt3', name: 'VOLT 3', tag: '电动轿车', style: 'ev_sedan', paint: 0xe9edf1,
      length: 4.72, accel: 10.4, vMax: 78, aLat: 26, grip: 7.8, brake: 25,
      stats: [4, 4, 4]
    },
    {
      id: 'volty', name: 'VOLT Y', tag: '电动 SUV', style: 'ev_suv', paint: 0x2c3c4e,
      length: 4.78, accel: 9.4, vMax: 72, aLat: 23.5, grip: 7.2, brake: 24,
      stats: [3, 4, 3]
    },
    {
      id: 'apexgt', name: 'APEX GT', tag: '中置跑车', style: 'coupe', paint: 0xd6392a,
      length: 4.52, accel: 11.0, vMax: 84, aLat: 28, grip: 8.2, brake: 26,
      stats: [5, 5, 5]
    },
    {
      id: 'minxgti', name: 'MINX GTI', tag: '钢炮掀背', style: 'hatch', paint: 0x2f80d2,
      length: 4.12, accel: 8.8, vMax: 68, aLat: 26.5, grip: 8.0, brake: 23,
      stats: [3, 3, 5]
    },
    {
      id: 'sable', name: 'SABLE RS', tag: '运动轿车', style: 'ev_sedan', paint: 0x1c1e23,
      length: 4.72, accel: 9.6, vMax: 74, aLat: 24.5, grip: 7.4, brake: 24,
      stats: [4, 3, 4]
    },
    {
      id: 'brute', name: 'BRUTE 4X4', tag: '皮卡', style: 'pickup', paint: 0x596068,
      length: 5.42, accel: 7.2, vMax: 58, aLat: 19, grip: 6.6, brake: 21,
      stats: [2, 2, 2]
    },
    {
      id: 'ferrari', file: 'ferrari.glb', name: 'F8 SPIDER', tag: '超跑', heavy: true,
      fallbackStyle: 'coupe',
      length: 4.60, accel: 11.6, vMax: 88, aLat: 29, grip: 8.4, brake: 27,
      stats: [5, 5, 5], tint: 0xffffff,
      hideNodes: [
        'interior_light', 'interior_dark', 'leather', 'carpet', 'carbon_fibre_trim', 'carbon fibre',
        'steering_wheel', 'steering_carbon', 'steering_centre', 'steering_column',
        'steering_leather', 'steering_metal', 'steering_red_lights', 'steering_trim', 'wipers'
      ]
    },
    {
      id: 'kart-ooli', file: 'kart-ooli.glb', name: 'KART OOLI', tag: '卡丁车',
      length: 2.60, accel: 6.5, vMax: 44, aLat: 30, grip: 8.8, brake: 20,
      stats: [1, 1, 5]
    }
  ];

  /* AI 车漆（乘算着色） */
  A.AI_TINTS = [
    0xff5566, 0x4d9bff, 0xffd34d, 0x7dff8f, 0xff8a3d, 0xc07dff, 0x3de8ff, 0xffffff
  ];

  /* ------------------------------------------------------ 程序化兜底车模 --- */
  function buildFallbackCar(spec) {
    var g = new THREE.Group();
    var L = spec.length, W = L * 0.28, H = L * 0.20;
    var paint = new THREE.MeshStandardMaterial({ color: 0xe03a3a, roughness: 0.35, metalness: 0.35 });
    var glass = new THREE.MeshStandardMaterial({ color: 0x121820, roughness: 0.12, metalness: 0.6 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.85 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.7, L), paint);
    body.position.y = H * 0.72;
    g.add(body);
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, H * 0.62, L * 0.44), glass);
    cabin.position.set(0, H * 1.28, -L * 0.04);
    g.add(cabin);
    var wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    var wb = L * 0.31, tr = W * 0.54;
    for (var sx = -1; sx <= 1; sx += 2) {
      for (var sz = -1; sz <= 1; sz += 2) {
        var w = new THREE.Mesh(wheelGeo, dark);
        w.position.set(sx * tr, 0.34, sz * wb);
        w.castShadow = true;
        g.add(w);
      }
    }
    body.castShadow = true; cabin.castShadow = true;
    g.userData.fallback = true;
    return { root: g, wheels: [], bodyPivot: null, length: L, width: W, wheelRadius: 0.34, modelLength: L };
  }

  /* -------------------------------------------------------------- 载入器 --- */
  var _modelCache = {};

  A.loadCarModel = function (spec) {
    if (_modelCache[spec.id]) return Promise.resolve(_modelCache[spec.id]);
    return A.loadGLTF('assets/models/' + spec.file, spec.id).then(function (gltf) {
      _modelCache[spec.id] = gltf;
      return gltf;
    });
  };

  /* 由 GLTF 场景构建一辆可动车的实例 */
  A.buildCarVisual = function (gltf, spec, tint, colormap) {
    var src = gltf.scene || gltf.scenes[0];
    var root = src.clone(true);

    /* 隐藏不需要的节点（例如超跑模型里看不见的内饰） */
    if (spec.hideNodes) {
      root.traverse(function (o) {
        if (o.name && spec.hideNodes.indexOf(o.name) >= 0) o.visible = false;
      });
    }
    /* 高面数模型只让车身/玻璃/轮子投影，省一半以上的阴影开销 */
    var shadowRe = /body|glass|wheel|tire|rim|trim/i;
    root.traverse(function (o) {
      if (!o.isMesh) return;
      if (spec.heavy) o.castShadow = !!shadowRe.test(o.name || '');
      else o.castShadow = true;
      o.receiveShadow = true;
    });

    /* 材质独立化 + 着色 */
    var matMap = new Map();
    root.traverse(function (o) {
      if (!o.isMesh) return;
      var apply = function (m) {
        if (matMap.has(m)) return matMap.get(m);
        var c = m.clone();
        c.roughness = 0.48;
        c.metalness = 0.06;
        c.envMapIntensity = 1.05;
        c.side = THREE.DoubleSide;
        /* 统一使用显式载入的贴图集，避免依赖 glTF 的相对路径解析 */
        if (colormap) c.map = colormap;
        if (c.map) c.map.anisotropy = A.maxAniso;
        c.color = new THREE.Color(tint === undefined ? 0xffffff : tint);
        matMap.set(m, c);
        return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(apply) : apply(o.material);
    });

    /* 分离轮子与车身 */
    var wheelNodes = [];
    root.traverse(function (o) {
      if (o.isMesh && o.visible !== false && /^wheel[-_]/i.test(o.name)) wheelNodes.push(o);
    });

    var wheels = [];
    var wheelRadius = 0.3, wheelBaseZ = { f: 0, b: 0 }, trackX = 0;

    for (var i = 0; i < wheelNodes.length; i++) {
      var wn = wheelNodes[i];
      var nm = wn.name.toLowerCase();
      /* 几何半径 */
      wn.geometry.computeBoundingBox();
      var bb = wn.geometry.boundingBox;
      var rad = (bb.max.y - bb.min.y) / 2;
      wheelRadius = rad;

      /* 用 pivot 包一层，便于转向 */
      var parent = wn.parent;
      var pivot = new THREE.Group();
      pivot.position.copy(wn.position);
      parent.add(pivot);
      pivot.add(wn);
      wn.position.set(0, 0, 0);

      var isFront = /front/.test(nm);
      var isLeft = /left/.test(nm);
      if (isFront) wheelBaseZ.f = Math.max(wheelBaseZ.f, pivot.position.z);
      else wheelBaseZ.b = Math.min(wheelBaseZ.b, pivot.position.z);
      trackX = Math.max(trackX, Math.abs(pivot.position.x));

      wheels.push({
        pivot: pivot, mesh: wn, front: isFront, left: isLeft,
        radius: rad, baseZ: pivot.position.z, baseX: pivot.position.x
      });
    }

    /* 车身单独一层，用于加减速俯仰与侧倾 */
    var bodyPivot = new THREE.Group();
    root.add(bodyPivot);
    var bodyNode = null;
    for (var c = root.children.length - 1; c >= 0; c--) {
      var ch = root.children[c];
      if (ch === bodyPivot) continue;
      if (ch.isMesh && /^wheel-/i.test(ch.name)) continue;
      if (ch.isGroup && ch.children.some(function (x) { return /^wheel-/i.test(x.name); })) continue;
      if (!bodyNode) { bodyNode = ch; }
    }
    if (bodyNode) bodyPivot.add(bodyNode);

    /* 整体尺寸 → 缩放到目标车长 */
    var box = new THREE.Box3().setFromObject(root);
    var modelLength = Math.max(box.max.z - box.min.z, 0.001);
    var scale = spec.length / modelLength;

    return {
      root: root,
      bodyPivot: bodyPivot,
      wheels: wheels,
      wheelRadius: wheelRadius * scale,
      scale: scale,
      length: spec.length,
      width: (box.max.x - box.min.x) * scale,
      height: (box.max.y - box.min.y) * scale,
      wheelBaseZ: wheelBaseZ,
      halfWidth: Math.max(0.9, (box.max.x - box.min.x) * scale * 0.5)
    };
  };

  /* ============================================================== Car ===== */
  function Car(spec, opts) {
    opts = opts || {};
    this.spec = spec;
    this.isPlayer = !!opts.isPlayer;
    this.name = opts.name || spec.name;
    this.tint = opts.tint === undefined ? 0xffffff : opts.tint;

    /* 物理状态 */
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.steer = 0;
    this.yawRate = 0;
    this.speed = 0;         /* 前向速度 */
    this.slip = 0;          /* 侧滑角（弧度） */
    this.rpm = 0.15;
    this.gear = 1;
    this.wheelSpin = 0;
    this.hint = 0;          /* 赛道索引缓存 */
    this.proj = null;
    this.onTrack = true;
    this.lateral = 0;
    this.arc = 0;
    this.lap = 0;
    this.sector = 0;
    this.progress = 0;
    this.prevArc = 0;
    this.lapStarted = false;
    this.radius = 0.95;
    this.finished = false;
    this.finishTime = 0;
    this.lapTimes = [];
    this.lapStart = 0;
    this.bestLap = Infinity;
    this.lastLap = 0;
    this.totalTime = 0;
    this.wrongWayT = 0;
    this.driftT = 0;
    this.driftScore = 0;
    this.shake = 0;
    this.impactCd = 0;
    this.rollVisual = 0;
    this.pitchVisual = 0;
    this.airborne = false;

    /* 三维对象 */
    this.group = new THREE.Group();
    this.group.name = 'car-' + spec.id;
    this.group.matrixAutoUpdate = true;
    this.visual = null;
    this.wheels = [];
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    /* 每辆车独立的投影结果，避免多车共用同一对象互相覆盖 */
    this.projObj = A.newProjection();
  }

  Car.prototype.attachVisual = function (vis) {
    this.visual = vis;
    this.wheels = vis.wheels;
    vis.root.scale.setScalar(vis.scale);
    this.group.add(vis.root);
    /* 车头方向对齐（模型均为 +Z 朝前，这里做个兜底判断） */
    if (vis.wheelBaseZ && vis.wheelBaseZ.f < vis.wheelBaseZ.b) {
      vis.root.rotation.y = Math.PI;
    }
    this.radius = Math.max(0.9, vis.halfWidth);
  };

  Car.prototype.attachFallback = function (vis) {
    this.attachVisual(vis);
  };

  /* 放到赛道上的指定位置 */
  Car.prototype.placeAt = function (track, index, lateral) {
    track.posAt(index, lateral, this.pos);
    this.hint = ((index % track.N) + track.N) % track.N;
    var t = track.T[this.hint];
    this.yaw = Math.atan2(t.x, t.z);
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.lap = 0;
    this.sector = 0;
    this.progress = 0;
    this.lapStart = 0;
    this.arc = track.S[this.hint];
    this.proj = track.project(this.pos.x, this.pos.z, this.hint, this.projObj);
    /* 发车位在起点线之后，进度记为负数，保证名次计算正确 */
    this.sector = Math.floor(this.hint / (track.N / 4)) % 4;
    this.prevArc = this.arc;
    this.progress = -(track.length - this.arc);
    this.lapStarted = false;
    this.lapTimes = [];
    this.bestLap = Infinity;
    this.lastLap = 0;
    this.totalTime = 0;
    this.finished = false;
    this.finishTime = 0;
    this.driftScore = 0;
    this.wrongWayT = 0;
    this.shake = 0;
  };

  /* --------------------------------------------------------------- 物理 --- */
  var _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _v = new THREE.Vector3();

  Car.prototype.update = function (dt, input, track, world) {
    var spec = this.spec;

    /* --- 赛道投影 --- */
    var pr = track.project(this.pos.x, this.pos.z, this.hint, this.projObj);
    this.proj = pr;
    this.hint = pr.index;
    this.lateral = pr.lateral;
    this.arc = pr.arc;
    var offTrack = Math.abs(pr.lateral) > track.roadHalf + track.kerbW * 0.6;
    this.onTrack = !offTrack;
    var surface = offTrack ? (Math.abs(pr.lateral) > track.roadHalf + 6 ? 0.58 : 0.80) : 1.0;

    /* --- 输入平滑 --- */
    var throttle = input.throttle, brake = input.brake, steerIn = input.steer;
    var handbrake = input.handbrake && this.speed > 3;

    /* --- 转向 ---
       目标偏航角速度受两重物理限制：
         · 最小转弯半径（低速打满方向，R ≈ 6.5m）
         · 侧向抓地上限 a_lat = v²/R  →  高速自然转向不足
       speedAtten 让车越慢转向越钝，避免静止时原地打转。 */
    var spd = Math.abs(this.speed);
    var speedAtten = 1 / (1 + Math.pow(spd / 34, 1.15));
    var yawGeo = spd / 6.5;
    var yawGrip = (spec.aLat * surface) / Math.max(spd, 5);
    var yawLimit = Math.min(yawGeo, yawGrip);
    var targetYaw = steerIn * 2.0 * speedAtten;
    if (targetYaw > yawLimit) targetYaw = yawLimit;
    else if (targetYaw < -yawLimit) targetYaw = -yawLimit;
    this.yawRate = A.damp(this.yawRate, targetYaw, handbrake ? 18 : 14, dt);
    if (this.speed < -0.4) this.yawRate = -this.yawRate;   /* 倒车时反向 */
    this.yaw -= this.yawRate * dt;
    this.steer = A.damp(this.steer, steerIn * 0.52, 16, dt);

    /* --- 车体坐标分解 --- */
    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _right.crossVectors(_fwd, UP);
    var vLong = this.vel.dot(_fwd);
    var vLat = this.vel.dot(_right);

    /* --- 侧向抓地 --- */
    var gripK = spec.grip * (handbrake ? 0.30 : 1.0) * (0.55 + 0.45 * surface);
    vLat *= Math.exp(-gripK * dt);

    /* --- 纵向 --- */
    var vRatio = A.clamp(Math.abs(vLong) / spec.vMax, 0, 1);
    var drive = 0, braking = 0;
    if (throttle > 0) {
      if (vLong < -0.5) { braking = spec.brake; vLong += spec.brake * throttle * dt; }
      /* 功率随速度平方衰减，vMax 处推力归零 */
      else drive = throttle * spec.accel * surface * (1 - vRatio * vRatio);
    }
    if (brake > 0) {
      if (vLong > 0.6) { braking = spec.brake * brake; vLong -= spec.brake * brake * dt; }
      else drive = -spec.accel * 0.55 * brake;   /* 倒车 */
    }
    vLong += drive * dt;

    /* 空气阻力 */
    vLong -= 0.00020 * vLong * Math.abs(vLong) * dt;
    /* 松油门时的滑行阻力（含出界的草地阻力） */
    if (throttle === 0 && brake === 0) {
      var coast = offTrack ? 5.5 : 1.4;
      vLong -= A.sign(vLong) * Math.min(coast * dt, Math.abs(vLong));
    }
    if (offTrack) vLong -= vLong * 0.9 * dt;
    if (handbrake) vLong -= A.sign(vLong) * 12 * dt;
    if (Math.abs(vLong) < 0.12 && throttle === 0) vLong = 0;

    /* --- 侧滑角 --- */
    this.slip = Math.atan2(vLat, Math.max(Math.abs(vLong), 1.2));
    this.speed = vLong;

    /* --- 合成速度 --- */
    this.vel.copy(_fwd).multiplyScalar(vLong).addScaledVector(_right, vLat);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    /* --- 护栏碰撞 --- */
    var wallLimit = track.wallAt - (this.radius || 0.95) * 0.85;
    var newPr = track.project(this.pos.x, this.pos.z, this.hint, this.projObj);
    var over = 0;
    if (newPr.lateral > wallLimit) over = wallLimit - newPr.lateral;
    else if (newPr.lateral < -wallLimit) over = -wallLimit - newPr.lateral;
    if (over !== 0) {
      var R = newPr.right;
      this.pos.x += R.x * over;
      this.pos.z += R.z * over;
      var vOut = this.vel.x * R.x + this.vel.z * R.z;
      if ((over > 0 && vOut < 0) || (over < 0 && vOut > 0)) {
        /* 已朝墙外运动：反弹 */
        var impact = Math.abs(vOut);
        this.vel.x -= R.x * vOut * 1.45;
        this.vel.z -= R.z * vOut * 1.45;
        /* 摩擦损失 */
        this.vel.multiplyScalar(0.88);
        if (impact > 2.2 && this.impactCd <= 0) {
          this.impactCd = 0.25;
          this.shake = Math.min(1, impact / 22);
          if (world && world.onImpact) world.onImpact(this, impact);
        }
      } else {
        this.vel.x -= R.x * vOut;
        this.vel.z -= R.z * vOut;
      }
      this.pos.y = newPr.height;
      /* 重新分解，保持速度连续 */
      vLong = this.vel.dot(_fwd);
      this.speed = vLong;
    }

    /* --- 贴地 --- */
    var prFinal = over !== 0 ? track.project(this.pos.x, this.pos.z, this.hint, this.projObj) : newPr;
    this.proj = prFinal;
    this.lateral = prFinal.lateral;
    this.arc = prFinal.arc;
    var surfY = prFinal.height;
    this.pos.y = surfY;

    /* --- 姿态 ---
       模型局部 +X 是车身左侧（左侧车轮在 +x），所以基向量顺序必须是
       (left, up, front) 才构成右手系。若写成 fwd × up，得到的矩阵行列式为 -1，
       是一个镜像矩阵，setFromRotationMatrix 会退化成非单位四元数 —— 车会
       既不正对前进方向、又被整体缩放。 */
    var up = prFinal.normal;
    if (!this.onTrack) {
      /* 出界后逐步回正 */
      up = this._tmp.copy(UP).lerp(prFinal.normal, A.smoothstep(12, 3, Math.abs(prFinal.lateral))).normalize();
    }
    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    var flat = this._tmp2.copy(up).multiplyScalar(_fwd.dot(up));
    var fwd2 = _fwd.clone().sub(flat);
    if (fwd2.lengthSq() < 1e-6) fwd2.set(0, 0, 1);
    fwd2.normalize();
    var left2 = new THREE.Vector3().crossVectors(up, fwd2).normalize();
    this._m.makeBasis(left2, up, fwd2);
    this._q.setFromRotationMatrix(this._m);
    this.group.quaternion.slerp(this._q, 1 - Math.exp(-22 * dt));
    this.group.position.copy(this.pos);

    /* --- 车体动态：加减速俯仰 + 侧倾 --- */
    if (this.visual && this.visual.bodyPivot) {
      var latAcc = this.yawRate * vLong;
      var longAcc = drive - braking;
      var targetRoll = A.clamp(-latAcc * 0.0075, -0.075, 0.075);
      var targetPitch = A.clamp(-longAcc * 0.0038, -0.05, 0.05);
      this.rollVisual = A.damp(this.rollVisual, targetRoll, 7, dt);
      this.pitchVisual = A.damp(this.pitchVisual, targetPitch, 7, dt);
      this.visual.bodyPivot.rotation.z = this.rollVisual;
      this.visual.bodyPivot.rotation.x = this.pitchVisual;
    }

    /* --- 车轮 --- */
    if (this.wheels.length) {
      this.wheelSpin += (vLong / Math.max(this.visual.wheelRadius, 0.15)) * dt;
      if (handbrake) this.wheelSpin += vLong * 0.5 * dt;
      for (var i = 0; i < this.wheels.length; i++) {
        var w = this.wheels[i];
        w.mesh.rotation.x = this.wheelSpin;
        if (w.front) w.pivot.rotation.y = -this.steer;
      }
    }

    /* --- 计时 / 进度 --- */
    this.totalTime += dt;
    this.impactCd -= dt;
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this._updateProgress(dt, track, prFinal);

    /* --- RPM / 档位（视觉用） --- */
    var gears = 6;
    var gr = A.clamp(Math.abs(vLong) / spec.vMax, 0, 1);
    var g = Math.min(gears, Math.floor(gr * gears) + 1);
    if (vLong < -0.5) g = 0;
    this.gear = g;
    var lo = (g - 1) / gears, hi = g / gears;
    var within = A.clamp((gr - lo) / Math.max(hi - lo, 0.001), 0, 1);
    var targetRpm = 0.18 + within * 0.78 + (throttle > 0 ? 0.06 : 0);
    if (Math.abs(vLong) < 1) targetRpm = 0.12 + throttle * 0.55;
    this.rpm = A.damp(this.rpm, A.clamp(targetRpm, 0, 1), 8, dt);

    return prFinal;
  };

  /* 计圈：必须按顺序通过 4 个分段 */
  Car.prototype._updateProgress = function (dt, track, pr) {
    var N = track.N, L = track.length;
    var idx = pr.index;
    var sec = Math.floor(idx / (N / 4)) % 4;
    if (sec === (this.sector + 1) % 4) {
      this.sector = sec;
      if (sec === 0) {
        /* 冲过终点线 */
        var now = this.totalTime;
        if (this.lapStarted) {
          var lt = now - this.lapStart;
          if (lt > 3) {
            this.lastLap = lt;
            this.lapTimes.push(lt);
            if (lt < this.bestLap) this.bestLap = lt;
            this.lap++;
            if (this.onLapDone) this.onLapDone(this, lt);
          }
        }
        this.lapStart = now;
        this.lapStarted = true;
      }
    }
    /* 连续里程：跨越 0 点时补偿一圈 */
    var d = pr.arc - this.prevArc;
    if (d > L * 0.5) d -= L;
    else if (d < -L * 0.5) d += L;
    this.progress += d;
    this.prevArc = pr.arc;

    /* 逆行检测 */
    var t = pr.tangent;
    var fwdDot = Math.sin(this.yaw) * t.x + Math.cos(this.yaw) * t.z;
    if (fwdDot < -0.35 && this.speed > 2) this.wrongWayT += dt;
    else this.wrongWayT = Math.max(0, this.wrongWayT - dt * 2);
  };

  /* 车与车碰撞：每车用前后两个圆近似 */
  var _ca = new THREE.Vector3(), _cb = new THREE.Vector3(), _n = new THREE.Vector3();
  A.resolveCarCollisions = function (cars) {
    for (var i = 0; i < cars.length; i++) {
      for (var j = i + 1; j < cars.length; j++) {
        var a = cars[i], b = cars[j];
        if (!a.visual || !b.visual) continue;
        for (var ai = -1; ai <= 1; ai += 2) {
          for (var bi = -1; bi <= 1; bi += 2) {
            var ra = (a.radius || 0.95) * 1.05, rb = (b.radius || 0.95) * 1.05;
            _ca.set(Math.sin(a.yaw) * ai * 1.15, 0, Math.cos(a.yaw) * ai * 1.15).add(a.pos);
            _cb.set(Math.sin(b.yaw) * bi * 1.15, 0, Math.cos(b.yaw) * bi * 1.15).add(b.pos);
            _n.subVectors(_ca, _cb);
            var d2 = _n.x * _n.x + _n.z * _n.z;
            var rr = ra + rb;
            if (d2 > rr * rr || d2 < 1e-8) continue;
            var d = Math.sqrt(d2);
            _n.multiplyScalar(1 / d);
            var pen = rr - d;
            /* 推开 */
            var push = pen * 0.5;
            a.pos.x += _n.x * push; a.pos.z += _n.z * push;
            b.pos.x -= _n.x * push; b.pos.z -= _n.z * push;
            /* 沿法线交换动量 */
            var va = a.vel.x * _n.x + a.vel.z * _n.z;
            var vb = b.vel.x * _n.x + b.vel.z * _n.z;
            if (va - vb < 0) {
              var rel = va - vb;
              var imp = -rel * 0.62;
              a.vel.x += _n.x * imp; a.vel.z += _n.z * imp;
              b.vel.x -= _n.x * imp; b.vel.z -= _n.z * imp;
              a.vel.multiplyScalar(0.985); b.vel.multiplyScalar(0.985);
              if (rel < -4) {
                a.shake = Math.max(a.shake, Math.min(0.5, -rel / 30));
                b.shake = Math.max(b.shake, Math.min(0.5, -rel / 30));
                if (a.onImpact) a.onImpact(a, -rel);
                if (b.onImpact) b.onImpact(b, -rel);
              }
            }
          }
        }
      }
    }
  };

  A.Car = Car;
  A.buildFallbackCar = buildFallbackCar;

})();
