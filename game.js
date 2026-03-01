/* Cursed Decision Game — Terminal Edition
   - Procedural scenarios, branching, random events, modifiers
   - Fake live chat reactions
   - Achievements, endings, autosave (localStorage)
   - Glitch + sound (WebAudio)
*/

const $ = (id) => document.getElementById(id);

// -------------------------
// State + persistence
// -------------------------
const STORAGE_KEY = "cursedDecisionGame_v2";

const defaultState = () => ({
  karma: 0,
  fbi: 0,
  clout: 0,
  chaos: 1,
  sanity: 100,
  turn: 0,
  modifiers: [],       // global modifiers that persist a few turns
  achievements: [],    // unlocked ids
  endings: [],         // archive entries
  timelineSeed: Math.floor(Math.random() * 1e9),
  isMuted: false
});

let state = loadState() ?? defaultState();
let lastScenario = null;

// -------------------------
// WebAudio SFX (no assets)
// -------------------------
let audioCtx = null;

function ensureAudio() {
  if (state.isMuted) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function beep(freq = 440, ms = 70, type = "square", gain = 0.03) {
  if (state.isMuted) return;
  ensureAudio();
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start();
  setTimeout(() => { o.stop(); }, ms);
}
function clickSound() { beep(180, 40, "square", 0.02); }
function eventSound() { beep(520, 90, "sawtooth", 0.03); setTimeout(()=>beep(300,70,"square",0.02), 90); }
function endingSound() { beep(110, 140, "triangle", 0.04); setTimeout(()=>beep(70,220,"sine",0.03), 140); }

// -------------------------
// UI helpers
// -------------------------
function logLine(text, tone = "dim") {
  const el = $("log");
  const p = document.createElement("div");
  p.className = tone === "warn" ? "warn" : "";
  p.innerHTML = `<span class="dim">[${new Date().toLocaleTimeString()}]</span> ${escapeHtml(text)}`;
  el.appendChild(p);
  el.scrollTop = el.scrollHeight;
}

function chatLine(text) {
  const el = $("chat");
  const p = document.createElement("div");
  p.innerHTML = escapeHtml(text);
  el.appendChild(p);
  el.scrollTop = el.scrollHeight;
}

function banner(text, ms = 1800) {
  const b = $("eventBanner");
  b.textContent = text;
  b.classList.remove("hidden");
  setTimeout(() => b.classList.add("hidden"), ms);
}

function updateHud() {
  $("karma").textContent = state.karma;
  $("fbi").textContent = state.fbi;
  $("clout").textContent = state.clout;
  $("chaos").textContent = state.chaos;
  $("sanity").textContent = state.sanity;
  $("turnReadout").textContent = `Turn ${state.turn}`;
  $("modReadout").textContent = `Mods: ${state.modifiers.length ? state.modifiers.map(m => m.name).join(", ") : "none"}`;

  // glitch intensity based on FBI + chaos
  const crt = $("crt");
  crt.classList.remove("glitch-1","glitch-2","glitch-3");
  const intensity = Math.max(
    Math.floor(state.fbi / 20),
    Math.floor((state.chaos - 1) / 6)
  );
  if (intensity >= 3) crt.classList.add("glitch-3");
  else if (intensity === 2) crt.classList.add("glitch-2");
  else if (intensity === 1) crt.classList.add("glitch-1");

  renderAchievements();
  renderEndings();
}

function renderAchievements() {
  const box = $("achievements");
  box.innerHTML = "";
  if (!state.achievements.length) {
    const d = document.createElement("div");
    d.className = "dim";
    d.textContent = "No achievements. Yet.";
    box.appendChild(d);
    return;
  }
  for (const id of state.achievements) {
    const a = ACHIEVEMENTS.find(x => x.id === id);
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = a ? a.name : id;
    box.appendChild(chip);
  }
}

function renderEndings() {
  const box = $("endings");
  box.innerHTML = "";
  if (!state.endings.length) {
    box.innerHTML = `<div class="dim">No endings logged.</div>`;
    return;
  }
  const last = state.endings.slice(-6).reverse();
  for (const e of last) {
    const line = document.createElement("div");
    line.innerHTML = `<span class="dim">${escapeHtml(e.when)}</span> — ${escapeHtml(e.title)}`;
    box.appendChild(line);
  }
}

// -------------------------
// Achievements
// -------------------------
const ACHIEVEMENTS = [
  { id: "first_blood", name: "First Bad Decision", check: () => state.turn >= 1 },
  { id: "reddit_moment", name: "Reddit Moment", check: () => state.clout >= 25 },
  { id: "federal_interest", name: "Federally Interesting", check: () => state.fbi >= 30 },
  { id: "no_grass", name: "Touched No Grass", check: () => state.turn >= 12 },
  { id: "moral_collapse", name: "Moral Collapse", check: () => state.karma <= -20 },
  { id: "saint", name: "Accidental Saint", check: () => state.karma >= 25 },
  { id: "brainrot", name: "Brainrot Ascending", check: () => state.chaos >= 10 },
  // secret-ish
  { id: "usb_anyway", name: "Plugged It In Anyway", check: () => state._pluggedUSB === true },
  { id: "timeline_hacker", name: "Timeline Hacker", check: () => state.endings.length >= 2 }
];

function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (state.achievements.includes(a.id)) continue;
    if (a.check()) {
      state.achievements.push(a.id);
      banner(`🏆 Achievement Unlocked: ${a.name}`, 2400);
      eventSound();
      logLine(`Achievement unlocked: ${a.name}`);
    }
  }
}

// -------------------------
// Modifiers (global effects lasting a few turns)
// -------------------------
const MOD_POOL = [
  {
    name: "Algorithm Bias",
    duration: 4,
    applyToChoice: (delta) => ({ ...delta, clout: delta.clout + 2 })
  },
  {
    name: "Paranoia Patch",
    duration: 3,
    applyToChoice: (delta) => ({ ...delta, fbi: Math.max(0, delta.fbi - 2) })
  },
  {
    name: "Moral Tax",
    duration: 5,
    applyToChoice: (delta) => ({ ...delta, karma: delta.karma - 1 })
  },
  {
    name: "Brain Fog",
    duration: 4,
    applyToChoice: (delta) => ({ ...delta, sanity: delta.sanity - 2 })
  },
  {
    name: "Viral Tailwind",
    duration: 3,
    applyToChoice: (delta) => ({ ...delta, clout: delta.clout + 6, karma: delta.karma - 1 })
  }
];

function maybeAddModifier() {
  // grows with chaos
  const p = Math.min(0.08 + (state.chaos * 0.02), 0.45);
  if (Math.random() < p) {
    const mod = pick(MOD_POOL);
    state.modifiers.push({ name: mod.name, turnsLeft: mod.duration, applyToChoice: mod.applyToChoice });
    banner(`🧬 Modifier gained: ${mod.name}`, 2200);
    logLine(`Global modifier added: ${mod.name}`);
  }
}

function tickModifiers() {
  for (const m of state.modifiers) m.turnsLeft -= 1;
  const before = state.modifiers.length;
  state.modifiers = state.modifiers.filter(m => m.turnsLeft > 0);
  if (state.modifiers.length !== before) logLine("Some modifiers expired.");
}

// -------------------------
// Procedural scenario generation
// -------------------------
const SEEDS = {
  objects: [
    "mystery USB", "unlabeled hard drive", "phone with no lock", "QR code sticker",
    "GoPro with wet sand inside", "SD card labeled 'taxes'", "Bluetooth speaker that whispers",
    "Ring doorbell in a shoebox", "prototype vape called 'The Oracle'"
  ],
  places: [
    "parking lot", "student union", "bus stop", "campus library", "Wawa", "Denny’s", "abandoned office",
    "brewery patio", "Discord voice channel", "subreddit modqueue"
  ],
  vibes: [
    "suspiciously warm", "covered in glitter", "smells like Monster energy", "humming faintly",
    "wrapped in duct tape", "still wet", "stained with printer ink", "laughing (quietly)"
  ],
  escalation: [
    "Now the object is texting you.", "Your phone autocorrects into legal threats.",
    "A man in cargo shorts appears and says 'don’t do that.'",
    "A notification says: 'Your fate has been uploaded.'",
    "Someone is live-streaming your actions without consent."
  ]
};

function makeScenario() {
  // Escalate more as chaos grows
  const obj = pick(SEEDS.objects);
  const place = pick(SEEDS.places);
  const vibe = pick(SEEDS.vibes);
  const extra = (state.chaos > 4 && Math.random() < 0.7) ? ` ${pick(SEEDS.escalation)}` : "";

  const baseText = `You found a ${obj} in the ${place}. It is ${vibe}.${extra}`;

  // Generate choices (some “good”, some cursed, some clout-max)
  const choiceTemplates = [
    { label: "Plug it in", d: { karma:-4, fbi:+10, clout:+2, sanity:-6 }, tag: "Classic speedrun." },
    { label: "Throw it away", d: { karma:+4, fbi:-2, clout:-2, sanity:+2 }, tag: "Responsible. Boring." },
    { label: "Sell it online", d: { karma:-2, fbi:+5, clout:+4, sanity:-2 }, tag: "Entrepreneurial menace." },
    { label: "Post about it on Reddit", d: { karma:+1, fbi:+3, clout:+10, sanity:-3 }, tag: "The hive demands content." },
    { label: "Report it to a grown-up", d: { karma:+6, fbi:-4, clout:-3, sanity:+3 }, tag: "Rare adult behavior." },
    { label: "Open it with a Linux live USB", d: { karma:+2, fbi:+6, clout:+1, sanity:-4 }, tag: "You *think* you’re safe." },
    { label: "Do a TikTok unboxing", d: { karma:-3, fbi:+6, clout:+14, sanity:-6 }, tag: "Algorithm sacrifices accepted." },
    { label: "Consult a psychic", d: { karma:+0, fbi:+1, clout:+3, sanity:-8 }, tag: "The vibes are… loud." },
    { label: "Hand it to the nearest guy named Kyle", d: { karma:-1, fbi:+4, clout:+5, sanity:-1 }, tag: "Kyle accepts." },
  ];

  // Pick 4 choices with at least one “responsible-ish” option
  const picks = new Set();
  picks.add(choiceTemplates[0]); // keep "Plug it in" as the forbidden button vibe
  picks.add(choiceTemplates[1]); // keep a safe-ish option
  while (picks.size < 4) picks.add(pick(choiceTemplates));

  const choices = Array.from(picks).map(c => ({
    text: c.label,
    delta: scaleDelta(c.d),
    hint: c.tag
  }));

  return { text: baseText, choices };
}

function scaleDelta(d) {
  // Scale chaos impact; clamp sanity delta a bit
  const mult = 1 + (state.chaos - 1) * 0.12;
  return {
    karma: Math.round(d.karma * (mult * 0.85)),
    fbi: Math.round(d.fbi * mult),
    clout: Math.round(d.clout * mult),
    sanity: clamp(Math.round(d.sanity * (1 + (state.chaos - 1) * 0.07)), -25, 25)
  };
}

// -------------------------
// Random meme events
// -------------------------
const EVENTS = [
  { text: "💀 It installs 47 toolbars and a sense of dread.", delta: { sanity:-8, fbi:+6, karma:-2 } },
  { text: "📈 Your post hits the front page. The comments are… violent.", delta: { clout:+18, sanity:-6 } },
  { text: "🚨 You receive an email titled: 'quick question'.", delta: { fbi:+10, sanity:-4 } },
  { text: "🧙 You gain ironic meme immunity (temporary).", delta: { sanity:+10, karma:+3 } },
  { text: "🧃 An energy drink sponsorship appears out of nowhere.", delta: { clout:+12, karma:-1 } },
  { text: "🧠 You learn a forbidden fact. You can’t unlearn it.", delta: { sanity:-14, clout:+6 } },
  { text: "🕵️ Someone says 'nice try, fed' and leaves.", delta: { fbi:+8, clout:+2 } },
  { text: "🧼 A rare moment of clarity washes over you.", delta: { sanity:+14, karma:+4, clout:-2 } }
];

function maybeEvent() {
  const p = Math.min(0.22 + state.chaos * 0.03, 0.60);
  if (Math.random() < p) {
    const ev = pick(EVENTS);
    applyDelta(ev.delta, { reason: ev.text, isEvent: true });
    banner(ev.text, 2600);
    eventSound();
    logLine(`EVENT: ${ev.text}`, "warn");
    // chat reacts to events too
    pushChatReactions("event", ev.text);
  }
}

// -------------------------
// Core choice application
// -------------------------
function applyDelta(delta, meta = {}) {
  // Apply modifiers
  let d = { karma:0, fbi:0, clout:0, sanity:0, ...delta };
  for (const m of state.modifiers) d = m.applyToChoice(d);

  // Secret tracking
  if (meta.choiceText && meta.choiceText.toLowerCase().includes("plug")) state._pluggedUSB = true;

  state.karma += d.karma;
  state.fbi += d.fbi;
  state.clout += d.clout;
  state.sanity = clamp(state.sanity + d.sanity, 0, 100);

  // soft clamps so it doesn't go insane instantly
  state.fbi = clamp(state.fbi, 0, 100);
  state.clout = clamp(state.clout, -50, 200);
  state.karma = clamp(state.karma, -200, 200);

  if (!meta.isEvent) {
    logLine(`Choice applied: ${meta.choiceText || "?"}  (ΔK ${fmt(d.karma)}, ΔF ${fmt(d.fbi)}, ΔC ${fmt(d.clout)}, ΔS ${fmt(d.sanity)})`);
  }
}

// -------------------------
// Endings
// -------------------------
function checkEnding() {
  // Multiple endings; whichever triggers first
  if (state.fbi >= 100) return { title:"🚨 PERMANENTLY INTERESTING", text:"You are now a recurring keyword in three separate databases. Congratulations?" };
  if (state.sanity <= 0) return { title:"🧠 BRAIN HAS LEFT THE CHAT", text:"Reality becomes optional. You attempt to reboot your personality driver." };
  if (state.clout >= 160) return { title:"🌐 PURE INTERNET ENERGY", text:"Your body dissolves into engagement metrics. You haunt comment sections forever." };
  if (state.karma <= -120) return { title:"🪦 VILLAIN ARC COMPLETE", text:"Even NPCs avoid eye contact. Your aura now has a terms-of-service violation." };
  if (state.karma >= 120 && state.clout >= 60) return { title:"👼 CHAOTIC GOOD ENDING", text:"Somehow you did good while being online. The algorithm is confused and afraid." };
  return null;
}

function showEnding(ending) {
  endingSound();
  const when = new Date().toLocaleString();
  state.endings.push({ when, title: ending.title });
  saveState();

  $("overlayTitle").textContent = ending.title;
  $("overlayText").textContent = ending.text;
  $("overlay").classList.remove("hidden");

  // Make chat go wild
  pushChatReactions("ending", ending.title);
  logLine(`ENDING reached: ${ending.title}`, "warn");

  // unlock timeline hacker if multiple endings
  checkAchievements();
}

function hideEnding() {
  $("overlay").classList.add("hidden");
}

// Continue = start a new “timeline” but keep ending archive + achievements
function newTimeline() {
  const keep = {
    achievements: [...state.achievements],
    endings: [...state.endings],
    isMuted: state.isMuted
  };
  state = defaultState();
  state.achievements = keep.achievements;
  state.endings = keep.endings;
  state.isMuted = keep.isMuted;
  lastScenario = null;

  $("log").innerHTML = "";
  $("chat").innerHTML = "";
  logLine("New timeline initialized.");
  chatLine("mod: new timeline?? ok chat");
  nextTurn();
}

function hardReset() {
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  lastScenario = null;
  $("log").innerHTML = "";
  $("chat").innerHTML = "";
  logLine("Reality hard reset.");
  chatLine("chat: bro wiped the timeline 💀");
  nextTurn();
}

// -------------------------
// Rendering scenarios / choices
// -------------------------
function renderScenario(s) {
  $("scenario").textContent = s.text;

  const box = $("choices");
  box.innerHTML = "";

  s.choices.forEach((c, idx) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.innerHTML = `${idx+1}. ${escapeHtml(c.text)}<small>${escapeHtml(c.hint)}</small>`;
    btn.onclick = () => choose(c);
    box.appendChild(btn);
  });
}

function choose(choice) {
  clickSound();

  applyDelta(choice.delta, { choiceText: choice.text });

  // turn progression
  state.turn += 1;
  state.chaos += 1;

  // sanity bleed as chaos increases
  if (state.chaos > 5) state.sanity = clamp(state.sanity - Math.floor((state.chaos - 4) * 0.6), 0, 100);

  // modifiers + events
  tickModifiers();
  maybeAddModifier();
  maybeEvent();

  // fake chat reacts
  pushChatReactions("choice", choice.text);

  // achievements + save + render
  checkAchievements();
  saveState();
  updateHud();

  const ending = checkEnding();
  if (ending) {
    showEnding(ending);
    return;
  }

  nextTurn();
}

function nextTurn() {
  // generate next scenario
  lastScenario = makeScenario();
  renderScenario(lastScenario);
  updateHud();
  saveState();

  // drip feed chat even if player stalls
  if (Math.random() < 0.35) chatLine(pick(CHAT_IDLE));
}

// -------------------------
// Fake chat engine
// -------------------------
const CHAT_NAMES = ["twitch_user_421", "wholesome_goblin", "Kyle", "DefinitelyNotFed", "meme_lawyer", "npc_energy", "hotdog_analyst", "sir_spamington", "your_ex", "mod"];
const CHAT_IDLE = [
  "chat: what are we doing",
  "chat: this is gonna age poorly",
  "chat: i can feel my iq going down",
  "chat: somebody clip this",
  "chat: bro touch grass",
  "mod: keep it civil (don’t)"
];

function pushChatReactions(type, payload) {
  const n = Math.floor(2 + Math.random() * 3);
  for (let i=0;i<n;i++) {
    setTimeout(() => {
      const name = pick(CHAT_NAMES);
      const msg = makeChatMessage(type, payload);
      chatLine(`${name}: ${msg}`);
    }, 120 + i*180);
  }
}

function makeChatMessage(type, payload) {
  const chaos = state.chaos;
  if (type === "choice") {
    const p = payload.toLowerCase();
    if (p.includes("plug")) return pick([
      "NOOOO not the forbidden button 😭",
      "HE DID IT. HE ACTUALLY DID IT.",
      "this is malware behavior",
      "chat we are so cooked"
    ]);
    if (p.includes("reddit")) return pick([
      "reddit moment detected",
      "source? (trust me bro)",
      "downvoted for being correct",
      "i’m calling my therapist"
    ]);
    if (p.includes("sell")) return pick([
      "entrepreneur grindset 💀",
      "facebook marketplace final boss",
      "cash only. meeting at night. ok",
      "IRS has entered the chat"
    ]);
    if (p.includes("throw")) return pick([
      "responsible king",
      "boring but alive",
      "ok mr. safety",
      "chat he chose peace"
    ]);
    return chaos > 6 ? "this timeline is cursed" : "wild choice";
  }

  if (type === "event") {
    return pick([
      "LMAO??",
      "chat this is insane",
      "i knew it",
      "this is why we can’t have nice things",
      "that’s gotta be illegal"
    ]);
  }

  if (type === "ending") {
    return pick([
      "ROLL CREDITS 🔥",
      "gg go next timeline",
      "WE DID IT CHAT (we didn’t)",
      "bro unlocked the bad ending speedrun",
      "mod: ok that’s enough internet for today"
    ]);
  }

  return pick(CHAT_IDLE);
}

// -------------------------
// Buttons / boot
// -------------------------
$("btnMute").onclick = () => {
  state.isMuted = !state.isMuted;
  $("btnMute").textContent = state.isMuted ? "🔇 Sound: OFF" : "🔊 Sound: ON";
  saveState();
  if (!state.isMuted) clickSound();
};

$("btnReset").onclick = () => {
  if (confirm("Reset this timeline? (Endings & achievements stay)")) {
    newTimeline();
  }
};

$("btnContinue").onclick = () => {
  hideEnding();
  newTimeline();
};

$("btnHardReset").onclick = () => {
  if (confirm("Hard reset deletes everything (including ending archive). Are you sure?")) {
    hideEnding();
    hardReset();
  }
};

// Resume state display on load
function boot() {
  $("btnMute").textContent = state.isMuted ? "🔇 Sound: OFF" : "🔊 Sound: ON";
  logLine("Boot sequence complete.");
  chatLine("chat: we are live");
  if (state.turn > 0) {
    logLine(`Resumed saved timeline at Turn ${state.turn}.`);
    chatLine("mod: resumed save file (unfortunate)");
  }
  nextTurn();
}
boot();

// -------------------------
// Utils
// -------------------------
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // minimal validation
    if (typeof parsed !== "object" || parsed === null) return null;
    return { ...defaultState(), ...parsed };
  } catch {
    return null;
  }
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function fmt(n) { return (n >= 0 ? "+" : "") + n; }
function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}