export interface InstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
}

type NativeHost = Window & {
  Capacitor?: { isNativePlatform?: () => boolean };
  ReactNativeWebView?: object;
  cordova?: object;
};

export function isInstalledExperience(): boolean {
  const host = window as NativeHost;
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const webView = /\bwv\b/i.test(navigator.userAgent) && /Android/i.test(navigator.userAgent);
  return standalone ||
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.matchMedia("(display-mode: fullscreen)").matches && !document.fullscreenElement) ||
    document.referrer.startsWith("android-app://") ||
    Boolean(host.Capacitor?.isNativePlatform?.()) ||
    Boolean(host.ReactNativeWebView || host.cordova || webView);
}

export function requestLandscapeGameMode(): void {
  if (!/Android|iPad|iPhone/i.test(navigator.userAgent) && !window.matchMedia("(pointer: coarse)").matches) return;
  const orientation = screen.orientation as ScreenOrientation & { lock?: (direction: "landscape") => Promise<void> };
  const lock = async () => {
    if (typeof orientation?.lock === "function") {
      try { await orientation.lock("landscape"); } catch { /* Manifest orientation and responsive UI remain as fallbacks. */ }
    }
  };

  if (!isInstalledExperience() && document.fullscreenEnabled && !document.fullscreenElement) {
    void document.documentElement.requestFullscreen({ navigationUI: "hide" })
      .catch(() => undefined)
      .then(lock);
  } else void lock();
}

export function leaveBrowserGameMode(): void {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  if (isInstalledExperience()) return;
  try { screen.orientation?.unlock(); } catch { /* Not every browser exposes unlock. */ }
}