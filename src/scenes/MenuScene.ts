import Phaser from "phaser";
import { COLORS, COLOR_HEX, TEXT_PRESETS } from "../theme";
import { drawDiagonalScanlines, createPulsingDot, addCornerLabel, getResponsiveTextSize } from "../ui";
import { takeScreenshot } from "../screenshot";
import { unlockAudio } from "../audio";

const HIGHSCORE_KEY = "gamedev-08-flappy-best";

export class MenuScene extends Phaser.Scene {
  private keys!: Record<"SPACE" | "ENTER" | "K", Phaser.Input.Keyboard.Key>;

  constructor() { super("menu"); }

  create() {
    const best = this.loadBest();
    const W = this.scale.width;
    const H = this.scale.height;

    this.add.rectangle(0, 0, W, H, COLOR_HEX.bg).setOrigin(0, 0);
    drawDiagonalScanlines(this, W, H, 15, 0.045);

    addCornerLabel(this, 22, 22, "/ 08", "FLAPPY", false);
    createPulsingDot(this, W - 22 - 4, 22 + 6, 4, COLOR_HEX.accent);
    this.add.text(W - 38, 22, `MELHOR  ${String(best).padStart(3, "0")}`, TEXT_PRESETS.monoLabel).setOrigin(1, 0);

    this.add.text(22, H - 22, "GAMEDEV.08", TEXT_PRESETS.hint).setOrigin(0, 1);
    this.add.text(W - 22, H - 22, "BRICOLAGE · GEIST", TEXT_PRESETS.hint).setOrigin(1, 1);

    this.add.text(W / 2, H * 0.18, "/ JORNADA GAMEDEV", { ...TEXT_PRESETS.monoLabel, color: COLORS.muted }).setOrigin(0.5);
    this.add.text(W / 2, H * 0.32, "FLAPPY", TEXT_PRESETS.heroOutline).setOrigin(0.5).setFontSize(getResponsiveTextSize(this, "hero"));
    this.add.text(W / 2, H * 0.42, "um botão · gravidade · canos infinitos", TEXT_PRESETS.body).setOrigin(0.5);

    this.drawDecoration();

    this.add.text(W / 2, H * 0.78, "ESPAÇO ou CLIQUE pra dar flap", { ...TEXT_PRESETS.body, fontSize: "14px" }).setOrigin(0.5);
    this.add.text(W / 2, H * 0.78 + 22, "passe pelos canos · não toque no chão nem no teto", { ...TEXT_PRESETS.body, fontSize: "14px" }).setOrigin(0.5);

    this.add.text(W / 2, H - 56, "ESPAÇO OU ENTER PRA COMEÇAR · K SCREENSHOT", TEXT_PRESETS.hint).setOrigin(0.5);

    const kb = this.input.keyboard!;
    this.keys = {
      SPACE: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      ENTER: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
      K: kb.addKey(Phaser.Input.Keyboard.KeyCodes.K),
    };
    kb.on("keydown", unlockAudio);
    this.input.on("pointerdown", () => { unlockAudio(); this.scene.start("game"); });
  }

  // Cena decorativa: passarinho laranja no meio + 2 silhuetas de canos atrás.
  private drawDecoration() {
    const W = this.scale.width;
    const H = this.scale.height;
    const cy = H * 0.6;

    // Canos atrás (silhuetas sutis pra dar contexto sem competir com hero text)
    const pipeColor = COLOR_HEX.bgSoft;
    const pipeStroke = COLOR_HEX.border;
    const drawPipe = (x: number, gapTop: number, gapBottom: number) => {
      const top = this.add.rectangle(x, gapTop / 2, 56, gapTop, pipeColor).setOrigin(0.5, 0.5);
      top.setStrokeStyle(1, pipeStroke, 1);
      const bottomH = H - gapBottom;
      const bot = this.add.rectangle(x, gapBottom + bottomH / 2, 56, bottomH, pipeColor).setOrigin(0.5, 0.5);
      bot.setStrokeStyle(1, pipeStroke, 1);
    };
    drawPipe(W * 0.22, cy - 90, cy + 90);
    drawPipe(W * 0.78, cy - 60, cy + 60);

    // Passarinho (quadradinho laranja com olho)
    const bird = this.add.rectangle(W / 2, cy, 28, 22, COLOR_HEX.accent);
    bird.setStrokeStyle(1, COLOR_HEX.fg, 0.5);
    this.add.circle(W / 2 + 6, cy - 4, 2, COLOR_HEX.fg);
    // Asa visual (linha angulada)
    this.add.rectangle(W / 2 - 8, cy + 2, 8, 3, COLOR_HEX.fg).setRotation(-0.25).setAlpha(0.6);

    this.tweens.add({
      targets: bird,
      y: cy - 8,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  update() {
    const justDown = Phaser.Input.Keyboard.JustDown;
    if (justDown(this.keys.K)) takeScreenshot(this.game, "gamedev-08-flappy-menu");
    if (justDown(this.keys.SPACE) || justDown(this.keys.ENTER)) this.scene.start("game");
  }

  private loadBest(): number {
    try {
      const raw = localStorage.getItem(HIGHSCORE_KEY);
      const n = raw ? parseInt(raw, 10) : 0;
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch { return 0; }
  }
}

export { HIGHSCORE_KEY };
