window.PWAInstallPrompt = window.PWAInstallPrompt || {
  event: null,
  canInstall: false,
  isInstalled: false
};

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  window.PWAInstallPrompt.event = event;
  window.PWAInstallPrompt.canInstall = true;
  window.dispatchEvent(new CustomEvent("pwa-install-available"));
});

window.addEventListener("appinstalled", () => {
  window.PWAInstallPrompt.event = null;
  window.PWAInstallPrompt.canInstall = false;
  window.PWAInstallPrompt.isInstalled = true;
  window.dispatchEvent(new CustomEvent("pwa-install-changed"));
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
