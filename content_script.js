// Injected on claude.ai and chatgpt.com
// Listens for pasteMemories messages from popup.js

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "pasteMemories") {
    const result = pasteIntoChat(message.text);
    sendResponse(result);
  }
});

function pasteIntoChat(text) {
  // ── Find input box ─────────────────────────────────────────────────────────
  const inputBox =
    document.querySelector('[contenteditable="true"].ProseMirror') ||
    document.querySelector('[contenteditable="true"]')            ||
    document.querySelector("#prompt-textarea")                    ||
    document.querySelector('textarea[data-id="root"]');

  if (!inputBox) {
    return { success: false, error: "Couldn't find the chat box" };
  }

  inputBox.focus();

  setTimeout(() => {
    writeToInput(inputBox, text);

    // Retry once if box is still empty after 300ms
    setTimeout(() => {
      const isEmpty =
        (inputBox.innerText?.trim() || "") === "" &&
        (inputBox.value?.trim() || "") === "";
      if (isEmpty) {
        inputBox.focus();
        writeToInput(inputBox, text);
      }
    }, 300);
  }, 100);

  return { success: true };
}

function writeToInput(inputBox, text) {
  inputBox.focus();

  if (inputBox.tagName === "TEXTAREA") {
    // ── Standard textarea (some ChatGPT variants) ────────────────────────────
    // Use the native setter so React's synthetic event system picks it up
    const nativeSet = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    if (nativeSet) nativeSet.call(inputBox, text);
    else inputBox.value = text;

  } else {
    // ── Contenteditable (Claude.ai ProseMirror, ChatGPT) ─────────────────────
    // Setting innerText= collapses line breaks because ProseMirror's
    // MutationObserver fires immediately and re-serialises the DOM as a single
    // text node.  Dispatching a synthetic ClipboardEvent with text/plain lets
    // the editor's own paste handler run, which correctly creates a new
    // paragraph node for every newline — preserving all formatting.
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    inputBox.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      })
    );
  }

  // Fire events so React/Vue state updates
  inputBox.dispatchEvent(new InputEvent("input",  { bubbles: true, cancelable: true }));
  inputBox.dispatchEvent(new Event("change",      { bubbles: true }));
  inputBox.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
  inputBox.dispatchEvent(new KeyboardEvent("keyup",   { bubbles: true }));

  // Move cursor to end (contenteditable only)
  if (inputBox.tagName !== "TEXTAREA") {
    try {
      const range = document.createRange();
      const sel   = window.getSelection();
      range.selectNodeContents(inputBox);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      // cursor placement is best-effort
    }
  }
}
