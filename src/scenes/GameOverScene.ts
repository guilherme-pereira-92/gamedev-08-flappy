// Placeholder: GameOverScene fica integrado dentro de GameScene via overlay.
// Mantido como cena vazia pra cumprir o contrato de import em main.ts e
// permitir futura separação se a complexidade do overlay crescer.
import Phaser from "phaser";

export class GameOverScene extends Phaser.Scene {
  constructor() { super("gameover"); }
  create() { this.scene.start("menu"); }
}
