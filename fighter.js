const FighterGame = (() => {
  const W = 560;
  const H = 320;
  const GROUND = 270;
  const GRAVITY = 0.55;
  const ROUND_TIME = 60;

  let canvas, ctx, overlay, overlayTitle, overlayMessage, startBtn;
  let p1HpEl, p2HpEl, timerEl;
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

  function createFighter(x, facing, color) {
    return {
      x, y: GROUND, vx: 0, vy: 0,
      facing, color,
      hp: 100, maxHp: 100,
      state: "idle", stateTimer: 0,
      onGround: true,
      hitCooldown: 0,
    };
  }

  function resetFighters() {
    p1 = createFighter(140, 1, "#60a5fa");
    p2 = createFighter(W - 140, -1, "#f87171");
    roundTimer = ROUND_TIME;
    timerAccumulator = 0;
    updateHud();
  }

  function updateHud() {
    p1HpEl.style.width = `${(p1.hp / p1.maxHp) * 100}%`;
    p2HpEl.style.width = `${(p2.hp / p2.maxHp) * 100}%`;
    timerEl.textContent = Math.ceil(roundTimer);
  }

  function setState(f, state, duration) {
    f.state = state;
    f.stateTimer = duration;
  }

  function canAct(f) {
    return f.state === "idle" || f.state === "walk" || f.state === "jump";
  }

  function getHitbox(f) {
    if (f.state === "punch" && f.stateTimer > 6) {
      return { x: f.x + f.facing * 38, y: f.y - 52, w: 28, h: 20, dmg: 8 };
    }
    if (f.state === "kick" && f.stateTimer > 8) {
      return { x: f.x + f.facing * 42, y: f.y - 28, w: 32, h: 18, dmg: 12 };
    }
    return null;
  }

  function getBodyBox(f) {
    return { x: f.x - 14, y: f.y - 68, w: 28, h: 68 };
  }

  function boxesOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function applyHit(attacker, defender, dmg) {
    if (defender.hitCooldown > 0 || defender.state === "down") return;
    defender.hp = Math.max(0, defender.hp - dmg);
    defender.vx = attacker.facing * 4;
    defender.vy = -3;
    defender.onGround = false;
    setState(defender, "hit", 14);
    defender.hitCooldown = 20;
    updateHud();
  }

  function checkAttacks() {
    [p1, p2].forEach((attacker) => {
      const hb = getHitbox(attacker);
      if (!hb) return;
      const defender = attacker === p1 ? p2 : p1;
      const body = getBodyBox(defender);
      if (boxesOverlap(hb, body)) applyHit(attacker, defender, hb.dmg);
    });
  }

  function updateFighter(f, left, right, jump, punch, kick) {
    if (f.hitCooldown > 0) f.hitCooldown--;

    if (f.stateTimer > 0) {
      f.stateTimer--;
      if (f.stateTimer === 0 && (f.state === "punch" || f.state === "kick" || f.state === "hit")) {
        f.state = "idle";
      }
    }

    if (f.state === "punch" || f.state === "kick" || f.state === "hit" || f.state === "down") {
      f.vx *= 0.85;
    } else if (canAct(f)) {
      if (left) { f.vx = -3.2; f.facing = -1; f.state = "walk"; }
      else if (right) { f.vx = 3.2; f.facing = 1; f.state = "walk"; }
      else { f.vx *= 0.75; if (f.onGround) f.state = "idle"; }

      if (jump && f.onGround) {
        f.vy = -9.5;
        f.onGround = false;
        f.state = "jump";
      }
      if (punch && f.onGround) setState(f, "punch", 16);
      if (kick && f.onGround) setState(f, "kick", 20);
    }

    f.vy += GRAVITY;
    f.x += f.vx;
    f.y += f.vy;

    if (f.y >= GROUND) {
      f.y = GROUND;
      f.vy = 0;
      f.onGround = true;
      if (f.state === "jump") f.state = "idle";
    }

    f.x = Math.max(30, Math.min(W - 30, f.x));

    if (f === p1 && f.x > p2.x - 20) f.x = p2.x - 20;
    if (f === p2 && f.x < p1.x + 20) f.x = p1.x + 20;
  }

  function tick() {
    if (!playing) return;

    updateFighter(p1, keys.a, keys.d, keys.w, keys.f, keys.g);
    updateFighter(p2, keys.ArrowLeft, keys.ArrowRight, keys.ArrowUp, keys.l || keys.L, keys[";"]);
    checkAttacks();

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

  function drawStickman(f) {
    const { x, y, facing, color, state, stateTimer } = f;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";

    const headY = y - 62;
    ctx.beginPath();
    ctx.arc(x, headY, 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, headY + 10);
    ctx.lineTo(x, y - 30);
    ctx.stroke();

    let armAngle = 0.4;
    let legSpread = 12;
    let armExtend = 18;

    if (state === "walk") {
      legSpread = 14 + Math.sin(Date.now() / 80) * 8;
    } else if (state === "punch") {
      armExtend = stateTimer > 6 ? 32 : 18;
      armAngle = 0;
    } else if (state === "kick") {
      legSpread = stateTimer > 8 ? 36 : 12;
    } else if (state === "hit") {
      ctx.save();
      ctx.translate(x, y - 30);
      ctx.rotate(-facing * 0.3);
      ctx.translate(-x, -(y - 30));
    }

    const shoulderY = y - 48;
    const hipY = y - 30;

    ctx.beginPath();
    ctx.moveTo(x, shoulderY);
    ctx.lineTo(x + facing * armExtend, shoulderY + (state === "punch" ? 2 : 10));
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, shoulderY);
    ctx.lineTo(x - facing * 14, shoulderY + 14);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, hipY);
    ctx.lineTo(x - legSpread / 2, y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, hipY);
    if (state === "kick" && stateTimer > 8) {
      ctx.lineTo(x + facing * 34, y - 10);
    } else {
      ctx.lineTo(x + legSpread / 2, y);
    }
    ctx.stroke();

    if (state === "hit") ctx.restore();
  }

  function draw() {
    ctx.fillStyle = "#1a2332";
    ctx.fillRect(0, 0, W, H);

    const grad = ctx.createLinearGradient(0, 0, 0, GROUND);
    grad.addColorStop(0, "#1e293b");
    grad.addColorStop(1, "#0f172a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, GROUND);

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    ctx.lineTo(W, GROUND);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(W / 2 - 1, 40, 2, GROUND - 40);

    drawStickman(p1);
    drawStickman(p2);
  }

  function loop(timestamp) {
    if (!playing) return;
    if (timestamp - lastTime >= 1000 / 60) {
      lastTime = timestamp;
      tick();
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
    if (e.key === " " && playing) {
      e.preventDefault();
    }
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
