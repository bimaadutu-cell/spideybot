export type LevelId = "ground" | "upstairs" | "basement" | "attic" | "maze";
export type Difficulty = "EASY" | "NORMAL" | "HARD" | "NIGHTMARE";
export type ItemId =
  | "mainKey"
  | "basementKey"
  | "securityKey"
  | "fuse"
  | "screwdriver"
  | "boltCutter"
  | "battery"
  | "medkit";

export type MonsterState =
  | "IDLE"
  | "PATROL"
  | "INVESTIGATE"
  | "SEARCH"
  | "CHASE"
  | "LOST PLAYER"
  | "RETURN";

export interface ControlOffset {
  x: number;
  y: number;
}

export interface GameSettings {
  quality: "LOW" | "MEDIUM" | "HIGH" | "ULTRA";
  fps: 30 | 60 | 120;
  shadows: "OFF" | "LOW" | "HIGH";
  effects: "LOW" | "HIGH";
  joystickSize: number;
  buttonSize: number;
  controlOpacity: number;
  controlLayout: Record<string, ControlOffset>;
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  sensitivity: number;
  invertY: boolean;
  vibration: boolean;
  subtitles: boolean;
  brightness: number;
}

export interface DroppedItem {
  uid: string;
  item: ItemId;
  level: LevelId;
  x: number;
  z: number;
}

export interface SaveData {
  version: 1;
  difficulty: Difficulty;
  level: LevelId;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  inventory: ItemId[];
  selectedSlot: number;
  collected: string[];
  dropped: DroppedItem[];
  unlockedDoors: string[];
  openedDoors: string[];
  readNotes: string[];
  safeOpen: boolean;
  powerOn: boolean;
  battery: number;
  health: number;
  stamina: number;
  flashlightOn: boolean;
  elapsed: number;
  detections: number;
  attempts: number;
  mainKeyLocation: number;
}

export interface InteractionPrompt {
  label: string;
  detail: string;
}

export interface HudState {
  level: LevelId;
  room: string;
  objective: string;
  health: number;
  stamina: number;
  battery: number;
  noise: number;
  inventory: ItemId[];
  selectedSlot: number;
  flashlightOn: boolean;
  crouching: boolean;
  hidden: boolean;
  running: boolean;
  monsterState: MonsterState;
  monsterDistance: number;
  prompt: InteractionPrompt | null;
  elapsed: number;
  detections: number;
  collectedCount: number;
  subtitle: string;
  hurt: boolean;
  actualFps: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  quality: "MEDIUM",
  fps: 120,
  shadows: "LOW",
  effects: "HIGH",
  joystickSize: 100,
  buttonSize: 100,
  controlOpacity: 82,
  controlLayout: {},
  master: 72,
  music: 35,
  sfx: 82,
  ambience: 72,
  sensitivity: 55,
  invertY: false,
  vibration: true,
  subtitles: true,
  brightness: 58,
};

export const ITEM_NAMES: Record<ItemId, string> = {
  mainKey: "Main Key",
  basementKey: "Basement Key",
  securityKey: "Security Key",
  fuse: "Fuse",
  screwdriver: "Screwdriver",
  boltCutter: "Bolt Cutter",
  battery: "Battery",
  medkit: "First Aid Kit",
};

export const ITEM_DESCRIPTIONS: Record<ItemId, string> = {
  mainKey: "Kunci tua untuk pintu depan rumah.",
  basementKey: "Gigi kuncinya berkarat. Cocok untuk pintu basement.",
  securityKey: "Kunci kecil bertanda simbol mata.",
  fuse: "Sekring cadangan untuk panel listrik rumah.",
  screwdriver: "Obeng yang masih dapat digunakan.",
  boltCutter: "Pemotong besi yang cukup kuat untuk rantai gerbang.",
  battery: "Baterai cadangan. Gunakan untuk mengisi senter.",
  medkit: "Perban dan antiseptik. Memulihkan kesehatan.",
};

export const NOTE_TEXT: Record<string, { title: string; body: string }> = {
  code: {
    title: "Kertas dari Ruang Tamu",
    body: '"Aku menyembunyikan kunci di brankas ruang makan. Jangan lupa urutannya: 4 - 1 - 7 - 9. Jika lampu padam, jangan ikuti suara langkah di lorong. Itu bukan milikku."',
  },
  family: {
    title: "Catatan Pemilik Rumah",
    body: '"Ia masih memakai mantel ayah. Setiap malam kudengar ia menyeret sesuatu di atas lantai kayu. Kami mengunci kamar timur, tapi terkadang ia sudah berdiri di luar pintunya."',
  },
  secret: {
    title: "Laporan yang Terbakar",
    body: '"Sinyal radio itu bukan permintaan tolong. Kami mengirimkannya agar seseorang datang. Rumah ini tidak ingin ditinggalkan sendirian."',
  },
  attic: {
    title: "Tulisan di Loteng",
    body: '"Jangan lihat matanya terlalu lama. Jika kau mendengar tiga ketukan, sembunyilah dan jangan bernapas."',
  },
  maze: {
    title: "Catatan di Gerbang Labirin",
    body: '"Labirin ini ditanam agar setiap orang menemukan jalan keluar yang berbeda. Di tengahnya ada pintu tua. Ia tidak menunggu di rumah — ia menunggu di sana, dan ia lebih cepat dari langkahmu."',
  },
};

export const SAVE_KEY = "creepy-bimz-save-v1";
export const SETTINGS_KEY = "creepy-bimz-settings-v1";

export function loadSettings(): GameSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    const settings: GameSettings = stored && typeof stored === "object"
      ? { ...DEFAULT_SETTINGS, ...stored }
      : { ...DEFAULT_SETTINGS };
    if (stored && typeof stored === "object" && !("buttonSize" in stored) && stored.fps === 60) settings.fps = 120;
    if (![30, 60, 120].includes(settings.fps)) settings.fps = DEFAULT_SETTINGS.fps;
    settings.joystickSize = Number.isFinite(settings.joystickSize) ? Math.min(145, Math.max(75, settings.joystickSize)) : 100;
    settings.buttonSize = Number.isFinite(settings.buttonSize) ? Math.min(145, Math.max(75, settings.buttonSize)) : 100;
    settings.controlOpacity = Number.isFinite(settings.controlOpacity) ? Math.min(100, Math.max(30, settings.controlOpacity)) : 82;
    const layout: Record<string, ControlOffset> = {};
    if (settings.controlLayout && typeof settings.controlLayout === "object") {
      for (const [key, value] of Object.entries(settings.controlLayout as Record<string, ControlOffset>)) {
        if (value && Number.isFinite(value.x) && Number.isFinite(value.y)) {
          layout[key] = { x: Math.max(-180, Math.min(180, value.x)), y: Math.max(-140, Math.min(140, value.y)) };
        }
      }
    }
    settings.controlLayout = layout;
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS, controlLayout: {} };
  }
}

export function loadSave(): SaveData | null {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY) || "null") as SaveData | null;
    if (
      !data ||
      data.version !== 1 ||
      !["ground", "upstairs", "basement", "attic", "maze"].includes(data.level) ||
      !["EASY", "NORMAL", "HARD", "NIGHTMARE"].includes(data.difficulty) ||
      !Array.isArray(data.inventory) ||
      !Array.isArray(data.collected) ||
      !Array.isArray(data.openedDoors) ||
      !Array.isArray(data.unlockedDoors) ||
      !Array.isArray(data.dropped) ||
      !Array.isArray(data.readNotes) ||
      !Number.isFinite(data.x) ||
      !Number.isFinite(data.z) ||
      !Number.isFinite(data.health) ||
      !Number.isFinite(data.battery)
    ) return null;
    if (![0, 1, 2].includes(data.mainKeyLocation)) data.mainKeyLocation = 0;
    if (data.health <= 0) {
      data.health = 100;
      data.stamina = 100;
      data.level = "ground";
      data.x = 12;
      data.z = 16;
      data.attempts++;
    }
    return data;
  } catch {
    return null;
  }
}

export function createSave(difficulty: Difficulty, attempts = 1): SaveData {
  return {
    version: 1,
    difficulty,
    level: "ground",
    x: 12,
    z: 16,
    yaw: 0,
    pitch: 0,
    inventory: [],
    selectedSlot: 0,
    collected: [],
    dropped: [],
    unlockedDoors: [],
    openedDoors: [],
    readNotes: [],
    safeOpen: false,
    powerOn: false,
    battery: 100,
    health: 100,
    stamina: 100,
    flashlightOn: true,
    elapsed: 0,
    detections: 0,
    attempts,
    mainKeyLocation: difficulty === "EASY" ? 0 : difficulty === "HARD" || difficulty === "NIGHTMARE" ? 1 + Math.floor(Math.random() * 2) : Math.floor(Math.random() * 3),
  };
}

export function saveGame(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Gameplay remains available even when private browsing disables storage.
  }
}
