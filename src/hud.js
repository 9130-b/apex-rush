/* ============================================================================
 * hud.js — 抬头显示：仪表盘 / 小地图 / 计时 / 排名
 * ==========================================================================*/
(function () {
  'use strict';
  var A = window.APEX;

  function HUD() {
    this.el = {
      hud: A.$('#hud'),
      lapNow: A.$('#lapNow'), lapTotal: A.$('#lapTotal'),
      posNow: A.$('#posNow'), posTotal: A.$('#posTotal'),
      tCur: A.$('#tCur'), tBest: A.$('#tBest'), tLast: A.$('#tLast'), tDelta: A.$('#tDelta'),
      standings: A.$('#standings'),
      spdVal: A.$('#spdVal'), gearVal: A.$('#gearVal'),
      wrongWay: A.$('#wrongWay'), driftTag: A.$('#driftTag'), driftScore: A.$('#driftScore'),
      toast: A.$('#toast'), camHint: A.$('#camHint')
    };
    this.gauge = A.$('#gauge');
    this.gctx = this.gauge.getContext('2d');
    this.minimap = A.$('#minimap');
    this.mctx = this.minimap.getContext('2d');

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._setupCanvas(this.gauge, this.gctx, 260, 260);
    this._setupCanvas(this.minimap, this.mctx, 220, 220);

    this.mapCache = null;
    this._toastT = 0;
    this._lastStand = '';
    this._lastPos = -1;
    this.displaySpeed = 0;
  }

  HUD.prototype._setupCanvas = function (cv, ctx, w, h) {
    cv.width = w * this.dpr;
    cv.height = h * this.dpr;
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    cv._w = w; cv._h = h;
  };

  HUD.prototype.setVisible = function (on) {
    this.el.hud.classList.toggle('hidden', !on);
    this.el.hud.classList.toggle('on', !!on);
  };

  HUD.prototype.toast = function (msg, ms) {
    var t = this.el.toast;
    t.textContent = msg;
    t.classList.add('on');
    this._toastT = (ms || 2000) / 1000;
  };

  HUD.prototype.camHint = function (msg) {
    var c = this.el.camHint;
    c.textContent = msg;
    c.classList.add('on');
    clearTimeout(this._camT);
    var self = this;
    this._camT = setTimeout(function () { c.classList.remove('on'); }, 1400);
  };

  /* ------------------------------------------------------------ 主刷新 --- */
  HUD.prototype.update = function (dt, st) {
    var e = this.el;
    e.lapNow.textContent = Math.min(st.lap + 1, st.totalLaps);
    e.lapTotal.textContent = st.totalLaps;
    e.posNow.textContent = st.pos;
    e.posTotal.textContent = st.total;

    e.tCur.textContent = A.formatTime(st.lapTime);
    e.tBest.textContent = A.formatTime(st.bestLap);
    e.tLast.textContent = A.formatTime(st.lastLap);
    if (isFinite(st.delta)) {
      e.tDelta.textContent = A.formatDelta(st.delta);
      e.tDelta.classList.toggle('bad', st.delta > 0);
    } else {
      e.tDelta.textContent = '--.---';
    }

    /* 速度 */
    this.displaySpeed = A.damp(this.displaySpeed, Math.abs(st.speed) * 3.6, 14, dt);
    e.spdVal.textContent = Math.round(this.displaySpeed);
    e.gearVal.textContent = st.gear === 0 ? 'R' : st.gear;

    e.wrongWay.classList.toggle('hidden', !st.wrongWay);
    e.driftTag.classList.toggle('on', st.drifting);
    if (st.drifting) e.driftScore.textContent = Math.round(st.driftScore);

    if (this._toastT > 0) {
      this._toastT -= dt;
      if (this._toastT <= 0) e.toast.classList.remove('on');
    }

    this._drawGauge(st);
    this._drawMinimap(st);
    this._drawStandings(st);
  };

  /* ---------------------------------------------------------- 仪表盘 --- */
  HUD.prototype._drawGauge = function (st) {
    var g = this.gctx, W = this.gauge._w, H = this.gauge._h;
    var cx = W / 2, cy = H / 2 + 6, R = W / 2 - 14;
    var a0 = Math.PI * 0.78, a1 = Math.PI * 2.22;

    g.clearRect(0, 0, W, H);

    /* 底盘 */
    g.beginPath();
    g.arc(cx, cy, R + 5, 0, Math.PI * 2);
    g.fillStyle = 'rgba(6,11,19,.66)';
    g.fill();
    g.strokeStyle = 'rgba(120,190,220,.18)';
    g.lineWidth = 1;
    g.stroke();

    var vmaxKmh = Math.ceil((st.vMax * 3.6) / 40) * 40;
    var spd = A.clamp(this.displaySpeed / vmaxKmh, 0, 1);
    var rpm = A.clamp(st.rpm, 0, 1);

    /* 外圈刻度 */
    g.lineCap = 'butt';
    var ticks = 40;
    for (var i = 0; i <= ticks; i++) {
      var t = i / ticks;
      var a = a0 + (a1 - a0) * t;
      var major = (i % 5 === 0);
      var r1 = R - 2, r2 = R - (major ? 13 : 7);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      g.strokeStyle = t > 0.82 ? 'rgba(255,70,90,.85)' : 'rgba(150,205,225,.5)';
      g.lineWidth = major ? 2.4 : 1.2;
      g.stroke();
      if (major) {
        g.save();
        g.fillStyle = 'rgba(180,220,235,.72)';
        g.font = '600 10px ' + getComputedStyle(document.body).fontFamily;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        var rr = R - 24;
        g.fillText(Math.round(vmaxKmh * t / 20) * 20, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        g.restore();
      }
    }

    /* 转速环 */
    g.lineCap = 'round';
    g.beginPath();
    g.arc(cx, cy, R - 30, a0, a1);
    g.strokeStyle = 'rgba(255,255,255,.07)';
    g.lineWidth = 9;
    g.stroke();

    var grad = g.createLinearGradient(cx - R, cy, cx + R, cy);
    grad.addColorStop(0, '#4df3ff');
    grad.addColorStop(0.62, '#7ef7c8');
    grad.addColorStop(0.84, '#ffd166');
    grad.addColorStop(1, '#ff2d6f');
    g.beginPath();
    g.arc(cx, cy, R - 30, a0, a0 + (a1 - a0) * rpm);
    g.strokeStyle = grad;
    g.lineWidth = 9;
    g.stroke();

    /* 红区 */
    g.beginPath();
    g.arc(cx, cy, R - 30, a0 + (a1 - a0) * 0.88, a1);
    g.strokeStyle = 'rgba(255,45,111,.9)';
    g.lineWidth = 9;
    g.stroke();

    /* 指针 */
    var na = a0 + (a1 - a0) * spd;
    g.save();
    g.translate(cx, cy);
    g.rotate(na);
    g.beginPath();
    g.moveTo(-8, 0);
    g.lineTo(R - 36, -2.2);
    g.lineTo(R - 30, 0);
    g.lineTo(R - 36, 2.2);
    g.closePath();
    g.fillStyle = '#ff3f5f';
    g.shadowColor = 'rgba(255,60,90,.9)';
    g.shadowBlur = 12;
    g.fill();
    g.restore();

    g.beginPath();
    g.arc(cx, cy, 6, 0, Math.PI * 2);
    g.fillStyle = '#0d131c';
    g.fill();
    g.strokeStyle = 'rgba(200,230,245,.55)';
    g.lineWidth = 1.4;
    g.stroke();
  };

  /* ---------------------------------------------------------- 小地图 --- */
  HUD.prototype.resetMapCache = function () {
    this.mapCache = null;
    this._lastStand = '';
  };

  HUD.prototype._buildMapCache = function (track) {
    var W = this.minimap._w, H = this.minimap._h;
    var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (var i = 0; i < track.N; i++) {
      var p = track.P[i];
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    var pad = 20;
    var sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
    var ox = (W - (maxX - minX) * sc) / 2 - minX * sc;
    var oy = (H - (maxZ - minZ) * sc) / 2 - minZ * sc;
    this.mapT = { sc: sc, ox: ox, oy: oy };

    var cv = document.createElement('canvas');
    cv.width = W * this.dpr; cv.height = H * this.dpr;
    var c = cv.getContext('2d');
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    var toX = function (x) { return x * sc + ox; };
    var toY = function (z) { return z * sc + oy; };

    /* 路面 */
    c.beginPath();
    for (var k = 0; k <= track.N; k += 2) {
      var pp = track.P[k % track.N];
      var X = toX(pp.x), Y = toY(pp.z);
      if (k === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
    }
    c.closePath();
    c.strokeStyle = 'rgba(255,255,255,.28)';
    c.lineWidth = Math.max(4, track.roadHalf * 2 * sc);
    c.lineJoin = 'round';
    c.stroke();
    c.strokeStyle = 'rgba(120,220,255,.95)';
    c.lineWidth = 2.2;
    c.stroke();

    /* 起跑线 */
    var sp = track.P[0], sr = track.R[0];
    c.beginPath();
    c.moveTo(toX(sp.x - sr.x * track.roadHalf), toY(sp.z - sr.z * track.roadHalf));
    c.lineTo(toX(sp.x + sr.x * track.roadHalf), toY(sp.z + sr.z * track.roadHalf));
    c.strokeStyle = '#ffffff';
    c.lineWidth = 3;
    c.stroke();

    this.mapCache = cv;
  };

  HUD.prototype._drawMinimap = function (st) {
    if (!this.mapCache) this._buildMapCache(st.track);
    var g = this.mctx, W = this.minimap._w, H = this.minimap._h;
    var t = this.mapT;
    g.clearRect(0, 0, W, H);
    g.drawImage(this.mapCache, 0, 0, W, H);

    var toX = function (x) { return x * t.sc + t.ox; };
    var toY = function (z) { return z * t.sc + t.oy; };

    /* 对手 */
    for (var i = 0; i < st.cars.length; i++) {
      var c = st.cars[i];
      if (c === st.car) continue;
      g.beginPath();
      g.arc(toX(c.pos.x), toY(c.pos.z), 3.2, 0, Math.PI * 2);
      g.fillStyle = '#' + new THREE.Color(c.tint === 0xffffff ? 0x99a6ad : c.tint).getHexString();
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,.55)';
      g.lineWidth = 1;
      g.stroke();
    }

    /* 玩家（三角，指示朝向） */
    var p = st.car;
    var px = toX(p.pos.x), py = toY(p.pos.z);
    var yaw = Math.atan2(Math.sin(p.yaw), Math.cos(p.yaw));
    g.save();
    g.translate(px, py);
    g.rotate(-yaw + Math.PI);
    g.beginPath();
    g.moveTo(0, -6.5);
    g.lineTo(4.6, 5.2);
    g.lineTo(0, 2.8);
    g.lineTo(-4.6, 5.2);
    g.closePath();
    g.fillStyle = '#4df3ff';
    g.shadowColor = 'rgba(77,243,255,.95)';
    g.shadowBlur = 10;
    g.fill();
    g.restore();
  };

  /* ---------------------------------------------------------- 排名 --- */
  HUD.prototype._drawStandings = function (st) {
    var key = st.order.map(function (c) { return c.name + '|' + c.lap; }).join(',');
    if (key !== this._lastStand) {
      this._lastStand = key;
      var html = '';
      for (var i = 0; i < st.order.length; i++) {
        var c = st.order[i];
        var col = c.tint === 0xffffff ? '#a9b6bd' : '#' + new THREE.Color(c.tint).getHexString();
        html += '<li class="' + (c === st.car ? 'me' : '') + '">' +
          '<span class="p">' + (i + 1) + '</span>' +
          '<span class="dot" style="background:' + col + ';color:' + col + '"></span>' +
          '<span class="nm">' + c.name + '</span>' +
          '<span class="gp">L' + Math.min(c.lap + 1, st.totalLaps) + '</span></li>';
      }
      this.el.standings.innerHTML = html;
    }
  };

  A.HUD = HUD;

})();
