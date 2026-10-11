const checkbox = document.getElementById("enabled");
const status = document.getElementById("status");

chrome.storage.sync.get({ enabled: true }, (settings) => {
  checkbox.checked = settings.enabled !== false;
});

checkbox.addEventListener("change", () => {
  const enabled = checkbox.checked;
  chrome.storage.sync.set({ enabled }, () => {
    status.textContent = enabled ? "ترجمه روشن شد." : "ترجمه خاموش شد.";
  });
});
