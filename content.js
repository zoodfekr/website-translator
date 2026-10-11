(() => {
  const WORD_PATTERN = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
  const EXCLUDED = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE", "KBD", "SAMP"]);
  const pending = new Set();
  let enabled = true;
  let requestInProgress = false;

  function isTranslatableText(node) {
    const parent = node.parentElement;
    return parent && !parent.closest("script, style, noscript, textarea, input, code, pre, kbd, samp, [contenteditable='true'], ruby, [data-wordyar]") &&
      !EXCLUDED.has(parent.tagName) &&
      node.nodeValue && /[A-Za-z]/.test(node.nodeValue);
  }

  function collectWords(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!isTranslatableText(node)) continue;
      for (const match of node.nodeValue.matchAll(WORD_PATTERN)) pending.add(match[0]);
    }
  }

  function splitAndAnnotate(node, translations) {
    const text = node.nodeValue;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let changed = false;
    for (const match of text.matchAll(WORD_PATTERN)) {
      const word = match[0];
      const translation = translations[word] || translations[word.toLocaleLowerCase("en")];
      if (!translation) continue;
      changed = true;
      fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
      const ruby = document.createElement("ruby");
      ruby.className = "wordyar-word";
      ruby.dataset.wordyar = "true";
      ruby.append(document.createTextNode(word));
      const gloss = document.createElement("rt");
      gloss.lang = "fa";
      gloss.textContent = translation;
      ruby.append(gloss);
      fragment.append(ruby);
      lastIndex = match.index + word.length;
    }
    if (changed) {
      fragment.append(document.createTextNode(text.slice(lastIndex)));
      node.replaceWith(fragment);
    }
  }

  async function translatePending() {
    if (!enabled || requestInProgress || pending.size === 0) return;
    requestInProgress = true;
    const words = [...pending].slice(0, 500);
    words.forEach((word) => pending.delete(word));
    try {
      const result = await chrome.runtime.sendMessage({ type: "translateWords", words });
      if (!enabled) return;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let node;
      while ((node = walker.nextNode())) if (isTranslatableText(node)) nodes.push(node);
      for (const textNode of nodes) splitAndAnnotate(textNode, result?.translations || {});
    } catch {
      // Keep the page readable if the translation service is unavailable.
    } finally {
      requestInProgress = false;
      if (pending.size) setTimeout(translatePending, 100);
    }
  }

  function unwrapTranslations() {
    document.querySelectorAll("ruby.wordyar-word").forEach((ruby) => {
      ruby.replaceWith(document.createTextNode(ruby.firstChild?.textContent || ""));
    });
    document.body.normalize();
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (enabled) {
      collectWords(document.body);
      translatePending();
    } else {
      pending.clear();
      unwrapTranslations();
    }
  }

  chrome.storage.sync.get({ enabled: true }, (settings) => {
    enabled = settings.enabled !== false;
    if (enabled) {
      collectWords(document.body);
      translatePending();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.enabled) setEnabled(changes.enabled.newValue);
  });

  const observer = new MutationObserver((mutations) => {
    if (!enabled) return;
    for (const mutation of mutations) {
      if (mutation.type === "characterData" && isTranslatableText(mutation.target)) {
        for (const match of mutation.target.nodeValue.matchAll(WORD_PATTERN)) pending.add(match[0]);
      }
      for (const added of mutation.addedNodes) {
        if (added.nodeType === Node.TEXT_NODE) {
          if (isTranslatableText(added)) {
            for (const match of added.nodeValue.matchAll(WORD_PATTERN)) pending.add(match[0]);
          }
        } else if (added.nodeType === Node.ELEMENT_NODE && !added.matches("ruby, [data-wordyar]")) {
          collectWords(added);
        }
      }
    }
    translatePending();
  });
  if (document.body) observer.observe(document.body, { childList: true, characterData: true, subtree: true });
})();
