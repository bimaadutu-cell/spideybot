import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ArrowLeft, ArrowRight, AudioLines, Battery, Check, ChevronRight, CircleHelp,
  Download, Eye, EyeOff, Flashlight, Footprints, Heart, KeyRound, LockKeyhole, Maximize,
  Menu as MenuIcon, MousePointer2, Pause, Play, RotateCcw, Scissors, Settings2,
  Shield, Smartphone, Wrench, X, Zap,
} from "lucide-react";
import { HorrorAudio } from "./game/audio";
import { GameEngine } from "./game/engine";
import { isInstalledExperience, leaveBrowserGameMode, requestLandscapeGameMode, type InstallPromptEvent } from "./pwa";
import {
  createSave, ITEM_DESCRIPTIONS, ITEM_NAMES, loadSave, loadSettings,
  NOTE_TEXT, saveGame, SETTINGS_KEY,
  type Difficulty, type GameSettings, type HudState, type ItemId, type SaveData,
} from "./game/types";

type Screen = "studio" | "menu" | "difficulty" | "intro" | "loading" | "playing" |
  "paused" | "settings" | "how" | "credits" | "gameover" | "victory" | "error";
type Modal = { kind: "safe" | "note" | "inventory"; id?: string } | null;

const DIFFICULTIES: { id: Difficulty; title: string; description: string; index: string }[] = [
  { id: "EASY", title: "Easy", description: "Lebih banyak waktu untuk bersembunyi. Sang Creeper bergerak lebih lambat.", index: "01" },
  { id: "NORMAL", title: "Normal", description: "Setiap langkah dan cahaya senter dapat mengungkap keberadaanmu.", index: "02" },
  { id: "HARD", title: "Hard", description: "Pendengarannya tajam. Ia tidak akan berhenti mencari dengan mudah.", index: "03" },
  { id: "NIGHTMARE", title: "Nightmare", description: "Ia lebih cepat, lebih peka, dan sekali tertangkap semuanya berakhir.", index: "04" },
];

function ItemSymbol({ item, size = 22 }: { item: ItemId; size?: number }) {
  if (item === "mainKey" || item === "basementKey" || item === "securityKey") return <KeyRound size={size} strokeWidth={1.5} />;
  if (item === "fuse") return <Zap size={size} strokeWidth={1.5} />;
  if (item === "screwdriver") return <Wrench size={size} strokeWidth={1.5} />;
  if (item === "boltCutter") return <Scissors size={size} strokeWidth={1.5} />;
  if (item === "medkit") return <Heart size={size} strokeWidth={1.5} />;
  return <Battery size={size} strokeWidth={1.5} />;
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-lockup ${compact ? "brand-compact" : ""}`}>
      <div className="brand-word" data-text="CREEPY">CREEPY<span className="brand-slash" /></div>
      <div className="brand-byline"><span />BY BIMZ</div>
    </div>
  );
}

function Background({ loading = false }: { loading?: boolean }) {
  const art = new URL(loading ? "./images/creepy-loading.jpg" : "./images/creepy-house-menu.jpg", document.baseURI).href;
  return (
    <div className={`cinematic-bg ${loading ? "cinematic-loading" : ""}`} aria-hidden="true">
      <div className="background-image" style={{ backgroundImage: `url("${art}")` }} />
      <div className="background-shade" />
      <div className="background-rain" />
      <div className="background-fog" />
      <div className="background-grain" />
    </div>
  );
}

function Header({ onBack, title, label }: { onBack: () => void; title: string; label?: string }) {
  return (
    <div className="panel-header">
      <button className="back-link" onClick={onBack}><ArrowLeft size={18} /> BACK</button>
      <div className="panel-header-title"><Eye size={20} strokeWidth={1.4} /> CREEPY <span>/ {label || title.toUpperCase()}</span></div>
    </div>
  );
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const sec = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${sec}`;
}

function Joystick({ onMove, style }: { onMove: (x: number, y: number) => void; style?: CSSProperties }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== event.pointerId || !baseRef.current) return;
    const rect = baseRef.current.getBoundingClientRect();
    const radius = rect.width * 0.31;
    const rawX = event.clientX - (rect.left + rect.width / 2);
    const rawY = event.clientY - (rect.top + rect.height / 2);
    const scale = Math.min(1, radius / Math.max(1, Math.hypot(rawX, rawY)));
    const x = rawX * scale, y = rawY * scale;
    setPosition({ x, y });
    onMove(x / radius, y / radius);
  };
  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== event.pointerId) return;
    pointerRef.current = null;
    setPosition({ x: 0, y: 0 });
    onMove(0, 0);
  };
  return (
    <div className="joystick" ref={baseRef} style={style}
      onPointerDown={(event) => { event.stopPropagation(); pointerRef.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); move(event); }}
      onPointerMove={move} onPointerUp={release} onPointerCancel={release}>
      <div className="joystick-ring" />
      <div className="joystick-thumb" style={{ transform: `translate(${position.x}px, ${position.y}px)` }} />
      <span className="joystick-caption">MOVE</span>
    </div>
  );
}

function LookJoystick({ onLook, style }: { onLook: (dx: number, dy: number) => void; style?: CSSProperties }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);
  const lastRef = useRef({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  return (
    <div ref={baseRef} className="joystick look-joystick" style={style}
      onPointerDown={(event) => {
        pointerRef.current = event.pointerId;
        lastRef.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (event.pointerId !== pointerRef.current || !baseRef.current) return;
        onLook(event.clientX - lastRef.current.x, event.clientY - lastRef.current.y);
        lastRef.current = { x: event.clientX, y: event.clientY };
        const rect = baseRef.current.getBoundingClientRect();
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;
        const scale = Math.min(1, rect.width * 0.3 / Math.max(1, Math.hypot(x, y)));
        setPosition({ x: x * scale, y: y * scale });
      }}
      onPointerUp={(event) => { if (event.pointerId === pointerRef.current) { pointerRef.current = null; setPosition({ x: 0, y: 0 }); } }}
      onPointerCancel={(event) => { if (event.pointerId === pointerRef.current) { pointerRef.current = null; setPosition({ x: 0, y: 0 }); } }}>
      <div className="joystick-ring" />
      <div className="joystick-thumb" style={{ transform: `translate(${position.x}px, ${position.y}px)` }} />
      <span className="joystick-caption">LOOK</span>
    </div>
  );
}

function SettingChoice<T extends string | number>({ title, value, options, onChange }: {
  title: string; value: T; options: T[]; onChange: (value: T) => void;
}) {
  return (
    <div className="setting-row">
      <span className="setting-name">{title}</span>
      <div className="setting-options">
        {options.map((option) => <button key={option} className={value === option ? "chosen" : ""} onClick={() => onChange(option)}>{option}</button>)}
      </div>
    </div>
  );
}

function SettingSlider({ title, value, min = 0, max = 100, suffix = "", onChange }: {
  title: string; value: number; min?: number; max?: number; suffix?: string; onChange: (value: number) => void;
}) {
  return (
    <label className="setting-row setting-slider-row">
      <span className="setting-name">{title}</span>
      <div className="setting-slider"><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /><span>{value}{suffix}</span></div>
    </label>
  );
}

function SettingToggle({ title, checked, onChange }: { title: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="setting-row">
      <span className="setting-name">{title}</span>
      <button className={`toggle-switch ${checked ? "active" : ""}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}><span /></button>
    </div>
  );
}

type LayoutKey = "move" | "look" | "actions";
const LAYOUT_KEYS: LayoutKey[] = ["move", "look", "actions"];

function offsetOf(settings: GameSettings, key: string): CSSProperties {
  const offset = settings.controlLayout[key];
  return { transform: `translate(${offset?.x || 0}px, ${offset?.y || 0}px)` };
}

function LayoutEditor({ settings, onChange, onClose }: {
  settings: GameSettings;
  onChange: (key: string, offset: { x: number; y: number }) => void;
  onClose: () => void;
}) {
  const dragRef = useRef<{ key: string; startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const start = (key: string, event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    const base = settings.controlLayout[key] || { x: 0, y: 0 };
    dragRef.current = { key, startX: event.clientX, startY: event.clientY, baseX: base.x, baseY: base.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    onChange(drag.key, {
      x: Math.round(Math.max(-180, Math.min(180, drag.baseX + event.clientX - drag.startX))),
      y: Math.round(Math.max(-140, Math.min(140, drag.baseY + event.clientY - drag.startY))),
    });
  };
  const stop = () => { dragRef.current = null; };
  const anchor = (key: LayoutKey, className: string, content: ReactNode) => (
    <div className={`layout-anchor ${className}`} style={offsetOf(settings, key)}
      onPointerDown={(event) => start(key, event)} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}>
      {content}
    </div>
  );
  return (
    <div className="layout-editor" style={{
      "--joystick-scale": settings.joystickSize / 100,
      "--button-scale": settings.buttonSize / 100,
      "--control-opacity": settings.controlOpacity / 100,
    } as CSSProperties}>
      <div className="layout-bar">
        <span>GESER KONTROL KE POSISI YANG KAMU MAU</span>
        <div>
          <button onClick={() => LAYOUT_KEYS.forEach((key) => onChange(key, { x: 0, y: 0 }))}>RESET POSISI</button>
          <button className="layout-done" onClick={onClose}>SIMPAN</button>
        </div>
      </div>
      {anchor("move", "joystick", <><div className="joystick-ring" /><div className="joystick-thumb" /><span className="joystick-caption">MOVE</span></>)}
      {anchor("look", "joystick look-joystick", <><div className="joystick-ring" /><div className="joystick-thumb" /><span className="joystick-caption">LOOK</span></>)}
      {anchor("actions", "mobile-actions", <>
        <span className="mobile-action action-interact"><span><MousePointer2 size={25} /></span><small>INTERACT</small></span>
        <div className="mobile-action-row">
          <span className="mobile-action"><span><Footprints size={21} /></span><small>RUN</small></span>
          <span className="mobile-action"><span><EyeOff size={21} /></span><small>CROUCH</small></span>
          <span className="mobile-action"><span><Flashlight size={21} /></span><small>LIGHT</small></span>
        </div>
      </>)}
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("studio");
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const [saveAvailable, setSaveAvailable] = useState(() => Boolean(loadSave()));
  const [hud, setHud] = useState<HudState | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [safeCode, setSafeCode] = useState("");
  const [safeError, setSafeError] = useState(false);
  const [toast, setToast] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingLabel, setLoadingLabel] = useState("Preparing renderer...");
  const [loadingReady, setLoadingReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [victoryData, setVictoryData] = useState<SaveData | null>(null);
  const [mobile, setMobile] = useState(false);
  const [installed, setInstalled] = useState(isInstalledExperience);
  const [canInstall, setCanInstall] = useState(false);
  const [installGuide, setInstallGuide] = useState(false);
  const [portraitDismissed, setPortraitDismissed] = useState(false);
  const [layoutEdit, setLayoutEdit] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const audioRef = useRef<HorrorAudio | null>(null);
  const pendingRef = useRef<SaveData | null>(null);
  const loadingIdRef = useRef(0);
  const loadingStartedRef = useRef(false);
  const originRef = useRef<Screen>("menu");
  const installPromptRef = useRef<InstallPromptEvent | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setScreen((current) => current === "studio" ? "menu" : current), 3150);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    setMobile(window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0);
  }, []);

  useEffect(() => {
    const available = (event: Event) => {
      if (isInstalledExperience()) return;
      event.preventDefault();
      installPromptRef.current = event as InstallPromptEvent;
      setCanInstall(true);
    };
    const installedNow = () => { installPromptRef.current = null; setCanInstall(false); setInstalled(true); setInstallGuide(false); };
    const resumed = () => { if (!document.hidden && isInstalledExperience()) requestLandscapeGameMode(); };
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", installedNow);
    document.addEventListener("visibilitychange", resumed);
    if (isInstalledExperience()) requestLandscapeGameMode();
    return () => {
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", installedNow);
      document.removeEventListener("visibilitychange", resumed);
    };
  }, []);

  useEffect(() => {
    if (screen !== "intro") return;
    const timeout = window.setTimeout(() => { if (pendingRef.current) void beginLoading(pendingRef.current); }, 3100);
    return () => window.clearTimeout(timeout);
    // The intro starts one loading sequence; a skipped intro uses the same guarded function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Settings still work for this session. */ }
    audioRef.current?.setSettings(settings);
    engineRef.current?.applySettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => () => {
    loadingIdRef.current++;
    engineRef.current?.dispose();
    audioRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (!modal) return;
    const handle = (event: KeyboardEvent) => {
      if (event.code === "Escape" || (modal.kind === "inventory" && event.code === "KeyI")) { event.preventDefault(); closeModal(); }
      if (modal.kind !== "safe") return;
      if (/^Digit[0-9]$/.test(event.code)) setSafeCode((code) => (code + event.code.slice(-1)).slice(0, 4));
      if (event.code === "Backspace") setSafeCode((code) => code.slice(0, -1));
      if (event.code === "Enter") submitSafe();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
    // Modal handlers intentionally read the current modal and keypad values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, safeCode]);

  const getAudio = () => {
    if (!audioRef.current) audioRef.current = new HorrorAudio(settings);
    return audioRef.current;
  };
  const menuSound = () => {
    const audio = getAudio();
    void audio.init().then(() => { audio.setMode("menu"); audio.play("button"); }).catch(() => undefined);
  };

  function showToast(message: string) { setToast(message); }

  function closeModal() {
    setModal(null);
    engineRef.current?.setPaused(false);
    if (!mobile) engineRef.current?.requestPointerLock();
  }

  function openInventory() {
    engineRef.current?.setPaused(true);
    setModal({ kind: "inventory" });
  }

  async function beginLoading(data: SaveData) {
    if (loadingStartedRef.current) return;
    loadingStartedRef.current = true;
    const id = ++loadingIdRef.current;
    pendingRef.current = data;
    setLoadingProgress(0);
    setLoadingLabel("Preparing renderer...");
    setLoadingReady(false);
    setScreen("loading");
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (id !== loadingIdRef.current || !hostRef.current) return;
    engineRef.current?.dispose();
    const engine = new GameEngine(hostRef.current, data, settings, getAudio(), {
      onHud: (state) => setHud(state),
      onToast: showToast,
      onModal: (kind, noteId) => {
        engineRef.current?.setPaused(true);
        setSafeCode(""); setSafeError(false);
        setModal({ kind, id: noteId });
      },
      onPause: () => { engineRef.current?.setPaused(true); setScreen("paused"); },
      onInventory: openInventory,
      onDeath: () => { setScreen("gameover"); setSaveAvailable(true); },
      onVictory: (result) => { setVictoryData(result); setScreen("victory"); setSaveAvailable(false); },
      onError: (message) => { setErrorMessage(message); setScreen("error"); },
    });
    engineRef.current = engine;
    const ok = await engine.initialize((label, value) => {
      if (id !== loadingIdRef.current) return;
      setLoadingLabel(label);
      setLoadingProgress(value);
    });
    if (id === loadingIdRef.current && ok) {
      setLoadingReady(true);
      setSaveAvailable(true);
    }
  }

  function newGame(difficulty: Difficulty) {
    menuSound();
    if (installed) requestLandscapeGameMode();
    const data = createSave(difficulty);
    saveGame(data);
    pendingRef.current = data;
    loadingStartedRef.current = false;
    setScreen("intro");
  }

  function continueGame() {
    menuSound();
    if (installed) requestLandscapeGameMode();
    const data = loadSave();
    if (!data) { setSaveAvailable(false); showToast("Save tidak ditemukan."); return; }
    pendingRef.current = data;
    loadingStartedRef.current = false;
    void beginLoading(data);
  }

  function enterHouse() {
    if (!loadingReady) return;
    requestLandscapeGameMode();
    setScreen("playing");
    getAudio().setMode("game");
    engineRef.current?.setPaused(false);
    engineRef.current?.requestPointerLock();
    showToast("Temukan jalan keluar. Jangan biarkan ia mendengarmu.");
  }

  function pauseGame() { engineRef.current?.setPaused(true); setScreen("paused"); }
  function resumeGame() {
    setScreen("playing");
    getAudio().setMode("game");
    engineRef.current?.setPaused(false);
    engineRef.current?.requestPointerLock();
  }

  function toMenu() {
    leaveBrowserGameMode();
    loadingIdRef.current++;
    loadingStartedRef.current = false;
    engineRef.current?.setPaused(true);
    engineRef.current?.dispose();
    engineRef.current = null;
    getAudio().setMode("menu");
    setModal(null);
    setSaveAvailable(Boolean(loadSave()));
    setScreen("menu");
  }

  function restartGame() {
    const engine = engineRef.current;
    if (!engine) return;
    const data = engine.data;
    const fresh = createSave(data.difficulty, data.attempts + 1);
    saveGame(fresh);
    engine.dispose();
    engineRef.current = null;
    loadingStartedRef.current = false;
    void beginLoading(fresh);
  }

  function openPanel(panel: "settings" | "how" | "credits") {
    menuSound();
    originRef.current = screen === "paused" ? "paused" : "menu";
    engineRef.current?.setPaused(true);
    setScreen(panel);
  }

  function updateSetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function submitSafe() {
    if (engineRef.current?.trySafeCode(safeCode)) {
      setSafeError(false);
      closeModal();
    } else {
      setSafeError(true);
      setSafeCode("");
    }
  }

  function fullScreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else { void document.documentElement.requestFullscreen?.(); if (mobile) requestLandscapeGameMode(); }
  }

  async function installApp() {
    menuSound();
    const prompt = installPromptRef.current;
    if (!prompt) { setInstallGuide(true); return; }
    installPromptRef.current = null;
    try {
      const result = await prompt.prompt();
      setCanInstall(false);
      if (result.outcome === "accepted") { setInstalled(true); setInstallGuide(false); }
    } catch {
      setCanInstall(false);
      setInstallGuide(true);
    }
  }

  const inGameVisual = ["loading", "playing", "paused", "gameover", "victory", "error"].includes(screen) ||
    ((screen === "settings" || screen === "how") && engineRef.current !== null);
  const menuVisual = ["menu", "difficulty", "credits"].includes(screen) ||
    ((screen === "settings" || screen === "how") && engineRef.current === null);
  const showHud = screen === "playing" && Boolean(hud);

  return (
    <div className={`app-shell screen-${screen} ${settings.effects === "LOW" ? "effects-low" : ""}`}>
      <div ref={hostRef} className="game-host" style={{ display: inGameVisual ? "block" : "none" }} />
      {menuVisual && <Background />}

      {screen === "studio" && (
        <div className="studio-intro">
          <div className="studio-red-haze" />
          <div className="studio-first">BIMZ</div>
          <div className="studio-second"><span>BIMZ</span> STUDIO<small>AN ORIGINAL HORROR GAME</small></div>
          <div className="studio-last">CREEPY</div>
          <button className="studio-skip" onClick={() => setScreen("menu")}>SKIP INTRO <ArrowRight size={14} /></button>
        </div>
      )}

      {screen === "menu" && (
        <div className="menu-screen">
          <header className="menu-topbar">
            <div className="studio-mark"><Eye size={23} strokeWidth={1.3} /><span>BIMZ STUDIO<small>ORIGINAL HORROR</small></span></div>
            <div className="menu-chapter"><span className="tiny-red-line" /> CHAPTER 01 <span className="chapter-divider">/</span> THE OLD HOUSE</div>
          </header>
          <main className="menu-content">
            <div className="menu-copy">
              <div className="eyebrow"><span className="red-square" /> A FIRST-PERSON SURVIVAL HORROR</div>
              <Logo />
              <p className="menu-tagline">Welcome to the house.<br /><strong>You are not alone.</strong></p>
              <nav className="main-nav" aria-label="Main menu">
                {[
                  { number: "01", title: "NEW GAME", action: () => { menuSound(); setScreen("difficulty"); }, icon: <ArrowRight size={20} /> },
                  { number: "02", title: "CONTINUE", action: continueGame, icon: <ArrowRight size={20} />, disabled: !saveAvailable },
                  { number: "03", title: "SETTINGS", action: () => openPanel("settings"), icon: <ArrowRight size={20} /> },
                  { number: "04", title: "HOW TO PLAY", action: () => openPanel("how"), icon: <ArrowRight size={20} /> },
                  { number: "05", title: "CREDITS", action: () => openPanel("credits"), icon: <ArrowRight size={20} /> },
                ].map((link) => (
                  <button key={link.number} className={`main-nav-link ${link.number === "01" ? "main-nav-primary" : ""}`} disabled={link.disabled} onClick={link.action}>
                    <span className="nav-number">{link.number}</span><span>{link.title}</span>{link.disabled && <small>NO SAVE</small>}<span className="nav-arrow">{link.icon}</span>
                  </button>
                ))}
              </nav>
            </div>
          </main>
          <footer className="menu-footer"><span>CREEPY <i /> BY BIMZ</span>{!installed && <button className="install-menu-link" onClick={() => void installApp()}><Download size={15} /> {canInstall ? "INSTALL GAME" : "INSTALL PWA"}</button>}<span>HEADPHONES RECOMMENDED <i /> v1.1</span></footer>
        </div>
      )}

      {screen === "difficulty" && (
        <div className="fullscreen-panel difficulty-screen">
          <Header title="difficulty" onBack={() => setScreen("menu")} label="NEW GAME" />
          <div className="panel-body difficulty-body">
            <div className="section-marker"><span /> CHAPTER 01 / THE OLD HOUSE</div>
            <h1>CHOOSE YOUR<br /><em>FEAR.</em></h1>
            <p className="panel-lead">Setiap pilihan mengubah cara ia memburu. Pilih dengan hati-hati.</p>
            <div className="difficulty-list">
              {DIFFICULTIES.map((difficulty) => (
                <button key={difficulty.id} className="difficulty-option" onClick={() => newGame(difficulty.id)}>
                  <span className="difficulty-index">{difficulty.index}</span>
                  <span className="difficulty-detail"><strong>{difficulty.title}</strong><small>{difficulty.description}</small></span>
                  <ArrowRight size={22} strokeWidth={1.3} />
                </button>
              ))}
            </div>
          </div>
          <div className="panel-footnote">THE HOUSE DOES NOT FORGIVE. <span>BY BIMZ / v1.1</span></div>
        </div>
      )}

      {screen === "intro" && (
        <div className="story-intro">
          <Background loading />
          <div className="windshield-frame" />
          <div className="story-top"><span>CHAPTER 01</span><span>00:43 AM</span></div>
          <div className="story-copy"><div className="section-marker"><span /> THE OLD HOUSE</div><h1>THE SIGNAL<br />ENDS HERE.</h1><p>Aku datang karena sebuah sinyal. Sekarang, pintunya terkunci.</p></div>
          <div className="story-bottom"><span>[ CAR ENGINE STOPS ]</span><button onClick={() => { if (pendingRef.current) void beginLoading(pendingRef.current); }}>SKIP INTRO <ArrowRight size={16} /></button></div>
        </div>
      )}

      {screen === "loading" && (
        <div className="loading-screen">
          <Background loading />
          <div className="loading-top"><div className="studio-mark"><Eye size={21} strokeWidth={1.3} /><span>BIMZ STUDIO</span></div><span>CHAPTER 01 / THE OLD HOUSE</span></div>
          <div className="loading-title"><span>WELCOME TO THE HOUSE</span><Logo /><p>Something has been waiting for you.</p></div>
          <div className="loading-bottom">
            <div className="loading-status"><span className="section-marker"><span /> {loadingReady ? "READY TO ENTER" : loadingLabel.toUpperCase()}</span><strong>{String(loadingProgress).padStart(2, "0")}%</strong></div>
            <div className="loading-track"><div style={{ width: `${loadingProgress}%` }} /></div>
            <div className="loading-stages">
              {[
                ["HOUSE", 22], ["ENVIRONMENT", 51], ["AI", 71], ["AUDIO", 85], ["NIGHTMARE", 100],
              ].map(([stage, threshold]) => <span className={loadingProgress >= Number(threshold) ? "complete" : ""} key={stage}>{loadingProgress >= Number(threshold) ? <Check size={11} /> : <span className="stage-dot" />}{stage}</span>)}
            </div>
            {loadingReady && <button className="enter-button" onClick={enterHouse}>ENTER THE HOUSE <ArrowRight size={19} /></button>}
          </div>
        </div>
      )}

      {showHud && hud && (
        <div className={`game-ui ${hud.monsterState === "CHASE" ? "is-chased" : ""} ${hud.hidden ? "is-hidden" : ""}`} style={{
          "--joystick-scale": settings.joystickSize / 100,
          "--button-scale": settings.buttonSize / 100,
          "--control-opacity": settings.controlOpacity / 100,
          "--button-lift": `${Math.max(0, (settings.buttonSize - 100) * 1.8)}px`,
        } as CSSProperties}>
          <div className="game-vignette" />
          <div className="game-grain" />
          {hud.flashlightOn && <div className="flashlight-bloom" />}
          {hud.hurt && <div className="hurt-overlay" />}
          {hud.hidden && <div className="hiding-overlay"><div className="hiding-slit" /></div>}
          <div className="hud-top">
            <div className="hud-brand"><strong>CREEPY</strong><span>BY BIMZ</span><small>CHAPTER 01 / THE OLD HOUSE</small></div>
            <div className="hud-objective"><span>OBJECTIVE</span><strong>{hud.objective}</strong></div>
            <div className="hud-top-actions">{hud.actualFps > 0 && <span className="fps-readout">{hud.actualFps} FPS</span>}<button title="Fullscreen" onClick={fullScreen} className="desktop-hud-button"><Maximize size={18} /></button><button title="Pause" onClick={pauseGame}><Pause size={19} /></button></div>
          </div>
          <div className="hud-room"><span /> {hud.room}</div>
          <div className="crosshair"><i /><i /></div>
          {hud.prompt && <div className="interact-prompt"><span className="prompt-key">E</span><div><strong>{hud.prompt.label}</strong><small>{hud.prompt.detail}</small></div></div>}
          {hud.subtitle && <div className="subtitle">{hud.subtitle}</div>}
          {hud.monsterState === "CHASE" && <div className="chase-warning"><Eye size={18} /> IT SEES YOU. RUN.</div>}
          <div className="hud-bottom">
            <div className="survival-bars">
              <div className="survival-row"><Heart size={17} /><span>HEALTH</span><div className="meter"><i style={{ width: `${hud.health}%` }} /></div><b>{Math.ceil(hud.health)}</b></div>
              <div className="survival-row stamina-row"><Footprints size={17} /><span>STAMINA</span><div className="meter"><i style={{ width: `${hud.stamina}%` }} /></div><b>{Math.ceil(hud.stamina)}</b></div>
              <div className="survival-row noise-row"><AudioLines size={17} /><span>NOISE</span><div className="meter"><i style={{ width: `${hud.noise}%` }} /></div><b>{hud.noise > 58 ? "LOUD" : hud.noise > 18 ? "LOW" : "QUIET"}</b></div>
            </div>
            <div className="hud-inventory">
              <span className="inventory-caption">INVENTORY <small>1 - 5 TO SELECT</small></span>
              <div className="inventory-slots">{Array.from({ length: 5 }, (_, index) => {
                const item = hud.inventory[index];
                return <button key={index} title={item ? ITEM_NAMES[item] : `Empty slot ${index + 1}`} className={`inventory-slot ${hud.selectedSlot === index ? "active" : ""}`} onClick={() => engineRef.current?.selectSlot(index)}><span>{index + 1}</span>{item && <ItemSymbol item={item} size={22} />}</button>;
              })}</div>
            </div>
            <div className="hud-equipment"><div className="battery-label"><Flashlight size={18} /><span>FLASHLIGHT <small>{hud.flashlightOn ? "ON" : "OFF"}</small></span><strong>{Math.ceil(hud.battery)}%</strong></div><div className="battery-track"><i style={{ width: `${hud.battery}%` }} /></div><button className="inventory-text-link" onClick={openInventory}>OPEN INVENTORY <span>I</span></button></div>
          </div>
          <div className="desktop-controls">WASD MOVE <span>/</span> MOUSE LOOK <span>/</span> E INTERACT <span>/</span> SHIFT RUN <span>/</span> F FLASHLIGHT</div>
          {mobile && <div className="mobile-controls">
            <Joystick onMove={(x, y) => engineRef.current?.setMobileMove(x, y)} style={offsetOf(settings, "move")} />
            <LookJoystick onLook={(dx, dy) => engineRef.current?.touchLook(dx, dy)} style={offsetOf(settings, "look")} />
            <div className="mobile-actions" style={offsetOf(settings, "actions")}>
              <button className="mobile-action action-interact" onClick={() => engineRef.current?.interact()}><span><MousePointer2 size={25} /></span><small>INTERACT</small></button>
              <div className="mobile-action-row">
                <button className="mobile-action" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); engineRef.current?.setMobileRun(true); }} onPointerUp={() => engineRef.current?.setMobileRun(false)} onPointerCancel={() => engineRef.current?.setMobileRun(false)}><span><Footprints size={21} /></span><small>RUN</small></button>
                <button className="mobile-action" onClick={() => engineRef.current?.toggleCrouch()}><span><EyeOff size={21} /></span><small>CROUCH</small></button>
                <button className="mobile-action" onClick={() => engineRef.current?.toggleFlashlight()}><span><Flashlight size={21} /></span><small>LIGHT</small></button>
              </div>
              <div className="mobile-action-row secondary-actions"><button onClick={openInventory}>INVENTORY</button><button onClick={() => engineRef.current?.dropSelected()}>DROP</button></div>
            </div>
            {!portraitDismissed && <div className="landscape-tip"><Smartphone size={15} /> PUTAR LAYAR UNTUK PENGALAMAN TERBAIK <button onClick={() => setPortraitDismissed(true)}><X size={13} /></button></div>}
          </div>}
        </div>
      )}

      {screen === "paused" && (
        <div className="game-overlay pause-overlay"><div className="overlay-veil" />
          <div className="pause-content"><div className="section-marker"><span /> CREEPY / BY BIMZ</div><h1>PAUSED<span>.</span></h1><p>The house is quiet. For now.</p>
            <nav className="overlay-nav">
              <button onClick={resumeGame}><Play size={17} /> RESUME <ArrowRight size={18} /></button>
              <button onClick={() => openPanel("settings")}><Settings2 size={17} /> SETTINGS <ArrowRight size={18} /></button>
              <button onClick={() => openPanel("how")}><CircleHelp size={17} /> CONTROLS <ArrowRight size={18} /></button>
              <button onClick={restartGame}><RotateCcw size={17} /> RESTART CHAPTER <ArrowRight size={18} /></button>
              <button onClick={toMenu}><MenuIcon size={17} /> MAIN MENU <ArrowRight size={18} /></button>
            </nav>
          </div>
          <div className="pause-footer">CHAPTER 01 / THE OLD HOUSE <span>{hud ? formatTime(hud.elapsed) : "00:00"}</span></div>
        </div>
      )}

      {screen === "settings" && (
        <div className={`fullscreen-panel utility-screen ${engineRef.current ? "over-game" : ""}`}>
          <Header title="settings" onBack={() => setScreen(originRef.current)} />
          <div className="utility-scroll"><div className="utility-content"><div className="section-marker"><span /> MAKE THE DARK YOURS</div><h1>SETTINGS<span>.</span></h1>
            <div className="setting-section"><h2>01 / GRAPHICS</h2>
              <SettingChoice title="QUALITY" value={settings.quality} options={["LOW", "MEDIUM", "HIGH", "ULTRA"]} onChange={(value) => updateSetting("quality", value)} />
              <SettingChoice title="TARGET FPS" value={settings.fps} options={[30, 60, 120]} onChange={(value) => updateSetting("fps", value)} />
              <p className="setting-hint">120 FPS aktif jika layar dan perangkat mampu. Resolusi render menyesuaikan performa.</p>
              <SettingChoice title="SHADOWS" value={settings.shadows} options={["OFF", "LOW", "HIGH"]} onChange={(value) => updateSetting("shadows", value)} />
              <SettingChoice title="EFFECTS" value={settings.effects} options={["LOW", "HIGH"]} onChange={(value) => updateSetting("effects", value)} />
              <SettingSlider title="BRIGHTNESS" value={settings.brightness} min={20} onChange={(value) => updateSetting("brightness", value)} />
            </div>
            <div className="setting-section"><h2>02 / AUDIO</h2>
              <SettingSlider title="MASTER VOLUME" value={settings.master} onChange={(value) => updateSetting("master", value)} />
              <SettingSlider title="MUSIC" value={settings.music} onChange={(value) => updateSetting("music", value)} />
              <SettingSlider title="SFX" value={settings.sfx} onChange={(value) => updateSetting("sfx", value)} />
              <SettingSlider title="AMBIENCE" value={settings.ambience} onChange={(value) => updateSetting("ambience", value)} />
            </div>
            <div className="setting-section"><h2>03 / CONTROLS & ACCESSIBILITY</h2>
              <SettingSlider title="LOOK SENSITIVITY" value={settings.sensitivity} min={10} max={100} onChange={(value) => updateSetting("sensitivity", value)} />
              <SettingToggle title="INVERT Y AXIS" checked={settings.invertY} onChange={(value) => updateSetting("invertY", value)} />
              <SettingToggle title="VIBRATION" checked={settings.vibration} onChange={(value) => updateSetting("vibration", value)} />
              <SettingToggle title="SUBTITLES" checked={settings.subtitles} onChange={(value) => updateSetting("subtitles", value)} />
            </div>
            <div className="setting-section touch-settings"><h2>04 / TOMBOL SENTUH</h2>
              <SettingSlider title="UKURAN JOYSTICK" value={settings.joystickSize} min={75} max={145} suffix="%" onChange={(value) => updateSetting("joystickSize", value)} />
              <SettingSlider title="UKURAN TOMBOL" value={settings.buttonSize} min={75} max={145} suffix="%" onChange={(value) => updateSetting("buttonSize", value)} />
              <SettingSlider title="OPASITAS KONTROL" value={settings.controlOpacity} min={30} max={100} suffix="%" onChange={(value) => updateSetting("controlOpacity", value)} />
              <div className="touch-preview" aria-label="Pratinjau ukuran dan transparansi tombol"><span>PRATINJAU</span><div className="touch-preview-controls" style={{ opacity: settings.controlOpacity / 100 }}><span className="touch-preview-joystick" style={{ transform: `scale(${settings.joystickSize / 100})` }}><i /></span><span className="touch-preview-button" style={{ transform: `scale(${settings.buttonSize / 100})` }}><Footprints size={20} /></span><span className="touch-preview-button" style={{ transform: `scale(${settings.buttonSize / 100})` }}><Flashlight size={20} /></span></div></div>
              <div className="touch-settings-actions">
                <button className="reset-touch" onClick={() => setSettings((current) => ({ ...current, joystickSize: 100, buttonSize: 100, controlOpacity: 82 }))}>RESET UKURAN</button>
                <button className="layout-edit-button" onClick={() => { menuSound(); setLayoutEdit(true); }}>ATUR POSISI TOMBOL</button>
                <button className="reset-touch" onClick={() => setSettings((current) => ({ ...current, controlLayout: {} }))}>RESET POSISI</button>
              </div>
            </div>
            <button className="solid-action" onClick={() => setScreen(originRef.current)}>SAVE & BACK <ArrowRight size={17} /></button>
          </div></div>
        </div>
      )}

      {screen === "how" && (
        <div className={`fullscreen-panel utility-screen ${engineRef.current ? "over-game" : ""}`}>
          <Header title="how to play" onBack={() => setScreen(originRef.current)} />
          <div className="utility-scroll"><div className="utility-content guide-content"><div className="section-marker"><span /> SURVIVAL GUIDE</div><h1>STAY<br /><em>ALIVE.</em></h1><p className="panel-lead">Temukan petunjuk, hidupkan listrik, buka gerbang. Ia bisa melihat cahaya dan mendengar langkahmu.</p>
            <div className="guide-rows">
              <div><span>01 / MOVE</span><strong>W A S D</strong><p>Joystick kiri: dorong kiri untuk bergerak kiri, kanan untuk kanan. A dan D untuk geser ke samping.</p></div>
              <div><span>02 / LOOK</span><strong>MOUSE / TOUCH</strong><p>Geser layar ke kanan untuk menoleh kanan, ke kiri untuk menoleh kiri. Pada mobile bisa memakai joystick LOOK.</p></div>
              <div><span>03 / SURVIVE</span><strong>SHIFT / C</strong><p>Tahan Shift atau tombol RUN sambil bergerak untuk lari. C untuk merunduk dan membuka pintu perlahan.</p></div>
              <div><span>04 / INTERACT</span><strong>E / F</strong><p>E untuk mengambil, membuka, atau bersembunyi. F untuk senter yang sangat terang.</p></div>
              <div><span>05 / INVENTORY</span><strong>I / G / 1-5</strong><p>I membuka inventori. G menjatuhkan item. Angka 1-5 memilih slot.</p></div>
            </div>
            <p className="guide-warning"><Eye size={17} /> HINT: Jika kau mendengar langkah mendekat, matikan senter dan cari lemari.</p>
            <button className="solid-action" onClick={() => setScreen(originRef.current)}>I UNDERSTAND <ArrowRight size={17} /></button>
          </div></div>
        </div>
      )}

      {screen === "credits" && (
        <div className="fullscreen-panel credits-screen"><Header title="credits" onBack={() => setScreen("menu")} />
          <div className="credits-content"><div className="section-marker"><span /> THE PEOPLE BEHIND THE DARK</div><Logo compact /><h1>MADE IN<br />THE DARK.</h1><div className="credits-lines"><div><span>CREATED BY</span><strong>BIMZ</strong></div><div><span>A BIMZ STUDIO GAME</span><strong>CREEPY / CHAPTER 01</strong></div><div><span>WORLD, CREATURE & SOUND</span><strong>ORIGINAL PROCEDURAL WORK</strong></div><div><span>VERSION</span><strong>1.1</strong></div></div><p>Thank you for entering the Old House.</p></div>
        </div>
      )}

      {screen === "gameover" && (
        <div className="game-overlay ending-screen death-screen"><div className="overlay-veil" /><div className="ending-content"><div className="ending-symbol"><Eye size={36} strokeWidth={1} /></div><div className="section-marker"><span /> THE CREEPER FOUND YOU</div><h1>YOU WERE<br /><em>CAUGHT.</em></h1><p>The house is not finished with you.</p><div className="ending-buttons"><button className="solid-action" onClick={() => { engineRef.current?.respawn(); resumeGame(); }}>TRY AGAIN <RotateCcw size={17} /></button><button className="outline-action" onClick={toMenu}>MAIN MENU <ArrowRight size={17} /></button></div></div><div className="ending-footer">CREEPY / BY BIMZ <span>CHAPTER 01</span></div></div>
      )}

      {screen === "victory" && victoryData && (
        <div className="game-overlay ending-screen victory-screen"><div className="overlay-veil" /><div className="ending-content"><div className="section-marker"><span /> CHAPTER 01 COMPLETE</div><h1>YOU<br /><em>ESCAPED.</em></h1><p>The night is still out there. But so are you.</p><div className="victory-stats"><div><span>TIME</span><strong>{formatTime(victoryData.elapsed)}</strong></div><div><span>ITEMS FOUND</span><strong>{victoryData.collected.length}</strong></div><div><span>DETECTED</span><strong>{victoryData.detections}</strong></div><div><span>ATTEMPTS</span><strong>{victoryData.attempts}</strong></div></div><div className="ending-buttons"><button className="solid-action" onClick={() => { toMenu(); setScreen("difficulty"); }}>PLAY AGAIN <RotateCcw size={17} /></button><button className="outline-action" onClick={toMenu}>MAIN MENU <ArrowRight size={17} /></button></div></div><div className="ending-footer">CREEPY / CHAPTER 01 COMPLETE <span>BY BIMZ</span></div></div>
      )}

      {screen === "error" && (
        <div className="error-screen"><Background loading /><div className="error-content"><Shield size={38} /><div className="section-marker"><span /> THE HOUSE IS UNSTABLE</div><h1>ASSET ERROR.</h1><p>{errorMessage || "The 3D environment could not be prepared on this device."}</p><div className="ending-buttons"><button className="solid-action" onClick={() => { loadingStartedRef.current = false; if (pendingRef.current) void beginLoading(pendingRef.current); }}>RETRY <RotateCcw size={16} /></button><button className="outline-action" onClick={toMenu}>MAIN MENU <ArrowRight size={16} /></button></div></div></div>
      )}

      {modal && screen === "playing" && (
        <div className="modal-layer"><div className="modal-scrim" onClick={closeModal} />
          {modal.kind === "note" && <div className="note-modal modal-content"><button className="modal-close" onClick={closeModal}><X size={19} /></button><div className="section-marker"><span /> EVIDENCE FOUND</div><h2>{NOTE_TEXT[modal.id || "code"]?.title}</h2><p>{NOTE_TEXT[modal.id || "code"]?.body}</p><div className="note-bottom"><span>THE OLD HOUSE / ARCHIVE</span><button onClick={closeModal}>CLOSE NOTE <ArrowRight size={16} /></button></div></div>}
          {modal.kind === "safe" && <div className="safe-modal modal-content"><button className="modal-close" onClick={closeModal}><X size={19} /></button><LockKeyhole size={31} strokeWidth={1.2} /><div className="section-marker"><span /> DINING ROOM / OLD SAFE</div><h2>ENTER CODE.</h2><p>Empat angka. Petunjuknya mungkin tertinggal di suatu tempat.</p><div className={`safe-display ${safeError ? "safe-error" : ""}`}>{Array.from({ length: 4 }, (_, index) => <span key={index}>{safeCode[index] || "-"}</span>)}</div><div className="safe-keypad">{["1", "2", "3", "4", "5", "6", "7", "8", "9", "CLR", "0", "OK"].map((key) => <button key={key} onClick={() => { setSafeError(false); if (key === "CLR") setSafeCode(""); else if (key === "OK") submitSafe(); else setSafeCode((code) => (code + key).slice(0, 4)); }}>{key}</button>)}</div>{safeError && <small className="safe-feedback">WRONG CODE. TRY AGAIN.</small>}</div>}
          {modal.kind === "inventory" && <div className="inventory-modal modal-content"><button className="modal-close" onClick={closeModal}><X size={19} /></button><div className="section-marker"><span /> PLAYER / INVENTORY</div><h2>WHAT YOU<br />CARRY.</h2><p>Five slots. Every item can make the difference.</p><div className="large-inventory">{Array.from({ length: 5 }, (_, index) => { const item = hud?.inventory[index]; return <button key={index} className={hud?.selectedSlot === index ? "active" : ""} onClick={() => engineRef.current?.selectSlot(index)}><span>0{index + 1}</span>{item ? <ItemSymbol item={item} size={27} /> : <i />}{item && <small>{ITEM_NAMES[item]}</small>}</button>; })}</div><div className="inventory-description"><strong>{hud?.inventory[hud.selectedSlot] ? ITEM_NAMES[hud.inventory[hud.selectedSlot]] : "EMPTY SLOT"}</strong><p>{hud?.inventory[hud.selectedSlot] ? ITEM_DESCRIPTIONS[hud.inventory[hud.selectedSlot]] : "Pilih item yang telah kamu temukan."}</p></div><div className="inventory-modal-actions"><button disabled={!hud?.inventory[hud.selectedSlot]} onClick={() => engineRef.current?.useSelected()}>USE ITEM <ChevronRight size={16} /></button><button disabled={!hud?.inventory[hud.selectedSlot]} onClick={() => engineRef.current?.dropSelected()}>DROP ITEM <ChevronRight size={16} /></button></div></div>}
        </div>
      )}

      {installGuide && !installed && <div className="modal-layer install-layer"><div className="modal-scrim" onClick={() => setInstallGuide(false)} /><div className="modal-content install-dialog"><button className="modal-close" onClick={() => setInstallGuide(false)} aria-label="Tutup"><X size={19} /></button><Download size={28} strokeWidth={1.4} /><div className="section-marker"><span /> INSTALL CREEPY</div><h2>PLAY OFFLINE.</h2><p>{/iPad|iPhone/i.test(navigator.userAgent) ? "Di Safari, ketuk Bagikan lalu pilih Tambah ke Layar Utama." : /Android/i.test(navigator.userAgent) ? "Buka menu browser (tiga titik), lalu pilih Instal aplikasi atau Tambahkan ke Layar Utama. Gunakan Chrome di Android untuk pengalaman PWA terbaik." : "Gunakan ikon Instal di bilah alamat atau pilih Instal aplikasi dari menu browser. Chrome dan Edge mendukung instalasi langsung."}</p><p className="install-note">Instalasi tersedia dari situs HTTPS atau localhost. Setelah terpasang, game dapat dibuka tanpa koneksi dan otomatis memilih tampilan landscape pada perangkat yang mendukung.</p><button className="solid-action" onClick={() => setInstallGuide(false)}>MENGERTI <ArrowRight size={17} /></button></div></div>}

      {layoutEdit && <LayoutEditor settings={settings} onClose={() => setLayoutEdit(false)}
        onChange={(key, offset) => setSettings((current) => ({ ...current, controlLayout: { ...current.controlLayout, [key]: offset } }))} />}

      {toast && (screen === "playing" || screen === "loading" || screen === "intro") && <div className="game-toast" role="status">{toast}</div>}
    </div>
  );
}