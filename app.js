(function () {
  "use strict";

  const state = {
    sort: "asc",
    types: new Set(Object.keys(TYPES)),
    era: "all",
    query: "",
    onlyStories: false
  };
  const openIds = new Set();

  const $ = (sel) => document.querySelector(sel);
  const timeline = $("#timeline");

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  const earthUrl = (p) => `https://earth.google.com/web/@${p.lat},${p.lng},80a,900d,35y,0h,55t,0r`;
  const mapsUrl = (p) => `https://www.google.com/maps/@?api=1&map_action=map&center=${p.lat},${p.lng}&zoom=17&basemap=satellite`;
  const ext = 'target="_blank" rel="noopener"';

  function renderPlaces(places) {
    if (!places || !places.length) return "";
    const rows = places.map((p) => `
      <li>
        <span class="place-name">📍 ${esc(p.name)}</span>
        <a class="btn-link earth" href="${earthUrl(p)}" ${ext}>🌍 Google Earth</a>
        <a class="btn-link" href="${mapsUrl(p)}" ${ext}>🗺️ Карта</a>
        ${p.tour ? `<a class="btn-link tour" href="${esc(p.tour)}" ${ext}>🥽 Виртуальный тур</a>` : ""}
      </li>`).join("");
    return `<h4>Где это на карте</h4><ul class="places">${rows}</ul>`;
  }

  function list(title, arr) {
    if (!arr || !arr.length) return "";
    return `<h4>${title}</h4><ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  }

  function renderStories(stories) {
    if (!stories || !stories.length) return "";
    return stories.map((st) => {
      const k = STORY_KINDS[st.kind];
      return `
      <section class="story">
        <div class="story-head">
          <span class="story-label">📖 История</span>
          <span class="story-kind kind-${st.kind}" title="${esc(k.hint)}">${k.icon} ${esc(k.name)}</span>
        </div>
        <h4 class="story-title">${esc(st.title)}</h4>
        ${st.text.map((p) => `<p>${esc(p)}</p>`).join("")}
        <p class="story-source"><strong>Откуда мы это знаем:</strong> ${esc(st.source)}</p>
      </section>`;
    }).join("");
  }

  function renderItem(item, side) {
    const stories = STORIES[item.id] || [];
    const era = ERAS[item.era];
    const type = TYPES[item.type];
    const isPharaoh = item.type === "pharaoh";
    const links = (item.links || []).map((l) => `<li><a href="${esc(l.u)}" ${ext}>${esc(l.t)}</a></li>`).join("");
    return `
    <li class="tl-item ${side}" id="item-${item.id}" data-icon="${type.icon}" style="--era:${era.color}">
      <details class="tl-card" data-type="${item.type}" data-id="${item.id}" ${openIds.has(item.id) ? "open" : ""}>
        <summary>
          <span class="tl-date">${esc(item.date)}</span><span class="tl-type">${type.name}</span>
          <h3>${esc(item.name)}</h3>
          ${item.dynasty ? `<div class="tl-dyn">${esc(item.dynasty)} · ${esc(era.name)}</div>` : `<div class="tl-dyn">${esc(era.name)}</div>`}
          <p class="tl-summary">${esc(item.summary)}</p>
          ${stories.length ? `<p class="tl-has-story">📖 ${stories.map((st) => esc(st.title)).join(" · ")}</p>` : ""}
          <span class="tl-more"><span class="open-txt">Подробнее</span><span class="close-txt">Свернуть</span></span>
        </summary>
        <div class="tl-body">
          ${renderStories(stories)}
          <h4>${isPharaoh ? "Кто это?" : "Что это?"}</h4><p>${esc(item.who)}</p>
          <h4>Какое это было время</h4><p>${esc(item.time)}</p>
          ${list(isPharaoh ? "Главные достижения" : "Самое важное", item.achievements)}
          ${list("Значимые события", item.events)}
          ${item.fact ? `<p class="fact">💡 <strong>Интересный факт:</strong> ${esc(item.fact)}</p>` : ""}
          ${renderPlaces(item.places)}
          ${links ? `<h4>Узнать больше</h4><ul>${links}</ul>` : ""}
        </div>
      </details>
    </li>`;
  }

  function matches(item) {
    if (!state.types.has(item.type)) return false;
    if (state.era !== "all" && item.era !== state.era) return false;
    if (state.onlyStories && !STORIES[item.id]) return false;
    if (state.query) {
      const hay = [item.name, item.summary, item.who, item.dynasty || "", ...(item.places || []).map((p) => p.name), ...(STORIES[item.id] || []).map((st) => st.title)].join(" ").toLowerCase();
      if (!hay.includes(state.query)) return false;
    }
    return true;
  }

  function render() {
    const items = ITEMS.filter(matches).sort((a, b) =>
      state.sort === "asc" ? (a.start - b.start) || (a.end - b.end) : (b.start - a.start) || (b.end - a.end)
    );
    let html = "";
    let lastEra = null;
    let i = 0;
    for (const item of items) {
      if (item.era !== lastEra) {
        const e = ERAS[item.era];
        html += `<li class="tl-era"><span style="background:${e.color}">${esc(e.name)}<small>${esc(e.range)}</small></span></li>`;
        lastEra = item.era;
      }
      html += renderItem(item, i % 2 ? "right" : "left");
      i++;
    }
    timeline.innerHTML = html || `<li class="empty">Ничего не найдено. Попробуйте изменить фильтры.</li>`;
    $("#count").textContent = `Показано: ${items.length} из ${ITEMS.length}`;
  }

  // Запоминаем раскрытые карточки, чтобы они не сворачивались при сортировке
  timeline.addEventListener("toggle", (e) => {
    const d = e.target;
    if (!d.dataset || !d.dataset.id) return;
    d.open ? openIds.add(d.dataset.id) : openIds.delete(d.dataset.id);
  }, true);

  // Сортировка
  document.querySelectorAll("[data-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.sort = btn.dataset.sort;
      document.querySelectorAll("[data-sort]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      render();
    });
  });

  // Фильтры по типу
  const typeBox = $("#typeFilters");
  typeBox.innerHTML = Object.entries(TYPES).map(([k, t]) =>
    `<button type="button" class="chip" data-type="${k}" aria-pressed="true">${t.icon} ${t.name}</button>`).join("");
  typeBox.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-type]");
    if (!btn) return;
    const k = btn.dataset.type;
    if (state.types.has(k)) state.types.delete(k); else state.types.add(k);
    btn.setAttribute("aria-pressed", String(state.types.has(k)));
    render();
  });

  // Только с историями
  $("#onlyStories").addEventListener("click", (e) => {
    state.onlyStories = !state.onlyStories;
    e.currentTarget.setAttribute("aria-pressed", String(state.onlyStories));
    render();
  });

  $("#storyKinds").innerHTML = Object.entries(STORY_KINDS).map(([k, v]) =>
    `<li><span class="story-kind kind-${k}">${v.icon} ${esc(v.name)}</span> — ${esc(v.hint)}</li>`).join("");

  // Эпохи
  const eraSelect = $("#eraSelect");
  eraSelect.innerHTML = `<option value="all">Все эпохи</option>` +
    Object.entries(ERAS).map(([k, e]) => `<option value="${k}">${esc(e.name)}</option>`).join("");
  eraSelect.addEventListener("change", () => { state.era = eraSelect.value; render(); });

  $("#eraLegend").innerHTML = Object.values(ERAS).map((e) =>
    `<span class="era-pill"><span class="era-dot" style="background:${e.color}"></span>${esc(e.name)} · ${esc(e.range)}</span>`).join("");

  // Поиск
  $("#search").addEventListener("input", (e) => { state.query = e.target.value.trim().toLowerCase(); render(); });

  // Раскрыть / свернуть всё
  $("#expandAll").addEventListener("click", () => {
    timeline.querySelectorAll("details").forEach((d) => { d.open = true; openIds.add(d.dataset.id); });
  });
  $("#collapseAll").addEventListener("click", () => {
    timeline.querySelectorAll("details").forEach((d) => { d.open = false; });
    openIds.clear();
  });

  // Ресурсы и источники
  $("#resources").innerHTML = RESOURCES.map((r) =>
    `<li><a href="${esc(r.u)}" ${ext}>${esc(r.t)}</a><p>${esc(r.d)}</p></li>`).join("");
  $("#sources").innerHTML = SOURCES.map((s) => `<li>${esc(s)}</li>`).join("");

  render();

  // Ссылка вида index.html#item-khufu открывает нужную карточку (её дают из «Сада знаний»)
  function openFromHash() {
    if (!location.hash.startsWith("#item-")) return;
    const id = decodeURIComponent(location.hash.slice(6));
    const d = timeline.querySelector(`details[data-id="${CSS.escape(id)}"]`);
    if (!d) return;
    d.open = true;
    openIds.add(id);
    d.closest("li").scrollIntoView({ block: "start" });
  }
  openFromHash();
  window.addEventListener("hashchange", openFromHash);
})();
