let karma = 0;
let fbiSuspicion = 0;
let clout = 0;
let chaosLevel = 1;
let turn = 0;

const scenarios = [
  {
    text: "You found a USB in the parking lot. What do you do?",
    choices: [
      { text: "Plug it in", karma: -5, fbi: +10, clout: 0 },
      { text: "Throw it away", karma: +5, fbi: -2, clout: -1 },
      { text: "Sell it on Facebook Marketplace", karma: -2, fbi: +5, clout: +3 },
      { text: "Post about it on Reddit", karma: +1, fbi: +3, clout: +8 }
    ]
  }
];

const randomEvents = [
  { text: "💀 The USB installs 47 toolbars.", karma: -3, fbi: +5 },
  { text: "📈 Your Reddit post hits front page.", clout: +15 },
  { text: "🚨 The FBI adds you to a 'watch-ish' list.", fbi: +12 },
  { text: "🧙 You gain ironic meme immunity.", karma: +7 }
];

function renderScenario() {
  document.getElementById("scenario").innerText = scenarios[0].text;
  const choicesDiv = document.getElementById("choices");
  choicesDiv.innerHTML = "";

  scenarios[0].choices.forEach(choice => {
    const btn = document.createElement("button");
    btn.innerText = choice.text;
    btn.onclick = () => applyChoice(choice);
    choicesDiv.appendChild(btn);
  });
}

function applyChoice(choice) {
  karma += choice.karma;
  fbiSuspicion += choice.fbi;
  clout += choice.clout;
  chaosLevel++;
  turn++;

  maybeTriggerEvent();
  updateStats();
  checkGameOver();
}

function maybeTriggerEvent() {
  if (Math.random() < 0.5) {
    const event = randomEvents[Math.floor(Math.random() * randomEvents.length)];
    alert(event.text);
    karma += event.karma || 0;
    fbiSuspicion += event.fbi || 0;
    clout += event.clout || 0;
  }
}

function updateStats() {
  document.getElementById("karma").innerText = karma;
  document.getElementById("fbi").innerText = fbiSuspicion;
  document.getElementById("clout").innerText = clout;
  document.getElementById("chaos").innerText = chaosLevel;
}

function checkGameOver() {
  if (fbiSuspicion >= 50) {
    endGame("🚨 You are now permanently 'interesting' to federal agencies.");
  } else if (karma <= -50) {
    endGame("🪦 The universe has decided you're the villain.");
  } else if (clout >= 100) {
    endGame("🌐 You transcend into pure internet energy.");
  }
}

function endGame(message) {
  document.getElementById("scenario").innerText = message;
  document.getElementById("choices").innerHTML = "";
  document.getElementById("restart").style.display = "inline-block";
}

function restartGame() {
  karma = 0;
  fbiSuspicion = 0;
  clout = 0;
  chaosLevel = 1;
  turn = 0;
  document.getElementById("restart").style.display = "none";
  renderScenario();
  updateStats();
}

renderScenario();
updateStats();