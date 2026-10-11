/* ============================================================================
 * audio.js — 全部用 WebAudio 实时合成：引擎 / 轮胎 / 风噪 / 碰撞 / 提示音
 * ==========================================================================*/
(function () {
  'use strict';
  var A = window.APEX;

  function Audio() {
    this.ctx = null;
    this.ready = false;
    this.enabled = true;
    this.volume = 0.75;
  }

  Audio.prototype.init = function () {
    if (this.ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var ctx = this.ctx = new AC();

    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    this.master.connect(ctx.destination);

    /* --- 噪声源（循环白噪声，供轮胎/风噪/碰撞复用） --- */
    var len = ctx.sampleRate * 2;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    /* --- 引擎 --- */
    var eg = this.engineGain = ctx.createGain();
    eg.gain.value = 0;
    var lp = this.engineLP = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.Q.value = 2.4;
    var hp = this.engineHP = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 45;
    /* 失真让声音更有“肌肉感” */
    var shaper = this.shaper = ctx.createWaveShaper();
    var n = 1024, curve = new Float32Array(n);
    for (var k = 0; k < n; k++) {
      var x = (k / (n - 1)) * 2 - 1;
      curve[k] = Math.tanh(x * 2.6) * 0.85;
    }
    shaper.curve = curve;
    shaper.oversample = '2x';

    var mkOsc = function (type, mul, amt) {
      var o = ctx.createOscillator();
      o.type = type;
      var g = ctx.createGain();
      g.gain.value = amt;
      o.connect(g); g.connect(lp);
      o.start();
      return { osc: o, mul: mul, node: g, amt: amt };
    };
    this.oscs = [
      mkOsc('sawtooth', 1.0, 0.42),
      mkOsc('sawtooth', 2.02, 0.24),
      mkOsc('square', 0.5, 0.30),
      mkOsc('sawtooth', 3.01, 0.12)
    ];

    /* 引擎进气噪声 */
    var ns = ctx.createBufferSource();
    ns.buffer = buf; ns.loop = true;
    var nf = ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 420; nf.Q.value = 0.8;
    this.intakeGain = ctx.createGain();
    this.intakeGain.gain.value = 0;
    ns.connect(nf); nf.connect(this.intakeGain); this.intakeGain.connect(lp);
    ns.start();

    lp.connect(hp); hp.connect(shaper); shaper.connect(eg); eg.connect(this.master);

    /* --- 轮胎打滑 --- */
    var ts = ctx.createBufferSource();
    ts.buffer = buf; ts.loop = true;
    var tbp = ctx.createBiquadFilter();
    tbp.type = 'bandpass'; tbp.frequency.value = 2600; tbp.Q.value = 1.1;
    var thp = ctx.createBiquadFilter();
    thp.type = 'highpass'; thp.frequency.value = 1200;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    ts.connect(tbp); tbp.connect(thp); thp.connect(this.skidGain); this.skidGain.connect(this.master);
    ts.start();

    /* --- 风噪 / 路面 --- */
    var ws = ctx.createBufferSource();
    ws.buffer = buf; ws.loop = true;
    var wlp = ctx.createBiquadFilter();
    wlp.type = 'lowpass'; wlp.frequency.value = 620;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    ws.connect(wlp); wlp.connect(this.windGain); this.windGain.connect(this.master);
    ws.start();

    this.ready = true;
  };

  Audio.prototype.resume = function () {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  };

  Audio.prototype.setEnabled = function (on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? this.volume : 0;
  };

  Audio.prototype.toggle = function () { this.setEnabled(!this.enabled); return this.enabled; };

  /* 每帧更新引擎音 */
  Audio.prototype.update = function (dt, car, active) {
    if (!this.ready) return;
    var t = this.ctx.currentTime;
    var rpm = car ? car.rpm : 0.12;
    var spd = car ? Math.abs(car.speed) : 0;
    var thr = car && car._lastThrottle !== undefined ? car._lastThrottle : 0;
    var target = active ? 1 : 0;

    var base = 30 + rpm * 168;
    var revMix = 0.55 + thr * 0.45;
    for (var i = 0; i < this.oscs.length; i++) {
      var o = this.oscs[i];
      o.osc.frequency.setTargetAtTime(base * o.mul, t, 0.035);
      /* 高转速略微削一点音量，避免刺耳 */
      o.node.gain.setTargetAtTime(target * o.amt * revMix * (1 - rpm * 0.18), t, 0.06);
    }
    this.engineLP.frequency.setTargetAtTime(600 + rpm * 3400 + thr * 900, t, 0.05);
    this.engineGain.gain.setTargetAtTime(target * (0.30 + rpm * 0.30 + thr * 0.12), t, 0.05);
    this.intakeGain.gain.setTargetAtTime(target * (0.05 + thr * 0.22), t, 0.06);

    /* 打滑音量：由侧滑角与手刹决定 */
    var slip = car ? Math.abs(car.slip) : 0;
    var skid = active ? A.clamp((slip - 0.16) * 2.4, 0, 1) * A.clamp(spd / 12, 0, 1) : 0;
    this.skidGain.gain.setTargetAtTime(skid * 0.30, t, 0.05);

    var wind = active ? A.clamp(spd / 80, 0, 1) : 0;
    this.windGain.gain.setTargetAtTime(wind * 0.16, t, 0.1);
  };

  /* 碰撞音 */
  Audio.prototype.impact = function (strength) {
    if (!this.ready || !this.enabled) return;
    if (!isFinite(strength)) strength = 8;
    var ctx = this.ctx, t = ctx.currentTime;
    var s = A.clamp(strength / 20, 0.12, 1);

    var src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.6 + Math.random() * 0.5;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 180 + Math.random() * 260;
    bp.Q.value = 0.7;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.85 * s, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16 + s * 0.2);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.6);

    /* 低频撞击 */
    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.7 * s, t + 0.008);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.4);
  };

  /* 提示音 */
  Audio.prototype.beep = function (freq, dur, vol, type) {
    if (!this.ready || !this.enabled) return;
    var ctx = this.ctx, t = ctx.currentTime;
    var o = ctx.createOscillator();
    o.type = type || 'square';
    o.frequency.value = freq;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime((vol || 0.22), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.16));
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + (dur || 0.16) + 0.05);
  };

  A.Audio = Audio;

})();
