/* ============================================================================
 * game.js — 主循环 / 场景 / 比赛流程
 * ==========================================================================*/
(function () {
  'use strict';
  var A = window.APEX;
  var UP = new THREE.Vector3(0, 1, 0);

  /* ------------------------------------------------------------- 全局状态 --- */
  var G = {
    state: 'load',            /* load | menu | countdown | racing | paused | finished */
    quality: 'mid',
    renderer: null, scene: null, camera: null,
    sun: null,
    track: null, mats: null,
    cars: [], player: null, ais: [],
    hud: null, audio: null,
    totalLaps: 3,
    aiCount: 5,
    aiDiff: 0.95,
    playerSpec: null,
    countdown: 0,
    camMode: 0,
    camModes: ['追尾视角', '近距视角', '车头视角', '电影视角'],
    camPos: new THREE.Vector3(),
    camLook: new THREE.Vector3(),
    camFov: 62,
    input: { throttle: 0, brake: 0, steer: 0, handbrake: false },
    keys: {},
    order: [],
    raceStart: 0,
    finishOrder: [],
    topSpeed: 0,
    clock: null,
    dt: 0,
    frameCount: 0,
    fpsAcc: 0, fpsT: 0, fps: 0,
    paused: false
  };
  window.__APEX_GAME = G;

  /* ---------------------------------------------------------- 资源载入 --- */
  var loadEl = A.$('#loadBar'), loadTx = A.$('#loadText');
  function setLoad(p, text) {
    if (loadEl) loadEl.style.width = Math.round(p * 100) + '%';
    if (loadTx && text) loadTx.textContent = text;
  }
  function fatal(err) {
    console.error(err);
    A.$('#loader').classList.add('hidden');
    A.$('#fatal').classList.remove('hidden');
    A.$('#fatalText').textContent = (err && (err.stack || err.message)) || String(err);
    G.state = 'error';
  }

  /* =========================================================== 启动 ====== */
  function boot() {
    A.maxAniso = 8;
    /* ?embed=1 强制使用内嵌模型（用于验证 file:// 分支） */
    if (/[?&]embed=1/.test(location.search)) window.__FORCE_EMBED = true;
    initRenderer();
    G.scene = new THREE.Scene();
    G.hud = new A.HUD();
    G.audio = new A.Audio();

    loadAssets().then(function () {
      setupScene();
      buildMenu();
      A.$('#menu').classList.remove('hidden');
      wireMenu();
      requestAnimationFrame(loop);
      return selectMap(A.MAP_PRESETS[0]);
    }).then(function () {
      A.$('#loader').classList.add('hidden');
      G.state = 'menu';
    }).catch(fatal);
  }

  function initRenderer() {
    var cv = A.$('#scene');
    var r = new THREE.WebGLRenderer({
      canvas: cv, antialias: true, powerPreference: 'high-performance', stencil: false
    });
    r.setSize(window.innerWidth, window.innerHeight, false);
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.94;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setClearColor(0x9fbcd0, 1);
    G.renderer = r;
    A.maxAniso = Math.min(16, r.capabilities.getMaxAnisotropy ? r.capabilities.getMaxAnisotropy() : 8);
    G.scene = new THREE.Scene();
    window.addEventListener('resize', onResize);
    onResize();
  }

  function applyQuality() {
    var q = G.quality;
    var dpr = window.devicePixelRatio || 1;
    var pr = q === 'low' ? 1 : (q === 'mid' ? Math.min(dpr, 1.5) : Math.min(dpr, 2));
    G.renderer.setPixelRatio(pr);
    var size = q === 'low' ? 1024 : (q === 'mid' ? 2048 : 4096);
    if (G.sun && G.sun.shadow.mapSize.x !== size) {
      G.sun.shadow.mapSize.set(size, size);
      if (G.sun.shadow.map) { G.sun.shadow.map.dispose(); G.sun.shadow.map = null; }
    }
    onResize();
  }

  function onResize() {
    var w = window.innerWidth, h = window.innerHeight;
    G.renderer.setSize(w, h, false);
    if (G.camera) {
      G.camera.aspect = w / h;
      G.camera.updateProjectionMatrix();
    }
  }

  /* --------------------------------------------------------- 载入素材 --- */
  function loadAssets() {
    setLoad(0.04, '准备渲染器…');
    var tasks = [];
    var mats = { groundTex: {} };

    /* 沥青（原始贴图，各地图自行压低对比度） */
    tasks.push(A.loadTexture('assets/textures/asphalt/asphalt_diff_2k.jpg', {
      fallback: A.makeAsphalt, srgb: true
    }).then(function (r) {
      mats.roadTex = r.tex;
      mats.groundTex.concrete = r.tex;
      mats.asphaltExt = r.external;
      setLoad(0.14, '载入沥青贴图…');
    }));

    /* 草地 */
    tasks.push(A.loadTexture('assets/textures/grass/grass_diff_2k.jpg', {
      fallback: A.makeGrass, srgb: true
    }).then(function (r) { mats.groundTex.grass = r.tex; setLoad(0.24, '载入草地贴图…'); }));

    /* 沙地 / 沙滩 */
    tasks.push(A.loadTexture('assets/textures/sand/sand_diff_2k.jpg', { fallback: A.makeGrass, srgb: true })
      .then(function (r) { mats.groundTex.sand = r.tex; setLoad(0.32, '载入沙地贴图…'); }));
    tasks.push(A.loadTexture('assets/textures/sand/beach_diff_2k.jpg', { fallback: A.makeGrass, srgb: true })
      .then(function (r) { mats.groundTex.beach = r.tex; }));

    /* 雪地 */
    tasks.push(A.loadTexture('assets/textures/snow/snow_diff_2k.jpg', { fallback: A.makeGrass, srgb: true })
      .then(function (r) { mats.groundTex.snow = r.tex; setLoad(0.40, '载入雪地贴图…'); }));

    /* 程序化贴图 */
    mats.stripe = A.makeStripe();
    mats.checker = A.makeChecker(10);

    /* 车辆贴图集 */
    tasks.push(A.loadColormap().then(function (t) {
      mats.colormap = t;
      setLoad(0.46, '载入车辆贴图…');
    }));

    /* 车辆模型 */
    var specs = A.CAR_SPECS;
    var loaded = 0;
    specs.forEach(function (sp) {
      if (!sp.file) { loaded++; return; }
      tasks.push(A.loadCarModel(sp).then(function () {
        loaded++;
        setLoad(0.46 + 0.34 * (loaded / specs.length), '载入车辆模型 ' + loaded + '/' + specs.length + '…');
      }).catch(function (e) {
        console.warn('模型载入失败，使用程序化车模：' + sp.file, e);
        loaded++;
      }));
    });

    /* 道具模型 */
    var props = { cone: 'cone', box: 'box', tire: 'debris-tire' };
    Object.keys(props).forEach(function (k) {
      tasks.push(A.loadGLTF('assets/models/' + props[k] + '.glb', k).then(function (gltf) {
        var g = null;
        gltf.scene.traverse(function (o) { if (o.isMesh && !g) g = o; });
        if (g) {
          g.geometry.computeVertexNormals();
          mats.propGeo = mats.propGeo || {};
          mats.propGeo[k] = g.geometry;
          mats.propMat = mats.propMat || g.material;
        }
      }).catch(function (e) { console.warn('道具模型失败', k, e); }));
    });

    return Promise.all(tasks).then(function () {
      setLoad(0.86, '生成赛道…');
      G.assets = mats;
    });
  }

  var _hdrCache = {};
  function loadHDRI(url) {
    if (_hdrCache[url]) return Promise.resolve(_hdrCache[url]);
    return new Promise(function (resolve) {
      if (!THREE.RGBELoader) {
        _hdrCache[url] = { tex: null, external: false };
        return resolve(_hdrCache[url]);
      }
      var loader = new THREE.RGBELoader();
      loader.load(url, function (tex) {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        _hdrCache[url] = { tex: tex, external: true };
        resolve(_hdrCache[url]);
      }, undefined, function () {
        _hdrCache[url] = { tex: null, external: false };
        resolve(_hdrCache[url]);
      });
    });
  }

  /* ------------------------------------------------------------ 场景 --- */
  /* 只做一次：光照、雾、相机、PMREM */
  function setupScene() {
    var scene = G.scene;
    var sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    var sc = sun.shadow.camera;
    sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55;
    sc.near = 1; sc.far = 460;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
    scene.add(sun.target);
    G.sun = sun;

    G.hemi = new THREE.HemisphereLight(0xcfe4f2, 0x53603f, 0.55);
    scene.add(G.hemi);
    scene.fog = new THREE.FogExp2(0xbfd2dc, 0.00082);

    G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.4, 6000);
    G.camera.position.set(0, 8, -20);

    G.pmrem = new THREE.PMREMGenerator(G.renderer);
    G.pmrem.compileEquirectangularShader();
    applyQuality();
  }

  /* 应用某张地图的环境（天空 / IBL / 雾 / 光照 / 曝光） */
  function applyMap(preset, hdrTex) {
    var scene = G.scene;
    var bgTex = hdrTex;
    if (!bgTex) {
      bgTex = A.makeSkyEquirect({ fog: preset.fog[0], night: !!preset.night });
      bgTex.mapping = THREE.EquirectangularReflectionMapping;
    }
    if (G.envRT) { G.envRT.dispose(); G.envRT = null; }
    G.envRT = G.pmrem.fromEquirectangular(bgTex);
    scene.environment = G.envRT.texture;
    scene.background = bgTex;

    scene.fog = new THREE.FogExp2(preset.fog[0], preset.fog[1]);
    G.renderer.toneMappingExposure = preset.exposure;

    var s = preset.sun;
    G.sun.color.setHex(s.color);
    G.sun.intensity = s.intensity;
    G.sunDir = s.pos;
    G.hemi.color.setHex(preset.hemi.sky);
    G.hemi.groundColor.setHex(preset.hemi.ground);
    G.hemi.intensity = preset.hemi.intensity;

    G.night = !!preset.night;
    applyQuality();
  }

  /* 生成 / 切换赛道 */
  function buildTrack(preset) {
    if (G.track) { G.track.dispose(); G.track = null; }
    G.track = new A.Track(preset, G.assets);
    G.scene.add(G.track.group);
    G.hud.resetMapCache();
  }

  /* 选择地图：载入天空 → 应用环境 → 生成赛道 */
  function selectMap(preset) {
    G.map = preset;
    var note = A.$('#mapNote');
    if (note) { note.textContent = '正在生成赛道…'; note.classList.add('on'); }
    var t0 = performance.now();
    return loadHDRI(preset.hdri).then(function (res) {
      G.hdrExternal = res.external;
      applyMap(preset, res.tex);
      buildTrack(preset);
      if (note) note.classList.remove('on');
      console.log('[map] ' + preset.id + ' 生成耗时 ' + Math.round(performance.now() - t0) + 'ms');
    });
  }

  /* --------------------------------------------------------- 车辆实例 --- */
  function makeCar(spec, opts) {
    var car = new A.Car(spec, opts);
    var vis = null;
    /* 有 GLB 就先试 GLB（写实模型），失败再退回程序化车身 */
    if (spec.file) {
      var gltf = window.__APEX_GLTF && window.__APEX_GLTF[spec.id];
      if (gltf) {
        try { vis = A.buildCarVisual(gltf, spec, opts.tint, G.assets && G.assets.colormap); }
        catch (e) { console.warn('GLB 车模组装失败', spec.id, e); }
      }
    }
    if (!vis && (spec.style || spec.fallbackStyle)) {
      try { vis = A.buildProceduralCar(spec, opts.tint); }
      catch (e) { console.warn('程序化车模构建失败', e); }
    }
    if (!vis) vis = A.buildFallbackCar(spec);
    car.attachVisual(vis);
    G.scene.add(car.group);
    return car;
  }

  /* 缓存已载入的 GLTF，供 makeCar 复用 */
  function cacheGLTFs() {
    window.__APEX_GLTF = window.__APEX_GLTF || {};
    var specs = A.CAR_SPECS;
    return Promise.all(specs.map(function (sp) {
      if (!sp.file) return Promise.resolve();
      return A.loadCarModel(sp).then(function (g) { window.__APEX_GLTF[sp.id] = g; }).catch(function () { });
    }));
  }

  var AI_NAMES = ['BLAZE', 'VIPER', 'NOVA', 'ONYX', 'JET', 'FURY', 'ZENITH', 'BOLT', 'RAPTOR', 'GHOST'];

  function startRace() {
    /* 清掉上一局的车辆 */
    G.cars.forEach(function (c) { G.scene.remove(c.group); });
    G.cars = []; G.ais = []; G.finishOrder = []; G.topSpeed = 0;

    var track = G.track;
    var N = track.N;
    var spec = G.playerSpec;

    /* --- 排位：玩家从最后一位发车 --- */
    var total = 1 + G.aiCount;
    var grid = [];
    for (var i = 0; i < total; i++) {
      var row = Math.floor(i / 2);
      var side = (i % 2 === 0) ? -1 : 1;
      grid.push({
        indexOffset: -(7 + row * 5),
        lateral: side * 2.9
      });
    }

    /* AI 车辆 */
    var pool = A.CAR_SPECS.filter(function (s) { return s.id !== spec.id && !s.heavy; });
    var rnd = A.rng(Date.now() & 0xffff);
    var aiSpecs = [];
    for (var k = 0; k < G.aiCount; k++) {
      var cand = pool[Math.floor(rnd() * pool.length)];
      /* 难度高时偏向快车 */
      if (G.aiDiff > 1.0 && (cand.accel < 8.5)) cand = pool[0];
      aiSpecs.push(cand);
    }
    /* 按性能排序，快车排前面 */
    aiSpecs.sort(function (a, b) { return b.accel - a.accel; });

    var tints = A.AI_TINTS.slice();
    /* 洗牌 */
    for (var s = tints.length - 1; s > 0; s--) {
      var j = Math.floor(rnd() * (s + 1));
      var t = tints[s]; tints[s] = tints[j]; tints[j] = t;
    }

    var gridIdx = 0;
    /* 玩家放最后 */
    for (var a = 0; a < G.aiCount; a++) {
      var g = grid[gridIdx++];
      var c = makeCar(aiSpecs[a], { tint: tints[a % tints.length], name: AI_NAMES[a % AI_NAMES.length] });
      c.placeAt(track, N + g.indexOffset, g.lateral);
      var skill = G.aiDiff * (0.965 + a * 0.012) * (0.98 + rnd() * 0.05);
      var ai = new A.AI(c, {
        skill: skill,
        lineBias: (a % 2 === 0 ? -1 : 1) * (0.4 + rnd() * 0.9)
      });
      c.ai = ai;
      c.isAI = true;
      G.cars.push(c); G.ais.push(ai);
    }
    /* 玩家 */
    var pg = grid[gridIdx++];
    var player = makeCar(spec, {
      isPlayer: true, name: spec.name,
      tint: spec.paint === undefined ? 0xffffff : spec.paint
    });
    player.placeAt(track, N + pg.indexOffset, pg.lateral);
    player.onImpact = function (car, impact) {
      if (G.audio) G.audio.impact(impact);
      G.shakeT = 0.35;
    };
    G.player = player;
    G.cars.unshift(player);

    /* 重置计时 */
    G.raceTime = 0;
    G.lapMessages = [];
    G.finishOrder = [];
    G.topSpeed = 0;
    G.avgAcc = 0; G.avgN = 0;
    G.camMode = 0;
    setCamMode(0, true);

    /* 起跑倒计时 */
    G.countdown = 3.99;
    G.state = 'countdown';
    A.$('#results').classList.add('hidden');
    A.$('#menu').classList.add('hidden');
    A.$('#pause').classList.add('hidden');
    A.$('#lights').classList.remove('hidden');
    A.$('#countdown').classList.add('hidden');
    G.hud.setVisible(true);
    G.hud.toast('');
    G.lastBeep = 99;
    if (G.audio) { G.audio.init(); G.audio.resume(); }
  }

  /* ========================================================== 主循环 ==== */
  function loop(now) {
    requestAnimationFrame(loop);
    if (G.state === 'error') return;
    if (G.state === 'load') {
      if (G.camera) G.renderer.render(G.scene, G.camera);
      return;
    }
    if (!G.clock) G.clock = now;
    var dt = Math.min((now - G.clock) / 1000, 0.05);
    G.clock = now;
    G.dt = dt;

    /* FPS */
    G.fpsAcc += dt; G.fpsT++;
    if (G.fpsAcc > 0.5) { G.fps = G.fpsT / G.fpsAcc; G.fpsAcc = 0; G.fpsT = 0; }

    if (G.state === 'menu') {
      updateMenuCamera(dt);
      G.renderer.render(G.scene, G.camera);
      return;
    }

    if (G.state === 'paused') {
      G.renderer.render(G.scene, G.camera);
      return;
    }

    if (G.state === 'countdown') updateCountdown(dt);

    var racing = (G.state === 'racing');
    var simulate = racing || G.state === 'countdown';

    if (simulate) {
      /* 物理子步，保证高速下稳定 */
      var steps = Math.min(4, Math.max(1, Math.ceil(dt / 0.0125)));
      var sub = dt / steps;
      for (var s = 0; s < steps; s++) {
        stepCars(sub, racing);
        A.resolveCarCollisions(G.cars);
      }
      if (racing) {
        G.raceTime += dt;
        updateStandings();
        checkRaceEnd();
      }
      updateGantryLights();
    }

    updateCamera(dt);
    updateHUD(dt);
    if (G.audio) {
      G.player._lastThrottle = G.player._lastThrottle === undefined ? 0 : G.player._lastThrottle;
      G.audio.update(dt, G.player, G.state !== 'menu');
    }
    G.renderer.render(G.scene, G.camera);
  }

  /* ------------------------------------------------------- 车辆步进 --- */
  function stepCars(dt, racing) {
    var player = G.player;

    /* 玩家输入 */
    if (G.state === 'countdown') {
      G.input.throttle = 0; G.input.brake = 0; G.input.steer = 0; G.input.handbrake = false;
      /* 空踩油门烘托气氛 */
      var k = G.keys;
      if (k.KeyW || k.ArrowUp) player._lastThrottle = 1;
    } else if (racing) {
      var k2 = G.keys;
      var thr = (k2.KeyW || k2.ArrowUp) ? 1 : 0;
      var brk = (k2.KeyS || k2.ArrowDown) ? 1 : 0;
      var left = (k2.KeyA || k2.ArrowLeft) ? 1 : 0;
      var right = (k2.KeyD || k2.ArrowRight) ? 1 : 0;
      G.input.throttle = thr;
      G.input.brake = brk;
      G.input.steer = right - left;
      G.input.handbrake = !!k2.Space;
      player._lastThrottle = thr;
    } else {
      G.input.throttle = 0; G.input.brake = 0.6; G.input.steer = 0;
    }

    player.update(dt, G.input, G.track, {
      onImpact: function (car, impact) {
        if (G.audio) G.audio.impact(impact);
      }
    });

    for (var i = 0; i < G.ais.length; i++) {
      var ai = G.ais[i], car = ai.car;
      var inp;
      if (racing) {
        inp = ai.update(dt, G.track, G.cars);
        /* 轻微橡皮筋，避免比赛过早失去悬念 */
        var dp = (G.player.progress - car.progress);
        ai.rubber = A.clamp(1 + dp * 0.00035, 0.94, 1.07);
        if (car.finished) inp = { throttle: 0.35, brake: 0, steer: 0, handbrake: false };
      } else {
        inp = { throttle: 0, brake: 0, steer: 0, handbrake: false };
        if (G.keys.KeyW) car._lastThrottle = 1;
      }
      car.update(dt, inp, G.track, null);
      car._lastThrottle = inp.throttle;
    }

    /* 玩家极速统计 */
    var spd = Math.abs(player.speed) * 3.6;
    if (G.state === 'racing') {
      if (spd > G.topSpeed) G.topSpeed = spd;
      G.avgAcc += Math.abs(player.speed); G.avgN++;
    }
  }

  /* ---------------------------------------------------------- 倒计时 --- */
  function updateCountdown(dt) {
    G.countdown -= dt;
    var cd = G.countdown;
    var lights = A.$('#lights');
    var lit = cd > 3 ? 0 : (cd > 2 ? 1 : (cd > 1 ? 2 : (cd > 0 ? 3 : 5)));
    var kids = lights.children;
    for (var i = 0; i < kids.length; i++) {
      kids[i].classList.toggle('on', i < lit && lit < 5);
      kids[i].classList.toggle('go', lit === 5);
    }
    if (cd <= 0) {
      G.state = 'racing';
      G.raceTime = 0;
      G.player.lapStart = 0;
      G.player.totalTime = 0;
      G.cars.forEach(function (c) { c.totalTime = 0; c.lapStart = 0; });
      G.hud.toast('GO!', 1200);
      if (G.audio) G.audio.beep(1180, 0.5, 0.3, 'square');
      setTimeout(function () {
        A.$('#lights').classList.add('hidden');
        A.$('#countdown').classList.add('hidden');
      }, 900);
    } else {
      var n = Math.ceil(cd);
      if (n !== G.lastBeep && n <= 3) {
        G.lastBeep = n;
        var ce = A.$('#countdown');
        ce.classList.remove('hidden');
        var span = A.$('#cdText');
        span.textContent = n;
        span.classList.remove('go');
        /* 重放动画 */
        span.style.animation = 'none';
        void span.offsetWidth;
        span.style.animation = '';
        if (G.audio) G.audio.beep(620, 0.22, 0.26, 'square');
      }
    }
  }

  function updateGantryLights() {
    if (!G.track.lightMeshes) return;
    var on = 0;
    if (G.state === 'countdown') {
      var cd = G.countdown;
      on = cd > 3 ? 0 : (cd > 2 ? 1 : (cd > 1 ? 2 : (cd > 0 ? 3 : 5)));
    } else if (G.state === 'racing' && G.raceTime < 1.2) {
      on = 5;
    }
    for (var i = 0; i < G.track.lightMeshes.length; i++) {
      var m = G.track.lightMeshes[i].material;
      var isOn = i < on && on < 5;
      var isGo = on === 5;
      if (isGo) { m.emissive.setHex(0x22ff66); m.emissiveIntensity = 2.2; }
      else if (isOn) { m.emissive.setHex(0xff1a1a); m.emissiveIntensity = 2.0; }
      else { m.emissive.setHex(0x1a0505); m.emissiveIntensity = 0.25; }
    }
  }

  /* ---------------------------------------------------------- 名次 --- */
  function updateStandings() {
    var arr = G.cars.slice();
    arr.sort(function (a, b) {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    G.order = arr;
  }

  function checkRaceEnd() {
    var p = G.player;
    /* 记录完赛顺序 */
    for (var i = 0; i < G.cars.length; i++) {
      var c = G.cars[i];
      if (!c.finished && c.lap >= G.totalLaps) {
        c.finished = true;
        c.finishTime = G.raceTime;
        G.finishOrder.push(c);
      }
    }
    if (p.lap >= G.totalLaps && !G.resultsShown) {
      G.resultsShown = true;
      G.state = 'finished';
      showResults();
    }
  }

  /* ---------------------------------------------------------- 相机 --- */
  function setCamMode(i, silent) {
    G.camMode = ((i % G.camModes.length) + G.camModes.length) % G.camModes.length;
    if (!silent) G.hud.camHint(G.camModes[G.camMode]);
    /* 切换瞬间把相机拉到目标位，避免穿模 */
    var c = G.player;
    if (c) snapCamera();
  }

  var _camTarget = new THREE.Vector3(), _camDesired = new THREE.Vector3(), _lookTarget = new THREE.Vector3();

  function camBasis(car, out) {
    var fwd = out.fwd, right = out.right, up = out.up;
    fwd.set(Math.sin(car.yaw), 0, Math.cos(car.yaw));
    up.copy(car.proj ? car.proj.normal : UP);
    right.crossVectors(fwd, up).normalize();
    fwd.crossVectors(up, right).normalize();
    return out;
  }
  var _basis = { fwd: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() };

  function snapCamera() {
    computeCamera(1, 1);
  }

  function computeCamera(dt, snap) {
    var car = G.player;
    if (!car) return;
    var b = camBasis(car, _basis);
    var mode = G.camMode;
    var spd = Math.abs(car.speed);
    var sr = A.clamp(spd / car.spec.vMax, 0, 1);
    var k = snap ? 1 : (1 - Math.exp(-8 * dt));

    var upMix = 0.55;

    if (mode === 2) {
      /* 车头视角 */
      _camDesired.copy(car.pos)
        .addScaledVector(b.fwd, 0.25)
        .addScaledVector(b.up, 1.12)
        .addScaledVector(b.right, 0.0);
      _lookTarget.copy(car.pos).addScaledVector(b.fwd, 26).addScaledVector(b.up, 1.4);
      G.camPos.lerp(_camDesired, snap ? 1 : (1 - Math.exp(-30 * dt)));
      G.camLook.lerp(_lookTarget, snap ? 1 : (1 - Math.exp(-18 * dt)));
    } else {
      var back, high, lookAhead, stiff;
      if (mode === 1) { back = 5.6; high = 1.95; lookAhead = 7; stiff = 9; }
      else if (mode === 3) { back = 14.5; high = 6.4; lookAhead = 15; stiff = 4.5; }
      else { back = 8.4; high = 3.1; lookAhead = 10; stiff = 6.5; }

      /* 电影视角跟随赛道方向，画面更稳 */
      var dir = b.fwd;
      if (mode === 3 && car.proj) dir = car.proj.tangent;
      back += sr * 1.6;
      high += sr * 0.5;

      _camDesired.copy(car.pos)
        .addScaledVector(dir, -back)
        .addScaledVector(UP, high);
      /* 侧倾：过弯时相机稍微外倾 */
      _camDesired.addScaledVector(b.right, -car.yawRate * 0.9);
      _camDesired.y = Math.max(_camDesired.y, car.pos.y + 1.0);

      var lam = stiff * (snap ? 100 : 1);
      G.camPos.lerp(_camDesired, 1 - Math.exp(-lam * dt));

      _lookTarget.copy(car.pos)
        .addScaledVector(dir, lookAhead + sr * 8)
        .addScaledVector(UP, 1.5);
      G.camLook.lerp(_lookTarget, 1 - Math.exp(-(stiff + 3) * (snap ? 100 : 1) * dt));
    }

    /* 抖动 */
    var shake = car.shake;
    var jx = 0, jy = 0;
    if (shake > 0.001) {
      var amp = shake * 0.45;
      jx = (Math.random() - 0.5) * amp;
      jy = (Math.random() - 0.5) * amp;
    }
    /* 高速微震 */
    var vib = sr * 0.02;
    jx += (Math.random() - 0.5) * vib;
    jy += (Math.random() - 0.5) * vib;

    G.camera.position.set(G.camPos.x + jx, G.camPos.y + jy, G.camPos.z);
    G.camera.up.set(0, 1, 0).lerp(b.up, mode === 2 ? 1 : 0.35).normalize();
    G.camera.lookAt(G.camLook);

    /* FOV 随速度变化 */
    var baseFov = mode === 3 ? 46 : (mode === 2 ? 68 : 62);
    var targetFov = baseFov + sr * (mode === 3 ? 6 : 16);
    G.camFov = A.damp(G.camFov, targetFov, 4, dt);
    if (Math.abs(G.camera.fov - G.camFov) > 0.01) {
      G.camera.fov = G.camFov;
      G.camera.updateProjectionMatrix();
    }
  }

  function updateCamera(dt) {
    computeCamera(dt, false);
    /* 阳光跟随玩家，保证阴影清晰 */
    var car = G.player;
    if (G.sun && car) {
      G.sun.position.set(car.pos.x - 90, car.pos.y + 150, car.pos.z + 60);
      G.sun.target.position.copy(car.pos);
      G.sun.target.updateMatrixWorld();
    }
    /* 雾随环境微调 */
  }

  /* 菜单里让相机缓慢环绕赛道起点 */
  function updateMenuCamera(dt) {
    var t = (performance.now() / 1000) * 0.07;
    var track = G.track;
    if (!track) return;
    var i = Math.floor((t * 40) % track.N);
    var p = track.P[i];
    G.camera.position.set(p.x + Math.cos(t * 2) * 26, p.y + 9, p.z + Math.sin(t * 2) * 26);
    G.camera.lookAt(p.x, p.y + 1.5, p.z);
    if (G.camera.fov !== 58) { G.camera.fov = 58; G.camera.updateProjectionMatrix(); }
    if (G.sun) {
      G.sun.position.set(p.x - 90, p.y + 150, p.z + 60);
      G.sun.target.position.set(p.x, p.y, p.z);
      G.sun.target.updateMatrixWorld();
    }
  }

  /* ---------------------------------------------------------- HUD --- */
  function updateHUD(dt) {
    var p = G.player;
    var lapTime = (p.lapStarted ? (p.totalTime - p.lapStart) : p.totalTime) * 1000;
    var delta = Infinity;
    if (isFinite(p.bestLap) && p.lapStarted && p.lapTimes.length >= 1) {
      delta = lapTime - p.bestLap * 1000;
    }
    var drifting = Math.abs(p.slip) > 0.28 && Math.abs(p.speed) > 12;
    if (drifting) p.driftScore += Math.abs(p.slip) * Math.abs(p.speed) * dt * 12;

    G.hud.update(dt, {
      car: p, cars: G.cars, track: G.track,
      lap: p.lap, totalLaps: G.totalLaps,
      pos: (G.order.indexOf(p) >= 0 ? G.order.indexOf(p) : 0) + 1,
      total: G.cars.length,
      lapTime: lapTime,
      bestLap: p.bestLap * 1000,
      lastLap: p.lastLap * 1000,
      delta: delta,
      speed: p.speed, gear: p.gear, rpm: p.rpm, vMax: p.spec.vMax,
      wrongWay: p.wrongWayT > 1.0,
      drifting: drifting,
      driftScore: p.driftScore,
      order: G.order.length ? G.order : G.cars
    });
  }

  /* ---------------------------------------------------------- 结算 --- */
  function showResults() {
    var p = G.player;
    var pos = G.finishOrder.indexOf(p);
    if (pos < 0) {
      /* 玩家最后完赛 */
      pos = G.finishOrder.length;
      G.finishOrder.push(p);
      p.finished = true; p.finishTime = G.raceTime;
    }
    var place = pos + 1;
    A.$('#resPlace').textContent = place;
    var suf = ['ST', 'ND', 'RD'];
    A.$('#resSuffix').textContent = place <= 3 ? suf[place - 1] : 'TH';
    A.$('#resTitle').textContent = place === 1 ? '🏆 冠军！' : (place <= 3 ? '登上领奖台' : '比赛结束');
    A.$('#resTotal').textContent = A.formatTime(p.totalTime * 1000);
    A.$('#resBest').textContent = A.formatTime(p.bestLap * 1000);
    var avg = G.avgN ? (G.avgAcc / G.avgN) * 3.6 : 0;
    A.$('#resAvg').textContent = avg.toFixed(1) + ' km/h';
    A.$('#resTop').textContent = G.topSpeed.toFixed(0) + ' km/h';

    var html = '';
    for (var i = 0; i < p.lapTimes.length; i++) {
      var lt = p.lapTimes[i];
      var best = Math.abs(lt - p.bestLap) < 1e-6;
      html += '<div class="l' + (best ? ' best' : '') + '"><span>第 ' + (i + 1) + ' 圈</span><span class="mono">' +
        A.formatTime(lt * 1000) + (best ? '  ★' : '') + '</span></div>';
    }
    /* AI 成绩 */
    for (var k = 0; k < G.finishOrder.length; k++) {
      var c = G.finishOrder[k];
      if (c === p) continue;
      html += '<div class="l"><span>' + (k + 1) + '. ' + c.name + '</span><span class="mono">' +
        A.formatTime(c.finishTime * 1000) + '</span></div>';
    }
    A.$('#resLaps').innerHTML = html;
    A.$('#results').classList.remove('hidden');
    if (G.audio) {
      G.audio.beep(880, 0.18, 0.22, 'triangle');
      setTimeout(function () { G.audio.beep(1320, 0.3, 0.22, 'triangle'); }, 180);
    }
  }

  /* ========================================================== 菜单 ===== */
  /* 用赛道中心线画一张小预览图（很便宜，不需要生成整条赛道） */
  function drawMapPreview(cv, preset) {
    var g = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    var N = 280, pts = [], minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    var harms = preset.shape.harms;
    for (var i = 0; i < N; i++) {
      var th = i / N * Math.PI * 2, r = preset.shape.r0;
      for (var k = 0; k < harms.length; k++) r += harms[k][1] * Math.sin(harms[k][0] * th + harms[k][2]);
      var x = r * Math.cos(th), z = r * Math.sin(th);
      pts.push([x, z]);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    var pad = 16;
    var sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
    var ox = (W - (maxX - minX) * sc) / 2 - minX * sc;
    var oy = (H - (maxZ - minZ) * sc) / 2 - minZ * sc;
    g.beginPath();
    for (var j = 0; j <= N; j++) {
      var p = pts[j % N];
      var X = p[0] * sc + ox, Y = p[1] * sc + oy;
      if (j === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
    }
    g.closePath();
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(160,220,245,.30)';
    g.lineWidth = Math.max(6, preset.widths.road * 2 * sc);
    g.stroke();
    g.strokeStyle = '#4df3ff';
    g.lineWidth = 2;
    g.stroke();
  }

  function buildMenu() {
    /* --- 地图 --- */
    var mp = A.$('#mapPicker');
    if (mp) {
      mp.innerHTML = '';
      A.MAP_PRESETS.forEach(function (preset, i) {
        var card = document.createElement('div');
        card.className = 'map-card' + (i === 0 ? ' on' : '');
        var cv = document.createElement('canvas');
        cv.width = 220; cv.height = 124;
        card.appendChild(cv);
        var nm = document.createElement('div');
        nm.className = 'nm'; nm.textContent = preset.name;
        card.appendChild(nm);
        var ds = document.createElement('div');
        ds.className = 'ds'; ds.textContent = preset.desc;
        card.appendChild(ds);
        mp.appendChild(card);
        drawMapPreview(cv, preset);
        card.addEventListener('click', function () {
          if (G.busy || G.map === preset) return;
          [].forEach.call(mp.children, function (c) { c.classList.remove('on'); });
          card.classList.add('on');
          G.busy = true;
          selectMap(preset).then(function () { G.busy = false; }, function () { G.busy = false; });
        });
        preset._card = card;
      });
    }

    /* --- 车辆 --- */
    var picker = A.$('#carPicker');
    picker.innerHTML = '';
    A.CAR_SPECS.forEach(function (sp, i) {
      var card = document.createElement('div');
      card.className = 'car-card' + (i === 0 ? ' on' : '');
      card.dataset.id = sp.id;
      var cv = document.createElement('canvas');
      cv.width = 240; cv.height = 112;
      card.appendChild(cv);
      var nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = sp.name;
      card.appendChild(nm);
      var st = document.createElement('div');
      st.className = 'stat';
      var labels = ['速度', '加速', '操控'];
      for (var s = 0; s < 3; s++) {
        for (var q = 0; q < 5; q++) {
          var ii = document.createElement('i');
          if (q < sp.stats[s]) ii.className = 'f';
          st.appendChild(ii);
        }
      }
      card.appendChild(st);
      picker.appendChild(card);
      card.addEventListener('click', function () {
        [].forEach.call(picker.children, function (c) { c.classList.remove('on'); });
        card.classList.add('on');
        G.playerSpec = sp;
      });
      sp._card = card;
    });
    G.playerSpec = A.CAR_SPECS[0];
    renderPreviews();
  }

  /* 用一个小渲染器把每辆车画到卡片上 */
  function renderPreviews() {
    cacheGLTFs().then(function () {
      var pr = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      pr.setSize(240, 112);
      pr.outputEncoding = THREE.sRGBEncoding;
      pr.toneMapping = THREE.ACESFilmicToneMapping;
      pr.toneMappingExposure = 1.1;
      var sc = new THREE.Scene();
      if (G.scene.environment) sc.environment = G.scene.environment;
      var l1 = new THREE.DirectionalLight(0xffffff, 2.4); l1.position.set(4, 8, 6); sc.add(l1);
      var l2 = new THREE.DirectionalLight(0x88bbff, 1.1); l2.position.set(-6, 3, -5); sc.add(l2);
      var cam = new THREE.PerspectiveCamera(26, 240 / 112, 0.1, 100);
      var grp = new THREE.Group(); sc.add(grp);

      A.CAR_SPECS.forEach(function (sp) {
        var vis = null;
        if (sp.file) {
          var gltf = window.__APEX_GLTF[sp.id];
          if (gltf) {
            try { vis = A.buildCarVisual(gltf, sp, 0xffffff, G.assets && G.assets.colormap); } catch (e) { vis = null; }
          }
        }
        if (!vis && (sp.style || sp.fallbackStyle)) {
          try { vis = A.buildProceduralCar(sp, sp.paint === undefined ? 0xffffff : sp.paint); } catch (e) { return; }
        }
        if (!vis) return;
        var holder = new THREE.Group();
        holder.add(vis.root);
        vis.root.scale.setScalar(vis.scale);
        grp.add(holder);
        /* 让车在画面中居中 */
        var box = new THREE.Box3().setFromObject(holder);
        var c = box.getCenter(new THREE.Vector3());
        holder.position.sub(c);
        var size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
        var dist = size / (2 * Math.tan(cam.fov * Math.PI / 360)) * 1.35;
        cam.position.set(dist * 0.62, dist * 0.42, -dist * 0.78);
        cam.lookAt(0, 0, 0);
        pr.render(sc, cam);
        var cv = sp._card.querySelector('canvas');
        var ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, 240, 112);
        ctx.drawImage(pr.domElement, 0, 0);
        grp.remove(holder);
      });
      pr.dispose();
      if (pr.domElement.parentNode) pr.domElement.parentNode.removeChild(pr.domElement);
    });
  }

  function segControl(sel, cb) {
    var box = A.$(sel);
    A.on(box, 'click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      [].forEach.call(box.children, function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      cb(b.dataset.v);
    });
  }

  function wireMenu() {
    segControl('#lapsSeg', function (v) { G.totalLaps = parseInt(v, 10); });
    segControl('#aiSeg', function (v) { G.aiCount = parseInt(v, 10); });
    segControl('#diffSeg', function (v) { G.aiDiff = parseFloat(v); });
    segControl('#qualSeg', function (v) { G.quality = v; applyQuality(); });

    var btn = A.$('#startBtn');
    btn.disabled = false;
    btn.textContent = '开始比赛';
    A.on(btn, 'click', function () {
      if (G.audio) { G.audio.init(); G.audio.resume(); }
      G.resultsShown = false;
      startRace();
    });
    A.on(A.$('#againBtn'), 'click', function () {
      G.resultsShown = false;
      startRace();
    });
    A.on(A.$('#resumeBtn'), 'click', function () { togglePause(); });

    A.on(window, 'keydown', onKeyDown);
    A.on(window, 'keyup', function (e) { G.keys[e.code] = false; });
    window.addEventListener('blur', function () {
      G.keys = {};
      if (G.state === 'racing') togglePause();
    });
  }

  function togglePause() {
    if (G.state === 'racing') {
      G.state = 'paused';
      A.$('#pause').classList.remove('hidden');
    } else if (G.state === 'paused') {
      G.state = 'racing';
      A.$('#pause').classList.add('hidden');
      G.clock = performance.now();
    }
  }

  function onKeyDown(e) {
    G.keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
    if (G.state === 'menu' || G.state === 'error') return;
    if (e.code === 'KeyC') setCamMode(G.camMode + 1);
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (e.code === 'KeyM') {
      if (G.audio) { var on = G.audio.toggle(); G.hud.toast(on ? '音效开' : '音效关', 900); }
    }
    if (e.code === 'KeyR') {
      G.resultsShown = false;
      startRace();
    }
    if (e.code === 'KeyH') {
      A.$('#menu').classList.toggle('hidden');
    }
  }

  /* ------------------------------------------------------------ 入口 --- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
