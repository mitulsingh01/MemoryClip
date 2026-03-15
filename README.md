# MemoryClip

A Chrome extension that lets you clip and summarize any webpage — YouTube videos, GitHub repos, articles, blog posts — and instantly paste all your saved context into Claude.ai or ChatGPT so the AI has full background before you start chatting.

---

## What it does

**Learn mode** — on any tab, click the extension and hit **Learn This Page**. MemoryClip extracts the content, sends it to Claude or OpenAI, and saves a dense knowledge summary locally.

**Paste mode** — on Claude.ai or ChatGPT, click the extension and hit **Paste Memories**. All your saved summaries are injected directly into the chat input, numbered and formatted so the AI can use them as context.

No backend. No account. No sync. Everything stays on your machine in `chrome.storage.local`.

---

## Supported page types

| Page type | How content is extracted |
|-----------|--------------------------|
| **YouTube** | Pulls transcript via `ytInitialPlayerResponse` — no user action needed |
| **GitHub repos** | Fetches README + file tree via the public GitHub API |
| **Articles / blogs / docs** | Extracts from `<article>`, `<main>`, or `<body>` |

---

## Installation

### 1. Clone the repo

```bash
git clone https://github.com/mitulsingh01/MemoryClip.git
```

### 2. Load in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `MemoryClip` folder you just cloned

The MemoryClip icon will appear in your extensions bar.

### 3. Get an API key

You need one of these:

- **Claude** — get a key at [console.anthropic.com](https://console.anthropic.com) → API Keys
- **OpenAI** — get a key at [platform.openai.com](https://platform.openai.com) → API Keys

### 4. First launch setup

Click the MemoryClip icon. On first launch you'll see an onboarding screen — pick your provider (Claude or ChatGPT), paste your API key, and hit **Get Started**. That's it.

To change your provider or key later, click the ⚙️ gear icon in the top right of the popup.

---

## How to use

### Saving a memory

1. Open any YouTube video, GitHub repo, or article
2. Click the MemoryClip icon
3. Click **Learn This Page**
4. Wait a few seconds — you'll see a preview of the summary when it's done

### Pasting memories into Claude or ChatGPT

1. Open [claude.ai](https://claude.ai) or [chatgpt.com](https://chatgpt.com)
2. Click the MemoryClip icon
3. Click **Paste Memories**
4. Click inside the chat input box and hit **Send**

The pasted output looks like this:

```
These are my saved memories — use them to inform your answers on any relevant topics.

──────────────────────────────────────
1. How Claude Skills Work - Article
https://reddit.com/r/ClaudeAI/...

   • Claude Skills are modular instruction files loaded only when triggered.
   • Skills separate reusable instructions from permanent project context.
   • Bundling a codebase into a Skill lets Claude execute role-specific tasks.

──────────────────────────────────────
2. Black Myth Wukong's Lore - YouTube
https://youtube.com/watch?v=...

   • Old Lingxuzi sacrificed immortality to protect a mortal child.
   • Each arc explores themes of loss, legacy, and consequence.
   • The game draws heavily from Journey to the West mythology.

──────────────────────────────────────
2 memories · paste complete
```

---

## Storage

Memories are saved in `chrome.storage.local` — sandboxed to the extension, stored on disk in your Chrome profile. The limit is **5 MB**, which is roughly 1,000–1,500 summaries before you'd ever get close.

To inspect your saved memories: Chrome DevTools → Application → Storage → Extension Storage → `memories`.

---

## File structure

```
MemoryClip/
├── manifest.json        # Chrome MV3 manifest
├── popup.html           # Extension popup UI
├── popup.js             # Popup logic — learn, paste, onboarding, settings
├── content_script.js    # Injected on Claude.ai + ChatGPT — handles paste
├── background.js        # Service worker — content extraction + API calls
└── styles.css           # Popup styles
```

---

## Tech stack

- Vanilla JS — no framework, no bundler
- Chrome Extensions Manifest V3
- Claude API (`claude-sonnet-4-20250514`) or OpenAI API (`gpt-4o-mini`)
- `chrome.storage.local` for persistence
- GitHub public API for repo pages

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Couldn't read this page" | The page may block content scripts (e.g. Chrome Web Store). Try a different page. |
| "This video has no transcript" | The YouTube video has no captions available. |
| "Couldn't access this repo" | The GitHub repo is private. Only public repos are supported. |
| "Summarization failed" | Check your API key in the ⚙️ settings. Make sure it has credits. |
| Paste button does nothing | Refresh the Claude/ChatGPT tab, then try again. |
| Claude.ai UI breaks paste | Claude periodically updates their editor. The selector to update is `[contenteditable="true"].ProseMirror` in `content_script.js`. |
| ChatGPT UI breaks paste | ChatGPT periodically updates their editor. The selector to update is `#prompt-textarea` in `content_script.js`. |

---

## Contributing

Pull requests welcome. Keep it vanilla JS — no React, no bundler, no build step. The whole point is that anyone can open a file and read it.

---

## License

MIT
