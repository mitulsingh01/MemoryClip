// ── Helpers ─────────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function show(id) { $(id).classList.remove("hidden"); }
function hide(id) { $(id).classList.add("hidden"); }

const ALL_VIEWS = [
  "onboard-view",
  "settings-view",
  "learn-view",
  "loading-view",
  "success-view",
  "error-view",
  "paste-view",
];

function showOnly(id) {
  ALL_VIEWS.forEach((v) => (v === id ? show(v) : hide(v)));
}

function isAITab(url) {
  try {
    const h = new URL(url).hostname;
    return h.includes("claude.ai") || h.includes("chatgpt.com");
  } catch { return false; }
}

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function typeLabel(type) {
  return { youtube: "YouTube", github: "GitHub", article: "Article" }[type] || "Page";
}

function updateMemoryCount(memories) {
  const n = memories.length;
  $("memory-count").textContent = `${n} memor${n === 1 ? "y" : "ies"}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Render memory list ───────────────────────────────────────────────────────

function renderMemoryList(containerId, memories) {
  const el = $(containerId);
  el.innerHTML = "";
  memories.forEach((m) => {
    const item = document.createElement("div");
    item.className = "memory-item";

    const titleEl = document.createElement("span");
    titleEl.className = "memory-title";
    titleEl.textContent = m.title;

    const metaEl = document.createElement("span");
    metaEl.className = "memory-meta";
    metaEl.textContent = `${typeLabel(m.type)} · ${formatDate(m.savedAt)}`;

    const urlEl = document.createElement("a");
    urlEl.className = "memory-url";
    urlEl.textContent = m.url;
    urlEl.href = m.url;
    urlEl.title = m.url;
    urlEl.target = "_blank";
    urlEl.rel = "noopener noreferrer";

    item.appendChild(titleEl);
    item.appendChild(metaEl);
    item.appendChild(urlEl);
    el.appendChild(item);
  });
}

// ── Format memories for pasting ─────────────────────────────────────────────

const DIVIDER = "──────────────────────────────────────";

function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 40 ? u.pathname.slice(0, 40) + "…" : u.pathname;
    return u.hostname.replace(/^www\./, "") + path;
  } catch {
    return url;
  }
}

function formatSummary(text) {
  // Already has bullets — clean and indent, keep all of them
  if (text.includes("•")) {
    return text
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => "   " + line.trim())
      .join("\n");
  }

  // Convert paragraph prose to bullets (legacy summaries saved before the prompt change)
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 20)
    .map((s) => "   • " + s.trim())
    .join("\n");
}

function cleanTitle(raw) {
  return raw
    .replace(/^\(\d+\)\s*/, "")          // strip YouTube view count prefix "(299) "
    .replace(/\s*[-–|]\s*youtube$/i, "") // strip " - YouTube" suffix
    .trim();
}

function formatMemoriesForPaste(memories) {
  const blocks = memories.map((m, i) => {
    const rawTitle = cleanTitle(m.title);
    const title = toTitleCase(
      rawTitle.length > 70 ? rawTitle.slice(0, 70).trimEnd() + "..." : rawTitle
    );
    const summary = formatSummary(m.summary);

    return [
      `${i + 1}. ${title} - ${typeLabel(m.type)}`,
      m.url,
      ``,
      summary,
    ].join("\n");
  });

  const n = memories.length;
  const intro =
    `These are my saved memories — use them to inform your answers on any relevant topics.\n`;

  return `${intro}\n${blocks.join(`\n\n${DIVIDER}\n\n`)}\n\n${DIVIDER}`;
}

// ── Main init ────────────────────────────────────────────────────────────────

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { memoryClip_config: config } = await chrome.storage.local.get("memoryClip_config");

  if (!config) {
    showOnly("onboard-view");
    // Header extras hidden during onboarding
    initOnboardingView(tab);
    return;
  }

  // Config exists - show normal UI
  show("memory-count");
  show("gear-btn");

  const { memories = [] } = await chrome.storage.local.get("memories");
  updateMemoryCount(memories);

  $("gear-btn").addEventListener("click", () => initSettingsView(config, tab, memories));

  if (isAITab(tab.url)) {
    initPasteView(tab, memories);
  } else {
    initLearnView(tab, memories);
  }
}

// ── Onboarding view ──────────────────────────────────────────────────────────

function initOnboardingView(tab) {
  showOnly("onboard-view");

  // ── Provider toggle ──────────────────────────────────────────────────────
  let selectedProvider = null;

  document.querySelectorAll(".provider-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".provider-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedProvider = btn.dataset.value;
    });
  });

  $("onboard-submit-btn").addEventListener("click", async () => {
    const apiKey = $("api-key-input").value.trim();

    if (!selectedProvider || !apiKey) {
      show("onboard-error");
      return;
    }
    hide("onboard-error");

    const config = { provider: selectedProvider, apiKey };
    await chrome.storage.local.set({ memoryClip_config: config });

    // Transition to normal UI
    show("memory-count");
    show("gear-btn");

    const { memories = [] } = await chrome.storage.local.get("memories");
    updateMemoryCount(memories);

    $("gear-btn").addEventListener("click", () => initSettingsView(config, tab, memories));

    if (isAITab(tab.url)) {
      initPasteView(tab, memories);
    } else {
      initLearnView(tab, memories);
    }
  });
}

// ── Settings view ────────────────────────────────────────────────────────────

function initSettingsView(config, tab, memories) {
  showOnly("settings-view");
  hide("gear-btn");

  $("settings-provider").textContent =
    config.provider === "claude" ? "Claude (Anthropic)" : "OpenAI (ChatGPT)";

  // Show last 4 chars of key, rest masked
  const key = config.apiKey || "";
  const masked =
    key.length > 4
      ? "•".repeat(Math.min(key.length - 4, 12)) + key.slice(-4)
      : "•".repeat(key.length);
  $("settings-key-masked").textContent = masked;

  $("settings-change-btn").addEventListener("click", async () => {
    await chrome.storage.local.remove("memoryClip_config");
    hide("gear-btn");
    hide("memory-count");
    initOnboardingView(tab);
  });

  $("settings-back-btn").addEventListener("click", () => {
    show("gear-btn");
    if (isAITab(tab.url)) {
      initPasteView(tab, memories);
    } else {
      initLearnView(tab, memories);
    }
  });
}

// ── Learn view ───────────────────────────────────────────────────────────────

function initLearnView(tab, memories) {
  showOnly("learn-view");

  if (memories.length > 0) {
    renderMemoryList("learn-items", memories);
    show("learn-memory-list");
    show("learn-clear-btn");
  }

  $("learn-btn").addEventListener("click", () => startLearn(tab));

  $("learn-clear-btn").addEventListener("click", async () => {
    if (!confirm("Delete all memories?")) return;
    await chrome.storage.local.set({ memories: [] });
    hide("learn-memory-list");
    hide("learn-clear-btn");
    updateMemoryCount([]);
  });
}

async function startLearn(tab) {
  showOnly("loading-view");
  $("loading-text").textContent = "Reading page...";

  setTimeout(() => {
    $("loading-text").textContent = "Summarizing...";
  }, 1200);

  const response = await chrome.runtime.sendMessage({
    action: "learnPage",
    tabId: tab.id,
    tabUrl: tab.url,
    tabTitle: tab.title,
  });

  if (response.success) {
    showSuccess(response.memory);
  } else {
    showError(response.error || "Something went wrong");
  }
}

function showSuccess(memory) {
  showOnly("success-view");
  const lines = memory.summary.split("\n").filter((l) => l.trim()).slice(0, 2);
  $("summary-preview").textContent = lines.join(" ").slice(0, 200);

  setTimeout(async () => {
    const { memories = [] } = await chrome.storage.local.get("memories");
    updateMemoryCount(memories);
    if (memories.length > 0) {
      renderMemoryList("learn-items", memories);
      show("learn-memory-list");
      show("learn-clear-btn");
    }
    showOnly("learn-view");
  }, 2500);
}

function showError(msg) {
  showOnly("error-view");
  $("error-msg").textContent = msg;
  // Remove any existing listener before adding new one
  const btn = $("error-back-btn");
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.storage.local.get("memories", ({ memories = [] }) => {
        initLearnView(tab, memories);
      });
    });
  });
}

// ── Paste view ───────────────────────────────────────────────────────────────

function initPasteView(tab, memories) {
  showOnly("paste-view");

  const n = memories.length;
  $("paste-heading").textContent = `${n} memor${n === 1 ? "y" : "ies"} ready`;

  renderMemoryList("paste-items", memories);

  $("paste-btn").addEventListener("click", () => doPaste(tab, memories));

  $("paste-clear-btn").addEventListener("click", async () => {
    if (!confirm("Delete all memories?")) return;
    await chrome.storage.local.set({ memories: [] });
    updateMemoryCount([]);
    $("paste-heading").textContent = "0 memories ready";
    $("paste-items").innerHTML = "";
  });
}

function doPaste(tab, memories) {
  if (memories.length === 0) {
    showPasteStatus("No memories yet - go learn something first", "error");
    return;
  }

  const text = formatMemoriesForPaste(memories);

  chrome.tabs.sendMessage(tab.id, { action: "pasteMemories", text }, (response) => {
    if (chrome.runtime.lastError || !response) {
      showPasteStatus("Couldn't connect to the page - try refreshing the tab", "error");
      return;
    }

    if (response.success) {
      showPasteStatus("Memories pasted ✅ - click the chat box and hit Send", "success");
    } else {
      showPasteStatus(response.error || "Couldn't find the chat box", "error");
    }
  });
}

function showPasteStatus(msg, type) {
  const el = $("paste-status");
  el.textContent = msg;
  el.className = `paste-status ${type}`;
  show("paste-status");
}

// ── Boot ─────────────────────────────────────────────────────────────────────
init();
