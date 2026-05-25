import Phaser from "phaser";
import { COLOR_HEX, COLORS, TEXT_PRESETS } from "../theme";
import { drawDiagonalScanlines, createPulsingDot, addCornerLabel, getResponsiveTextSize } from "../ui";
import { takeScreenshot } from "../screenshot";
import { playTone, unlockAudio } from "../audio";
import { HIGHSCORE_KEY } from "./MenuScene";

// ---------- constants ----------
const GRAVITY = 1400;          // px/s²
const FLAP_VEL = -440;         // px/s (negativo = sobe)
const MAX_FALL_SPEED = 720;    // px/s — clamp pra não passar despercebido pelo cano
const PIPE_WIDTH = 64;
const PIPE_SCROLL = 180;       // px/s base (escala em tiers de 5 pontos)
const PIPE_SPACING_MIN = 200;  // distância mínima entre canos consecutivos (px)
const PIPE_SPACING_MAX = 280;  // distância máxima — aleatorizada a cada spawn
const PIPE_GAP = 160;          // altura do gap inicial (encolhe em tiers)
const PIPE_GAP_MIN = 110;
const PIPE_MARGIN_TOP = 70;    // distância mínima do topo
const PIPE_MARGIN_BOTTOM = 90; // ditto do chão
const GROUND_H = 56;
const BIRD_W = 28;
const BIRD_H = 22;

type State = "ready" | "playing" | "dead";

interface Pipe {
  topRect: Phaser.GameObjects.Rectangle;
  botRect: Phaser.GameObjects.Rectangle;
  topCap: Phaser.GameObjects.Rectangle;
  botCap: Phaser.GameObjects.Rectangle;
  x: number;
  gapTop: number;    // y do TOPO do gap (fim do cano de cima)
  gapBottom: number; // y do FUNDO do gap (início do cano de baixo)
  scored: boolean;
}

export class GameScene extends Phaser.Scene {
  private bird!: Phaser.GameObjects.Rectangle;
  private birdEye!: Phaser.GameObjects.Arc;
  private birdWing!: Phaser.GameObjects.Rectangle;
  private birdVy = 0;

  private pipes: Pipe[] = [];
  private nextSpawnGap = 0;
  private lastTier = 0;
  private state: State = "ready";

  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private ground!: Phaser.GameObjects.Rectangle;
  private skyTop!: Phaser.GameObjects.Rectangle;
  private overlayBg!: Phaser.GameObjects.Rectangle;
  private overlayTitle!: Phaser.GameObjects.Text;
  private overlayHint!: Phaser.GameObjects.Text;
  private isNight = false;

  private keys!: Record<"SPACE" | "UP" | "W" | "ESC" | "K" | "R", Phaser.Input.Keyboard.Key>;

  constructor() { super("game"); }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.state = "ready";
    this.birdVy = 0;
    this.pipes = [];
    this.score = 0;
    this.lastTier = 0;
    this.isNight = false;
    this.nextSpawnGap = Phaser.Math.Between(PIPE_SPACING_MIN, PIPE_SPACING_MAX);

    // Sky background — recolorível conforme dia/noite
    this.skyTop = this.add.rectangle(0, 0, W, H, COLOR_HEX.bg).setOrigin(0, 0);

    // Scanlines
    drawDiagonalScanlines(this, W, H, 18, 0.04);

    // Bird (laranja accent — destaque máximo conforme convenção do site)
    this.bird = this.add.rectangle(W * 0.28, H * 0.5, BIRD_W, BIRD_H, COLOR_HEX.accent);
    this.bird.setStrokeStyle(1, COLOR_HEX.fg, 0.5);
    this.birdEye = this.add.circle(this.bird.x + 6, this.bird.y - 4, 2, COLOR_HEX.fg);
    this.birdWing = this.add.rectangle(this.bird.x - 8, this.bird.y + 2, 8, 3, COLOR_HEX.fg).setAlpha(0.6);

    // Ground (bg-soft com borda crisp em cima — strip horizontal)
    this.ground = this.add.rectangle(0, H - GROUND_H, W, GROUND_H, COLOR_HEX.bgSoft).setOrigin(0, 0);
    this.ground.setStrokeStyle(1, COLOR_HEX.border, 1);

    // Chrome (UI)
    this.drawChrome();
    this.drawOverlay();
    this.showReadyOverlay();

    // Input
    const kb = this.input.keyboard!;
    this.keys = {
      SPACE: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      UP: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      ESC: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      K: kb.addKey(Phaser.Input.Keyboard.KeyCodes.K),
      R: kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
    };
    kb.on("keydown", unlockAudio);
    this.input.on("pointerdown", () => { unlockAudio(); this.handleFlapInput(); });
  }

  // ---------- input handler ----------

  private handleFlapInput() {
    if (this.state === "ready") {
      this.state = "playing";
      this.hideOverlay();
      this.flap();
    } else if (this.state === "playing") {
      this.flap();
    }
    // dead: ignore — R pra restartar (no overlay)
  }

  private flap() {
    this.birdVy = FLAP_VEL;
    playTone(660, 50, "square", 0.08);
    // Quick rotation tween pra dar sensação de "subida"
    this.tweens.add({
      targets: this.bird,
      angle: -22,
      duration: 80,
      yoyo: false,
      ease: "Quad.easeOut",
    });
  }

  // ---------- update loop ----------

  update(_time: number, delta: number) {
    const dt = delta / 1000;
    const justDown = Phaser.Input.Keyboard.JustDown;

    if (justDown(this.keys.K)) takeScreenshot(this.game, "gamedev-08-flappy");
    if (justDown(this.keys.ESC)) { this.scene.start("menu"); return; }

    const flapJustPressed = justDown(this.keys.SPACE) || justDown(this.keys.UP) || justDown(this.keys.W);
    if (flapJustPressed) this.handleFlapInput();

    if (this.state === "dead" && justDown(this.keys.R)) {
      this.scene.restart();
      return;
    }

    if (this.state === "ready") {
      // Hover suave pra deixar visualmente claro que o jogo ainda não começou
      this.bird.y = this.scale.height * 0.5 + Math.sin(this.time.now * 0.005) * 6;
      this.syncBirdParts();
      return;
    }

    if (this.state !== "playing") return;

    // ---- gravity + bird movement ----
    this.birdVy += GRAVITY * dt;
    if (this.birdVy > MAX_FALL_SPEED) this.birdVy = MAX_FALL_SPEED;
    this.bird.y += this.birdVy * dt;

    // Rotação contínua: aponta baixo conforme cai
    const targetAngle = Phaser.Math.Clamp(this.birdVy * 0.06, -22, 80);
    this.bird.angle = Phaser.Math.Linear(this.bird.angle, targetAngle, 0.08);
    this.syncBirdParts();

    // ---- spawn pipes ----
    // Spawn quando o último cano caminhou nextSpawnGap px da borda direita.
    // Resultado: distância on-screen entre canos == nextSpawnGap (200-280px).
    const W = this.scale.width;
    const lastPipe = this.pipes[this.pipes.length - 1];
    const shouldSpawn = !lastPipe || lastPipe.x <= W - this.nextSpawnGap;
    if (shouldSpawn) {
      this.spawnPipe(W + PIPE_WIDTH / 2);
      this.nextSpawnGap = Phaser.Math.Between(PIPE_SPACING_MIN, PIPE_SPACING_MAX);
    }

    // ---- scroll pipes ----
    const scroll = this.currentScrollSpeed();
    for (const p of this.pipes) {
      p.x -= scroll * dt;
      p.topRect.x = p.x;
      p.botRect.x = p.x;
      p.topCap.x = p.x;
      p.botCap.x = p.x;
    }

    // ---- score: bird passou pelo centro do cano ----
    for (const p of this.pipes) {
      if (!p.scored && p.x + PIPE_WIDTH / 2 < this.bird.x) {
        p.scored = true;
        this.score += 1;
        this.scoreText.setText(String(this.score).padStart(3, "0"));
        playTone(1175, 60, "triangle", 0.10);

        // Speed/gap tier: a cada 5 pontos, fica mais difícil.
        // Sinaliza visualmente com flash quando tier sobe.
        const tier = Math.floor(this.score / 5);
        if (tier > this.lastTier) {
          this.lastTier = tier;
          this.onTierUp();
        }

        // Day/night swap a cada 10 pontos (independente do tier)
        if (this.score % 10 === 0) this.toggleDayNight();
      }
    }

    // ---- recycle: remove pipes que saíram da tela ----
    this.pipes = this.pipes.filter((p) => {
      if (p.x + PIPE_WIDTH < -8) {
        p.topRect.destroy(); p.botRect.destroy();
        p.topCap.destroy(); p.botCap.destroy();
        return false;
      }
      return true;
    });

    // ---- collisions ----
    this.checkCollisions();
  }

  // Velocidade escala em tiers de 5 pontos. +12% por tier, cap em +80% (tier 7+).
  // Step-wise (não contínuo) cria sensação de "fica mais difícil agora" visível.
  private currentScrollSpeed(): number {
    const tier = Math.floor(this.score / 5);
    const bonus = Math.min(0.8, tier * 0.12);
    return PIPE_SCROLL * (1 + bonus);
  }

  // Gap encolhe 10px por tier, com piso em PIPE_GAP_MIN.
  private currentGap(): number {
    const tier = Math.floor(this.score / 5);
    const shrink = Math.min(PIPE_GAP - PIPE_GAP_MIN, tier * 10);
    return PIPE_GAP - shrink;
  }

  // Sinaliza pro jogador que a velocidade/dificuldade subiu.
  // Flash laranja + tone descendente — diferente do milestone azul (day/night).
  private onTierUp() {
    this.cameras.main.flash(180, 255, 69, 0, false);
    playTone(880, 120, "sawtooth", 0.10);
    this.time.delayedCall(140, () => playTone(660, 140, "sawtooth", 0.10));
  }

  // ---------- pipes ----------

  private spawnPipe(x: number) {
    const H = this.scale.height;
    const gap = this.currentGap();
    const playableTop = PIPE_MARGIN_TOP;
    const playableBottom = H - GROUND_H - PIPE_MARGIN_BOTTOM;
    const gapCenter = Phaser.Math.Between(playableTop + gap / 2, playableBottom - gap / 2);
    const gapTop = gapCenter - gap / 2;
    const gapBottom = gapCenter + gap / 2;

    // Cano de cima
    const topH = gapTop;
    const topRect = this.add.rectangle(x, topH / 2, PIPE_WIDTH, topH, COLOR_HEX.fg).setOrigin(0.5, 0.5);
    topRect.setStrokeStyle(1, COLOR_HEX.border, 1);
    // Cap (borda inferior — efeito tubo)
    const topCap = this.add.rectangle(x, topH - 4, PIPE_WIDTH + 6, 8, COLOR_HEX.fg).setOrigin(0.5, 0.5);
    topCap.setStrokeStyle(1, COLOR_HEX.border, 1);

    // Cano de baixo
    const bottomTopY = gapBottom;
    const bottomH = H - GROUND_H - bottomTopY;
    const botRect = this.add.rectangle(x, bottomTopY + bottomH / 2, PIPE_WIDTH, bottomH, COLOR_HEX.fg).setOrigin(0.5, 0.5);
    botRect.setStrokeStyle(1, COLOR_HEX.border, 1);
    const botCap = this.add.rectangle(x, bottomTopY + 4, PIPE_WIDTH + 6, 8, COLOR_HEX.fg).setOrigin(0.5, 0.5);
    botCap.setStrokeStyle(1, COLOR_HEX.border, 1);

    this.pipes.push({ topRect, botRect, topCap, botCap, x, gapTop, gapBottom, scored: false });
  }

  // ---------- collisions ----------

  private checkCollisions() {
    const H = this.scale.height;
    const bx = this.bird.x;
    const by = this.bird.y;
    const bw = BIRD_W * 0.6; // hitbox ligeiramente menor que visual (mais justo)
    const bh = BIRD_H * 0.7;

    // Teto / chão
    if (by - bh / 2 < 0) { this.die(); return; }
    if (by + bh / 2 > H - GROUND_H) { this.die(); return; }

    // Canos: AABB simples
    for (const p of this.pipes) {
      // X overlap?
      if (bx + bw / 2 < p.x - PIPE_WIDTH / 2) continue;
      if (bx - bw / 2 > p.x + PIPE_WIDTH / 2) continue;
      // Y dentro do gap?
      if (by - bh / 2 > p.gapTop && by + bh / 2 < p.gapBottom) continue;
      this.die();
      return;
    }
  }

  // ---------- death / restart ----------

  private die() {
    this.state = "dead";
    playTone(160, 350, "sawtooth", 0.18);
    this.cameras.main.shake(220, 0.012);
    this.cameras.main.flash(120, 220, 40, 40, false);

    // Save best
    try {
      const raw = localStorage.getItem(HIGHSCORE_KEY);
      const prev = raw ? parseInt(raw, 10) : 0;
      if (this.score > prev) localStorage.setItem(HIGHSCORE_KEY, String(this.score));
    } catch {}

    this.time.delayedCall(500, () => {
      this.showOverlay("FIM", `${this.score} ponto${this.score === 1 ? "" : "s"} · R pra jogar de novo · ESC menu`);
    });
  }

  // ---------- visual: bird parts sync ----------

  private syncBirdParts() {
    // Olho e asa acompanham o passarinho — uso world coords simples (sem rotation pra evitar trig)
    this.birdEye.setPosition(this.bird.x + 6, this.bird.y - 4);
    this.birdWing.setPosition(this.bird.x - 8, this.bird.y + 2);
  }

  // ---------- day / night cycle ----------

  // A cada 10 pontos: troca paleta da skybox e cor do cap dos canos.
  // Não muda gameplay — só refresca visualmente pra recompensar progresso.
  private toggleDayNight() {
    this.isNight = !this.isNight;
    this.skyTop.fillColor = this.isNight ? COLOR_HEX.bgSoft : COLOR_HEX.bg;
    // Flash leve verde-claro pra sinalizar "milestone"
    this.cameras.main.flash(180, 122, 209, 122, false);
    playTone(1320, 100, "triangle", 0.10);
  }

  // ---------- chrome / overlay ----------

  private drawChrome() {
    const W = this.scale.width;
    const H = this.scale.height;

    addCornerLabel(this, 22, 22, "/ 08", "FLAPPY", false);
    const dot = createPulsingDot(this, W - 22 - 4, 22 + 6, 4, COLOR_HEX.accent);
    void dot;

    this.add.text(W - 38, 22, this.bestLabel(), TEXT_PRESETS.monoLabel).setOrigin(1, 0);
    // Score grande no centro topo (numeral é o herói)
    this.scoreText = this.add.text(W / 2, 80, "000", { ...TEXT_PRESETS.heroOutline, fontSize: getResponsiveTextSize(this, "display") })
      .setOrigin(0.5, 0);

    this.add.text(22, H - 22, "GAMEDEV.08", TEXT_PRESETS.hint).setOrigin(0, 1);
    this.add.text(W - 22, H - 22, "ESPAÇO · CLIQUE · ESC MENU · K", TEXT_PRESETS.hint).setOrigin(1, 1);
  }

  private bestLabel(): string {
    try {
      const raw = localStorage.getItem(HIGHSCORE_KEY);
      const n = raw ? parseInt(raw, 10) : 0;
      return `MELHOR  ${String(n).padStart(3, "0")}`;
    } catch { return "MELHOR  000"; }
  }

  private drawOverlay() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.overlayBg = this.add.rectangle(W / 2, H / 2, W, H, COLOR_HEX.bg, 0.78);
    this.overlayTitle = this.add.text(W / 2, H / 2 - 30, "", TEXT_PRESETS.heroOutline)
      .setOrigin(0.5)
      .setFontSize(getResponsiveTextSize(this, "hero"));
    this.overlayHint = this.add.text(W / 2, H / 2 + 50, "", { ...TEXT_PRESETS.hint, color: COLORS.fg }).setOrigin(0.5);
    this.hideOverlay();
  }

  private showReadyOverlay() {
    this.showOverlay("FLAPPY", "ESPAÇO ou CLIQUE pra começar");
  }

  private showOverlay(title: string, hint: string) {
    this.overlayBg.setVisible(true);
    this.overlayTitle.setVisible(true).setText(title);
    this.overlayHint.setVisible(true).setText(hint);
  }

  private hideOverlay() {
    this.overlayBg.setVisible(false);
    this.overlayTitle.setVisible(false);
    this.overlayHint.setVisible(false);
  }
}
