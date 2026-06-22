(() => {
  const screens = {
    menu: document.getElementById("menu-screen"),
    snake: document.getElementById("snake-screen"),
    fighter: document.getElementById("fighter-screen"),
  };

  let activeGame = null;

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  function stopActiveGame() {
    if (activeGame === "snake") SnakeGame.destroy();
    if (activeGame === "fighter") FighterGame.destroy();
    activeGame = null;
  }

  function startGame(name) {
    stopActiveGame();
    showScreen(name);
    activeGame = name;

    if (name === "snake") SnakeGame.init();
    if (name === "fighter") FighterGame.init();
  }

  document.querySelectorAll(".menu-card[data-game]").forEach((card) => {
    card.addEventListener("click", () => startGame(card.dataset.game));
  });

  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => {
      stopActiveGame();
      showScreen("menu");
    });
  });
})();
