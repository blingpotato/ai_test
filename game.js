(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const highScoreEl = document.getElementById("high-score");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayMessage = document.getElementById("overlay-message");
  const startBtn = document.getElementById("start-btn");

  const GRID = 20;
  const CELL = canvas.width / GRID;
  const TICK_MS = 120;
  const HIGH_SCORE_KEY = "snake-high-score";

  const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  let snake = [];
  let direction = DIRECTIONS.right;
  let nextDirection = DIRECTIONS.right;
  let food = { x: 0, y: 0 };
  let score = 0;
  let highScore = Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
  let playing = false;
  let paused = false;
  let loopId = null;

  highScoreEl.textContent = highScore;

  function initSnake() {
    const mid = Math.floor(GRID / 2);
    snake = [
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
      { x: mid - 3, y: mid },
    ];
    direction = DIRECTIONS.right;
    nextDirection = DIRECTIONS.right;
  }

  function randomFood() {
    let pos;
    do {
      pos = {
        x: Math.floor(Math.random() * GRID),
        y: Math.floor(Math.random() * GRID),
      };
    } while (snake.some((s) => s.x === pos.x && s.y === pos.y));
    food = pos;
  }

  function drawCell(x, y, color, radius = 3) {
    const px = x * CELL;
    const py = y * CELL;
    const pad = 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(px + pad, py + pad, CELL - pad * 2, CELL - pad * 2, radius);
    ctx.fill();
  }

  function drawGrid() {
    ctx.fillStyle = "#1a2332";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(45, 58, 79, 0.4)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL, 0);
      ctx.lineTo(i * CELL, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL);
      ctx.lineTo(canvas.width, i * CELL);
      ctx.stroke();
    }
  }

  function draw() {
    drawGrid();

    drawCell(food.x, food.y, "#f87171", CELL / 2);

    snake.forEach((seg, i) => {
      const isHead = i === 0;
      drawCell(seg.x, seg.y, isHead ? "#86efac" : "#4ade80", isHead ? 6 : 4);
    });
  }

  function isOpposite(a, b) {
    return a.x + b.x === 0 && a.y + b.y === 0;
  }

  function setDirection(dir) {
    const newDir = DIRECTIONS[dir];
    if (newDir && !isOpposite(newDir, direction)) {
      nextDirection = newDir;
    }
  }

  function tick() {
    direction = nextDirection;

    const head = snake[0];
    const newHead = {
      x: head.x + direction.x,
      y: head.y + direction.y,
    };

    if (
      newHead.x < 0 ||
      newHead.x >= GRID ||
      newHead.y < 0 ||
      newHead.y >= GRID ||
      snake.some((s) => s.x === newHead.x && s.y === newHead.y)
    ) {
      gameOver();
      return;
    }

    snake.unshift(newHead);

    if (newHead.x === food.x && newHead.y === food.y) {
      score += 10;
      scoreEl.textContent = score;
      if (score > highScore) {
        highScore = score;
        highScoreEl.textContent = highScore;
        localStorage.setItem(HIGH_SCORE_KEY, highScore);
      }
      randomFood();
    } else {
      snake.pop();
    }

    draw();
  }

  function startGame() {
    score = 0;
    scoreEl.textContent = score;
    initSnake();
    randomFood();
    draw();
    playing = true;
    paused = false;
    overlay.classList.add("hidden");
    clearInterval(loopId);
    loopId = setInterval(tick, TICK_MS);
  }

  function pauseGame() {
    if (!playing || paused) return;
    paused = true;
    clearInterval(loopId);
    loopId = null;
    overlayTitle.textContent = "일시정지";
    overlayMessage.textContent = "스페이스바를 눌러 재개하세요";
    startBtn.textContent = "재개하기";
    overlay.classList.remove("hidden");
  }

  function resumeGame() {
    if (!playing || !paused) return;
    paused = false;
    overlay.classList.add("hidden");
    loopId = setInterval(tick, TICK_MS);
  }

  function gameOver() {
    playing = false;
    paused = false;
    clearInterval(loopId);
    loopId = null;
    overlayTitle.textContent = "게임 오버!";
    overlayMessage.textContent = `점수: ${score}점 — 다시 도전해보세요!`;
    startBtn.textContent = "다시 하기";
    overlay.classList.remove("hidden");
  }

  document.addEventListener("keydown", (e) => {
    const keyMap = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      w: "up",
      W: "up",
      s: "down",
      S: "down",
      a: "left",
      A: "left",
      d: "right",
      D: "right",
    };

    if (keyMap[e.key]) {
      e.preventDefault();
      if (!playing || paused) return;
      setDirection(keyMap[e.key]);
    }

    if (e.key === " ") {
      e.preventDefault();
      if (playing && paused) {
        resumeGame();
      } else if (playing && !paused) {
        pauseGame();
      } else {
        startGame();
      }
    }
  });

  document.querySelectorAll(".dpad-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (playing && !paused) setDirection(btn.dataset.dir);
    });
  });

  startBtn.addEventListener("click", () => {
    if (playing && paused) {
      resumeGame();
    } else {
      startGame();
    }
  });

  initSnake();
  randomFood();
  draw();
})();
