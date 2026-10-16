(function () {
  "use strict";

  const KEY = "pharaoh-garden-v1";
  const NEW_PER_DAY = 8;
  // Через сколько дней повторить после перехода на ступень 1..5
  const INTERVALS = [0, 1, 2, 3, 5, 10];
  const STAGES = ["🟫", "🌱", "🌿", "🪴", "🌳", "🌴"];
  const STAGE_NAMES = ["ещё не посажено", "росток", "кустик", "деревце", "дерево", "пальма"];
  const LEARNED_BOX = 4;
  const SOURCE_OPTIONS = {
    doc: "📜 Документ того времени",
    tale: "🪶 Древняя сказка",
    legend: "🏺 Легенда, записанная много позже",
    find: "🔍 Рассказ находок археологов"
  };
  const TYPE_LABELS = { mc: "Вопрос", order: "Что было раньше?", whoami: "Кто я?", source: "Правда или легенда?" };

  const $ = (s) => document.querySelector(s);
  const itemById = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

  // ───── Дата (параметр ?shift=N сдвигает «сегодня» для проверки) ─────
  const shift = Number(new URLSearchParams(location.search).get("shift")) || 0;
  function dateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function addDays(str, n) {
    const [y, m, d] = str.split("-").map(Number);
    return dateStr(new Date(y, m - 1, d + n));
  }
  const today = () => addDays(dateStr(new Date()), shift);

  // ───── Хранилище ─────
  function blank() {
    return { cards: {}, gold: 0, streak: { last: null, count: 0 }, newToday: { date: null, count: 0 } };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign(blank(), JSON.parse(raw));
    } catch (e) { /* приватный режим и т.п. */ }
    return blank();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ничего */ }
  }
  let state = load();

  const box = (id) => (state.cards[id] ? state.cards[id].box : 0);
  const newLeftToday = () => NEW_PER_DAY - (state.newToday.date === today() ? state.newToday.count : 0);

  function dueFacts() {
    const t = today();
    return QUIZ.filter((f) => state.cards[f.id] && state.cards[f.id].due <= t)
      .sort((a, b) => state.cards[a.id].due.localeCompare(state.cards[b.id].due));
  }
  const unseenFacts = () => QUIZ.filter((f) => !state.cards[f.id]);

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ───── Главный экран ─────
  function renderHome() {
    const due = dueFacts().length;
    const fresh = Math.min(newLeftToday(), unseenFacts().length);
    const learned = QUIZ.filter((f) => box(f.id) >= LEARNED_BOX).length;
    const palms = QUIZ.filter((f) => box(f.id) === 5).length;

    const streakAlive = state.streak.last === today() || state.streak.last === addDays(today(), -1);
    $("#statStreak").textContent = streakAlive ? state.streak.count : 0;
    $("#statGold").textContent = state.gold;
    $("#statLearned").textContent = `${learned}/${QUIZ.length}`;
    $("#statPalms").textContent = palms;

    const total = due + fresh;
    const startBtn = $("#startBtn");
    const extraBtn = $("#extraBtn");
    if (total > 0) {
      const parts = [];
      if (due) parts.push(`повторить: ${due}`);
      if (fresh) parts.push(`новых: ${fresh}`);
      $("#todayText").textContent = `Сегодня тебя ждут вопросы — ${parts.join(", ")}.`;
      startBtn.hidden = false;
      startBtn.textContent = `Начать тренировку (${total})`;
      extraBtn.hidden = true;
    } else {
      const next = Object.values(state.cards).map((c) => c.due).sort()[0];
      $("#todayText").textContent = unseenFacts().length || next
        ? `🎉 На сегодня всё! Растения растут. ${next ? `Следующее повторение: ${formatDay(next)}.` : ""}`
        : "🌴 Весь оазис вырос! Ты знаешь всё о фараонах.";
      startBtn.hidden = true;
      extraBtn.hidden = unseenFacts().length === 0;
    }

    $("#stageLegend").innerHTML = STAGES.map((s, i) => `<span>${s} ${STAGE_NAMES[i]}</span>`).join("");
    $("#garden").innerHTML = QUIZ.map((f) => {
      const b = box(f.id);
      return `<a class="plot stage-${b}" href="index.html#item-${f.item}" title="${esc(f.topic)} — ${STAGE_NAMES[b]}">
        <span class="plant">${STAGES[b]}</span><span class="plot-name">${esc(f.topic)}</span></a>`;
    }).join("");
  }

  function formatDay(str) {
    const diff = Math.round((new Date(str) - new Date(today())) / 86400000);
    if (diff <= 0) return "сегодня";
    if (diff === 1) return "завтра";
    if (diff === 2) return "послезавтра";
    return `через ${diff} дн.`;
  }

  // ───── Тренировка ─────
  let session = null;

  function startSession(extraNew) {
    const due = shuffle(dueFacts());
    const freshCount = extraNew ? extraNew : Math.max(0, newLeftToday());
    const fresh = unseenFacts().slice(0, freshCount);
    session = { queue: [...due, ...fresh], pos: 0, retry: new Set(), right: 0, wrong: 0, grown: 0, palms: 0, gold: 0, done: 0, total: due.length + fresh.length };
    if (!session.queue.length) return;
    show("quiz");
    ask();
  }

  function show(id) {
    ["home", "quiz", "done"].forEach((s) => { $("#" + s).hidden = s !== id; });
    window.scrollTo(0, 0);
  }

  function buildQuestion(f) {
    if (f.type === "order") {
      const a = itemById[f.a], b = itemById[f.b];
      const earlier = a.start <= b.start ? a : b;
      return { text: "Что было раньше?", options: shuffle([a.name, b.name]), answer: earlier.name, wide: true };
    }
    if (f.type === "source") {
      return { text: f.q, options: Object.keys(SOURCE_OPTIONS).map((k) => SOURCE_OPTIONS[k]), answer: SOURCE_OPTIONS[f.answer], wide: true };
    }
    return { text: f.type === "whoami" ? "Кто я?" : f.q, options: shuffle([f.answer, ...f.wrong]), answer: f.answer };
  }

  function ask() {
    const f = session.queue[session.pos];
    const q = buildQuestion(f);
    session.current = { f, q, clues: 1, answered: false };

    $("#progressBar").style.width = `${Math.round((session.done / session.total) * 100)}%`;
    $("#progressText").textContent = `Вопрос ${Math.min(session.done + 1, session.total)} из ${session.total}` +
      (session.retry.has(f.id) ? " · повторяем" : "");
    const b = box(f.id);
    $("#qType").textContent = `${STAGES[b]} ${TYPE_LABELS[f.type]}`;
    $("#qText").textContent = q.text;
    renderClues();
    $("#options").className = "options" + (q.wide ? " wide" : "");
    $("#options").innerHTML = q.options.map((o, i) =>
      `<button type="button" class="opt" data-i="${i}">${esc(o)}</button>`).join("");
    $("#feedback").hidden = true;
    $("#nextBtn").hidden = true;
  }

  function renderClues() {
    const { f, clues } = session.current;
    if (f.type !== "whoami") {
      $("#qClues").innerHTML = "";
      $("#clueBtn").hidden = true;
      return;
    }
    $("#qClues").innerHTML = f.clues.slice(0, clues).map((c) => `<p class="clue">🗝️ ${esc(c)}</p>`).join("");
    $("#clueBtn").hidden = session.current.answered || clues >= f.clues.length;
  }

  $("#clueBtn").addEventListener("click", () => {
    session.current.clues++;
    renderClues();
  });

  $("#options").addEventListener("click", (e) => {
    const btn = e.target.closest(".opt");
    if (!btn || session.current.answered) return;
    const { f, q } = session.current;
    const chosen = q.options[Number(btn.dataset.i)];
    const correct = chosen === q.answer;
    session.current.answered = true;
    $("#clueBtn").hidden = true;

    document.querySelectorAll(".opt").forEach((b) => {
      const val = q.options[Number(b.dataset.i)];
      b.disabled = true;
      if (val === q.answer) b.classList.add("correct");
      else if (b === btn) b.classList.add("wrong");
    });

    const result = grade(f, correct);
    showFeedback(f, correct, result);
    $("#nextBtn").hidden = false;
    $("#nextBtn").focus();
  });

  function grade(f, correct) {
    const t = today();
    const c = state.cards[f.id] || { box: 0, right: 0, wrong: 0, due: t };
    const isNew = !state.cards[f.id];
    const before = c.box;
    const isRetry = session.retry.has(f.id);

    if (correct) {
      c.right++;
      c.box = isRetry ? 1 : Math.min(5, c.box + 1);
      c.due = addDays(t, INTERVALS[c.box]);
      session.right++;
      state.gold += 1;
      session.gold += 1;
      if (c.box === 5 && before < 5) { state.gold += 3; session.gold += 3; session.palms++; }
      if (c.box > before) session.grown++;
    } else {
      c.wrong++;
      c.box = 1;
      // второй промах подряд — не мучаем сегодня, повторим завтра
      c.due = isRetry ? addDays(t, 1) : t;
      session.wrong++;
      if (!isRetry) {
        session.retry.add(f.id);
        session.queue.push(f);
        session.total++;
      }
    }
    if (isNew) {
      if (state.newToday.date !== t) state.newToday = { date: t, count: 0 };
      state.newToday.count++;
    }
    state.cards[f.id] = c;
    session.done++;
    save();
    return { before, after: c.box };
  }

  function showFeedback(f, correct, { before, after }) {
    let plant;
    if (correct && after > before) plant = `${STAGES[before]} → ${STAGES[after]} Растение подросло!`;
    else if (correct) plant = `${STAGES[after]} Молодец! Закрепим завтра.`;
    else {
      const again = session.queue.lastIndexOf(f) > session.pos ? "Повторим ещё раз в конце тренировки." : "Повторим завтра.";
      plant = before === 0 ? `${STAGES[1]} Посадили росток. ${again}` : `🥀 Растение подвяло и стало ростком ${STAGES[1]}. Не беда! ${again}`;
    }

    let explain = f.explain;
    if (f.type === "order") {
      const a = itemById[f.a], b = itemById[f.b];
      const gap = Math.abs(a.start - b.start);
      explain = `${a.name}: ${a.date}. ${b.name}: ${b.date}. Разница — примерно ${gap} лет. ${f.explain}`;
    }
    const fb = $("#feedback");
    fb.className = "feedback " + (correct ? "ok" : "bad");
    fb.innerHTML = `
      <p class="fb-title">${correct ? "✅ Верно! +1 🪙" : "❌ Не совсем."}</p>
      <p class="fb-plant">${plant}</p>
      <p>${esc(explain)}</p>
      <a href="index.html#item-${f.item}" target="_blank" rel="noopener">📖 Прочитать об этом в ленте времени</a>`;
    fb.hidden = false;
  }

  $("#nextBtn").addEventListener("click", () => {
    session.pos++;
    if (session.pos >= session.queue.length) finish();
    else ask();
  });
  $("#quitBtn").addEventListener("click", () => finish());

  function finish() {
    if (session && session.done > 0) {
      const t = today();
      if (state.streak.last !== t) {
        state.streak.count = state.streak.last === addDays(t, -1) ? state.streak.count + 1 : 1;
        state.streak.last = t;
      }
      save();
      $("#doneTitle").textContent = session.wrong === 0 ? "🏆 Без единой ошибки!" : "🌿 Тренировка закончена!";
      $("#doneText").innerHTML = `Правильных ответов: <strong>${session.right}</strong> из ${session.right + session.wrong}.<br>
        Подросло растений: <strong>${session.grown}</strong>${session.palms ? `, новых пальм: <strong>${session.palms}</strong> 🌴` : ""}.<br>
        Заработано золота храбрости: <strong>${session.gold}</strong> 🪙.<br>
        Дней подряд: <strong>${state.streak.count}</strong> 🔥. Приходи завтра — растения ждут полива!`;
      show("done");
    } else {
      renderHome();
      show("home");
    }
  }

  $("#startBtn").addEventListener("click", () => startSession(0));
  $("#extraBtn").addEventListener("click", () => startSession(5));
  $("#homeBtn").addEventListener("click", () => { renderHome(); show("home"); });
  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("Точно начать сад заново? Все растения и золото пропадут.")) return;
    state = blank();
    save();
    renderHome();
  });

  renderHome();
})();
