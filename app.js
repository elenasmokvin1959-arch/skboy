(function () {
  const STORAGE_KEY = "skboySiteData";
  const OWNER_KEY = "skboyOwnerMode";
  const DEFAULT_PASSWORD = "skboy228";

  function cryptoId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Math.random().toString(16).slice(2) + Date.now();
  }

  const defaults = {
    password: DEFAULT_PASSWORD,
    news: {
      enabled: true,
      title: "Мальчик снова в строю",
      text: "Все основные ссылки и контакты собраны здесь. Новости можно менять в админ панели."
    },
    hero: {
      eyebrow: "вечная визитка",
      title: "Солёный Мальчик",
      description: "Быстрый вход в бота, контакты оператора и актуальные площадки, где Мальчик снова в строю.",
      logo: "avatar.jpg",
      video: "hero.mp4"
    },
    cards: [
      { id: cryptoId(), title: "ВЕЧНЫЙ БОТ", description: "Постоянная ссылка на главный вход Солёного Мальчика.", image: "avatar.jpg", button: "Открыть", url: "https://tut.contact/skboy" },
      { id: cryptoId(), title: "Мальчик на dnestra.cc", description: "Отдельный бот для перехода на dnestra.cc.", image: "avatar.jpg", button: "Перейти", url: "https://t.me/boy_dnestra_bot" },
      { id: cryptoId(), title: "Реклама", description: "Связь по рекламе и размещению.", image: "avatar.jpg", button: "Написать", url: "https://t.me/BOY_rekl" }
    ],
    groups: [
      { id: cryptoId(), title: "Группы, часть 1", description: "Шапки и площадки, где Мальчик уже отмечен.", image: "groups-1.jpg", button: "Посмотреть", url: "groups-1.jpg" },
      { id: cryptoId(), title: "Группы, часть 2", description: "Дополнительные группы и партнерские шапки.", image: "groups-2.jpg", button: "Посмотреть", url: "groups-2.jpg" }
    ],
    chats: [
      { id: cryptoId(), title: "Оператор", hint: "@BOYsalty", url: "https://t.me/BOYsalty" },
      { id: cryptoId(), title: "Работа", hint: "@BOYsalty", url: "https://t.me/BOYsalty" },
      { id: cryptoId(), title: "Реклама", hint: "@BOY_rekl", url: "https://t.me/BOY_rekl" },
      { id: cryptoId(), title: "Вечный бот", hint: "tut.contact/skboy", url: "https://tut.contact/skboy" }
    ],
    reviews: [
      { id: cryptoId(), login: "@salt_user", text: "Всё быстро, ссылка всегда под рукой.", createdAt: new Date(Date.now() - 5400000).toISOString(), approved: true, rating: 5 },
      { id: cryptoId(), login: "@dnestra", text: "Мальчик снова в строю, удобно что контакты на одном сайте.", createdAt: new Date(Date.now() - 93600000).toISOString(), approved: true, rating: 5 },
      { id: cryptoId(), login: "@forum_md", text: "Оператор ответил ровно и без лишней суеты.", createdAt: new Date(Date.now() - 183900000).toISOString(), approved: true, rating: 4 },
      { id: cryptoId(), login: "@blackbook", text: "Нормальная визитка, всё видно сразу.", createdAt: new Date(Date.now() - 291300000).toISOString(), approved: true, rating: 5 }
    ],
    seedVersion: 2
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function mergeData(saved) {
    if (!saved || typeof saved !== "object") return clone(defaults);
    return {
      password: saved.password || DEFAULT_PASSWORD,
      news: { ...defaults.news, ...(saved.news || {}) },
      hero: { ...defaults.hero, ...(saved.hero || {}) },
      cards: normalizeCards(saved),
      groups: Array.isArray(saved.groups) ? saved.groups : clone(defaults.groups),
      chats: Array.isArray(saved.chats) ? saved.chats : clone(defaults.chats),
      reviews: Array.isArray(saved.reviews) ? saved.reviews.map(review => ({ ...review, rating: Number(review.rating || 5) })) : clone(defaults.reviews),
      seedVersion: Math.max(Number(saved.seedVersion || 0), defaults.seedVersion)
    };
  }

  function loadData() {
    try {
      return mergeData(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    } catch (error) {
      return clone(defaults);
    }
  }

  function normalizeCards(saved) {
    if (!Array.isArray(saved.cards)) return clone(defaults.cards);
    const cards = saved.cards.map(card => ({ ...card }));
    if (Number(saved.seedVersion || 0) < 2) {
      cards.forEach((card, index) => {
        if (index > 0 && (card.image === "groups-1.jpg" || card.image === "groups-2.jpg")) {
          card.image = "avatar.jpg";
        }
      });
    }
    return cards;
  }

  function saveData(data, password) {
    data.seedVersion = Math.max(Number(data.seedVersion || 0), defaults.seedVersion);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn("Не получилось сохранить данные в браузере", error);
    }
    if (!password) return Promise.resolve(true);
    return fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Password": password },
      body: JSON.stringify(data)
    }).then(response => response.ok).catch(() => true);
  }

  async function loadServerData() {
    try {
      const response = await fetch("/api/data", { cache: "no-store" });
      if (!response.ok) return false;
      const value = await response.json();
      if (!value || !Object.keys(value).length) return false;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mergeData(value)));
      return true;
    } catch (error) {
      return false;
    }
  }

  function submitReview(review, data) {
    data.reviews.unshift(review);
    saveData(data);
    fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(review)
    }).catch(() => {});
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeUrl(url) {
    const clean = String(url || "").trim();
    if (!clean) return "#";
    if (clean.startsWith("@")) return "https://t.me/" + clean.slice(1);
    if (/^[a-z]+:\/\//i.test(clean)) return clean;
    if (clean.startsWith("t.me/") || clean.startsWith("tut.contact/")) return "https://" + clean;
    return clean;
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }

  function stars(rating) {
    const value = Math.max(1, Math.min(5, Number(rating || 5)));
    return "★".repeat(value) + "☆".repeat(5 - value);
  }

  function renderHero(data) {
    const hero = { ...defaults.hero, ...(data.hero || {}) };
    const eyebrow = document.getElementById("heroEyebrow");
    const title = document.getElementById("heroTitle");
    const description = document.getElementById("heroDescription");
    const brandLogo = document.getElementById("brandLogo");
    const heroVideo = document.getElementById("heroVideo");
    if (eyebrow) eyebrow.textContent = hero.eyebrow;
    if (title) title.textContent = hero.title;
    if (description) description.textContent = hero.description;
    if (brandLogo) brandLogo.src = hero.logo || defaults.hero.logo;
    if (heroVideo) heroVideo.src = hero.video || defaults.hero.video;
  }

  function renderCards(data) {
    const grid = document.getElementById("cardGrid");
    if (!grid) return;
    grid.innerHTML = data.cards.map(card => `
      <article class="link-card">
        <img src="${escapeHtml(card.image)}" alt="${escapeHtml(card.title)}" onerror="this.onerror=null;this.src='avatar.jpg';">
        <div class="link-card-body">
          <h3>${escapeHtml(card.title)}</h3>
          <p>${escapeHtml(card.description)}</p>
          <a class="btn primary" href="${escapeHtml(normalizeUrl(card.url))}" target="_blank" rel="noopener">${escapeHtml(card.button || "Перейти")}</a>
        </div>
      </article>
    `).join("");
  }

  function renderGroups(data) {
    const gallery = document.getElementById("groupGallery");
    if (!gallery) return;
    const groups = (data.groups || []).length ? data.groups : defaults.groups;
    const main = groups[0];
    gallery.innerHTML = `
      <article class="group-card group-carousel" data-carousel>
        <div class="group-slides">
          ${groups.map((group, index) => `
            <img class="group-slide ${index === 0 ? "is-active" : ""}" src="${escapeHtml(group.image)}" alt="${escapeHtml(group.title)}" onerror="this.onerror=null;this.src='groups-1.jpg';">
          `).join("")}
        </div>
        <div class="group-card-body">
          <h3>${escapeHtml(main.title)}</h3>
          <p>${escapeHtml(main.description)}</p>
          <a class="btn ghost" href="${escapeHtml(normalizeUrl(main.url || main.image))}" target="_blank" rel="noopener">${escapeHtml(main.button || "Открыть")}</a>
          <div class="group-dots" aria-hidden="true">
            ${groups.map((_, index) => `<span class="${index === 0 ? "is-active" : ""}"></span>`).join("")}
          </div>
        </div>
      </article>
    `;
    setupGroupCarousel(gallery);
  }

  function setupGroupCarousel(root) {
    const carousel = root.querySelector("[data-carousel]");
    if (!carousel) return;
    const slides = [...carousel.querySelectorAll(".group-slide")];
    const dots = [...carousel.querySelectorAll(".group-dots span")];
    if (slides.length < 2) return;
    let active = 0;
    window.clearInterval(window.skboyGroupTimer);
    const paint = () => {
      slides.forEach((slide, index) => slide.classList.toggle("is-active", index === active));
      dots.forEach((dot, index) => dot.classList.toggle("is-active", index === active));
    };
    window.skboyGroupTimer = window.setInterval(() => {
      active = (active + 1) % slides.length;
      paint();
    }, 3200);
  }

  function renderChats(data) {
    const list = document.getElementById("chatList");
    if (!list) return;
    list.innerHTML = data.chats.map(chat => `
      <a class="chat-button" href="${escapeHtml(normalizeUrl(chat.url))}" target="_blank" rel="noopener">
        <span>${escapeHtml(chat.title)}</span>
        <small>${escapeHtml(chat.hint || "перейти")}</small>
      </a>
    `).join("");
  }

  function approvedReviews(data) {
    return (data.reviews || []).filter(review => review.approved);
  }

  function renderReviews(data) {
    const track = document.getElementById("reviewTrack");
    if (!track) return;
    const approved = approvedReviews(data);
    if (!approved.length) {
      track.innerHTML = `<article class="review-card"><strong>Пока нет отзывов</strong><p>Будьте первым, кто оставит отзыв.</p></article>`;
      return;
    }
    const doubled = [...approved, ...approved];
    track.innerHTML = doubled.map(review => `
      <article class="review-card">
        <strong>${escapeHtml(review.login)}</strong>
        <div class="review-rating">${stars(review.rating)}</div>
        <p>${escapeHtml(review.text)}</p>
        <time>${formatDate(review.createdAt)}</time>
      </article>
    `).join("");
  }

  function renderReviewsList(data) {
    const list = document.getElementById("reviewsList");
    if (!list) return;
    const approved = approvedReviews(data);
    const summary = document.getElementById("reviewSummary");
    const sum = approved.reduce((total, review) => total + Number(review.rating || 5), 0);
    const average = approved.length ? sum / approved.length : 0;
    if (summary) summary.innerHTML = `<strong>${average.toFixed(2)}</strong><span>${approved.length} отзывов</span>`;
    if (!approved.length) {
      list.innerHTML = `<article class="full-review-card"><strong>Пока нет отзывов</strong><p>Будьте первым, кто оставит отзыв.</p></article>`;
      return;
    }
    list.innerHTML = approved.map((review, index) => `
      <article class="full-review-card">
        <div class="review-number">#${index + 1}</div>
        <div>
          <strong>${escapeHtml(review.login)}</strong>
          <div class="review-rating">${stars(review.rating)}</div>
          <p>${escapeHtml(review.text)}</p>
          <time>${formatDate(review.createdAt)}</time>
        </div>
      </article>
    `).join("");
  }

  function setupStars() {
    const picker = document.getElementById("starPicker");
    if (!picker || picker.dataset.bound === "1") return;
    picker.dataset.bound = "1";
    let current = 5;
    const paint = () => picker.querySelectorAll(".star").forEach(button => button.classList.toggle("is-active", Number(button.dataset.rating) <= current));
    picker.addEventListener("click", event => {
      const button = event.target.closest(".star");
      if (!button) return;
      current = Number(button.dataset.rating);
      picker.dataset.value = String(current);
      paint();
    });
    picker.dataset.value = String(current);
    paint();
  }

  function setupReviewForm(onDone) {
    const form = document.getElementById("reviewForm");
    if (!form || form.dataset.bound === "1") return;
    form.dataset.bound = "1";
    form.addEventListener("submit", event => {
      event.preventDefault();
      const login = document.getElementById("reviewLogin").value.trim();
      const text = document.getElementById("reviewText").value.trim();
      const notice = document.getElementById("reviewNotice");
      notice.classList.remove("is-hidden");
      if (!/^@[A-Za-z0-9_]{4,32}$/.test(login)) {
        notice.textContent = "Логин должен начинаться с @.";
        return;
      }
      if (text.length < 5) {
        notice.textContent = "Отзыв слишком короткий.";
        return;
      }
      submitReview({ id: cryptoId(), login, text, createdAt: new Date().toISOString(), approved: false, rating: Number(document.getElementById("starPicker")?.dataset.value || 5) }, loadData());
      form.reset();
      setupStars();
      notice.textContent = "Отзыв отправлен. Он появится после одобрения.";
      if (typeof onDone === "function") onDone();
    });
  }

  function setupNews(data) {
    const overlay = document.getElementById("newsOverlay");
    if (!overlay || !data.news.enabled) return;
    document.getElementById("newsTitle").textContent = data.news.title || "Новости";
    document.getElementById("newsText").textContent = data.news.text || "";
    overlay.classList.remove("is-hidden");
    const close = () => overlay.classList.add("is-hidden");
    document.getElementById("closeNews").addEventListener("click", close);
    document.getElementById("acceptNews").addEventListener("click", close);
  }

  function setupOwnerLink() {
    const params = new URLSearchParams(location.search);
    if (params.get("owner") === "1") localStorage.setItem(OWNER_KEY, "1");
    const link = document.getElementById("adminLink");
    if (link && localStorage.getItem(OWNER_KEY) === "1") link.classList.remove("is-hidden");
  }

  function setupSalt() {
    const layer = document.getElementById("saltLayer");
    if (!layer || layer.dataset.ready === "1") return;
    layer.dataset.ready = "1";
    const count = window.matchMedia("(max-width: 620px)").matches ? 34 : 62;
    const origin = document.querySelector(".hero-media video, .hero-media");
    const rect = origin ? origin.getBoundingClientRect() : null;
    const left = rect ? rect.left : 0;
    const width = rect ? rect.width : window.innerWidth;
    const top = rect ? rect.top + rect.height * .22 : -18;
    for (let i = 0; i < count; i += 1) {
      const grain = document.createElement("span");
      grain.className = "salt-grain";
      grain.style.setProperty("--x", Math.round(left + Math.random() * width) + "px");
      grain.style.setProperty("--start-y", Math.round(top + Math.random() * 110) + "px");
      grain.style.setProperty("--size", (2 + Math.random() * 4).toFixed(1) + "px");
      grain.style.setProperty("--opacity", (0.28 + Math.random() * 0.5).toFixed(2));
      grain.style.setProperty("--duration", (7 + Math.random() * 9).toFixed(1) + "s");
      grain.style.setProperty("--delay", (-Math.random() * 12).toFixed(1) + "s");
      grain.style.setProperty("--drift", (Math.random() * 90 - 45).toFixed(0) + "px");
      layer.appendChild(grain);
    }
  }

  function setupScrollReveal() {
    const items = document.querySelectorAll(".hero, .section, .reviews-section, .link-card, .group-card, .chat-button, .review-form, .full-review-card");
    items.forEach(item => item.classList.add("reveal-on-scroll"));
    if (!("IntersectionObserver" in window)) {
      items.forEach(item => item.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    items.forEach(item => observer.observe(item));
  }

  function renderPublicPage() {
    const data = loadData();
    renderHero(data);
    renderCards(data);
    renderGroups(data);
    renderChats(data);
    renderReviews(data);
    setupNews(data);
    setupOwnerLink();
    setupSalt();
    setupScrollReveal();
  }

  function renderReviewsPage() {
    const data = loadData();
    renderHero(data);
    setupStars();
    setupReviewForm(() => renderReviewsList(loadData()));
    renderReviewsList(data);
    setupOwnerLink();
    setupSalt();
    setupScrollReveal();
  }

  window.SkboyStore = { STORAGE_KEY, OWNER_KEY, DEFAULT_PASSWORD, cryptoId, loadData, saveData, loadServerData, submitReview, escapeHtml, formatDate, normalizeUrl };

  setupSalt();
  if (document.getElementById("cardGrid")) {
    renderPublicPage();
    loadServerData().then(changed => { if (changed) renderPublicPage(); });
  }
  if (document.getElementById("reviewsList")) {
    renderReviewsPage();
    loadServerData().then(changed => { if (changed) renderReviewsPage(); });
  }
})();
