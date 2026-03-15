// ── Tab type detection ──────────────────────────────────────────────────────

function detectTabType(url) {
  try {
    const hostname = new URL(url).hostname;
    if (hostname.includes("youtube.com")) return "youtube";
    if (hostname.includes("github.com")) return "github";
    return "article";
  } catch {
    return "article";
  }
}

// ── GitHub content extraction via public API ────────────────────────────────

async function extractGitHub(url) {
  const match = new URL(url).pathname.match(/^\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error("Couldn't parse GitHub repo URL");

  const [, owner, repo] = match;
  const headers = { Accept: "application/vnd.github.v3+json" };

  let readmeText = "";
  try {
    const readmeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      { headers }
    );
    if (readmeRes.ok) {
      const data = await readmeRes.json();
      readmeText = atob(data.content.replace(/\n/g, ""));
    }
  } catch {
    // continue without README
  }

  let fileList = "";
  try {
    const contentsRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents`,
      { headers }
    );
    if (contentsRes.ok) {
      const items = await contentsRes.json();
      if (Array.isArray(items)) {
        fileList = items
          .map((i) => `${i.type === "dir" ? "📁" : "📄"} ${i.name}`)
          .join("\n");
      }
    } else if (contentsRes.status === 404 || contentsRes.status === 403) {
      throw new Error("Couldn't access this repo - it may be private");
    }
  } catch (err) {
    if (err.message.includes("private")) throw err;
  }

  if (!readmeText && !fileList) {
    throw new Error("Couldn't access this repo - it may be private");
  }

  return [
    readmeText ? `README:\n${readmeText}` : "",
    fileList ? `\nTop-level files:\n${fileList}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 8000);
}

// ── Summarize via Claude or OpenAI ─────────────────────────────────────────

async function summarize(content, config) {
  if (!config || !config.apiKey) {
    throw new Error("Summarization failed - check your API key in settings");
  }

  const prompt =
    `You are a knowledge extractor. Extract the actual knowledge from the content below so someone who never read it can learn from it.\n\n` +
    `Rules:\n` +
    `• Write 6-10 bullet points starting each with "• "\n` +
    `• Each bullet must contain specific facts, arguments, names, numbers, concepts, or steps — NOT descriptions of what the content talks about\n` +
    `• BAD: "The author discusses the importance of reading habits"\n` +
    `• GOOD: "Reading for quantity (50 books/year) produces less retention than reading slowly with active note-taking — volume is vanity, depth is ROI"\n` +
    `• BAD: "The video covers five tragic character arcs"\n` +
    `• GOOD: "Old Lingxuzi gave up immortality to protect a mortal child — the game uses this to argue that attachment, not power, defines a legacy"\n` +
    `• Capture: core arguments, surprising insights, specific how-tos, named concepts, key distinctions, and anything counterintuitive\n` +
    `• No intro line. No outro line. No markdown formatting. No headers. Just the bullets.\n\n` +
    `Content: ${content}`;

  if (config.provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1024,
      }),
    });
    if (!res.ok) throw new Error("Summarization failed - check your API key in settings");
    const data = await res.json();
    return data.choices[0].message.content.trim();
  } else {
    // Claude
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error("Summarization failed - check your API key in settings");
    const data = await res.json();
    return data.content[0].text.trim();
  }
}

// ── Save memory ─────────────────────────────────────────────────────────────

async function saveMemory(memory) {
  const result = await chrome.storage.local.get("memories");
  const memories = result.memories || [];
  memories.unshift(memory);
  await chrome.storage.local.set({ memories });
}

// ── Message handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "learnPage") {
    handleLearnPage(message).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

async function handleLearnPage({ tabId, tabUrl, tabTitle }) {
  // Read config from storage
  const { memoryClip_config: config } = await chrome.storage.local.get("memoryClip_config");
  if (!config) {
    throw new Error("Please complete setup - click the extension icon to configure your API key");
  }

  const type = detectTabType(tabUrl);
  let content = "";

  if (type === "github") {
    content = await extractGitHub(tabUrl);
  } else {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPageContent,
      args: [type],
    });

    if (!results || !results[0]) {
      throw new Error("Couldn't read this page");
    }

    const result = results[0].result;
    if (result.error) throw new Error(result.error);
    content = result.content;
  }

  if (!content || content.trim().length < 50) {
    throw new Error("Couldn't read this page");
  }

  const summary = await summarize(content, config);

  const memory = {
    id: Date.now().toString(),
    title: tabTitle || "Untitled",
    url: tabUrl,
    type,
    summary,
    savedAt: new Date().toISOString(),
  };

  await saveMemory(memory);
  return { success: true, memory };
}

// ── Content extraction (injected into page) ─────────────────────────────────
// Must be a standalone async function - no closure references allowed.

async function extractPageContent(type) {
  if (type === "youtube") {
    const titleEl =
      document.querySelector("h1.ytd-video-primary-info-renderer") ||
      document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
      document.querySelector("h1.ytd-watch-metadata");
    const title = titleEl ? titleEl.innerText.trim() : document.title;

    // Extract description as supplemental fallback
    const descEl =
      document.querySelector("ytd-text-inline-expander yt-attributed-string") ||
      document.querySelector("#description-inline-expander") ||
      document.querySelector("#description");
    const description = descEl ? descEl.innerText.trim().slice(0, 500) : "";

    // ── Primary: ytInitialPlayerResponse caption tracks ──────────────────────
    let transcriptText = "";

    try {
      const scripts = document.querySelectorAll("script");
      for (const script of scripts) {
        const text = script.textContent;
        if (!text.includes("ytInitialPlayerResponse")) continue;

        // Bracket-count extraction - more reliable than regex for large JSON
        const assignIdx = text.indexOf("ytInitialPlayerResponse");
        if (assignIdx === -1) continue;

        const braceStart = text.indexOf("{", assignIdx);
        if (braceStart === -1) continue;

        let depth = 0;
        let braceEnd = braceStart;
        for (; braceEnd < text.length; braceEnd++) {
          if (text[braceEnd] === "{") depth++;
          else if (text[braceEnd] === "}") {
            depth--;
            if (depth === 0) break;
          }
        }

        const playerResponse = JSON.parse(text.slice(braceStart, braceEnd + 1));
        const captionTracks =
          playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

        if (captionTracks && captionTracks.length > 0) {
          // Prefer English track; fall back to first available
          const track =
            captionTracks.find((t) =>
              t.languageCode === "en" || (t.name?.simpleText || "").toLowerCase().includes("english")
            ) || captionTracks[0];

          const captionUrl = track.baseUrl;
          const res = await fetch(captionUrl);
          const xml = await res.text();

          const parser = new DOMParser();
          const doc = parser.parseFromString(xml, "text/xml");
          const textNodes = doc.querySelectorAll("text");
          transcriptText = Array.from(textNodes)
            .map((node) => node.textContent.replace(/&amp;/g, "&").replace(/&#39;/g, "'"))
            .join(" ")
            .trim();
        }
        break;
      }
    } catch {
      // fall through to error below
    }

    if (!transcriptText) {
      // If no transcript, use title + description if description is meaningful
      if (description.length > 100) {
        return {
          content: `Title: ${title}\n\nDescription:\n${description}`,
        };
      }
      return { error: "This video has no transcript available" };
    }

    return {
      content: `Title: ${title}\n\nTranscript:\n${transcriptText}${description ? `\n\nDescription:\n${description}` : ""}`,
    };
  }

  // ── Article / blog / docs ────────────────────────────────────────────────
  const rawContent =
    document.querySelector("article")?.innerText ||
    document.querySelector("main")?.innerText ||
    document.body.innerText ||
    "";

  const filtered = rawContent
    .split("\n")
    .filter((line) => line.trim().length >= 50)
    .join("\n")
    .trim()
    .slice(0, 8000);

  if (!filtered) {
    return { error: "Couldn't read this page" };
  }

  return { content: filtered };
}
