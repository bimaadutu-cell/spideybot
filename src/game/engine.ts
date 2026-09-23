import * as THREE from "three";
import { HorrorAudio, type SoundName } from "./audio";
import { forwardAt, movementAt, yawToward } from "./controls";
import { CELL, currentObjective, gridToWorld, LEVELS, roomName, tileAt, worldToGrid } from "./maps";
import { createCreeper, type CreeperRig } from "./monster";
import { createWorld, type WorldHandle, type WorldInteraction } from "./world";
import { ITEM_NAMES, SAVE_KEY, saveGame, type GameSettings, type HudState, type ItemId, type LevelId, type MonsterState, type SaveData } from "./types";

export interface EngineCallbacks {
  onHud: (state: HudState) => void;
  onToast: (message: string) => void;
  onModal: (kind: "safe" | "note", id?: string) => void;
  onPause: () => void;
  onInventory: () => void;
  onDeath: () => void;
  onVictory: (data: SaveData) => void;
  onError: (message: string) => void;
}

const DIFFICULTY = {
  EASY: { patrol: 1.25, chase: 2.7, vision: 9, hearing: 0.7, damage: 36 },
  NORMAL: { patrol: 1.6, chase: 3.55, vision: 12, hearing: 1, damage: 52 },
  HARD: { patrol: 1.9, chase: 4.15, vision: 15, hearing: 1.3, damage: 67 },
  NIGHTMARE: { patrol: 2.2, chase: 4.75, vision: 18, hearing: 1.6, damage: 100 },
};

export class GameEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(75, 1, 0.045, 100);
  private ambient = new THREE.AmbientLight(0x8e9ba7, 0.45);
  private moon = new THREE.DirectionalLight(0x8298b3, 0.28);
  private flashlight!: THREE.SpotLight;
  private flashlightFill!: THREE.PointLight;
  private flashlightLens!: THREE.Mesh;
  private hands!: THREE.Group;
  private heldItem!: THREE.Group;
  private world: WorldHandle | null = null;
  private monster: CreeperRig | null = null;
  private monsterPos = new THREE.Vector2();
  private monsterYaw = 0;
  private monsterState: MonsterState = "IDLE";
  private monsterTarget: THREE.Vector2 | null = null;
  private monsterLastSeen: THREE.Vector2 | null = null;
  private monsterPath: { x: number; z: number }[] = [];
  private monsterPathTimer = 0;
  private monsterThinkTimer = 0;
  private monsterSearchTimer = 0;
  private monsterGrace = 12;
  private monsterStepClock = 0;
  private monsterBreathClock = 0;
  private bloodStepClock = 0;
  private attackCooldown = 0;
  private attackAnimation = 0;
  private lastMonsterDist = 100;
  private keys = new Set<string>();
  private mobileMove = { x: 0, y: 0 };
  private mobileRunning = false;
  private lookPointer: number | null = null;
  private touchLast = { x: 0, y: 0 };
  private crouching = false;
  private exhausted = false;
  private hidden = false;
  private hiddenAt = "";
  private paused = true;
  private loaded = false;
  private disposed = false;
  private finished = false;
  private deathTimer = 0;
  private animationId = 0;
  private lastFrame = 0;
  private nextFrame = 0;
  private shadowTick = 0;
  private monsterTurn = 0;
  private playerVelocity = new THREE.Vector2();
  private lastRaf = 0;
  private fastestRaf = Infinity;
  private sampleStart = 0;
  private renderedFrames = 0;
  private renderScale = 1;
  private actualFps = 0;
  private clock = 0;
  private bob = 0;
  private walkStepClock = 0;
  private clockTick = 0;
  private noise = 0;
  private hudClock = 0;
  private saveClock = 0;
  private eventClock = 20;
  private blackoutTimer = 0;
  private hurtClock = 0;
  private subtitle = "";
  private subtitleUntil = 0;
  private focused: WorldInteraction | null = null;
  private seenRooms = new Set<string>();
  private settings: GameSettings;
  readonly data: SaveData;

  constructor(container: HTMLElement, data: SaveData, settings: GameSettings,
    private audio: HorrorAudio, private callbacks: EngineCallbacks) {
    this.container = container;
    this.data = data;
    this.settings = settings;
    this.scene.background = new THREE.Color(0x090b0d);
    this.scene.fog = new THREE.FogExp2(0x090b0d, 0.03);
    this.scene.add(this.ambient);
    this.moon.position.set(-15, 24, -11);
    this.scene.add(this.moon);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);
  }

  async initialize(progress: (label: string, value: number) => void): Promise<boolean> {
    const yieldFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      progress("Preparing renderer...", 8);
      await yieldFrame();
      const renderer = new THREE.WebGLRenderer({ antialias: this.settings.quality !== "LOW", powerPreference: "high-performance", alpha: false });
      this.renderer = renderer;
      renderer.setClearColor(0x090b0d);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.container.appendChild(renderer.domElement);
      renderer.domElement.className = "game-canvas";
      renderer.domElement.style.touchAction = "none";
      this.applySettings(this.settings);
      this.resize();
      progress("Loading House...", 22);
      await yieldFrame();
      this.loadLevel(this.data.level, false);
      progress("Loading Environment...", 51);
      await yieldFrame();
      this.makeHands();
      this.monster = createCreeper();
      this.monster.setDetail(this.settings.quality === "HIGH" || this.settings.quality === "ULTRA");
      this.scene.add(this.monster.group);
      this.resetMonster(12);
      progress("Loading AI...", 71);
      await yieldFrame();
      this.findPath(this.monsterPos, this.playerWorld());
      progress("Loading Audio...", 85);
      try {
        await this.audio.init();
        this.audio.setMode("game");
      } catch {
        this.callbacks.onToast("Audio tidak tersedia. Gameplay tetap dapat dimainkan.");
      }
      await yieldFrame();
      this.updateCamera(0);
      renderer.render(this.scene, this.camera);
      this.bindInputs();
      this.loaded = true;
      this.loop(0);
      this.sendHud();
      progress("Preparing Nightmare...", 100);
      return true;
    } catch (error) {
      this.callbacks.onError(error instanceof Error ? error.message : "Unable to initialize 3D renderer.");
      return false;
    }
  }

  private loadLevel(level: LevelId, placePlayer: boolean): void {
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
    }
    this.data.level = level;
    if (placePlayer) {
      const positions: Record<LevelId, [number, number]> = {
        ground: [12, 5],
        upstairs: [12, 5], basement: [12, 5], attic: [5, 5], maze: [13, 25],
      };
      [this.data.x, this.data.z] = positions[level];
      this.data.pitch = 0;
      this.data.yaw = level === "basement" || level === "maze" ? Math.PI : 0;
    }
    this.world = createWorld(level, this.data, this.settings.quality);
    this.scene.add(this.world.group);
    const fogColor = level === "maze" ? 0x0a1012 : level === "basement" ? 0x090b0a : level === "attic" ? 0x0b0d0f : 0x090b0d;
    this.scene.background = new THREE.Color(fogColor);
    const fogDensity = level === "maze" ? 0.036 : level === "basement" ? 0.044 : level === "attic" ? 0.038 : 0.027;
    this.scene.fog = new THREE.FogExp2(fogColor, this.settings.effects === "HIGH" ? fogDensity : fogDensity * 0.62);
    if (this.world.dust) this.world.dust.visible = this.settings.effects === "HIGH";
    if (this.world.rain) this.world.rain.visible = this.settings.effects === "HIGH";
    this.ambient.intensity = level === "maze" ? 0.31 : level === "basement" ? 0.29 : level === "attic" ? 0.34 : 0.45;
    this.moon.intensity = level === "maze" ? 0.38 : level === "basement" ? 0.07 : 0.28;
  }

  private makeHands(): void {
    const skin = new THREE.MeshStandardMaterial({ color: 0x927b68, roughness: 0.9 });
    const jacket = new THREE.MeshStandardMaterial({ color: 0x272b2a, roughness: 1 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x262d30, metalness: 0.78, roughness: 0.3 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x101517, metalness: 0.3, roughness: 0.8 });
    const lensMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2c6 });
    const hands = new THREE.Group();
    this.hands = hands;
    this.camera.add(hands);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.14, 0.48, 10), jacket);
    sleeve.position.set(0.43, -0.53, -0.65);
    sleeve.rotation.z = -0.46;
    sleeve.rotation.x = 0.33;
    hands.add(sleeve);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), skin);
    hand.scale.set(0.85, 1.25, 0.84);
    hand.position.set(0.29, -0.29, -0.7);
    hands.add(hand);
    const flashlightBody = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.097, 0.39, 14), grip);
    flashlightBody.rotation.x = Math.PI / 2;
    flashlightBody.position.set(0.245, -0.26, -0.88);
    hands.add(flashlightBody);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.105, 0.085, 14), metal);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0.245, -0.26, -1.09);
    hands.add(ring);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.086, 16), lensMaterial);
    lens.position.set(0.245, -0.26, -1.14);
    hands.add(lens);
    this.flashlightLens = lens;
    this.heldItem = new THREE.Group();
    this.heldItem.position.set(-0.31, -0.4, -0.73);
    hands.add(this.heldItem);
    this.updateHeldItem();

    const beam = new THREE.SpotLight(0xfff5e5, 145, 27, Math.PI / 5.2, 0.65, 1.55);
    beam.position.set(0.245, -0.255, -0.95);
    beam.target.position.set(0.16, -0.06, -10);
    beam.castShadow = this.settings.shadows !== "OFF";
    beam.shadow.mapSize.set(this.settings.shadows === "HIGH" ? 1024 : 512, this.settings.shadows === "HIGH" ? 1024 : 512);
    beam.shadow.bias = -0.0006;
    beam.shadow.camera.near = 0.25;
    beam.shadow.camera.far = 20;
    this.camera.add(beam, beam.target);
    this.flashlight = beam;
    const fill = new THREE.PointLight(0xfff0d2, 5, 4.9, 2);
    fill.position.set(0.18, -0.15, -0.55);
    this.camera.add(fill);
    this.flashlightFill = fill;
    this.updateFlashlight();
  }

  private updateHeldItem(): void {
    if (!this.heldItem) return;
    this.heldItem.clear();
    const item = this.data.inventory[this.data.selectedSlot];
    if (!item || item === "battery" || item === "medkit") return;
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.105, 9, 7), new THREE.MeshStandardMaterial({ color: 0x897563 }));
    this.heldItem.add(glove);
    const metal = new THREE.MeshStandardMaterial({ color: item === "mainKey" || item === "basementKey" ? 0xb7a478 : 0x89918c, metalness: 0.75, roughness: 0.38 });
    if (["mainKey", "basementKey", "securityKey"].includes(item)) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.02, 6, 10), metal);
      ring.position.set(0, 0.23, -0.07);
      this.heldItem.add(ring);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.23, 0.035), metal);
      shaft.position.set(0, 0.055, -0.07);
      this.heldItem.add(shaft);
    } else {
      const tool = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, item === "boltCutter" ? 0.7 : 0.36, 7), metal);
      tool.position.set(0, 0.17, -0.08);
      tool.rotation.z = -0.16;
      this.heldItem.add(tool);
    }
  }

  private updateFlashlight(): void {
    if (!this.flashlight) return;
    const on = this.data.flashlightOn && this.data.battery > 0;
    this.flashlight.intensity = on ? 145 : 0;
    this.flashlightFill.intensity = on ? 5 : 0;
    (this.flashlightLens.material as THREE.MeshBasicMaterial).color.setHex(on ? 0xfff4ce : 0x4c514e);
  }

  applySettings(settings: GameSettings): void {
    const shadowsChanged = this.settings.shadows !== settings.shadows;
    const qualityChanged = this.settings.quality !== settings.quality;
    if (qualityChanged) this.renderScale = 1;
    this.settings = settings;
    this.audio.setSettings(settings);
    if (qualityChanged && this.world) {
      this.loadLevel(this.data.level, false);
      this.focused = null;
    }
    if (!this.renderer) return;
    const ratio = Math.min(window.devicePixelRatio || 1, settings.quality === "LOW" ? 1 : settings.quality === "MEDIUM" ? 1.5 : settings.quality === "HIGH" ? 2 : 2.5);
    this.renderer.setPixelRatio(ratio * this.renderScale);
    this.renderer.shadowMap.enabled = settings.shadows !== "OFF";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.toneMappingExposure = 0.96 + settings.brightness / 100 * 0.88;
    if (this.world?.dust) this.world.dust.visible = settings.effects === "HIGH";
    if (this.world?.rain) this.world.rain.visible = settings.effects === "HIGH";
    if (this.scene.fog instanceof THREE.FogExp2) {
      const base = this.data.level === "basement" ? 0.044 : this.data.level === "attic" ? 0.038 : 0.027;
      this.scene.fog.density = settings.effects === "HIGH" ? base : base * 0.62;
    }
    if (this.flashlight) {
      this.flashlight.castShadow = settings.shadows !== "OFF";
      if (shadowsChanged) {
        const size = settings.shadows === "HIGH" ? 1024 : 512;
        this.flashlight.shadow.mapSize.set(size, size);
        this.flashlight.shadow.map?.dispose();
        this.flashlight.shadow.map = null;
      }
    }
    this.monster?.setDetail(settings.quality === "HIGH" || settings.quality === "ULTRA");
    this.resize();
  }

  private resize = (): void => {
    if (!this.renderer) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private keyDown = (event: KeyboardEvent): void => {
    if (!this.loaded || this.paused) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(event.code)) event.preventDefault();
    if (event.repeat && ["KeyE", "KeyF", "KeyC", "KeyI", "KeyG", "Escape"].includes(event.code)) return;
    this.keys.add(event.code);
    switch (event.code) {
      case "KeyE": this.interact(); break;
      case "KeyF": this.toggleFlashlight(); break;
      case "KeyC": this.toggleCrouch(); break;
      case "KeyG": this.dropSelected(); break;
      case "KeyI": this.callbacks.onInventory(); break;
      case "Escape": this.callbacks.onPause(); break;
      case "Digit1": case "Digit2": case "Digit3": case "Digit4": case "Digit5":
        this.selectSlot(Number(event.code.slice(-1)) - 1); break;
    }
  };

  private keyUp = (event: KeyboardEvent): void => { this.keys.delete(event.code); };
  private mouseMove = (event: MouseEvent): void => {
    if (this.paused || document.pointerLockElement !== this.renderer?.domElement) return;
    this.look(event.movementX, event.movementY, 0.0024);
  };
  private pointerDown = (event: PointerEvent): void => {
    if (this.paused || !this.renderer) return;
    if (event.pointerType === "touch") {
      if (event.clientX < window.innerWidth * 0.36 || this.lookPointer !== null) return;
      this.lookPointer = event.pointerId;
      this.touchLast = { x: event.clientX, y: event.clientY };
      this.renderer.domElement.setPointerCapture(event.pointerId);
    } else if (document.pointerLockElement !== this.renderer.domElement) {
      this.lookPointer = event.pointerId;
      this.touchLast = { x: event.clientX, y: event.clientY };
      this.renderer.domElement.setPointerCapture(event.pointerId);
      void this.renderer.domElement.requestPointerLock().catch(() => undefined);
    }
  };
  private pointerMove = (event: PointerEvent): void => {
    if (this.paused || event.pointerId !== this.lookPointer) return;
    if (document.pointerLockElement !== this.renderer?.domElement) {
      this.look(event.clientX - this.touchLast.x, event.clientY - this.touchLast.y, event.pointerType === "touch" ? 0.0042 : 0.0024);
    }
    this.touchLast = { x: event.clientX, y: event.clientY };
  };
  private pointerUp = (event: PointerEvent): void => {
    if (event.pointerId === this.lookPointer) this.lookPointer = null;
  };
  private contextLost = (event: Event): void => {
    event.preventDefault();
    this.paused = true;
    this.callbacks.onError("Graphics context was lost. Retry to rebuild the Old House.");
  };
  private visibilityChange = (): void => {
    this.sampleStart = 0;
    this.renderedFrames = 0;
    this.lastFrame = 0;
    this.lastRaf = 0;
    if (document.hidden && !this.paused) this.callbacks.onPause();
  };
  private lockChange = (): void => {
    if (!document.pointerLockElement && !this.paused && this.loaded && !this.disposed && !('ontouchstart' in window)) this.callbacks.onPause();
  };

  private bindInputs(): void {
    window.addEventListener("resize", this.resize);
    document.addEventListener("keydown", this.keyDown);
    document.addEventListener("keyup", this.keyUp);
    document.addEventListener("mousemove", this.mouseMove);
    document.addEventListener("pointerlockchange", this.lockChange);
    document.addEventListener("visibilitychange", this.visibilityChange);
    const canvas = this.renderer!.domElement;
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerUp);
    canvas.addEventListener("webglcontextlost", this.contextLost);
  }

  private look(dx: number, dy: number, factor: number): void {
    const sensitivity = this.settings.sensitivity / 55;
    this.data.yaw -= dx * factor * sensitivity;
    this.data.pitch += dy * factor * sensitivity * (this.settings.invertY ? 1 : -1);
    this.data.pitch = THREE.MathUtils.clamp(this.data.pitch, -1.35, 1.35);
  }

  requestPointerLock(): void {
    if (this.renderer && !('ontouchstart' in window)) void this.renderer.domElement.requestPointerLock().catch(() => undefined);
  }

  setPaused(value: boolean): void {
    this.paused = value;
    this.keys.clear();
    this.mobileRunning = false;
    this.mobileMove = { x: 0, y: 0 };
    if (value && document.pointerLockElement === this.renderer?.domElement) document.exitPointerLock();
    if (value) this.persist();
  }

  respawn(): void {
    this.data.health = 100;
    this.data.stamina = 100;
    this.data.battery = Math.max(this.data.battery, 35);
    this.data.attempts++;
    this.data.x = 12;
    this.data.z = 16;
    this.data.yaw = 0;
    this.data.pitch = 0;
    this.hidden = false;
    this.crouching = false;
    this.exhausted = false;
    this.hurtClock = 0;
    this.loadLevel("ground", false);
    this.resetMonster(16);
    this.audio.setMode("game");
    this.subtitleText("[You wake in the entrance hall. The house remembers.]", 4);
    this.persist();
    this.sendHud();
  }

  setMobileMove(x: number, y: number): void { this.mobileMove = { x, y }; }
  setMobileRun(value: boolean): void { this.mobileRunning = value; }
  touchLook(dx: number, dy: number): void { if (!this.paused) this.look(dx, dy, 0.0042); }
  selectSlot(index: number): void {
    this.data.selectedSlot = THREE.MathUtils.clamp(index, 0, 4);
    this.updateHeldItem();
    this.sendHud();
  }

  toggleFlashlight(): void {
    if (this.data.battery <= 0) { this.toast("Baterai senter habis. Cari baterai cadangan."); return; }
    this.data.flashlightOn = !this.data.flashlightOn;
    this.updateFlashlight();
    this.audio.play("switch");
    this.subtitleText(this.data.flashlightOn ? "[Flashlight clicks on]" : "[Flashlight clicks off]", 2);
    this.sendHud();
  }

  toggleCrouch(): void {
    if (this.hidden) return;
    this.crouching = !this.crouching;
    this.sendHud();
  }

  private toast(message: string): void {
    this.callbacks.onToast(message);
  }

  private subtitleText(text: string, seconds = 3): void {
    this.subtitle = text;
    this.subtitleUntil = this.clock + seconds;
  }

  private playerWorld(): THREE.Vector2 {
    const p = gridToWorld(this.data.level, this.data.x, this.data.z);
    return new THREE.Vector2(p.x, p.z);
  }

  private tileBlocked(x: number, z: number, monster = false): boolean {
    const tile = tileAt(this.data.level, x, z);
    if (tile === "#") return true;
    if (tile !== "D") return false;
    const door = LEVELS[this.data.level].doors.find((d) => d.x === x && d.z === z);
    if (!door) return true;
    if (!monster) return !this.data.openedDoors.includes(door.id);
    return Boolean(door.required && !this.data.unlockedDoors.includes(door.id));
  }

  private collides(x: number, z: number, radius = 0.32): boolean {
    const grid = worldToGrid(this.data.level, x, z);
    for (let iz = Math.floor(grid.z) - 1; iz <= Math.ceil(grid.z) + 1; iz++) {
      for (let ix = Math.floor(grid.x) - 1; ix <= Math.ceil(grid.x) + 1; ix++) {
        if (!this.tileBlocked(ix, iz)) continue;
        const center = gridToWorld(this.data.level, ix, iz);
        const nearestX = Math.max(center.x - CELL / 2, Math.min(x, center.x + CELL / 2));
        const nearestZ = Math.max(center.z - CELL / 2, Math.min(z, center.z + CELL / 2));
        if ((x - nearestX) ** 2 + (z - nearestZ) ** 2 < radius ** 2) return true;
      }
    }
    for (const obstacle of this.world?.colliders || []) {
      if ((x - obstacle.x) ** 2 + (z - obstacle.z) ** 2 < (radius + obstacle.radius) ** 2) return true;
    }
    return false;
  }

  private lineOfSight(start: THREE.Vector2, end: THREE.Vector2, includeEnd = false, ignoredDoor?: string): boolean {
    const distance = start.distanceTo(end);
    for (let travelled = 0.38; travelled < distance - (includeEnd ? 0.2 : 0.26); travelled += 0.27) {
      const t = travelled / distance;
      const grid = worldToGrid(this.data.level, THREE.MathUtils.lerp(start.x, end.x, t), THREE.MathUtils.lerp(start.y, end.y, t));
      const cellX = Math.round(grid.x);
      const cellZ = Math.round(grid.z);
      if (tileAt(this.data.level, cellX, cellZ) === "#") return false;
      const door = LEVELS[this.data.level].doors.find((d) => d.x === cellX && d.z === cellZ);
      if (door && door.id !== ignoredDoor && !this.data.openedDoors.includes(door.id)) return false;
    }
    return true;
  }

  private findFocused(): WorldInteraction | null {
    if (this.hidden) return this.world?.interactions.find((i) => i.id === this.hiddenAt) || null;
    if (!this.world) return null;
    const player = this.playerWorld();
    const facingDirection = forwardAt(this.data.yaw);
    const direction = new THREE.Vector2(facingDirection.x, facingDirection.z);
    const fullLook = new THREE.Vector3(facingDirection.x * Math.cos(this.data.pitch), Math.sin(this.data.pitch), facingDirection.z * Math.cos(this.data.pitch));
    const eyeHeight = this.crouching ? 1.13 : 1.67;
    let focused: WorldInteraction | null = null;
    let best = -Infinity;
    for (const interaction of this.world.interactions) {
      const p = gridToWorld(this.data.level, interaction.x, interaction.z);
      const vector = new THREE.Vector2(p.x - player.x, p.z - player.y);
      const distance = vector.length();
      if (distance > (interaction.kind === "door" ? 3.45 : 3.1)) continue;
      const facing = distance < 0.4 ? 1 : vector.normalize().dot(direction);
      if (facing < (distance < 1.35 ? 0.34 : 0.61)) continue;
      const targetHeight = interaction.kind === "item" || interaction.kind === "note" ? 0.9 : interaction.kind === "safe" ? 0.6 : 1.5;
      const sight = new THREE.Vector3(p.x - player.x, targetHeight - eyeHeight, p.z - player.y).normalize().dot(fullLook);
      if (distance > 0.75 && sight < 0.52) continue;
      if (!this.lineOfSight(player, new THREE.Vector2(p.x, p.z), false, interaction.kind === "door" ? interaction.id : undefined)) continue;
      const score = facing * 1.2 + sight - distance * 0.29 + (interaction.kind === "item" ? 0.26 : 0);
      if (score > best) { best = score; focused = interaction; }
    }
    return focused;
  }

  private promptFor(interaction: WorldInteraction | null): HudState["prompt"] {
    if (!interaction) return null;
    const { kind, name, door, feature } = interaction;
    if (this.hidden) return { label: "LEAVE HIDING", detail: "E  /  INTERACT" };
    if (kind === "item") return { label: `PICK UP  ${name.toUpperCase()}`, detail: "E  /  INTERACT" };
    if (kind === "note") return { label: "READ NOTE", detail: "E  /  INTERACT" };
    if (kind === "safe") return { label: this.data.safeOpen ? "SAFE IS OPEN" : "ENTER SAFE CODE", detail: this.data.safeOpen ? "The key was inside" : "E  /  INTERACT" };
    if (kind === "power") return { label: this.data.powerOn ? "POWER RESTORED" : this.data.inventory.includes("fuse") ? "INSERT FUSE" : "NEED A FUSE", detail: "E  /  INTERACT" };
    if (kind === "hide") return { label: "HIDE INSIDE", detail: "E  /  INTERACT" };
    if (kind === "drawer") return { label: this.data.unlockedDoors.includes(interaction.id) ? "DRAWER IS EMPTY" : "OPEN DRAWER", detail: "E  /  INTERACT" };
    if (kind === "escape") return { label: "OPEN THE WAY OUT", detail: "E  /  INTERACT" };
    if (kind === "portal") {
      const req = feature?.required;
      return { label: req && !this.data.unlockedDoors.includes(interaction.id) && !this.data.inventory.includes(req) ? `NEED ${ITEM_NAMES[req].toUpperCase()}` : feature?.destination === "basement" ? "ENTER BASEMENT" : `USE ${name.toUpperCase()}`, detail: "E  /  INTERACT" };
    }
    if (kind === "door" && door) {
      const locked = door.required && !this.data.unlockedDoors.includes(door.id);
      if (locked && door.required === "power" && !this.data.powerOn) return { label: "NO POWER", detail: "Restore electricity first" };
      if (locked && door.required !== "power" && !this.data.inventory.includes(door.required as ItemId)) return { label: `NEED ${ITEM_NAMES[door.required as ItemId].toUpperCase()}`, detail: "The door is locked" };
      return { label: locked ? `UNLOCK ${name.toUpperCase()}` : this.data.openedDoors.includes(door.id) ? "CLOSE DOOR" : this.crouching ? "OPEN SLOWLY" : `OPEN ${name.toUpperCase()}`, detail: "E  /  INTERACT" };
    }
    return null;
  }

  interact(): void {
    if (this.paused || !this.world) return;
    if (this.hidden) {
      this.hidden = false;
      this.hiddenAt = "";
      this.subtitleText("[You leave your hiding place]", 2);
      this.sendHud();
      return;
    }
    const target = this.findFocused();
    if (!target) { this.toast("Tidak ada yang dapat dijangkau."); return; }
    if (target.kind === "item" && target.item) {
      if (this.data.inventory.length >= 5) { this.toast("Inventori penuh. Pilih item lalu buang dengan G."); return; }
      this.data.inventory.push(target.item);
      if (!target.id.startsWith("drop-") && !this.data.collected.includes(target.id)) this.data.collected.push(target.id);
      this.data.dropped = this.data.dropped.filter((d) => d.uid !== target.id);
      this.world.removeInteraction(target.id);
      this.audio.play("pickup");
      this.toast(`${ITEM_NAMES[target.item]} ditemukan.`);
      this.updateHeldItem();
      this.persist(); this.sendHud();
      return;
    }
    if (target.kind === "note") {
      const noteId = target.feature?.noteId || "code";
      if (!this.data.readNotes.includes(noteId)) this.data.readNotes.push(noteId);
      this.audio.play("pickup");
      this.callbacks.onModal("note", noteId);
      this.persist(); this.sendHud();
      return;
    }
    if (target.kind === "safe") {
      if (this.data.safeOpen) this.toast("Brankas sudah terbuka.");
      else this.callbacks.onModal("safe");
      return;
    }
    if (target.kind === "power") {
      if (this.data.powerOn) { this.toast("Listrik sudah menyala."); return; }
      if (!this.consume("fuse")) { this.audio.play("lock"); this.toast("Panel ini membutuhkan sekring."); return; }
      this.data.powerOn = true;
      this.audio.play("switch");
      this.makeNoise(this.playerWorld(), 14);
      this.toast("Listrik menyala. Kunci elektronik garasi terbuka.");
      this.world.setPower(true);
      this.persist(); this.sendHud();
      return;
    }
    if (target.kind === "drawer") {
      if (this.data.unlockedDoors.includes(target.id)) { this.toast("Laci sudah kosong."); return; }
      this.data.unlockedDoors.push(target.id);
      this.audio.play("door");
      this.makeNoise(this.playerWorld(), 7);
      this.world.setDrawer(target.id, true);
      this.world.addItem({ uid: "drawer-battery", item: "battery", x: target.x - 0.5, z: target.z - 0.4 });
      this.toast("Ada baterai cadangan di dalam laci.");
      this.persist(); this.sendHud();
      return;
    }
    if (target.kind === "hide") {
      this.hidden = true;
      this.hiddenAt = target.id;
      this.crouching = true;
      this.noise = 0;
      this.audio.play("door");
      this.subtitleText("[You hold your breath inside the dark]", 3);
      this.sendHud();
      return;
    }
    if (target.kind === "escape") {
      this.audio.play("switch");
      this.makeNoise(this.playerWorld(), 18);
      this.victory();
      return;
    }
    if (target.kind === "portal" && target.feature?.destination) {
      const req = target.feature.required;
      if (req && !this.data.unlockedDoors.includes(target.id)) {
        if (!this.consume(req)) { this.audio.play("lock"); this.toast(`Butuh ${ITEM_NAMES[req]} untuk membukanya.`); return; }
        this.data.unlockedDoors.push(target.id);
        this.audio.play("door");
        this.makeNoise(this.playerWorld(), 11);
      }
      this.transition(target.feature.destination);
      return;
    }
    if (target.kind === "door" && target.door) {
      const door = target.door;
      if (door.required && !this.data.unlockedDoors.includes(door.id)) {
        if (door.required === "power") {
          if (!this.data.powerOn) { this.audio.play("lock"); this.toast("Tidak ada listrik. Temukan panel sekring."); return; }
        } else if (!this.data.inventory.includes(door.required)) {
          this.audio.play("lock"); this.toast(`Pintu ini membutuhkan ${ITEM_NAMES[door.required]}.`); return;
        } else if (!["securityKey", "screwdriver"].includes(door.required)) {
          this.consume(door.required);
        }
        this.data.unlockedDoors.push(door.id);
        this.audio.play("lock");
        this.toast(door.gate ? "Rantai gerbang berhasil dipotong. Lari!" : `${door.name} terbuka.`);
      }
      if (door.gate) {
        this.data.openedDoors = [...this.data.openedDoors, door.id];
        this.world.setDoor(door.id, true);
        this.audio.play("switch");
        this.subtitleText("[The chained gate swings open]", 3);
        this.toast("Rantai putus. Di balik gerbang terbentang labirin.");
        this.transition("maze");
        return;
      }
      const open = !this.data.openedDoors.includes(door.id);
      if (!open) {
        const p = gridToWorld(this.data.level, door.x, door.z);
        if (this.playerWorld().distanceTo(new THREE.Vector2(p.x, p.z)) < CELL / 2 + 0.42) { this.toast("Mundur sedikit untuk menutup pintu."); return; }
      }
      this.data.openedDoors = open ? [...this.data.openedDoors, door.id] : this.data.openedDoors.filter((d) => d !== door.id);
      this.world.setDoor(door.id, open);
      this.audio.play("door");
      this.makeNoise(this.playerWorld(), this.crouching ? 3.2 : door.gate ? 15 : 8.5);
      this.subtitleText(this.crouching ? "[Door opens slowly]" : "[Door creaking]", 2.5);
      this.persist(); this.sendHud();
    }
  }

  trySafeCode(code: string): boolean {
    if (code !== "4179") { this.audio.play("lock"); this.toast("Kode salah. Mekanisme brankas tidak bergerak."); return false; }
    if (this.data.safeOpen) return true;
    this.data.safeOpen = true;
    this.audio.play("switch");
    this.makeNoise(this.playerWorld(), 10);
    this.world?.setSafe(true);
    if (this.data.inventory.length < 5) {
      this.data.inventory.push("basementKey");
      this.data.collected.push("safe-basement-key");
      this.toast("Brankas terbuka. Basement Key ditemukan.");
    } else {
      this.world?.addItem({ uid: "safe-basement-key", item: "basementKey", x: 5, z: 5 });
      this.toast("Brankas terbuka. Kunci terjatuh di dekat brankas karena inventori penuh.");
    }
    this.updateHeldItem();
    this.persist(); this.sendHud();
    return true;
  }

  private consume(item: ItemId): boolean {
    const index = this.data.inventory.indexOf(item);
    if (index < 0) return false;
    this.data.inventory.splice(index, 1);
    this.updateHeldItem();
    return true;
  }

  useSelected(): void {
    const item = this.data.inventory[this.data.selectedSlot];
    if (!item) return;
    if (item === "battery") {
      if (this.data.battery >= 99) { this.toast("Baterai senter masih penuh."); return; }
      this.data.battery = Math.min(100, this.data.battery + 55);
      this.consumeAtSlot();
      this.updateFlashlight();
      this.audio.play("switch");
      this.toast("Baterai senter terisi kembali.");
    } else if (item === "medkit") {
      if (this.data.health >= 100) { this.toast("Kesehatan masih penuh."); return; }
      this.data.health = Math.min(100, this.data.health + 55);
      this.consumeAtSlot();
      this.audio.play("pickup");
      this.toast("Luka telah dirawat.");
    } else this.toast(`Arahkan ke objek yang sesuai lalu tekan E untuk menggunakan ${ITEM_NAMES[item]}.`);
    this.persist(); this.sendHud();
  }

  private consumeAtSlot(): void {
    this.data.inventory.splice(this.data.selectedSlot, 1);
    this.updateHeldItem();
  }

  dropSelected(): void {
    const item = this.data.inventory[this.data.selectedSlot];
    if (!item || !this.world) { this.toast("Tidak ada item di slot ini."); return; }
    const facing = forwardAt(this.data.yaw);
    const grid = worldToGrid(this.data.level, this.playerWorld().x + facing.x * 0.7,
      this.playerWorld().y + facing.z * 0.7);
    const x = tileAt(this.data.level, Math.round(grid.x), Math.round(grid.z)) === "#" ? this.data.x : grid.x;
    const z = tileAt(this.data.level, Math.round(grid.x), Math.round(grid.z)) === "#" ? this.data.z : grid.z;
    const uid = `drop-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    this.data.dropped.push({ uid, item, level: this.data.level, x, z });
    this.world.addItem({ uid, item, x, z });
    this.consumeAtSlot();
    this.audio.play("stepMetal");
    this.makeNoise(this.playerWorld(), 13);
    this.toast(`${ITEM_NAMES[item]} dijatuhkan.`);
    this.persist(); this.sendHud();
  }

  private transition(destination: LevelId): void {
    const previous = this.data.level;
    this.loadLevel(destination, true);
    if (destination === "ground" && previous === "basement") { this.data.x = 19; this.data.z = 6; }
    if (destination === "ground" && previous === "maze") { this.data.x = 12; this.data.z = 26; }
    if (destination === "upstairs" && previous === "attic") { this.data.x = 20; this.data.z = 6; }
    if (destination === "maze") { this.data.x = 13; this.data.z = 25; this.data.yaw = Math.PI; }
    this.hidden = false;
    this.crouching = false;
    this.resetMonster(9);
    this.audio.play("door");
    this.subtitleText(`[${roomName(destination, this.data.x, this.data.z)}]`, 3);
    this.toast(destination === "maze" ? "Dinding labirin menutup di belakangmu. Cari jalan keluar di tengahnya."
      : destination === "basement" ? "Udara di bawah sini terasa lebih dingin."
      : destination === "attic" ? "Ada sesuatu yang bergerak di atas kepalamu."
      : "Lantai kayu berderit di bawah kakimu.");
    this.persist(); this.sendHud();
  }

  private resetMonster(grace: number): void {
    const [x, z] = LEVELS[this.data.level].monsterSpawn;
    const p = gridToWorld(this.data.level, x, z);
    this.monsterPos.set(p.x, p.z);
    this.monsterYaw = Math.PI;
    this.monsterState = "IDLE";
    this.attackAnimation = 0;
    this.monsterTarget = null;
    this.monsterPath = [];
    this.bloodStepClock = 0;
    this.monsterBreathClock = 2;
    this.monsterGrace = grace;
    this.monsterThinkTimer = 0;
    if (this.monster) this.monster.group.position.set(p.x, 0, p.z);
  }

  private makeNoise(position: THREE.Vector2, radius: number): void {
    this.noise = Math.max(this.noise, Math.min(100, radius * 7.5));
    const distance = position.distanceTo(this.monsterPos);
    if (this.data.elapsed < 11 || distance > radius * DIFFICULTY[this.data.difficulty].hearing || this.monsterState === "CHASE") return;
    this.monsterTarget = position.clone();
    this.monsterState = "INVESTIGATE";
    this.monsterSearchTimer = 4;
    this.monsterPathTimer = 0;
  }

  private findPath(from: THREE.Vector2, to: THREE.Vector2): { x: number; z: number }[] {
    const startGrid = worldToGrid(this.data.level, from.x, from.y);
    const endGrid = worldToGrid(this.data.level, to.x, to.y);
    const sx = Math.round(startGrid.x), sz = Math.round(startGrid.z);
    const tx = Math.round(endGrid.x), tz = Math.round(endGrid.z);
    const width = LEVELS[this.data.level].width;
    const height = LEVELS[this.data.level].height;
    const start = sz * width + sx;
    const end = tz * width + tx;
    if (start === end || this.tileBlocked(tx, tz, true)) return [];
    const visited = new Int32Array(width * height).fill(-1);
    const queue = new Int32Array(width * height);
    let head = 0, tail = 0;
    queue[tail++] = start;
    visited[start] = start;
    while (head < tail) {
      const current = queue[head++];
      if (current === end) break;
      const x = current % width, z = Math.floor(current / width);
      for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= width || nz >= height || this.tileBlocked(nx, nz, true)) continue;
        const next = nz * width + nx;
        if (visited[next] !== -1) continue;
        visited[next] = current;
        queue[tail++] = next;
      }
    }
    if (visited[end] === -1) return [];
    const result: { x: number; z: number }[] = [];
    let node = end;
    while (node !== start && result.length < 200) {
      const pos = gridToWorld(this.data.level, node % width, Math.floor(node / width));
      result.unshift(pos);
      node = visited[node];
    }
    return result;
  }

  private pickPatrol(): void {
    const choices = LEVELS[this.data.level].patrol;
    const shuffled = [...choices].sort(() => Math.random() - 0.5);
    for (const [x, z] of shuffled) {
      const p = gridToWorld(this.data.level, x, z);
      const target = new THREE.Vector2(p.x, p.z);
      if (target.distanceTo(this.monsterPos) < CELL * 2) continue;
      const path = this.findPath(this.monsterPos, target);
      if (!path.length) continue;
      this.monsterTarget = target;
      this.monsterPath = path;
      this.monsterPathTimer = 1.3;
      return;
    }
  }

  private updateMonster(dt: number): void {
    if (!this.monster) return;
    const player = this.playerWorld();
    const distance = player.distanceTo(this.monsterPos);
    this.lastMonsterDist = distance;
    this.monsterGrace = Math.max(0, this.monsterGrace - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.attackAnimation = Math.max(0, this.attackAnimation - dt);
    this.monsterThinkTimer -= dt;

    if (this.data.elapsed < 13 && this.monsterState === "IDLE") {
      this.monster.animate(this.clock, "IDLE", 0);
      this.monster.group.position.set(this.monsterPos.x, 0, this.monsterPos.y);
      return;
    }
    if (this.monsterThinkTimer <= 0) {
      this.monsterThinkTimer = 0.24;
      const config = DIFFICULTY[this.data.difficulty];
      const playerDark = !this.data.flashlightOn && this.crouching;
      const visibleRange = config.vision * (playerDark ? 0.46 : this.crouching ? 0.7 : this.data.flashlightOn ? 1.18 : 0.88);
      const toPlayer = new THREE.Vector2(player.x - this.monsterPos.x, player.y - this.monsterPos.y).normalize();
      const monsterFacing = forwardAt(this.monsterYaw);
      const facing = toPlayer.dot(new THREE.Vector2(monsterFacing.x, monsterFacing.z));
      const seen = !this.hidden && this.monsterGrace <= 0 && distance < visibleRange &&
        (distance < 3.3 || facing > (this.monsterState === "CHASE" ? -0.2 : 0.18)) &&
        this.lineOfSight(this.monsterPos, player, true);
      if (seen) {
        if (this.monsterState !== "CHASE") {
          this.data.detections++;
          this.subtitleText("[The Creeper sees you. RUN.]", 3);
          this.callbacks.onToast("THE CREEPER HAS FOUND YOU. RUN.");
          if (this.settings.vibration && navigator.vibrate) navigator.vibrate([80, 50, 100]);
        }
        this.monsterState = "CHASE";
        this.monsterTarget = player.clone();
        this.monsterLastSeen = player.clone();
        this.monsterPathTimer = 0;
      } else if (this.monsterState === "CHASE") {
        this.monsterState = "LOST PLAYER";
        this.monsterTarget = this.monsterLastSeen?.clone() || player.clone();
        this.monsterSearchTimer = 5;
        this.monsterPathTimer = 0;
        this.subtitleText("[The footsteps slow down]", 2.5);
      }
    }

    if (this.monsterState === "IDLE") {
      this.monsterState = "PATROL";
      this.pickPatrol();
    }
    if (this.monsterState === "PATROL" && (!this.monsterTarget || this.monsterPos.distanceTo(this.monsterTarget) < 0.6)) this.pickPatrol();
    if ((this.monsterState === "INVESTIGATE" || this.monsterState === "LOST PLAYER") && this.monsterTarget && this.monsterPos.distanceTo(this.monsterTarget) < 0.85) {
      this.monsterState = "SEARCH";
      this.monsterSearchTimer = 3 + Math.random() * 2;
      this.monsterTarget = null;
      this.monsterPath = [];
    }
    if (this.monsterState === "SEARCH") {
      this.monsterSearchTimer -= dt;
      this.monsterYaw += dt * 0.4;
      if (this.monsterSearchTimer <= 0) { this.monsterState = "RETURN"; this.monsterTarget = null; }
    }
    if (this.monsterState === "RETURN") { this.monsterState = "PATROL"; this.pickPatrol(); }

    let movingSpeed = 0;
    if (this.monsterTarget && this.monsterState !== "SEARCH") {
      this.monsterPathTimer -= dt;
      // Predict where the player is heading so the pursuit flows instead of zig-zagging.
      if (this.monsterState === "CHASE") {
        this.monsterTarget.set(
          player.x + this.playerVelocity.x * 0.42,
          player.y + this.playerVelocity.y * 0.42,
        );
      }
      if (this.monsterPathTimer <= 0) {
        this.monsterPath = this.findPath(this.monsterPos, this.monsterTarget);
        this.monsterPathTimer = this.monsterState === "CHASE" ? 0.47 : 1.2;
      }
      let next = this.monsterPath[0];
      if (next && this.monsterPos.distanceTo(new THREE.Vector2(next.x, next.z)) < 0.24) {
        this.monsterPath.shift();
        next = this.monsterPath[0];
      }
      if (!next && this.monsterState === "CHASE" && this.lineOfSight(this.monsterPos, player, true)) next = { x: player.x, z: player.y };
      if (next) {
        const waypoint = new THREE.Vector2(next.x, next.z);
        const direction = waypoint.sub(this.monsterPos).normalize();
        const speed = this.monsterState === "CHASE" ? DIFFICULTY[this.data.difficulty].chase : DIFFICULTY[this.data.difficulty].patrol;
        this.monsterPos.addScaledVector(direction, Math.min(speed * dt, this.monsterPos.distanceTo(new THREE.Vector2(next.x, next.z))));
        movingSpeed = speed;
        const targetYaw = yawToward(direction.x, direction.y);
        const turnDelta = Math.atan2(Math.sin(targetYaw - this.monsterYaw), Math.cos(targetYaw - this.monsterYaw));
        this.monsterTurn = THREE.MathUtils.lerp(this.monsterTurn, turnDelta / Math.max(dt, 0.001), 0.22);
        this.monsterYaw += turnDelta * Math.min(1, dt * (this.monsterState === "CHASE" ? 7.5 : 4.6));
        const grid = worldToGrid(this.data.level, next.x, next.z);
        const door = LEVELS[this.data.level].doors.find((d) => d.x === Math.round(grid.x) && d.z === Math.round(grid.z));
        if (door && (!door.required || this.data.unlockedDoors.includes(door.id)) && !this.data.openedDoors.includes(door.id) && this.monsterPos.distanceTo(new THREE.Vector2(next.x, next.z)) < 1.7) {
          this.data.openedDoors.push(door.id);
          this.world?.setDoor(door.id, true);
          this.audio.play("door");
          this.subtitleText("[A door creaks open somewhere nearby]", 2.8);
        }
      }
    }
    this.monster.group.position.set(this.monsterPos.x, 0, this.monsterPos.y);
    this.monster.group.rotation.y = this.monsterYaw;
    this.monster.group.rotation.z = THREE.MathUtils.clamp(-this.monsterTurn * 0.045, -0.2, 0.2)
      + (this.monsterState === "CHASE" ? Math.sin(this.clock * 9) * 0.017 : 0);
    this.monster.animate(this.clock, this.monsterState, movingSpeed, Math.min(1, this.attackAnimation * 2.5));
    this.bloodStepClock -= dt;
    if (movingSpeed > 0 && distance < 23 && this.bloodStepClock <= 0) {
      this.bloodStepClock = this.monsterState === "CHASE" ? .55 : 1.25;
      this.world?.stampBlood(this.monsterPos.x, this.monsterPos.y, this.monsterYaw);
    }
    this.monsterStepClock -= dt;
    if (movingSpeed > 0 && this.monsterStepClock <= 0 && distance < 18) {
      this.monsterStepClock = this.monsterState === "CHASE" ? 0.43 : 0.78;
      this.audio.play("monsterStep");
      if (distance < 10 && this.settings.subtitles && this.monsterState !== "CHASE" && this.clock > this.subtitleUntil) this.subtitleText("[Footsteps nearby]", 2);
    }
    this.monsterBreathClock -= dt;
    if (distance < 7 && this.monsterState !== "CHASE" && this.monsterBreathClock <= 0) {
      this.monsterBreathClock = 4.3 + Math.random() * 2;
      this.audio.play("rasp");
      if (this.clock > this.subtitleUntil) this.subtitleText("[Wet breathing very close]", 2.8);
    }
    if (!this.hidden && distance < 1.3 && this.monsterGrace <= 0 && this.attackCooldown <= 0) {
      this.attackCooldown = 2.5;
      this.attackAnimation = 0.55;
      this.data.health = Math.max(0, this.data.health - DIFFICULTY[this.data.difficulty].damage);
      this.hurtClock = 1.1;
      this.audio.play("scare");
      if (this.settings.vibration && navigator.vibrate) navigator.vibrate([170, 60, 220]);
      this.subtitleText("[The Creeper grabs you]", 2.2);
      this.monster.animate(this.clock, "CHASE", 0, 1);
      if (this.data.health <= 0) {
        const toward = new THREE.Vector2(this.monsterPos.x - player.x, this.monsterPos.y - player.y);
        this.data.yaw = yawToward(toward.x, toward.y);
        this.data.pitch = 0.38;
        this.paused = true;
        this.audio.setMode("end");
        this.persist();
        this.deathTimer = window.setTimeout(() => { if (!this.disposed) this.callbacks.onDeath(); }, 820);
      } else {
        this.callbacks.onToast("TERLUKA. Cari tempat bersembunyi!");
        this.monsterGrace = 1.2;
      }
      this.sendHud();
    }
  }

  private updateCamera(dt: number): void {
    const eyeHeight = this.hidden ? 1.15 : this.crouching ? 1.13 : 1.67;
    const moving = this.keys.has("KeyW") || this.keys.has("KeyA") || this.keys.has("KeyS") || this.keys.has("KeyD") || Math.abs(this.mobileMove.x) + Math.abs(this.mobileMove.y) > 0.15;
    const headBob = moving && !this.hidden ? Math.sin(this.bob) * (this.isRunning() ? 0.038 : 0.021) : Math.sin(this.clock * 1.7) * 0.009;
    this.camera.position.set(this.playerWorld().x, eyeHeight + headBob + (this.hurtClock > 0 ? Math.sin(this.clock * 24) * 0.014 : 0), this.playerWorld().y);
    this.camera.rotation.y = this.data.yaw;
    this.camera.rotation.x = this.data.pitch;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.isRunning() ? 79 : 75, Math.min(1, dt * 4));
    this.camera.updateProjectionMatrix();
    if (this.hands) {
      this.hands.position.y = Math.sin(this.bob) * (moving ? 0.019 : 0.006);
      this.hands.rotation.z = Math.sin(this.bob * 0.5) * (this.isRunning() ? 0.028 : 0.01);
    }
  }

  private isRunning(): boolean {
    return !this.hidden && !this.crouching && !this.exhausted && this.data.stamina > 2 && (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.mobileRunning);
  }

  private updatePlayer(dt: number): void {
    const forward = Number(this.keys.has("KeyW") || this.keys.has("ArrowUp")) - Number(this.keys.has("KeyS") || this.keys.has("ArrowDown")) - this.mobileMove.y;
    const strafe = Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) - Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft")) + this.mobileMove.x;
    const length = Math.hypot(forward, strafe);
    const moving = length > 0.08 && !this.hidden;
    const running = moving && this.isRunning();
    if (moving) {
      const speed = this.crouching ? 1.55 : running ? 5.3 : 3.18;
      const movement = movementAt(this.data.yaw, forward, strafe);
      const dx = movement.x * speed * dt;
      const dz = movement.z * speed * dt;
      const current = this.playerWorld();
      if (!this.collides(current.x + dx, current.y)) this.data.x += dx / CELL;
      const afterX = this.playerWorld();
      if (!this.collides(afterX.x, afterX.y + dz)) this.data.z += dz / CELL;
      this.playerVelocity.x = THREE.MathUtils.lerp(this.playerVelocity.x, dx / Math.max(dt, 0.001), 0.3);
      this.playerVelocity.y = THREE.MathUtils.lerp(this.playerVelocity.y, dz / Math.max(dt, 0.001), 0.3);
      this.bob += dt * (running ? 13 : this.crouching ? 6 : 8.1);
      this.walkStepClock -= dt;
      if (this.walkStepClock <= 0) {
        this.walkStepClock = running ? 0.36 : this.crouching ? 0.79 : 0.53;
        const room = roomName(this.data.level, this.data.x, this.data.z);
        const surface: SoundName = room === "GARAGE" ? "stepMetal" : this.data.level === "basement" || room === "KITCHEN" ? "stepTile" : this.crouching ? "stepSoft" : "stepWood";
        this.audio.play(surface);
        if (running) this.makeNoise(this.playerWorld(), this.data.level === "basement" ? 13 : 10);
        else if (!this.crouching) this.makeNoise(this.playerWorld(), 3.2);
      }
      if (running) this.data.stamina = Math.max(0, this.data.stamina - dt * 18);
    } else this.walkStepClock = 0;
    if (!running) this.data.stamina = Math.min(100, this.data.stamina + dt * (this.crouching ? 18 : 11));
    if (this.data.stamina <= 3) this.exhausted = true;
    if (this.exhausted && this.data.stamina >= 30) this.exhausted = false;
    this.noise = Math.max(0, this.noise - dt * 43);
    if (this.data.flashlightOn) {
      this.data.battery = Math.max(0, this.data.battery - dt * 0.087);
      if (this.data.battery <= 0) { this.data.flashlightOn = false; this.updateFlashlight(); this.toast("Senter mati. Baterai habis."); }
      else if (this.data.battery < 19 && this.flashlight) {
        this.flashlight.intensity = Math.random() < 0.018 ? 13 : 145;
        this.flashlightFill.intensity = this.flashlight.intensity < 20 ? 0.5 : 5;
      }
    }
    this.hurtClock = Math.max(0, this.hurtClock - dt);
    const grid = { x: Math.round(this.data.x), z: Math.round(this.data.z) };
    if (this.data.level === "maze" && Math.abs(grid.x - 13) <= 1 && Math.abs(grid.z - 13) <= 1) { this.victory(); return; }
    const room = roomName(this.data.level, this.data.x, this.data.z);
    if (!this.seenRooms.has(room)) {
      this.seenRooms.add(room);
      if (this.clock > 4) this.subtitleText(`[${room}]`, 2.2);
    }
  }

  private randomEvent(): void {
    this.eventClock = 19 + Math.random() * 19;
    if (this.data.elapsed < 17) return;
    const event = Math.floor(Math.random() * 4);
    if (event === 0) { this.audio.play("whisper"); this.subtitleText("[A whisper behind the wall]", 3); }
    else if (event === 1) { this.audio.play("creak"); this.subtitleText("[The house settles around you]", 3); }
    else if (event === 2) {
      this.audio.play("stepWood");
      this.subtitleText("[A distant step... then silence]", 3);
    } else if (this.settings.effects === "HIGH") {
      this.blackoutTimer = 0.65 + Math.random() * 0.5;
      this.audio.play("switch");
      this.subtitleText("[The lights flicker]", 3);
    }
  }

  private victory(): void {
    if (this.paused) return;
    this.finished = true;
    this.paused = true;
    this.audio.play("victory");
    this.audio.setMode("end");
    try { localStorage.removeItem(SAVE_KEY); } catch { /* Victory still works without storage. */ }
    this.callbacks.onVictory({ ...this.data, inventory: [...this.data.inventory] });
  }

  private loop = (timestamp: number): void => {
    if (this.disposed) return;
    this.animationId = requestAnimationFrame(this.loop);
    if (!this.renderer) return;
    if (this.lastRaf) {
      const gap = timestamp - this.lastRaf;
      if (gap > 3 && gap < 45) this.fastestRaf = Math.min(this.fastestRaf, gap);
    }
    this.lastRaf = timestamp;
    const targetMs = 1000 / (this.paused ? 10 : this.settings.fps);
    // Steady frame pacing: never alternate long and short frames at high refresh rates.
    if (timestamp < this.nextFrame) return;
    this.nextFrame = this.nextFrame && this.nextFrame > timestamp - targetMs * 3 ? this.nextFrame + targetMs : timestamp + targetMs;
    const dt = this.lastFrame ? Math.min(0.05, (timestamp - this.lastFrame) / 1000) : 1 / Math.max(30, this.settings.fps);
    this.lastFrame = timestamp;
    if (!this.paused) {
      this.clock += dt;
      this.data.elapsed += dt;
      this.eventClock -= dt;
      if (this.eventClock <= 0) this.randomEvent();
      this.blackoutTimer = Math.max(0, this.blackoutTimer - dt);
      this.updatePlayer(dt);
      if (!this.paused) this.updateMonster(dt);
      this.audio.update(this.lastMonsterDist, this.monsterState === "CHASE", this.data.level === "ground" && this.data.z >= 20, dt);
      this.clockTick -= dt;
      if (this.clockTick <= 0 && this.data.level === "ground" && this.data.x >= 10 && this.data.x <= 15 && this.data.z >= 5 && this.data.z <= 12) {
        this.clockTick = 1.1;
        this.audio.play("tick");
      }
      this.world?.flickerLights.forEach((light, index) => {
        const base = this.data.powerOn ? 1.65 : 1;
        light.intensity = this.blackoutTimer > 0 ? 0.025 : (index === 0 ? 1.3 : 0.7) * base * (0.82 + Math.sin(this.clock * (3.5 + index)) * 0.1 + (Math.random() < 0.009 ? -0.62 : 0));
      });
      if (this.world) {
        this.world.animate(dt);
        for (const interaction of this.world.interactions) {
          if (interaction.kind !== "item") continue;
          interaction.object.position.y = 0.84 + Math.sin(this.clock * 2.3 + interaction.x) * 0.07;
          interaction.object.rotation.y += dt * 0.52;
        }
        if (this.world.dust) this.world.dust.rotation.y += dt * 0.0018;
      }
      this.focused = this.findFocused();
      this.hudClock -= dt;
      if (this.hudClock <= 0) { this.hudClock = 0.13; this.sendHud(); }
      this.saveClock += dt;
      if (this.saveClock >= 6) { this.saveClock = 0; this.persist(); }
    }
    this.updateCamera(dt);
    this.shadowTick++;
    this.renderer.shadowMap.needsUpdate = this.settings.fps < 120 || this.shadowTick % 2 === 0;
    this.renderer.render(this.scene, this.camera);
    if (!this.paused) {
      this.renderedFrames++;
      if (!this.sampleStart) this.sampleStart = timestamp;
      const windowMs = timestamp - this.sampleStart;
      if (windowMs >= 2400) {
        this.actualFps = Math.round(this.renderedFrames * 1000 / windowMs);
        const displayFps = Number.isFinite(this.fastestRaf) ? Math.round(1000 / this.fastestRaf) : this.settings.fps;
        const reachableTarget = Math.min(this.settings.fps, displayFps);
        const scaleFloor = this.settings.quality === "ULTRA" ? 0.92 : this.settings.quality === "HIGH" ? 0.86 : this.settings.quality === "MEDIUM" ? 0.8 : 0.7;
        if (this.actualFps < reachableTarget * 0.72 && this.renderScale > scaleFloor) this.renderScale = Math.max(scaleFloor, this.renderScale - 0.06);
        else if (this.actualFps > reachableTarget * 0.92 && this.renderScale < 1) this.renderScale = Math.min(1, this.renderScale + 0.03);
        const baseRatio = Math.min(window.devicePixelRatio || 1, this.settings.quality === "LOW" ? 1 : this.settings.quality === "MEDIUM" ? 1.5 : this.settings.quality === "HIGH" ? 2 : 2.5);
        if (Math.abs(this.renderer.getPixelRatio() - baseRatio * this.renderScale) > 0.01) {
          this.renderer.setPixelRatio(baseRatio * this.renderScale);
          this.resize();
        }
        this.renderedFrames = 0;
        this.sampleStart = timestamp;
      }
    } else {
      this.renderedFrames = 0;
      this.sampleStart = 0;
    }
  };

  private sendHud(): void {
    this.callbacks.onHud({
      level: this.data.level,
      room: roomName(this.data.level, this.data.x, this.data.z),
      objective: currentObjective(this.data),
      health: this.data.health,
      stamina: this.data.stamina,
      battery: this.data.battery,
      noise: this.noise,
      inventory: [...this.data.inventory],
      selectedSlot: this.data.selectedSlot,
      flashlightOn: this.data.flashlightOn,
      crouching: this.crouching,
      hidden: this.hidden,
      running: this.isRunning(),
      monsterState: this.monsterState,
      monsterDistance: this.lastMonsterDist,
      prompt: this.promptFor(this.focused),
      elapsed: this.data.elapsed,
      detections: this.data.detections,
      collectedCount: this.data.collected.length,
      subtitle: this.settings.subtitles && this.clock < this.subtitleUntil ? this.subtitle : "",
      hurt: this.hurtClock > 0,
      actualFps: this.actualFps,
    });
  }

  persist(): void { if (!this.finished) saveGame(this.data); }

  dispose(): void {
    this.disposed = true;
    window.clearTimeout(this.deathTimer);
    cancelAnimationFrame(this.animationId);
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("keydown", this.keyDown);
    document.removeEventListener("keyup", this.keyUp);
    document.removeEventListener("mousemove", this.mouseMove);
    document.removeEventListener("pointerlockchange", this.lockChange);
    document.removeEventListener("visibilitychange", this.visibilityChange);
    if (this.renderer) {
      const canvas = this.renderer.domElement;
      canvas.removeEventListener("pointerdown", this.pointerDown);
      canvas.removeEventListener("pointermove", this.pointerMove);
      canvas.removeEventListener("pointerup", this.pointerUp);
      canvas.removeEventListener("pointercancel", this.pointerUp);
      canvas.removeEventListener("webglcontextlost", this.contextLost);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      this.renderer.dispose();
      canvas.remove();
    }
    if (this.world) { this.scene.remove(this.world.group); this.world.dispose(); }
    if (this.monster) {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      this.monster.group.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          geometries.add(node.geometry);
          (Array.isArray(node.material) ? node.material : [node.material]).forEach((mat) => materials.add(mat));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => {
        if (material instanceof THREE.MeshStandardMaterial) material.map?.dispose();
        material.dispose();
      });
    }
  }
}