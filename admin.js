(function () {
  const store = window.SkboyStore;
  let data = store.loadData();

  const loginPanel = document.getElementById("loginPanel");
  const adminPanel = document.getElementById("adminPanel");
  const loginNotice = document.getElementById("loginNotice");
  let adminPassword = sessionStorage.getItem("skboyAdminPassword") || "";

  function isAuthed() {
    return sessionStorage.getItem("skboyAdminAuthed") === "1";
  }

  function showAdmin() {
    loginPanel.classList.add("is-hidden");
    adminPanel.classList.remove("is-hidden");
    localStorage.setItem(store.OWNER_KEY, "1");
    renderAll();
  }

  async function tryLogin() {
    const password = document.getElementById("adminPassword").value;
    const ok = await checkPassword(password);
    if (ok) {
      adminPassword = password;
      sessionStorage.setItem("skboyAdminPassword", password);
      sessionStorage.setItem("skboyAdminAuthed", "1");
      showAdmin();
      return;
    }
    loginNotice.textContent = "Неверный пароль.";
  }

  async function checkPassword(password) {
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "X-Admin-Password": password }
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async function saveAndRender(passwordOverride) {
    await store.saveData(data, passwordOverride || adminPassword);
    renderAll();
  }

  function field(label, value, onInput, wide) {
    const id = store.cryptoId();
    setTimeout(() => {
      const input = document.getElementById(id);
      if (input) input.addEventListener("input", event => onInput(event.target.value));
    });
    return `
      <label class="${wide ? "wide" : ""}">
        <span>${label}</span>
        <input id="${id}" type="text" value="${store.escapeHtml(value || "")}">
      </label>
    `;
  }

  function area(label, value, onInput) {
    const id = store.cryptoId();
    setTimeout(() => {
      const input = document.getElementById(id);
      if (input) input.addEventListener("input", event => onInput(event.target.value));
    });
    return `
      <label class="wide">
        <span>${label}</span>
        <textarea id="${id}" rows="4">${store.escapeHtml(value || "")}</textarea>
      </label>
    `;
  }

  function renderImageList(listName, targetId, fallback) {
    const list = document.getElementById(targetId);
    const items = data[listName] || [];
    list.innerHTML = items.map((item, index) => `
      <article class="admin-item">
        <img class="admin-thumb" src="${store.escapeHtml(item.image || fallback)}" alt="" onerror="this.onerror=null;this.src='${fallback}';">
        <div class="admin-fields">
          ${field("Название", item.title, value => item.title = value)}
          ${field("Фото / ссылка / файл", item.image, value => item.image = value)}
          <label class="wide">
            <span>Загрузить фото</span>
            <input data-image-upload="${listName}" data-image-id="${item.id}" type="file" accept="image/*">
          </label>
          ${area("Описание", item.description, value => item.description = value)}
          ${field("Текст кнопки", item.button, value => item.button = value)}
          ${field("Ссылка перехода", item.url, value => item.url = value, true)}
          <div class="order-actions wide">
            <button class="btn ghost" data-move-list="${listName}" data-move-index="${index}" data-move-dir="-1" type="button">Выше</button>
            <button class="btn ghost" data-move-list="${listName}" data-move-index="${index}" data-move-dir="1" type="button">Ниже</button>
          </div>
          <div class="row-actions wide">
            <button class="btn primary" data-save type="button">Сохранить</button>
            <button class="btn danger" data-delete-list="${listName}" data-delete-id="${item.id}" type="button">Удалить</button>
          </div>
        </div>
      </article>
    `).join("");
  }

  function renderCards() {
    renderImageList("cards", "cardsAdminList", "avatar.jpg");
  }

  function renderGroups() {
    renderImageList("groups", "groupsAdminList", "groups-1.jpg");
  }

  function renderChats() {
    const list = document.getElementById("chatsAdminList");
    list.innerHTML = data.chats.map((chat, index) => `
      <article class="admin-item no-image">
        <div class="admin-fields">
          ${field("Название кнопки", chat.title, value => chat.title = value)}
          ${field("Подпись", chat.hint, value => chat.hint = value)}
          ${field("Ссылка", chat.url, value => chat.url = value, true)}
          <div class="order-actions wide">
            <button class="btn ghost" data-move-list="chats" data-move-index="${index}" data-move-dir="-1" type="button">Выше</button>
            <button class="btn ghost" data-move-list="chats" data-move-index="${index}" data-move-dir="1" type="button">Ниже</button>
          </div>
          <div class="row-actions wide">
            <button class="btn primary" data-save type="button">Сохранить</button>
            <button class="btn danger" data-delete-list="chats" data-delete-id="${chat.id}" type="button">Удалить</button>
          </div>
        </div>
      </article>
    `).join("");
  }

  function renderReviews() {
    const list = document.getElementById("reviewsAdminList");
    if (!data.reviews.length) {
      list.innerHTML = `<div class="panel"><p class="muted">Отзывов пока нет.</p></div>`;
      return;
    }
    list.innerHTML = data.reviews.map((review, index) => `
      <article class="admin-item no-image">
        <div class="admin-fields">
          <div>
            <span class="status-pill">${review.approved ? "Одобрен" : "Ждет одобрения"}</span>
            <h3>${store.escapeHtml(review.login)}</h3>
            <div class="review-rating">${"★".repeat(Number(review.rating || 5))}${"☆".repeat(5 - Number(review.rating || 5))}</div>
            <p class="muted">${store.formatDate(review.createdAt)}</p>
          </div>
          <p>${store.escapeHtml(review.text)}</p>
          <div class="order-actions wide">
            <button class="btn ghost" data-move-list="reviews" data-move-index="${index}" data-move-dir="-1" type="button">Выше</button>
            <button class="btn ghost" data-move-list="reviews" data-move-index="${index}" data-move-dir="1" type="button">Ниже</button>
          </div>
          <div class="row-actions wide">
            <button class="btn primary" data-toggle-review="${review.id}" type="button">${review.approved ? "Скрыть" : "Одобрить"}</button>
            <button class="btn danger" data-delete-list="reviews" data-delete-id="${review.id}" type="button">Удалить</button>
          </div>
        </div>
      </article>
    `).join("");
  }

  function renderHero() {
    if (!data.hero) data.hero = {};
    document.getElementById("heroEyebrowInput").value = data.hero.eyebrow || "";
    document.getElementById("heroTitleInput").value = data.hero.title || "";
    document.getElementById("heroDescriptionInput").value = data.hero.description || "";
    document.getElementById("heroLogoInput").value = data.hero.logo || "avatar.jpg";
    document.getElementById("heroVideoInput").value = data.hero.video || "hero.mp4";
    document.getElementById("heroPrimaryTextInput").value = data.hero.primaryText || "Вечный бот";
    document.getElementById("heroPrimaryUrlInput").value = data.hero.primaryUrl || "https://tut.contact/skboy";
    document.getElementById("heroSecondaryTextInput").value = data.hero.secondaryText || "Мальчик на dnestra.cc";
    document.getElementById("heroSecondaryUrlInput").value = data.hero.secondaryUrl || "https://t.me/boy_dnestra_bot";
    document.getElementById("heroTertiaryTextInput").value = data.hero.tertiaryText || "Мальчик на Фениксе";
    document.getElementById("heroTertiaryUrlInput").value = data.hero.tertiaryUrl || "#";
  }

  function renderSiteText() {
    if (!data.siteText) data.siteText = {};
    const defaults = {
      linksEyebrow: "основное",
      linksTitle: "Переходы",
      groupsEyebrow: "где есть мальчик",
      groupsTitle: "Группы и шапки",
      contactsEyebrow: "контакты",
      contactsTitle: "Связь",
      reviewsEyebrow: "отзывы",
      reviewsTitle: "Что пишут",
      footerLeft: "Солёный Мальчик",
      footerRight: "Защищено Cerber Industries 2026"
    };
    Object.entries(defaults).forEach(([key, value]) => {
      const input = document.getElementById(key + "Input");
      if (input) input.value = data.siteText[key] || value;
    });
  }

  function renderNews() {
    document.getElementById("newsEnabled").checked = Boolean(data.news.enabled);
    document.getElementById("newsTitleInput").value = data.news.title || "";
    document.getElementById("newsTextInput").value = data.news.text || "";
  }

  function renderAll() {
    renderHero();
    renderSiteText();
    renderCards();
    renderGroups();
    renderChats();
    renderReviews();
    renderNews();
  }

  function getOrderedList(name) {
    if (name === "cards") return data.cards;
    if (name === "groups") return data.groups;
    if (name === "chats") return data.chats;
    if (name === "reviews") return data.reviews;
    return null;
  }

  function moveItem(name, index, direction) {
    const list = getOrderedList(name);
    if (!Array.isArray(list)) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= list.length) return;
    const current = list[index];
    list[index] = list[nextIndex];
    list[nextIndex] = current;
    saveAndRender();
  }

  document.getElementById("loginBtn").addEventListener("click", tryLogin);
  document.getElementById("adminPassword").addEventListener("keydown", event => {
    if (event.key === "Enter") tryLogin();
  });

  document.querySelectorAll(".tab-btn").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(item => item.classList.remove("is-active"));
      document.querySelectorAll(".admin-tab").forEach(item => item.classList.remove("is-active"));
      button.classList.add("is-active");
      document.getElementById("tab-" + button.dataset.tab).classList.add("is-active");
    });
  });

  document.getElementById("addCard").addEventListener("click", () => {
    data.cards.unshift({ id: store.cryptoId(), title: "Новая карточка", description: "Описание можно изменить в админке.", image: "avatar.jpg", button: "Перейти", url: "https://tut.contact/skboy" });
    saveAndRender();
  });

  document.getElementById("addGroup").addEventListener("click", () => {
    data.groups.unshift({ id: store.cryptoId(), title: "Новая группа", description: "Описание можно изменить в админке.", image: "groups-1.jpg", button: "Открыть", url: "groups-1.jpg" });
    saveAndRender();
  });

  document.getElementById("addChat").addEventListener("click", () => {
    data.chats.unshift({ id: store.cryptoId(), title: "Новая кнопка", hint: "@username", url: "https://t.me/username" });
    saveAndRender();
  });

  document.getElementById("saveHero").addEventListener("click", () => {
    data.hero = {
      eyebrow: document.getElementById("heroEyebrowInput").value,
      title: document.getElementById("heroTitleInput").value,
      description: document.getElementById("heroDescriptionInput").value,
      logo: document.getElementById("heroLogoInput").value || "avatar.jpg",
      video: document.getElementById("heroVideoInput").value || "hero.mp4",
      primaryText: document.getElementById("heroPrimaryTextInput").value || "Вечный бот",
      primaryUrl: document.getElementById("heroPrimaryUrlInput").value || "https://tut.contact/skboy",
      secondaryText: document.getElementById("heroSecondaryTextInput").value || "Мальчик на dnestra.cc",
      secondaryUrl: document.getElementById("heroSecondaryUrlInput").value || "https://t.me/boy_dnestra_bot",
      tertiaryText: document.getElementById("heroTertiaryTextInput").value || "Мальчик на Фениксе",
      tertiaryUrl: document.getElementById("heroTertiaryUrlInput").value || "#"
    };
    saveAndRender();
  });

  document.getElementById("saveSiteText").addEventListener("click", () => {
    data.siteText = {
      linksEyebrow: document.getElementById("linksEyebrowInput").value,
      linksTitle: document.getElementById("linksTitleInput").value,
      groupsEyebrow: document.getElementById("groupsEyebrowInput").value,
      groupsTitle: document.getElementById("groupsTitleInput").value,
      contactsEyebrow: document.getElementById("contactsEyebrowInput").value,
      contactsTitle: document.getElementById("contactsTitleInput").value,
      reviewsEyebrow: document.getElementById("reviewsEyebrowInput").value,
      reviewsTitle: document.getElementById("reviewsTitleInput").value,
      footerLeft: document.getElementById("footerLeftInput").value,
      footerRight: document.getElementById("footerRightInput").value
    };
    saveAndRender();
  });

  document.getElementById("saveNews").addEventListener("click", () => {
    data.news.enabled = document.getElementById("newsEnabled").checked;
    data.news.title = document.getElementById("newsTitleInput").value;
    data.news.text = document.getElementById("newsTextInput").value;
    saveAndRender();
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem("skboyAdminAuthed");
    sessionStorage.removeItem("skboyAdminPassword");
    localStorage.removeItem(store.OWNER_KEY);
    location.href = "index.html";
  });

  document.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches("[data-save]")) saveAndRender();
    if (target.dataset.moveList) {
      moveItem(target.dataset.moveList, Number(target.dataset.moveIndex), Number(target.dataset.moveDir));
      return;
    }
    if (target.dataset.deleteList && target.dataset.deleteId) {
      const list = getOrderedList(target.dataset.deleteList);
      if (Array.isArray(list)) {
        data[target.dataset.deleteList] = list.filter(item => item.id !== target.dataset.deleteId);
        saveAndRender();
      }
    }
    if (target.dataset.toggleReview) {
      const review = data.reviews.find(item => item.id === target.dataset.toggleReview);
      if (review) review.approved = !review.approved;
      saveAndRender();
    }
  });

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")));
      reader.addEventListener("error", reject);
      reader.readAsDataURL(file);
    });
  }

  function resizeImage(file, options = {}) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("error", reject);
      reader.addEventListener("load", () => {
        const image = new Image();
        image.addEventListener("error", reject);
        image.addEventListener("load", () => {
          const maxWidth = options.maxWidth || 1100;
          const maxHeight = options.maxHeight || 900;
          const quality = options.quality || 0.82;
          const ratio = Math.min(1, maxWidth / image.width, maxHeight / image.height);
          const width = Math.max(1, Math.round(image.width * ratio));
          const height = Math.max(1, Math.round(image.height * ratio));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#10231f";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(image, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        });
        image.src = String(reader.result || "");
      });
      reader.readAsDataURL(file);
    });
  }

  document.addEventListener("change", event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files && input.files[0];
    if (!file) return;

    if (input.id === "heroLogoFile" && file.type.startsWith("image/")) {
      resizeImage(file, { maxWidth: 500, maxHeight: 500, quality: 0.82 }).then(result => {
        if (!data.hero) data.hero = {};
        data.hero.logo = result;
        document.getElementById("heroLogoInput").value = result;
        saveAndRender();
      });
      return;
    }

    if (input.id === "heroVideoFile" && file.type.startsWith("video/")) {
      fileToDataUrl(file).then(result => {
        if (!data.hero) data.hero = {};
        data.hero.video = result;
        document.getElementById("heroVideoInput").value = result;
        saveAndRender();
      });
      return;
    }

    const listName = input.dataset.imageUpload;
    const itemId = input.dataset.imageId;
    if (!listName || !itemId || !file.type.startsWith("image/")) return;
    const list = getOrderedList(listName);
    const item = Array.isArray(list) ? list.find(entry => entry.id === itemId) : null;
    if (!item) return;
    resizeImage(file, { maxWidth: 1200, maxHeight: 900, quality: 0.82 }).then(result => {
      item.image = result;
      saveAndRender();
    });
  });

  store.loadServerData().then(changed => {
    if (changed) data = store.loadData();
    if (isAuthed() && adminPassword) {
      checkPassword(adminPassword).then(ok => {
        if (ok) showAdmin();
        else {
          sessionStorage.removeItem("skboyAdminAuthed");
          sessionStorage.removeItem("skboyAdminPassword");
        }
      });
    }
  });
})();
