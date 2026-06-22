const FighterGame = (() => {
  const W = 560;
  const H = 320;
  const GROUND = 270;
  const GRAVITY = 0.55;
  const ROUND_TIME = 60;
  const SPECIAL_MAX = 100;
  const SPECIAL_COST = 100;

  let canvas, ctx, overlay, overlayTitle, overlayMessage, startBtn;
  let p1HpEl, p2HpEl, p1SpecialEl, p2SpecialEl, timerEl;
  let animId = null;
  let keyHandler = null;
  let keyUpHandler = null;
  let startHandler = null;
  let keys = {};
  let playing = false;

  let p1, p2;
  let roundTimer = ROUND_TIME;
  let lastTime = 0;
  let timerAccumulator = 0;
  let effects = [];
  let screenShake = 0;

  function createFighter(x, facing, color, skinTone) {
    return {
      x, y: GROUND, vx: 0, vy: 0,
      facing, color, skinTone,
      hp: 100, maxHp: 100,
      state: "idle", stateTimer: 0,
      onGround: true,
      hitCooldown: 0,
      specialMeter: 0,
      specialHitDone: false,
    };
  }

  function resetFighters() {
    p1 = createFighter(140, 1, "#60a5fa", "#fde68a");
    p2 = createFighter(W - 140, -1, "#f87171", "#fecaca");
    roundTimer = ROUND_TIME;
    timerAccumulator = 0;
    effects = [];
    screenShake = 0;
    updateHud();
  }

  function updateHud() {
    p1HpEl.style.width = `${(p1.hp / p1.maxHp) * 100}%`;
    p2HpEl.style.width = `${(p2.hp / p2.maxHp) * 100}%`;
    p1SpecialEl.style.width = `${(p1.specialMeter / SPECIAL_MAX) * 100}%`;
    p2SpecialEl.style.width = `${(p2.specialMeter / SPECIAL_MAX) * 100}%`;
    p1SpecialEl.classList.toggle("ready", p1.specialMeter >= SPECIAL_COST);
    p2SpecialEl.classList.toggle("ready", p2.specialMeter >= SPECIAL_COST);
    timerEl.textContent = Math.ceil(roundTimer);
  }

  function stateDuration(f) {
    const d = { punch: 18, kick: 22, air_kick: 18, special: 42, hit: 16 };
    return d[f.state] || 1;
  }

  function attackProgress(f) {
    return 1 - f.stateTimer / stateDuration(f);
  }

  function isAttacking(f) {
    return f.state === "punch" || f.state === "kick" || f.state === "air_kick" || f.state === "special";
  }

  function setState(f, state, duration) {
    f.state = state;
    f.stateTimer = duration;
    if (state === "special") f.specialHitDone = false;
  }

  function canAct(f) {
    return f.state === "idle" || f.state === "walk" || f.state === "jump";
  }

  function canAirKick(f) {
    return !f.onGround && f.state === "jump";
  }

  function getHitbox(f) {
    if (f.state === "punch") {
      const p = attackProgress(f);
      if (p > 0.35 && p < 0.65) {
        const reach = 44 + Math.sin((p - 0.35) / 0.3 * Math.PI) * 8;
        return { x: f.x + f.facing * reach - 10, y: f.y - 58, w: 26, h: 22, dmg: 8 };
      }
    }
    if (f.state === "kick") {
      const p = attackProgress(f);
      if (p > 0.4 && p < 0.72) {
        const reach = 48 + Math.sin((p - 0.4) / 0.32 * Math.PI) * 10;
        return { x: f.x + f.facing * reach - 12, y: f.y - 36, w: 30, h: 20, dmg: 12 };
      }
    }
    if (f.state === "air_kick") {
      const p = attackProgress(f);
      if (p > 0.3 && p < 0.75) {
        const reach = 46 + Math.sin((p - 0.3) / 0.45 * Math.PI) * 12;
        return { x: f.x + f.facing * reach - 14, y: f.y - 42, w: 34, h: 22, dmg: 10, air: true };
      }
    }
    if (f.state === "special" && !f.specialHitDone) {
      const p = attackProgress(f);
      if (p > 0.45 && p < 0.72) {
        return { x: f.x + f.facing * 20 - 18, y: f.y - 70, w: 56, h: 50, dmg: 25, special: true };
      }
    }
    return null;
  }

  function getBodyBox(f) {
    return { x: f.x - 14, y: f.y - 72, w: 28, h: 72 };
  }

  function boxesOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function spawnHitEffect(x, y, facing, level) {
    const heavy = level >= 2;
    const ultra = level >= 3;
    const count = ultra ? 16 : heavy ? 10 : 6;
    const particles = [];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = ultra ? 5 + Math.random() * 5 : heavy ? 3 + Math.random() * 4 : 2 + Math.random() * 3;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed + facing * (ultra ? 3 : 1.5),
        vy: Math.sin(angle) * speed - (ultra ? 2 : 1),
        life: ultra ? 22 : heavy ? 16 : 12,
        size: ultra ? 4 + Math.random() * 3 : heavy ? 3 + Math.random() * 2 : 2 + Math.random() * 2,
      });
    }
    effects.push({ type: "burst", x, y, facing, life: ultra ? 20 : heavy ? 14 : 10, heavy: heavy || ultra, ultra, particles });
    effects.push({ type: "slash", x, y, facing, life: ultra ? 12 : 8, heavy: heavy || ultra, ultra });
    if (ultra) effects.push({ type: "shockwave", x, y, facing, life: 16, radius: 10 });
    screenShake = ultra ? 12 : heavy ? 6 : 3;
  }

  function applyHit(attacker, defender, hb) {
    if (defender.hitCooldown > 0 || defender.state === "down") return;
    const dmg = hb.dmg;
    if (hb.special) attacker.specialHitDone = true;

    defender.hp = Math.max(0, defender.hp - dmg);
    const knock = hb.special ? 8 : dmg >= 10 ? 5.5 : 3.5;
    defender.vx = attacker.facing * knock;
    defender.vy = hb.special ? -6 : dmg >= 10 ? -4 : -2.5;
    defender.onGround = false;
    setState(defender, "hit", hb.special ? 22 : 16);
    defender.hitCooldown = hb.special ? 30 : 22;

    attacker.specialMeter = Math.min(SPECIAL_MAX, attacker.specialMeter + (hb.special ? 0 : 18));
    defender.specialMeter = Math.min(SPECIAL_MAX, defender.specialMeter + 8);

    const hx = defender.x + attacker.facing * 8;
    const hy = defender.y - 48;
    spawnHitEffect(hx, hy, attacker.facing, hb.special ? 3 : dmg >= 10 ? 2 : 1);
    updateHud();
  }

  function checkAttacks() {
    [p1, p2].forEach((attacker) => {
      const hb = getHitbox(attacker);
      if (!hb) return;
      const defender = attacker === p1 ? p2 : p1;
      if (boxesOverlap(hb, getBodyBox(defender))) applyHit(attacker, defender, hb);
    });
  }

  function updateFighter(f, left, right, jump, punch, kick, special) {
    if (f.hitCooldown > 0) f.hitCooldown--;

    if (f.stateTimer > 0) {
      f.stateTimer--;
      if (f.stateTimer === 0 && (isAttacking(f) || f.state === "hit")) {
        f.state = f.onGround ? "idle" : "jump";
      }
    }

    if (f.state === "special") {
      const p = attackProgress(f);
      if (p < 0.35) {
        f.vx *= 0.7;
      } else if (p >= 0.35 && p < 0.72) {
        f.vx = f.facing * 5.5;
      } else {
        f.vx *= 0.8;
      }
    } else if (f.state === "air_kick") {
      f.vy *= 0.35;
      f.vx *= 0.9;
    } else if (isAttacking(f) || f.state === "hit" || f.state === "down") {
      f.vx *= 0.85;
    } else if (canAct(f)) {
      if (left) { f.vx = -3.2; f.facing = -1; if (f.onGround) f.state = "walk"; }
      else if (right) { f.vx = 3.2; f.facing = 1; if (f.onGround) f.state = "walk"; }
      else { f.vx *= 0.75; if (f.onGround) f.state = "idle"; }

      if (jump && f.onGround) {
        f.vy = -9.5;
        f.onGround = false;
        f.state = "jump";
      }
      if (special && f.specialMeter >= SPECIAL_COST && f.onGround) {
        f.specialMeter -= SPECIAL_COST;
        setState(f, "special", 42);
        effects.push({ type: "charge", fighter: f, life: 14 });
      } else if (punch && f.onGround) {
        setState(f, "punch", 18);
      } else if (kick && f.onGround) {
        setState(f, "kick", 22);
      } else if (kick && canAirKick(f)) {
        setState(f, "air_kick", 18);
      }
    }

    f.vy += GRAVITY;
    f.x += f.vx;
    f.y += f.vy;

    if (f.y >= GROUND) {
      f.y = GROUND;
      f.vy = 0;
      f.onGround = true;
      if (f.state === "jump" || f.state === "air_kick") f.state = "idle";
    }

    f.x = Math.max(30, Math.min(W - 30, f.x));
    if (f === p1 && f.x > p2.x - 24) f.x = p2.x - 24;
    if (f === p2 && f.x < p1.x + 24) f.x = p1.x + 24;
  }

  function updateEffects() {
    effects = effects.filter((e) => {
      e.life--;
      if (e.particles) {
        e.particles.forEach((p) => {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.15;
          p.life--;
        });
        e.particles = e.particles.filter((p) => p.life > 0);
      }
      return e.life > 0 || (e.particles && e.particles.length > 0);
    });
    if (screenShake > 0) screenShake *= 0.8;
    if (screenShake < 0.3) screenShake = 0;
  }

  function tick() {
    if (!playing) return;

    updateFighter(p1, keys.a, keys.d, keys.w, keys.f, keys.g, keys.r || keys.R);
    updateFighter(p2, keys.ArrowLeft, keys.ArrowRight, keys.ArrowUp, keys.l || keys.L, keys[";"], keys.o || keys.O);
    checkAttacks();
    updateEffects();

    timerAccumulator += 1 / 60;
    if (timerAccumulator >= 1) {
      timerAccumulator = 0;
      roundTimer = Math.max(0, roundTimer - 1);
      timerEl.textContent = Math.ceil(roundTimer);
      if (roundTimer <= 0) endRound("time");
    }

    if (p1.hp <= 0) endRound("p2");
    else if (p2.hp <= 0) endRound("p1");

    draw();
  }

  function endRound(winner) {
    playing = false;
    cancelAnimationFrame(animId);
    animId = null;

    let msg;
    if (winner === "p1") msg = "플레이어 1 승리!";
    else if (winner === "p2") msg = "플레이어 2 승리!";
    else msg = p1.hp > p2.hp ? "플레이어 1 승리! (시간)" : p2.hp > p1.hp ? "플레이어 2 승리! (시간)" : "무승부!";

    overlayTitle.textContent = "라운드 종료";
    overlayMessage.textContent = msg;
    startBtn.textContent = "다시 하기";
    overlay.classList.remove("hidden");
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function joint(x, y, len, angle) {
    return { x: x + Math.cos(angle) * len, y: y + Math.sin(angle) * len };
  }

  function resolvePose(f) {
    const { x, y, facing, state } = f;
    const dir = facing;
    const walkPhase = Date.now() / 90;
    const p = attackProgress(f);
    const headY = y - 66;
    const neckY = y - 54;
    const shoulderY = y - 50;
    const hipY = y - 28;
    const base = Math.PI / 2;

    let torsoLean = 0;
    let headTilt = 0;
    let frontUpper = base - 0.5 * dir;
    let frontFore = base - 0.3 * dir;
    let backUpper = base + 0.5 * dir;
    let backFore = base + 0.3 * dir;
    let frontThigh = base - 0.15 * dir;
    let frontShin = base - 0.05 * dir;
    let backThigh = base + 0.15 * dir;
    let backShin = base + 0.05 * dir;
    let fist = false;
    let kickFoot = false;
    let expression = "neutral";

    if (state === "walk") {
      const swing = Math.sin(walkPhase) * 0.45;
      frontThigh = base - dir * (0.2 + swing);
      frontShin = frontThigh - dir * 0.35;
      backThigh = base + dir * (0.2 + swing);
      backShin = backThigh + dir * 0.35;
      frontUpper = base - dir * (0.4 + swing * 0.5);
      frontFore = frontUpper - dir * 0.3;
      backUpper = base + dir * (0.4 + swing * 0.5);
      backFore = backUpper + dir * 0.3;
    } else if (state === "jump") {
      frontThigh = base - dir * 0.55;
      frontShin = base - dir * 0.15;
      backThigh = base + dir * 0.35;
      backShin = base + dir * 0.7;
      frontUpper = base - dir * 0.9;
      backUpper = base + dir * 0.9;
    } else if (state === "punch") {
      expression = "attack";
      torsoLean = dir * 0.12;
      const windup = p < 0.25;
      const strike = p >= 0.25 && p < 0.6;

      if (windup) {
        const t = p / 0.25;
        frontUpper = base - dir * (1.2 + t * 0.5);
        frontFore = frontUpper - dir * 0.4;
        backUpper = base + dir * 0.6;
        backFore = backUpper + dir * 0.5;
      } else if (strike) {
        const t = (p - 0.25) / 0.35;
        frontUpper = base - dir * lerp(1.7, 0.05, t);
        frontFore = frontUpper - dir * lerp(0.4, 0.02, t);
        backUpper = base + dir * 0.3;
        backFore = backUpper + dir * 0.4;
        fist = true;
        torsoLean = dir * lerp(0.12, 0.22, t);
      } else {
        const t = (p - 0.6) / 0.4;
        frontUpper = base - dir * lerp(0.05, 0.5, t);
        frontFore = frontUpper - dir * 0.3;
      }
      backThigh = base + dir * 0.25;
      backShin = base + dir * 0.1;
      frontThigh = base - dir * 0.2;
      frontShin = base - dir * 0.05;
    } else if (state === "kick") {
      expression = "attack";
      torsoLean = -dir * 0.08;
      const windup = p < 0.3;
      const strike = p >= 0.3 && p < 0.65;

      if (windup) {
        const t = p / 0.3;
        frontThigh = base - dir * (0.8 + t * 0.6);
        frontShin = frontThigh - dir * 0.5;
        backThigh = base + dir * 0.1;
        backShin = base + dir * 0.05;
      } else if (strike) {
        const t = (p - 0.3) / 0.35;
        frontThigh = base - dir * lerp(1.4, 0.1, t);
        frontShin = frontThigh - dir * lerp(0.5, 1.6, t);
        kickFoot = true;
        torsoLean = -dir * lerp(0.08, 0.18, t);
        backUpper = base + dir * 0.7;
      }
      backUpper = base + dir * (p > 0.3 && p < 0.65 ? 0.8 : 0.4);
      backFore = backUpper + dir * 0.3;
      frontUpper = base - dir * (p > 0.3 && p < 0.65 ? 1.0 : 0.5);
      frontFore = frontUpper - dir * 0.3;
    } else if (state === "air_kick") {
      expression = "attack";
      torsoLean = -dir * 0.15;
      const strike = p > 0.25;

      frontThigh = base - dir * (strike ? 0.15 : 0.9);
      frontShin = frontThigh - dir * (strike ? 1.75 : 0.4);
      backThigh = base + dir * 0.65;
      backShin = backThigh + dir * 0.55;
      kickFoot = strike;
      frontUpper = base - dir * 1.1;
      frontFore = frontUpper - dir * 0.5;
      backUpper = base + dir * 1.1;
      backFore = backUpper + dir * 0.5;
    } else if (state === "special") {
      expression = "attack";
      const charge = p < 0.35;
      const dash = p >= 0.35 && p < 0.72;
      const recover = p >= 0.72;

      if (charge) {
        const t = p / 0.35;
        torsoLean = -dir * 0.15 * t;
        frontUpper = base - dir * (0.8 + t * 0.4);
        frontFore = frontUpper - dir * 0.5;
        backUpper = base + dir * (0.8 + t * 0.4);
        backFore = backUpper + dir * 0.5;
        frontThigh = base - dir * 0.35;
        backThigh = base + dir * 0.35;
      } else if (dash) {
        const t = (p - 0.35) / 0.37;
        torsoLean = dir * 0.25;
        frontUpper = base - dir * lerp(0.3, 0.02, t);
        frontFore = frontUpper - dir * lerp(0.5, 0.05, t);
        backUpper = base + dir * 0.5;
        backFore = backUpper + dir * 0.3;
        fist = true;
        frontThigh = base - dir * 0.5;
        frontShin = base - dir * 0.2;
        backThigh = base + dir * 0.6;
        backShin = base + dir * 0.3;
      } else {
        const t = (p - 0.72) / 0.28;
        frontUpper = base - dir * lerp(0.02, 0.4, t);
        frontFore = frontUpper - dir * 0.3;
      }
    } else if (state === "hit") {
      expression = "hurt";
      headTilt = -dir * 0.25;
      torsoLean = -dir * 0.2;
      frontUpper = base - dir * 0.9;
      backUpper = base + dir * 0.9;
      frontThigh = base - dir * 0.4;
      backThigh = base + dir * 0.4;
    }

    return {
      x, headY, neckY, shoulderY, hipY, dir, torsoLean, headTilt, expression,
      fist, kickFoot, state, p,
      backUpper, backFore, frontUpper, frontFore,
      backThigh, backShin, frontThigh, frontShin,
    };
  }

  function drawLimb(x, y, upperAngle, foreAngle, upperLen, foreLen, color, thick, endType) {
    const elbow = joint(x, y, upperLen, upperAngle);
    const hand = joint(elbow.x, elbow.y, foreLen, foreAngle);

    ctx.strokeStyle = color;
    ctx.lineWidth = thick;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(elbow.x, elbow.y);
    ctx.lineTo(hand.x, hand.y);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(elbow.x, elbow.y, thick * 0.55, 0, Math.PI * 2);
    ctx.fill();

    if (endType === "fist") {
      ctx.fillStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, thick * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, thick * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    return hand;
  }

  function drawLeg(x, y, thighAngle, shinAngle, thighLen, shinLen, color, thick, endType) {
    const knee = joint(x, y, thighLen, thighAngle);
    const foot = joint(knee.x, knee.y, shinLen, shinAngle);

    ctx.strokeStyle = color;
    ctx.lineWidth = thick;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(knee.x, knee.y);
    ctx.lineTo(foot.x, foot.y);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(knee.x, knee.y, thick * 0.5, 0, Math.PI * 2);
    ctx.fill();

    if (endType === "kick") {
      ctx.fillStyle = "#e2e8f0";
      ctx.save();
      ctx.translate(foot.x, foot.y);
      ctx.rotate(shinAngle);
      ctx.beginPath();
      ctx.roundRect(-4, -6, 18, 12, 3);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(foot.x, foot.y, thick * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    return foot;
  }

  function drawHead(pose, f) {
    const { x, headY, dir, headTilt, expression } = pose;
    const r = 12;

    ctx.save();
    ctx.translate(x, headY);
    ctx.rotate(headTilt);

    ctx.fillStyle = f.skinTone;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = f.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    const eyeY = -2;
    const eyeSpacing = 5;
    const pupilShift = dir * 1.5;

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(-eyeSpacing + pupilShift * 0.3, eyeY, 3.2, 3.8, 0, 0, Math.PI * 2);
    ctx.ellipse(eyeSpacing + pupilShift * 0.3, eyeY, 3.2, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(-eyeSpacing + pupilShift, eyeY, 1.8, 0, Math.PI * 2);
    ctx.arc(eyeSpacing + pupilShift, eyeY, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    const browY = eyeY - 5;
    if (expression === "attack") {
      ctx.beginPath();
      ctx.moveTo(-eyeSpacing - 3, browY + 2);
      ctx.lineTo(-eyeSpacing + 3, browY - 1);
      ctx.moveTo(eyeSpacing - 3, browY - 1);
      ctx.lineTo(eyeSpacing + 3, browY + 2);
      ctx.stroke();
    } else if (expression === "hurt") {
      ctx.beginPath();
      ctx.moveTo(-eyeSpacing - 3, browY);
      ctx.lineTo(-eyeSpacing + 3, browY + 3);
      ctx.moveTo(eyeSpacing - 3, browY + 3);
      ctx.lineTo(eyeSpacing + 3, browY);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-eyeSpacing - 3, browY);
      ctx.lineTo(-eyeSpacing + 3, browY);
      ctx.moveTo(eyeSpacing - 3, browY);
      ctx.lineTo(eyeSpacing + 3, browY);
      ctx.stroke();
    }

    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (expression === "attack") {
      ctx.arc(0, 5, 3, 0.1, Math.PI - 0.1);
    } else if (expression === "hurt") {
      ctx.arc(0, 8, 3.5, Math.PI + 0.2, -0.2);
    } else {
      ctx.moveTo(-2, 5);
      ctx.lineTo(2, 5);
    }
    ctx.stroke();

    ctx.restore();
  }

  function drawAttackTrail(pose, f) {
    const { state, p, dir, shoulderY, x, hipY } = pose;
    if (!isAttacking({ state })) return;

    ctx.save();
    if (state === "punch" && p > 0.25 && p < 0.7) {
      ctx.globalAlpha = 0.25 + Math.sin(p * Math.PI) * 0.2;
      const hx = x + dir * lerp(20, 52, (p - 0.25) / 0.45);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(hx - dir * 16, shoulderY + 4, 22, dir === 1 ? -0.8 : Math.PI - 0.8, dir === 1 ? 0.8 : Math.PI + 0.8);
      ctx.stroke();
    } else if ((state === "kick" || state === "air_kick") && p > 0.25 && p < 0.75) {
      ctx.globalAlpha = state === "air_kick" ? 0.35 : 0.25 + Math.sin(p * Math.PI) * 0.2;
      const kx = x + dir * lerp(18, state === "air_kick" ? 58 : 56, (p - 0.25) / 0.5);
      const ky = state === "air_kick" ? hipY - 8 : shoulderY + 30;
      ctx.strokeStyle = state === "air_kick" ? "#93c5fd" : "#fff";
      ctx.lineWidth = state === "air_kick" ? 5 : 4;
      ctx.beginPath();
      ctx.moveTo(kx - dir * 30, ky + 8);
      ctx.quadraticCurveTo(kx, ky - 10, kx + dir * 8, ky - 20);
      ctx.stroke();
    } else if (state === "special") {
      ctx.globalAlpha = 0.4 + Math.sin(p * Math.PI * 2) * 0.15;
      if (p < 0.35) {
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, shoulderY + 10, 28 + p * 20, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p < 0.72) {
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 4;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(x - dir * (20 + i * 12), shoulderY);
          ctx.lineTo(x + dir * (30 + i * 8), shoulderY - 10 + i * 8);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function drawSpecialAura(f) {
    if (f.state === "special") {
      const p = attackProgress(f);
      ctx.save();
      ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 60) * 0.15;
      const grad = ctx.createRadialGradient(f.x, f.y - 40, 5, f.x, f.y - 40, 40 + p * 20);
      grad.addColorStop(0, "#fbbf24");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(f.x, f.y - 40, 40 + p * 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (f.specialMeter >= SPECIAL_COST) {
      ctx.save();
      ctx.globalAlpha = 0.15 + Math.sin(Date.now() / 120) * 0.08;
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x, f.y - 40, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawFighter(f) {
    drawSpecialAura(f);
    const pose = resolvePose(f);
    const color = f.color;

    drawAttackTrail(pose, f);

    ctx.save();
    if (pose.torsoLean) {
      ctx.translate(f.x, pose.hipY);
      ctx.rotate(pose.torsoLean);
      ctx.translate(-f.x, -pose.hipY);
    }

    drawLeg(f.x, pose.hipY, pose.backThigh, pose.backShin, 16, 18, color, 3.5, null);
    drawLeg(f.x, pose.hipY, pose.frontThigh, pose.frontShin, 16, 18, color, 4,
      pose.kickFoot ? "kick" : null);

    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(f.x, pose.neckY);
    ctx.lineTo(f.x, pose.hipY);
    ctx.stroke();

    drawLimb(f.x, pose.shoulderY, pose.backUpper, pose.backFore, 14, 13, color, 3, null);
    drawLimb(f.x, pose.shoulderY, pose.frontUpper, pose.frontFore, 14, 14, color, 3.5,
      pose.fist ? "fist" : null);

    ctx.restore();
    drawHead(pose, f);
  }

  function drawEffects() {
    effects.forEach((e) => {
      const alpha = e.life / (e.ultra ? 20 : e.heavy ? 14 : 10);
      if (e.type === "slash") {
        ctx.save();
        ctx.globalAlpha = alpha * 0.8;
        ctx.strokeStyle = e.ultra ? "#fbbf24" : e.heavy ? "#fbbf24" : "#f8fafc";
        ctx.lineWidth = e.ultra ? 4 : e.heavy ? 3 : 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        const spread = e.ultra ? 24 : e.heavy ? 18 : 12;
        ctx.moveTo(e.x - e.facing * 6, e.y - spread);
        ctx.lineTo(e.x + e.facing * 14, e.y);
        ctx.lineTo(e.x - e.facing * 4, e.y + spread);
        ctx.stroke();
        ctx.restore();
      }
      if (e.type === "shockwave") {
        const r = e.radius + (16 - e.life) * 4;
        ctx.save();
        ctx.globalAlpha = alpha * 0.6;
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (e.type === "charge" && e.fighter) {
        ctx.save();
        ctx.globalAlpha = (e.life / 14) * 0.5;
        ctx.fillStyle = "#fbbf24";
        ctx.font = "bold 14px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("필살기!", e.fighter.x, e.fighter.y - 90);
        ctx.restore();
      }
      if (e.particles) {
        e.particles.forEach((p) => {
          ctx.save();
          ctx.globalAlpha = (p.life / 16) * 0.9;
          ctx.fillStyle = e.ultra ? "#fbbf24" : e.heavy ? "#fbbf24" : "#f8fafc";
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      }
    });
  }

  function drawBackground() {
    ctx.fillStyle = "#1a2332";
    ctx.fillRect(0, 0, W, H);

    const grad = ctx.createLinearGradient(0, 0, 0, GROUND);
    grad.addColorStop(0, "#1e293b");
    grad.addColorStop(1, "#0f172a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, GROUND);

    ctx.fillStyle = "rgba(255,255,255,0.03)";
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(40 + i * 110, 60, 60, 120);
    }

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    ctx.lineTo(W, GROUND);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(W / 2 - 1, 40, 2, GROUND - 40);
  }

  function draw() {
    ctx.save();
    if (screenShake > 0) {
      ctx.translate(
        (Math.random() - 0.5) * screenShake,
        (Math.random() - 0.5) * screenShake
      );
    }

    drawBackground();
    drawFighter(p1);
    drawFighter(p2);
    drawEffects();
    ctx.restore();
  }

  function loop(timestamp) {
    if (!playing) return;
    if (timestamp - lastTime >= 1000 / 60) {
      lastTime = timestamp;
      tick();
    } else {
      draw();
    }
    animId = requestAnimationFrame(loop);
  }

  function startGame() {
    resetFighters();
    draw();
    playing = true;
    lastTime = 0;
    overlay.classList.add("hidden");
    cancelAnimationFrame(animId);
    animId = requestAnimationFrame(loop);
  }

  function onKeyDown(e) {
    keys[e.key] = true;
    if (e.key === " " && !playing && overlayVisible()) {
      e.preventDefault();
      startGame();
    }
    if (e.key === " " && playing) e.preventDefault();
  }

  function onKeyUp(e) {
    keys[e.key] = false;
  }

  function overlayVisible() {
    return !overlay.classList.contains("hidden");
  }

  function bindControls() {
    keyHandler = onKeyDown;
    keyUpHandler = onKeyUp;
    startHandler = startGame;
    document.addEventListener("keydown", keyHandler);
    document.addEventListener("keyup", keyUpHandler);
    startBtn.addEventListener("click", startHandler);
  }

  function unbindControls() {
    if (keyHandler) document.removeEventListener("keydown", keyHandler);
    if (keyUpHandler) document.removeEventListener("keyup", keyUpHandler);
    if (startHandler) startBtn.removeEventListener("click", startHandler);
    keyHandler = null;
    keyUpHandler = null;
    startHandler = null;
    keys = {};
  }

  return {
    init() {
      canvas = document.getElementById("fighter-canvas");
      ctx = canvas.getContext("2d");
      overlay = document.getElementById("fighter-overlay");
      overlayTitle = document.getElementById("fighter-overlay-title");
      overlayMessage = document.getElementById("fighter-overlay-message");
      startBtn = document.getElementById("fighter-start-btn");
      p1HpEl = document.getElementById("p1-hp");
      p2HpEl = document.getElementById("p2-hp");
      p1SpecialEl = document.getElementById("p1-special");
      p2SpecialEl = document.getElementById("p2-special");
      timerEl = document.getElementById("round-timer");

      playing = false;
      overlayTitle.textContent = "졸라맨 격투";
      overlayMessage.textContent = "스페이스바 또는 시작하기 버튼";
      startBtn.textContent = "시작하기";
      overlay.classList.remove("hidden");

      resetFighters();
      draw();
      bindControls();
    },

    destroy() {
      playing = false;
      cancelAnimationFrame(animId);
      animId = null;
      unbindControls();
    },
  };
})();
