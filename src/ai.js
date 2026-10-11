/* ============================================================================
 * ai.js — AI 车手
 *   跟随赛车线 + 依据曲率计算的目标速度（含刹车点预估）
 * ==========================================================================*/
(function () {
  'use strict';
  var A = window.APEX;

  var _tgt = new THREE.Vector3(), _d = new THREE.Vector3();

  function posAtFloat(track, fi, lat, out) {
    var N = track.N;
    var i0 = Math.floor(fi), f = fi - Math.floor(fi);
    i0 = ((i0 % N) + N) % N;
    var i1 = (i0 + 1) % N;
    var p0 = track.P[i0], p1 = track.P[i1], r0 = track.R[i0], r1 = track.R[i1];
    out.set(
      A.lerp(p0.x, p1.x, f) + A.lerp(r0.x, r1.x, f) * lat, 0,
      A.lerp(p0.z, p1.z, f) + A.lerp(r0.z, r1.z, f) * lat
    );
    return out;
  }

  function AI(car, opts) {
    opts = opts || {};
    this.car = car;
    this.skill = opts.skill === undefined ? 1.0 : opts.skill;
    this.lineBias = opts.lineBias || 0;
    this.aggression = opts.aggression === undefined ? 1 : opts.aggression;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.stuckT = 0;
    this.reverseT = 0;
    this.mistakeT = 0;
    this.mistakeCd = 4 + Math.random() * 12;
    this.startBoost = 0;
    this.rubber = 1;
    this._rnd = A.rng(Math.floor(Math.random() * 1e9));
  }

  AI.prototype.update = function (dt, track, cars) {
    var car = this.car, inp = this.input;
    var spd = car.speed;

    /* 卡住检测：倒车脱困 */
    if (Math.abs(spd) < 1.6 && car.progress > 0) this.stuckT += dt; else this.stuckT = 0;
    if (this.stuckT > 1.6) { this.reverseT = 1.1; this.stuckT = 0; }
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      inp.throttle = 0; inp.brake = 1; inp.steer = 0.45; inp.handbrake = false;
      return inp;
    }

    /* 偶发失误（松油门），让比赛更自然 */
    this.mistakeCd -= dt;
    if (this.mistakeCd <= 0) {
      this.mistakeCd = 7 + this._rnd() * 16;
      this.mistakeT = 0.35 + this._rnd() * 0.7;
    }
    if (this.mistakeT > 0) this.mistakeT -= dt;

    /* --- 前视点 --- */
    var la = 7 + Math.abs(spd) * 0.62;
    var fi = track.indexAtArc(car.arc + la);

    /* --- 避让：前方有车就稍微让线 --- */
    var avoid = 0;
    for (var i = 0; i < cars.length; i++) {
      var o = cars[i];
      if (o === car) continue;
      var dArc = o.progress - car.progress;
      if (dArc > 0.5 && dArc < 17) {
        var dLat = o.lateral - car.lateral;
        if (Math.abs(dLat) < 3.0) {
          avoid += (dLat >= 0 ? -1 : 1) * (1 - Math.abs(dLat) / 3.0) * 2.6;
        }
      }
    }
    avoid = A.clamp(avoid, -2.6, 2.6);

    var lat = track.lineAt(fi, this.lineBias + avoid);
    posAtFloat(track, fi, lat, _tgt);

    /* --- 转向 --- */
    _d.subVectors(_tgt, car.pos);
    var desiredYaw = Math.atan2(_d.x, _d.z);
    var err = A.wrapPi(desiredYaw - car.yaw);
    /* 高速时增益略降，避免摆动 */
    var gain = 2.9 / (1 + Math.abs(spd) / 72);
    var steer = A.clamp(-err * gain, -1, 1);
    /* 大角度时补一点反向稳定 */
    steer -= A.clamp(car.yawRate * 0.10, -0.25, 0.25);
    inp.steer = A.clamp(steer, -1, 1);

    /* --- 目标速度：直接取刹车包络曲线上略微前视的一点 --- */
    var laSpeed = 6 + Math.abs(spd) * 0.78;
    var fiSpeed = track.indexAtArc(car.arc + laSpeed);
    var vTarget = track.speedAt(fiSpeed) * this.skill * this.rubber;
    /* 出界后目标速度降低 */
    if (!car.onTrack) vTarget = Math.min(vTarget, 26);

    var diff = vTarget - spd;
    if (this.mistakeT > 0) { inp.throttle = 0; inp.brake = 0; }
    else if (diff > 1.5) { inp.throttle = 1; inp.brake = 0; }
    else if (diff > -0.5) { inp.throttle = 0.45; inp.brake = 0; }
    else {
      inp.throttle = 0;
      inp.brake = A.clamp(-diff / 14, 0.15, 1);
    }
    /* 转向吃力时松油 */
    if (Math.abs(err) > 0.42 && spd > 20) inp.throttle = Math.min(inp.throttle, 0.15);
    inp.handbrake = false;

    /* 起跑反应 */
    if (car.totalTime < 0.35 && this.startBoost > 0) inp.throttle = 0;

    return inp;
  };

  A.AI = AI;

})();
