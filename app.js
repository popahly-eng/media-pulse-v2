/**
 * Media Pulse — Application logic
 * ---------------------------------------------------------------
 * Vanilla ES6. No build step, no dependencies beyond fetch().
 */

(() => {
  "use strict";

  /* ---------------------------------------------------------------
   * State
   * --------------------------------------------------------------- */
  const state = {
    messageType: "news", // 'news' | 'text' | 'link' | 'file'
    url: "",
    title: "",
    priority: "Normal",
    mode: "all", // 'all' | 'sector' | 'client'
    summary: "",
    linkUrl: "",
    linkTitle: "",
    linkDescription: "",
    file: null,
    fileCaption: "",
    sectors: [],       // [{ id, name }]
    clients: [],       // [{ id, name, sectorNames: [] }]
    selectedSectorIds: new Set(),
    selectedClientIds: new Set(),
    clientSearch: "",
    sending: false,
    fetchingTitle: false,
  };

  /* ---------------------------------------------------------------
   * DOM references
   * --------------------------------------------------------------- */
  const el = {
    urlInput: document.getElementById("urlInput"),
    urlHint: document.getElementById("urlHint"),
    fetchTitleBtn: document.getElementById("fetchTitleBtn"),
    titleInput: document.getElementById("titleInput"),

    typeGroup: document.getElementById("typeGroup"),
    typePanels: document.querySelectorAll(".type-panel"),

    summaryInput: document.getElementById("summaryInput"),

    linkUrlInput: document.getElementById("linkUrlInput"),
    linkTitleInput: document.getElementById("linkTitleInput"),
    linkDescInput: document.getElementById("linkDescInput"),

    fileInput: document.getElementById("fileInput"),
    fileDrop: document.getElementById("fileDrop"),
    fileDropLabel: document.getElementById("fileDropLabel"),
    fileCaptionInput: document.getElementById("fileCaptionInput"),

    previewDescription: document.getElementById("previewDescription"),
    previewFileRow: document.getElementById("previewFileRow"),
    previewFileName: document.getElementById("previewFileName"),

    priorityGroup: document.getElementById("priorityGroup"),
    modeGroup: document.getElementById("modeGroup"),

    sectorPanel: document.getElementById("sectorPanel"),
    sectorList: document.getElementById("sectorList"),
    sectorCount: document.getElementById("sectorCount"),

    clientPanel: document.getElementById("clientPanel"),
    clientList: document.getElementById("clientList"),
    clientCount: document.getElementById("clientCount"),
    clientSearch: document.getElementById("clientSearch"),

    previewTitle: document.getElementById("previewTitle"),
    previewUrl: document.getElementById("previewUrl"),
    previewTime: document.getElementById("previewTime"),
    previewPriorityRow: document.getElementById("previewPriorityRow"),
    previewPriorityBadge: document.getElementById("previewPriorityBadge"),
    targetSummary: document.getElementById("targetSummary"),

    sendBtn: document.getElementById("sendBtn"),
    formError: document.getElementById("formError"),
    toast: document.getElementById("toast"),
  };

  /* ---------------------------------------------------------------
   * Utilities
   * --------------------------------------------------------------- */
  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function isValidUrl(value) {
    try {
      const u = new URL(value);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  function shortUrl(value) {
    try {
      const u = new URL(value);
      return (u.hostname + u.pathname).replace(/\/$/, "");
    } catch {
      return value;
    }
  }

  function setButtonLoading(btn, isLoading) {
    const spinner = btn.querySelector(".btn__spinner");
    const label = btn.querySelector(".btn__label");
    btn.disabled = isLoading;
    if (spinner) spinner.hidden = !isLoading;
    if (label) label.style.opacity = isLoading ? "0.55" : "1";
  }

  function showToast(message, type = "success", duration = 3200) {
    el.toast.textContent = message;
    el.toast.className = "toast is-visible " + (type === "error" ? "is-error" : "is-success");
    el.toast.hidden = false;
    requestAnimationFrame(() => el.toast.classList.add("is-visible"));
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      el.toast.classList.remove("is-visible");
      setTimeout(() => { el.toast.hidden = true; }, 300);
    }, duration);
  }

  function showFormError(message) {
    if (!message) {
      el.formError.hidden = true;
      el.formError.textContent = "";
      return;
    }
    el.formError.hidden = false;
    el.formError.textContent = message;
  }

  /* ---------------------------------------------------------------
   * Recipient data (clients / sectors) — loaded from n8n
   * --------------------------------------------------------------- */
  async function loadFormData() {
    el.sectorList.innerHTML = `<p class="empty-note">Loading sectors…</p>`;
    el.clientList.innerHTML = `<p class="empty-note">Loading clients…</p>`;
    try {
      const res = await fetch(CONFIG.FORM_DATA_URL);
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      const data = await res.json();
      if (data?.success === false) {
        throw new Error("Request did not succeed.");
      }

      state.clients = Array.isArray(data.clients)
        ? data.clients.map((c) => ({ id: c.id, name: c.name, sectorNames: [] }))
        : [];
      state.sectors = Array.isArray(data.sectors)
        ? data.sectors.map((s) => ({ id: s.id, name: s.name }))
        : [];

      renderSectorList();
      renderClientList();
    } catch (err) {
      const message = `<p class="empty-note">Couldn't load recipients. Please try again later.</p>`;
      el.sectorList.innerHTML = message;
      el.clientList.innerHTML = message;
      console.error(err);
    }
  }

  /* ---------------------------------------------------------------
   * Title fetching (Microlink, OpenGraph fallback)
   * --------------------------------------------------------------- */
  async function fetchArticleTitle(url) {
    // Primary: Microlink
    try {
      const res = await fetch(`${CONFIG.MICROLINK_API}/?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data?.status === "success") {
        const title = data.data?.title || data.data?.publisher || "";
        if (title) return title;
      }
    } catch (err) {
      console.warn("Microlink lookup failed, falling back to OpenGraph.", err);
    }

    // Fallback: fetch raw HTML and parse OpenGraph / <title> tags.
    // Uses a public CORS proxy since browsers cannot fetch arbitrary
    // cross-origin HTML directly.
    try {
      const proxyUrl = `https://r.jina.ai/${url}`;
      const res = await fetch(proxyUrl);
      const text = await res.text();
      const ogMatch = text.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
      if (ogMatch?.[1]) return ogMatch[1];
      const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch?.[1]) return titleMatch[1].trim();
    } catch (err) {
      console.warn("OpenGraph fallback failed.", err);
    }

    throw new Error("Couldn't read a title from that link. Type it in manually below.");
  }

  async function handleFetchTitle() {
    const url = el.urlInput.value.trim();
    if (!isValidUrl(url)) {
      el.urlHint.textContent = "Enter a valid link starting with http:// or https://";
      el.urlHint.style.color = "var(--urgent)";
      el.urlInput.focus();
      return;
    }
    el.urlHint.style.color = "";
    state.fetchingTitle = true;
    setButtonLoading(el.fetchTitleBtn, true);
    try {
      const title = await fetchArticleTitle(url);
      state.title = title;
      el.titleInput.value = title;
      el.urlHint.textContent = "Headline pulled automatically. Feel free to edit it.";
      updatePreview();
    } catch (err) {
      el.urlHint.textContent = err.message || "Couldn't fetch the title automatically.";
      el.urlHint.style.color = "var(--urgent)";
    } finally {
      state.fetchingTitle = false;
      setButtonLoading(el.fetchTitleBtn, false);
    }
  }

  /* ---------------------------------------------------------------
   * Segmented controls (Priority / Send To)
   * --------------------------------------------------------------- */
  function wireSegmented(group, onChange) {
    group.addEventListener("click", (e) => {
      const opt = e.target.closest(".segmented__opt");
      if (!opt) return;
      [...group.children].forEach((c) => {
        c.classList.remove("is-active");
        c.setAttribute("aria-checked", "false");
      });
      opt.classList.add("is-active");
      opt.setAttribute("aria-checked", "true");
      onChange(opt.dataset.value);
    });
  }

  function priorityBadgeMeta(priority) {
    if (priority === "Urgent") return { label: "🔴 URGENT", cls: "badge--urgent" };
    if (priority === "Important") return { label: "🟠 IMPORTANT", cls: "badge--important" };
    return null;
  }

  /* ---------------------------------------------------------------
   * Checklists — sectors / clients
   * --------------------------------------------------------------- */
  function renderSectorList() {
    if (!state.sectors.length) {
      el.sectorList.innerHTML = `<p class="empty-note">No sectors found.</p>`;
      return;
    }
    el.sectorList.innerHTML = state.sectors
      .map((s) => {
        const checked = state.selectedSectorIds.has(s.id);
        return `
          <label class="check-item ${checked ? "is-checked" : ""}" data-id="${s.id}">
            <input type="checkbox" ${checked ? "checked" : ""} data-id="${s.id}" />
            <span>${escapeHtml(s.name)}</span>
          </label>`;
      })
      .join("");
    updateSectorCount();
  }

  function renderClientList() {
    const term = state.clientSearch.trim().toLowerCase();
    const filtered = term
      ? state.clients.filter((c) => c.name.toLowerCase().includes(term))
      : state.clients;

    if (!state.clients.length) {
      el.clientList.innerHTML = `<p class="empty-note">No clients found.</p>`;
      return;
    }
    if (!filtered.length) {
      el.clientList.innerHTML = `<p class="empty-note">No clients match "${escapeHtml(state.clientSearch)}".</p>`;
      return;
    }

    el.clientList.innerHTML = filtered
      .map((c) => {
        const checked = state.selectedClientIds.has(c.id);
        const sub = c.sectorNames.length ? `<span class="item-sub">${escapeHtml(c.sectorNames[0])}</span>` : "";
        return `
          <label class="check-item ${checked ? "is-checked" : ""}" data-id="${c.id}">
            <input type="checkbox" ${checked ? "checked" : ""} data-id="${c.id}" />
            <span>${escapeHtml(c.name)}</span>
            ${sub}
          </label>`;
      })
      .join("");
    updateClientCount();
  }

  function updateSectorCount() {
    const n = state.selectedSectorIds.size;
    el.sectorCount.textContent = `${n} selected`;
    updatePreview();
  }

  function updateClientCount() {
    const n = state.selectedClientIds.size;
    el.clientCount.textContent = `${n} selected`;
    updatePreview();
  }

  el.sectorList.addEventListener("change", (e) => {
    const input = e.target.closest("input[type=checkbox]");
    if (!input) return;
    const id = input.dataset.id;
    if (input.checked) state.selectedSectorIds.add(id);
    else state.selectedSectorIds.delete(id);
    input.closest(".check-item").classList.toggle("is-checked", input.checked);
    updateSectorCount();
  });

  el.clientList.addEventListener("change", (e) => {
    const input = e.target.closest("input[type=checkbox]");
    if (!input) return;
    const id = input.dataset.id;
    if (input.checked) state.selectedClientIds.add(id);
    else state.selectedClientIds.delete(id);
    input.closest(".check-item").classList.toggle("is-checked", input.checked);
    updateClientCount();
  });

  el.clientSearch.addEventListener(
    "input",
    debounce((e) => {
      state.clientSearch = e.target.value;
      renderClientList();
    }, 150)
  );

  /* ---------------------------------------------------------------
   * Preview
   * --------------------------------------------------------------- */
  function updatePreview() {
    const type = state.messageType;

    // Reset optional rows; each branch below turns on what it needs.
    el.previewDescription.hidden = true;
    el.previewFileRow.hidden = true;
    el.previewUrl.style.display = "none";

    if (type === "news") {
      const title = el.titleInput.value.trim();
      el.previewTitle.textContent = title || "Your headline will appear here once you paste a link.";
      el.previewTitle.hidden = false;

      if (state.url && isValidUrl(state.url)) {
        el.previewUrl.textContent = shortUrl(state.url);
        el.previewUrl.href = state.url;
        el.previewUrl.style.display = "";
      }
    } else if (type === "text") {
      const summary = el.summaryInput.value.trim();
      el.previewTitle.textContent = summary || "Your message will appear here exactly as typed.";
      el.previewTitle.hidden = false;
    } else if (type === "link") {
      const linkTitle = el.linkTitleInput.value.trim();
      const linkDesc = el.linkDescInput.value.trim();

      if (linkTitle) {
        el.previewTitle.textContent = linkTitle;
        el.previewTitle.hidden = false;
      } else {
        el.previewTitle.hidden = true;
      }

      if (linkDesc) {
        el.previewDescription.textContent = linkDesc;
        el.previewDescription.hidden = false;
      }

      if (state.linkUrl && isValidUrl(state.linkUrl)) {
        el.previewUrl.textContent = shortUrl(state.linkUrl);
        el.previewUrl.href = state.linkUrl;
        el.previewUrl.style.display = "";
      }

      if (!linkTitle && !linkDesc && !state.linkUrl) {
        el.previewTitle.hidden = false;
        el.previewTitle.textContent = "Your link preview will appear here.";
      }
    } else if (type === "file") {
      el.previewTitle.hidden = true;
      el.previewFileRow.hidden = false;
      el.previewFileName.textContent = state.file ? state.file.name : "No file selected";

      const caption = el.fileCaptionInput.value.trim();
      if (caption) {
        el.previewDescription.textContent = caption;
        el.previewDescription.hidden = false;
      }
    }

    const now = new Date();
    el.previewTime.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const badge = priorityBadgeMeta(state.priority);
    if (badge) {
      el.previewPriorityRow.hidden = false;
      el.previewPriorityBadge.textContent = badge.label;
      el.previewPriorityBadge.className = `badge ${badge.cls}`;
    } else {
      el.previewPriorityRow.hidden = true;
    }

    // Target summary
    let summary = "Sending to <strong>All Clients</strong>.";
    if (state.mode === "sector") {
      const n = state.selectedSectorIds.size;
      summary = n
        ? `Sending to <strong>${n} sector${n > 1 ? "s" : ""}</strong>.`
        : `Select at least one sector.`;
    } else if (state.mode === "client") {
      const n = state.selectedClientIds.size;
      summary = n
        ? `Sending to <strong>${n} client${n > 1 ? "s" : ""}</strong>.`
        : `Select at least one client.`;
    }
    el.targetSummary.innerHTML = summary;
  }

  /* ---------------------------------------------------------------
   * Message Type switching
   * --------------------------------------------------------------- */
  function setMessageType(type) {
    state.messageType = type;
    showFormError(null);

    el.typePanels.forEach((panel) => {
      panel.hidden = panel.dataset.type !== type;
    });

    updatePreview();
  }

  /* ---------------------------------------------------------------
   * Mode (Send To) switching
   * --------------------------------------------------------------- */
  function setMode(mode) {
    state.mode = mode;
    el.sectorPanel.hidden = mode !== "sector";
    el.clientPanel.hidden = mode !== "client";
    updatePreview();
  }

  /* ---------------------------------------------------------------
   * Validation
   * --------------------------------------------------------------- */
  function validate() {
    const type = state.messageType;

    if (type === "news") {
      if (!state.url || !isValidUrl(state.url)) {
        return "Paste a valid news URL before sending.";
      }
      if (!el.titleInput.value.trim()) {
        return "The news title can't be empty.";
      }
    } else if (type === "text") {
      if (!el.summaryInput.value.trim()) {
        return "Write an editorial summary before sending.";
      }
    } else if (type === "link") {
      if (!state.linkUrl || !isValidUrl(state.linkUrl)) {
        return "Paste a valid link URL before sending.";
      }
    } else if (type === "file") {
      if (!state.file) {
        return "Choose a file before sending.";
      }
    }

    if (state.mode === "sector" && state.selectedSectorIds.size === 0) {
      return "Select at least one sector.";
    }
    if (state.mode === "client" && state.selectedClientIds.size === 0) {
      return "Select at least one client.";
    }
    return null;
  }

  /* ---------------------------------------------------------------
   * Send
   * --------------------------------------------------------------- */
  function buildPayload() {
    const type = state.messageType;
    const base = {
      type,
      url: "",
      title: "",
      description: "",
      message: "",
      caption: "",
      priority: state.priority.toLowerCase(),
      mode: state.mode,
      sector_ids: state.mode === "sector" ? [...state.selectedSectorIds] : [],
      client_ids: state.mode === "client" ? [...state.selectedClientIds] : [],
    };

    if (type === "news") {
      base.url = state.url;
      base.title = el.titleInput.value.trim();
    } else if (type === "text") {
      base.message = el.summaryInput.value.trim();
    } else if (type === "link") {
      base.url = state.linkUrl;
      base.title = el.linkTitleInput.value.trim();
      base.description = el.linkDescInput.value.trim();
    } else if (type === "file") {
      base.caption = el.fileCaptionInput.value.trim();
    }

    return base;
  }

  async function parseResponseSafely(res) {
    try {
      const text = await res.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    } catch {
      return null;
    }
  }

  async function sendJsonPayload(payload) {
    const res = await fetch(CONFIG.WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await parseResponseSafely(res);
    if (!res.ok || (data && data.success === false)) {
      throw new Error(`Webhook responded with status ${res.status}`);
    }
    return data;
  }

  async function sendFilePayload(payload) {
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (key === "sector_ids" || key === "client_ids") {
        formData.append(key, JSON.stringify(value));
      } else {
        formData.append(key, value);
      }
    });
    formData.append("file", state.file, state.file.name);

    // Note: Content-Type is intentionally NOT set here — the browser
    // must generate the multipart boundary itself.
    const res = await fetch(CONFIG.WEBHOOK_URL, {
      method: "POST",
      body: formData,
    });
    const data = await parseResponseSafely(res);
    if (!res.ok || (data && data.success === false)) {
      throw new Error(`Webhook responded with status ${res.status}`);
    }
    return data;
  }

  async function handleSend() {
    showFormError(null);
    const error = validate();
    if (error) {
      showFormError(error);
      return;
    }

    const payload = buildPayload();

    state.sending = true;
    setButtonLoading(el.sendBtn, true);
    el.sendBtn.querySelector(".btn__check").hidden = true;

    try {
      if (state.messageType === "file") {
        await sendFilePayload(payload);
      } else {
        await sendJsonPayload(payload);
      }

      setButtonLoading(el.sendBtn, false);
      el.sendBtn.querySelector(".btn__check").hidden = false;
      showToast("Pulse sent successfully.", "success");

      setTimeout(() => {
        el.sendBtn.querySelector(".btn__check").hidden = true;
      }, 1600);
    } catch (err) {
      console.error(err);
      setButtonLoading(el.sendBtn, false);
      showFormError("Couldn't reach the webhook. Check your connection and try again.");
      showToast("Send failed.", "error");
    } finally {
      state.sending = false;
    }
  }

  /* ---------------------------------------------------------------
   * Wire up static fields
   * --------------------------------------------------------------- */
  el.urlInput.addEventListener("input", (e) => {
    state.url = e.target.value.trim();
    showFormError(null);
    updatePreview();
  });

  el.urlInput.addEventListener("paste", () => {
    setTimeout(() => {
      state.url = el.urlInput.value.trim();
      if (state.messageType === "news" && isValidUrl(state.url)) handleFetchTitle();
    }, 30);
  });

  el.titleInput.addEventListener("input", () => {
    updatePreview();
  });

  el.summaryInput.addEventListener("input", (e) => {
    state.summary = e.target.value;
    updatePreview();
  });

  el.linkUrlInput.addEventListener("input", (e) => {
    state.linkUrl = e.target.value.trim();
    showFormError(null);
    updatePreview();
  });
  el.linkTitleInput.addEventListener("input", (e) => {
    state.linkTitle = e.target.value;
    updatePreview();
  });
  el.linkDescInput.addEventListener("input", (e) => {
    state.linkDescription = e.target.value;
    updatePreview();
  });

  el.fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    state.file = file;
    el.fileDropLabel.textContent = file ? file.name : "Choose file";
    el.fileDrop.classList.toggle("has-file", !!file);
    showFormError(null);
    updatePreview();
  });
  el.fileCaptionInput.addEventListener("input", (e) => {
    state.fileCaption = e.target.value;
    updatePreview();
  });

  el.fetchTitleBtn.addEventListener("click", handleFetchTitle);
  el.sendBtn.addEventListener("click", handleSend);

  wireSegmented(el.typeGroup, (value) => {
    setMessageType(value);
  });

  wireSegmented(el.priorityGroup, (value) => {
    state.priority = value;
    updatePreview();
  });

  wireSegmented(el.modeGroup, (value) => {
    setMode(value);
  });

  /* ---------------------------------------------------------------
   * Init
   * --------------------------------------------------------------- */
  updatePreview();
  loadFormData();
})();
