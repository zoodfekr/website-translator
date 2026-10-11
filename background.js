const STORAGE_KEY = "wordyarTranslations";
const MAX_CACHE_SIZE = 12000;
const cache = new Map();

async function loadCache() {
  if (cache.size) return;
  const saved = await chrome.storage.local.get(STORAGE_KEY);
  for (const [word, translation] of Object.entries(saved[STORAGE_KEY] || {})) cache.set(word, translation);
}

async function translateWord(word) {
  const key = word.toLocaleLowerCase("en");
  if (cache.has(key)) return cache.get(key);
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "en");
  url.searchParams.set("tl", "fa");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", word);
  try {
    const response = await fetch(url);
    if (!response.ok) return "";
    const data = await response.json();
    const translation = (data?.[0] || []).map((part) => part?.[0] || "").join("").trim();
    if (translation) cache.set(key, translation);
    return translation;
  } catch {
    return "";
  }
}

async function persistCache() {
  while (cache.size > MAX_CACHE_SIZE) cache.delete(cache.keys().next().value);
  await chrome.storage.local.set({ [STORAGE_KEY]: Object.fromEntries(cache) });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "translateWords" || !Array.isArray(message.words)) return;
  (async () => {
    await loadCache();
    const words = [...new Set(message.words)].slice(0, 500);
    const translations = {};
    for (let index = 0; index < words.length; index += 4) {
      const group = words.slice(index, index + 4);
      const results = await Promise.all(group.map(async (word) => [word, await translateWord(word)]));
      for (const [word, translation] of results) translations[word] = translation;
    }
    await persistCache();
    sendResponse({ translations });
  })().catch(() => sendResponse({ translations: {} }));
  return true;
});
