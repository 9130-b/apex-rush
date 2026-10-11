/* ============================================================================
 * utils.js — 数学 / 时间 / 贴图工具
 * ==========================================================================*/
(function () {
  'use strict';
  var A = (window.APEX = window.APEX || {});
  var TAU = Math.PI * 2;

  A.TAU = TAU;
  A.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  A.lerp = function (a, b, t) { return a + (b - a) * t; };
  A.smoothstep = function (e0, e1, x) {
    var t = A.clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  /* 帧率无关的指数平滑 */
  A.damp = function (a, b, lambda, dt) { return A.lerp(a, b, 1 - Math.exp(-lambda * dt)); };
  A.wrapPi = function (a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  };
  A.sign = function (v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); };

  /* 确定性随机，保证每次生成的赛道装饰一致 */
  A.rng = function (seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  A.formatTime = function (ms) {
    if (!isFinite(ms) || ms <= 0) return '--:--.---';
    var m = Math.floor(ms / 60000);
    var s = Math.floor((ms % 60000) / 1000);
    var t = Math.floor(ms % 1000);
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (t < 100 ? (t < 10 ? '00' : '0') : '') + t;
  };
  A.formatDelta = function (ms) {
    if (!isFinite(ms)) return '--.---';
    return (ms >= 0 ? '+' : '-') + (Math.abs(ms) / 1000).toFixed(3);
  };

  /* ---------------------------------------------------------------- 贴图 --- */

  A.maxAniso = 1;

  /* 用 canvas 生成贴图 */
  A.canvasTexture = function (w, h, draw, opts) {
    opts = opts || {};
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    if (opts.srgb !== false) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = A.maxAniso;
    if (opts.nearest) { t.magFilter = THREE.NearestFilter; }
    return t;
  };

  /* 简易 hash 噪声 */
  function hash2(x, y) {
    var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }
  function valueNoise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return A.lerp(A.lerp(a, b, u), A.lerp(c, d, u), v);
  }
  function fbm(x, y, oct, gain) {
    var s = 0, amp = 0.5, f = 1, norm = 0;
    for (var i = 0; i < oct; i++) {
      s += amp * valueNoise(x * f, y * f);
      norm += amp; amp *= (gain || 0.5); f *= 2;
    }
    return s / norm;
  }
  A.fbm = fbm;

  /* 程序化沥青（外部贴图缺失时的兜底） */
  A.makeAsphalt = function (size) {
    size = size || 512;
    return A.canvasTexture(size, size, function (g, w, h) {
      g.fillStyle = '#3a3d40'; g.fillRect(0, 0, w, h);
      var img = g.getImageData(0, 0, w, h), d = img.data;
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var i = (y * w + x) * 4;
          var n = fbm(x * 0.07, y * 0.07, 5, 0.55);
          var grain = hash2(x * 1.7, y * 2.3);
          var v = 44 + n * 46 + grain * 26;
          d[i] = v * 1.0; d[i + 1] = v * 1.02; d[i + 2] = v * 1.07; d[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      /* 裂缝与补丁 */
      g.strokeStyle = 'rgba(18,18,20,.55)'; g.lineWidth = 1.2;
      var r = A.rng(7);
      for (var k = 0; k < 26; k++) {
        g.beginPath();
        var px = r() * w, py = r() * h;
        g.moveTo(px, py);
        for (var s = 0; s < 5; s++) { px += (r() - 0.5) * 60; py += (r() - 0.5) * 60; g.lineTo(px, py); }
        g.stroke();
      }
    });
  };

  /* 程序化草地 */
  A.makeGrass = function (size) {
    size = size || 512;
    return A.canvasTexture(size, size, function (g, w, h) {
      var img = g.createImageData(w, h), d = img.data;
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var i = (y * w + x) * 4;
          var n = fbm(x * 0.05, y * 0.05, 5, 0.6);
          var m = fbm(x * 0.3 + 40, y * 0.3 + 11, 3, 0.5);
          d[i] = 44 + n * 62 + m * 22;
          d[i + 1] = 74 + n * 76 + m * 26;
          d[i + 2] = 30 + n * 40 + m * 14;
          d[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    });
  };

  /* 红白相间（路肩 / 护栏） */
  A.makeStripe = function (a, b, band) {
    a = a || '#e8262f'; b = b || '#f2f2f0'; band = band || 8;
    return A.canvasTexture(64, band * 2, function (g, w, h) {
      g.fillStyle = a; g.fillRect(0, 0, w, h / 2);
      g.fillStyle = b; g.fillRect(0, h / 2, w, h / 2);
      /* 轻微污渍，避免过于干净 */
      g.globalAlpha = 0.10; g.fillStyle = '#000';
      var r = A.rng(3);
      for (var i = 0; i < 90; i++) g.fillRect(r() * w, r() * h, r() * 8 + 1, r() * 4 + 1);
      g.globalAlpha = 1;
    }, { nearest: false });
  };

  /* 棋盘格（起跑线） */
  A.makeChecker = function (n) {
    n = n || 8;
    return A.canvasTexture(n * 16, n * 16, function (g, w, h) {
      var c = w / n;
      for (var y = 0; y < n; y++) {
        for (var x = 0; x < n; x++) {
          g.fillStyle = ((x + y) & 1) ? '#f4f4f2' : '#15171b';
          g.fillRect(x * c, y * c, c, c);
        }
      }
    }, { nearest: true });
  };

  /* 广告牌 */
  A.makeAd = function (text, bg, fg, accent) {
    return A.canvasTexture(512, 128, function (g, w, h) {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = accent; g.fillRect(0, h - 14, w, 14);
      g.fillStyle = fg;
      g.font = 'bold 62px "Segoe UI",Arial,sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 - 6);
      g.globalAlpha = 0.08; g.fillStyle = '#fff';
      for (var i = 0; i < w; i += 6) g.fillRect(i, 0, 3, h);
    });
  };

  /* 程序化天空（HDR 缺失时的兜底），等距柱状投影。
     传入 { fog: 雾色, night: 是否夜晚 } 可让配色与地图一致 */
  A.makeSkyEquirect = function (opts) {
    opts = opts || {};
    var night = !!opts.night;
    var fog = new THREE.Color(opts.fog === undefined ? 0xbfd2dc : opts.fog);
    var top = fog.clone().multiplyScalar(night ? 0.22 : 0.42);
    var mid = fog.clone().multiplyScalar(night ? 0.45 : 0.78);
    var bot = fog.clone().multiplyScalar(night ? 0.62 : 1.12);
    var gnd = fog.clone().multiplyScalar(night ? 0.30 : 0.70);
    var hex = function (c) { return '#' + c.getHexString(); };
    return A.canvasTexture(1024, 512, function (g, w, h) {
      var sky = g.createLinearGradient(0, 0, 0, h * 0.52);
      sky.addColorStop(0.00, hex(top));
      sky.addColorStop(0.45, hex(mid));
      sky.addColorStop(1.00, hex(bot));
      g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.52);
      var grd = g.createLinearGradient(0, h * 0.52, 0, h);
      grd.addColorStop(0, hex(gnd));
      grd.addColorStop(1, hex(gnd.clone().multiplyScalar(0.72)));
      g.fillStyle = grd; g.fillRect(0, h * 0.52, w, h * 0.48);
      if (!night) {
        var sx = w * 0.28, sy = h * 0.20;
        var glow = g.createRadialGradient(sx, sy, 0, sx, sy, 190);
        glow.addColorStop(0, 'rgba(255,252,235,1)');
        glow.addColorStop(0.14, 'rgba(255,244,205,.85)');
        glow.addColorStop(0.5, 'rgba(255,230,180,.20)');
        glow.addColorStop(1, 'rgba(255,230,180,0)');
        g.fillStyle = glow; g.fillRect(0, 0, w, h * 0.55);
      }
      var r = A.rng(night ? 5 : 11);
      g.globalAlpha = night ? 0.25 : 0.5;
      for (var i = 0; i < 90; i++) {
        var cx = r() * w, cy = r() * h * 0.46 + h * 0.02, rad = 20 + r() * 90;
        var cg = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
        cg.addColorStop(0, night ? 'rgba(200,215,240,.6)' : 'rgba(255,255,255,.85)');
        cg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = cg;
        g.beginPath(); g.ellipse(cx, cy, rad, rad * 0.42, 0, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    });
  };

  /* 压低贴图对比度：把原图按 alpha 叠在一层中间色上。
     沥青这类扫描贴图带有明显的大尺度裂缝，平铺后会变成抢眼的条纹，
     压一下对比度再平铺就自然多了。 */
  A.reduceContrast = function (tex, hexBase, alpha) {
    var img = tex.image;
    if (!img || !img.width) return tex;
    var c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    var g = c.getContext('2d');
    g.fillStyle = hexBase;
    g.fillRect(0, 0, c.width, c.height);
    g.globalAlpha = alpha;
    g.drawImage(img, 0, 0);
    g.globalAlpha = 1;
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = A.maxAniso;
    t.needsUpdate = true;
    return t;
  };

  /* -------------------------------------------------------------- 载入器 --- */

  /* 载入外部贴图；失败则用程序化贴图兜底 */
  A.loadTexture = function (url, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var fallback = opts.fallback ? opts.fallback() : null;
      var loader = new THREE.TextureLoader();
      loader.load(url, function (tex) {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
        if (opts.srgb !== false) tex.encoding = THREE.sRGBEncoding;
        tex.anisotropy = A.maxAniso;
        resolve({ tex: tex, external: true });
      }, undefined, function () {
        resolve({ tex: fallback, external: false });
      });
    });
  };

  /* 车辆贴图集（colormap.png）。GLTF 里是外部引用，这里显式载入，
     file:// 下如果读不到就退回内嵌的 data URI */
  A.loadColormap = function () {
    function prep(t) {
      t.flipY = false;                       /* 与 glTF 约定一致 */
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.encoding = THREE.sRGBEncoding;
      t.anisotropy = A.maxAniso;
      return t;
    }
    return new Promise(function (resolve) {
      var loader = new THREE.TextureLoader();
      loader.load('assets/models/Textures/colormap.png',
        function (t) { resolve(prep(t)); },
        undefined,
        function () {
          if (!window.APEX_COLORMAP) return resolve(null);
          new THREE.TextureLoader().load(window.APEX_COLORMAP,
            function (t) { resolve(prep(t)); },
            undefined,
            function () { resolve(null); });
        });
    });
  };

  /* 简易 Promise 版 GLTF 载入：优先本地文件，file:// 下走内嵌 base64。
     window.__FORCE_EMBED 可强制走内嵌分支（用于测试）。
     超跑模型是 Draco 压缩的，需要挂上 DRACOLoader 才能解析。 */
  function makeGLTFLoader() {
    var loader = new THREE.GLTFLoader();
    if (THREE.DRACOLoader) {
      try {
        var draco = new THREE.DRACOLoader();
        draco.setDecoderPath('vendor/draco/');
        loader.setDRACOLoader(draco);
      } catch (e) { console.warn('DRACOLoader 初始化失败', e); }
    }
    return loader;
  }

  A.loadGLTF = function (url, key) {
    return new Promise(function (resolve, reject) {
      var loader = makeGLTFLoader();
      var embedded = window.APEX_EMBED && key && window.APEX_EMBED[key];
      var useEmbedded = embedded && (location.protocol === 'file:' || window.__FORCE_EMBED);
      if (useEmbedded) {
        var bin = atob(embedded);
        var buf = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        loader.parse(buf.buffer, 'assets/models/', resolve, reject);
      } else {
        loader.load(url, resolve, undefined, reject);
      }
    });
  };

  /* ---------------------------------------------------------- DOM 小工具 --- */
  A.$ = function (sel) { return document.querySelector(sel); };
  A.on = function (el, ev, fn) { el.addEventListener(ev, fn, false); };

})( );
