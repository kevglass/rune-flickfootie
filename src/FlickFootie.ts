import { graphics, physics, sound } from "togl";
import {
    GameState,
    GameUpdate,
    Team,
    inputDelay,
    targetScreenHeight,
    targetScreenWidth,
} from "./logic";
import { ASSETS } from "./lib/assets";
import { PlayerId } from "rune-games-sdk";

export class FlickFootie implements graphics.Game {
    game?: GameState;
    scale = 1;

    whiteCircle: graphics.GameImage;
    bg: graphics.GameImage;
    bgl: graphics.GameImage;
    ball: graphics.GameImage;
    team1: graphics.GameImage;
    team2: graphics.GameImage;
    spinRing: graphics.GameImage;

    font: graphics.GameFont;
    bigFont: graphics.GameFont;
    frameCount = 0;
    offsetX = 0;
    offsetY = 0;
    landscape = false;

    mx = 0;
    my = 0;
    localPlayerId?: PlayerId;
    draggingPuck?: physics.Puck;
    dragX = 0;
    dragY = 0;
    dragPower = 0;

    bottomBar: graphics.GameImage;
    topBar: graphics.GameImage;

    goalScored?: Team;
    gameOver?: Team;

    sfxGoal: sound.Sound;
    sfxHit: sound.Sound;
    sfxBall: sound.Sound;
    sfxWhistle: sound.Sound;

    constructor() {
        graphics.init(graphics.RendererType.WEBGL, false, undefined, 5);

        this.whiteCircle = graphics.loadImage(ASSETS["whitecircle.png"]);
        this.bg = graphics.loadImage(ASSETS["bg.png"]);
        this.bgl = graphics.loadImage(ASSETS["bgl.png"]);
        this.ball = graphics.loadImage(ASSETS["ball.png"]);
        this.team1 = graphics.loadImage(ASSETS["team1.png"]);
        this.team2 = graphics.loadImage(ASSETS["team2.png"]);
        this.bottomBar = graphics.loadImage(ASSETS["bottom-bar.png"]);
        this.topBar = graphics.loadImage(ASSETS["top-bar.png"]);
        this.spinRing = graphics.loadImage(ASSETS["spinring.png"]);
        this.font = graphics.generateFont(16, "white");
        this.bigFont = graphics.generateFont(50, "white");

        this.sfxGoal = sound.loadSound(ASSETS["goal.mp3"]);
        this.sfxHit = sound.loadSound(ASSETS["hit.mp3"]);
        this.sfxBall = sound.loadSound(ASSETS["ball.mp3"]);
        this.sfxWhistle = sound.loadSound(ASSETS["whistle.mp3"]);
    }

    start(): void {
        graphics.startRendering(this);
    }

    gameUpdate(update: GameUpdate): void {
        this.game = update.game;
        this.localPlayerId = update.yourPlayerId;

        if (update.game.gameStart) {
            this.goalScored = undefined;
            this.gameOver = undefined;
            setTimeout(() => { sound.playSound(this.sfxWhistle) }, 100);
        }
        for (const event of update.game.gameEvents) {
            if (event.type === "ball") {
                sound.playSound(this.sfxBall);
            }
            if (event.type === "players") {
                sound.playSound(this.sfxHit);
            }
            if (event.type === "goal") {
                sound.playSound(this.sfxGoal);
                this.goalScored = event.team;
            }
            if (event.type === "gameOver") {
                this.gameOver = event.winner;
            }
            if (event.type === "reset") {
                sound.playSound(this.sfxWhistle);
                this.goalScored = undefined;
            }
        }
    }

    toWorldCoordinates(x: number, y: number): { x: number, y: number } {
        if (this.landscape) {
            const t = x;
            x = y;
            y = t;
            x -= this.offsetY;
            y -= this.offsetX;
        } else {
            x -= this.offsetX;
            y -= this.offsetY;
        }
        x /= this.scale;
        y /= this.scale;
        // if (this.landscape) {
        //     x += targetScreenWidth;
        // }

        if (this.myTeam() === Team.BLUE) {
            y = targetScreenHeight - y;
        }
        return { x, y }
    }

    mouseDown(px: number, py: number): void {
        const ready = !this.gameOver && !this.goalScored;
        if (!ready) {
            return;
        }

        const { x, y } = this.toWorldCoordinates(px, py);
        this.mx = x;
        this.my = y;

        if (this.game && this.game.atRest && this.game.whoseTurn === this.myTeam()) {
            const puck = this.game.table.pucks.find(p => {
                const dx = Math.abs(this.mx - p.position.x);
                const dy = Math.abs(this.my - p.position.y);

                return (dx * dx) + (dy * dy) < p.radius * p.radius * 2;
            });

            if (puck && puck.data?.team === this.myTeam()) {
                this.draggingPuck = puck;
                this.dragX = this.mx - this.draggingPuck.position.x;
                this.dragY = this.my - this.draggingPuck.position.y;
                this.dragPower = Math.sqrt((this.dragX * this.dragX) + (this.dragY * this.dragY));
                this.dragX /= this.dragPower;
                this.dragY /= this.dragPower;
            }
        }
        this.dragPower = Math.min(140, this.dragPower);
    }

    mouseDrag(px: number, py: number): void {
        const { x, y } = this.toWorldCoordinates(px, py);
        this.mx = x;
        this.my = y;

        if (this.draggingPuck) {
            this.dragX = this.mx - this.draggingPuck.position.x;
            this.dragY = this.my - this.draggingPuck.position.y;
            this.dragPower = Math.sqrt((this.dragX * this.dragX) + (this.dragY * this.dragY));
            this.dragX /= this.dragPower;
            this.dragY /= this.dragPower;
        }

        this.dragPower = Math.min(140, this.dragPower);
    }

    mouseUp(): void {
        this.dragPower = Math.min(140, this.dragPower);

        if (this.draggingPuck) {
            if (this.dragPower > 10 && this.game) {
                Rune.actions.shoot({
                    puckId: this.draggingPuck.id,
                    dx: -this.dragX,
                    dy: -this.dragY,
                    power: this.dragPower * 3,
                });
            }

            setTimeout(() => {
                this.draggingPuck = undefined;
            }, inputDelay);
        }
    }

    keyDown(): void {
        // do nothing
    }

    keyUp(): void {
        // do nothing
    }

    myTeam(): Team {
        return this.game?.playerTeams[this.localPlayerId ?? ""] ?? Team.NONE;
    }

    resourcesLoaded(): void {
        Rune.initClient({
            onChange: (update) => {
                this.gameUpdate(update);
            },
        });
    }

    render(): void {
        this.frameCount++;
        if (this.frameCount % 2 === 0) {
            return;
        }

        graphics.fillRect(0, 0, graphics.width(), graphics.height(), "#333");

        this.landscape = graphics.width() > graphics.height();

        const targetWidth = this.landscape ? targetScreenHeight : targetScreenWidth;
        const targetHeight = this.landscape ? targetScreenWidth : targetScreenHeight;
        this.scale = graphics.width() / targetWidth;
        if (targetHeight * this.scale > graphics.height()) {
            this.scale = graphics.height() / targetHeight;
        }
        const actualScreenWidth = this.scale * targetWidth;
        const actualScreenHeight = this.scale * targetHeight;
        this.offsetX = Math.floor((graphics.width() - actualScreenWidth) / 2);
        this.offsetY = Math.floor((graphics.height() - actualScreenHeight) / 2);

        graphics.push();
        graphics.translate(this.offsetX, this.offsetY);
        graphics.scale(this.scale, this.scale);
        if (this.landscape) {
            graphics.drawImage(this.bgl, -50, -50, targetScreenHeight + 100, targetScreenWidth + 100);
        } else {
            graphics.drawImage(this.bg, -50, -50, targetScreenWidth + 100, targetScreenHeight + 100);
        }

        const ready = !this.gameOver && !this.goalScored && !this.game?.pendingShot;

        if (this.game) {
            if (((this.draggingPuck && ready) || (this.game.pendingShot && this.game.whoseTurn !== this.myTeam()))) {
                const puck = this.draggingPuck ?? this.game.table.pucks.find(p => p.id === this.game?.pendingShot?.id);
                if (puck) {
                    let puckX = Math.floor(puck.position.x)
                    let puckY = Math.floor(this.myTeam() === Team.BLUE ? targetScreenHeight - puck.position.y : puck.position.y);
                    if (this.landscape) {
                        const t = puckX;
                        puckX = puckY;
                        puckY = t;
                    }
                    const dragX = this.dragX;
                    let dragY = -this.dragY;
                    if (this.myTeam() === Team.BLUE) {
                        dragY = -dragY;
                    }

                    let scaleBack = 1;
                    if (this.game.pendingShot) {
                        scaleBack = Math.max(0, (this.game.pendingShot.fireAt - Rune.gameTime()) / inputDelay);
                    }
                    graphics.push();
                    graphics.translate(puckX, puckY);
                    graphics.rotate(this.landscape ? Math.atan2(dragX, -dragY) : Math.atan2(-dragY, dragX));
                    graphics.fillRect(0, 0, this.dragPower * scaleBack, 5, "rgba(255,255,255,0.5)");
                    graphics.fillRect((this.dragPower - 2) * scaleBack, -10, 5, 25, "white");

                    if (!this.game.pendingShot) {
                        for (let i = 0; i < 8; i++) {
                            graphics.drawImage(this.whiteCircle, -5 - (i * this.dragPower / 3), -5, 10, 10);
                        }
                    }
                    graphics.pop();
                }
            }
            for (const puck of this.game.table.pucks) {
                let puckX = Math.floor(puck.position.x)
                let puckY = Math.floor(this.myTeam() === Team.BLUE ? targetScreenHeight - puck.position.y : puck.position.y);
                if (this.landscape) {
                    const t = puckX;
                    puckX = puckY;
                    puckY = t;
                }

                if (ready && this.game.atRest && puck.data?.team === this.game.whoseTurn && this.game.whoseTurn === this.myTeam() && !this.draggingPuck) {
                    const radius = puck.radius + 7;

                    graphics.push();
                    graphics.translate(puckX, puckY);
                    graphics.rotate(this.frameCount * 0.025);
                    graphics.drawImage(
                        this.spinRing,
                        - radius,
                        - radius,
                        radius * 2,
                        radius * 2
                    );
                    graphics.pop();
                }

                graphics.push();
                graphics.translate(puckX, puckY);
                graphics.rotate((this.myTeam() === Team.BLUE ? Math.PI : 0) + (this.landscape ? -Math.PI / 2 : 0));
                graphics.drawImage(
                    puck.data?.team === Team.BLUE ? this.team1 : puck.data?.team === Team.RED ? this.team2 : this.ball,
                    -puck.radius,
                    -puck.radius,
                    puck.radius * 2,
                    puck.radius * 2
                );
                graphics.pop();
            }

            graphics.pop();

            if (this.game.atRest && !this.draggingPuck && ready) {
                if (this.game.whoseTurn === this.myTeam()) {
                    const msg = "Your Turn";
                    graphics.drawImage(this.bottomBar, Math.floor((graphics.width() - this.bottomBar.width) / 2), graphics.height() - this.bottomBar.height, this.bottomBar.width, this.bottomBar.height, this.getTeamColour(this.myTeam()));
                    graphics.drawText(Math.floor((graphics.width() - graphics.textWidth(msg, this.font)) / 2), graphics.height() - 4, msg, this.font);
                } else {
                    const msg = this.getTeamName(this.game.whoseTurn) + " Turn";
                    graphics.drawImage(this.topBar, Math.floor((graphics.width() - this.topBar.width) / 2), 0, this.topBar.width, this.topBar.height, this.getTeamColour(this.game.whoseTurn));
                    graphics.drawText(Math.floor((graphics.width() - graphics.textWidth(msg, this.font)) / 2), 18, msg, this.font);
                }
            }

            graphics.drawImage(this.topBar, -this.topBar.width + 40, 0, this.topBar.width, this.topBar.height, this.getTeamColour(Team.RED));
            graphics.drawText(Math.floor((30 - graphics.textWidth(this.game.scores[Team.RED] + "", this.font)) / 2), 18, this.game.scores[Team.RED] + "", this.font);
            graphics.drawImage(this.topBar, graphics.width() - 40, 0, this.topBar.width, this.topBar.height, this.getTeamColour(Team.BLUE));
            graphics.drawText(graphics.width() - 30 + Math.floor((30 - graphics.textWidth(this.game.scores[Team.BLUE] + "", this.font)) / 2), 18, this.game.scores[Team.BLUE] + "", this.font);


            if (this.gameOver) {
                graphics.fillRect(0, Math.floor(graphics.height() / 2) - 50, graphics.width(), 100, "rgba(0,0,0,0.7)");
                const col = this.getTeamColour(this.gameOver);
                const steps = 11;
                const step = Math.floor(graphics.width() / steps);
                for (let i = 0; i < steps; i += 2) {
                    graphics.fillRect(i * (step), Math.floor(graphics.height() / 2) - 46, step, 10, col);
                    graphics.fillRect(i * (step), Math.floor(graphics.height() / 2) + 36, step, 10, col);
                }

                const snippet = this.gameOver === this.myTeam() ? "YOU WIN!" : this.getTeamName(this.gameOver).toUpperCase() + " WINS!";
                graphics.drawText(Math.floor((graphics.width() - graphics.textWidth(snippet, this.bigFont)) / 2), Math.floor(graphics.height() / 2) + 18, snippet, this.bigFont, col);
            } else if (this.goalScored) {
                graphics.fillRect(0, Math.floor(graphics.height() / 2) - 50, graphics.width(), 100, "rgba(0,0,0,0.7)");
                const col = this.getTeamColour(this.goalScored);
                const steps = 11;
                const step = Math.floor(graphics.width() / steps);
                for (let i = 0; i < steps; i += 2) {
                    graphics.fillRect(i * (step), Math.floor(graphics.height() / 2) - 46, step, 10, col);
                    graphics.fillRect(i * (step), Math.floor(graphics.height() / 2) + 36, step, 10, col);
                }

                const snippet = "GOAL!!! ";
                const textSize = graphics.textWidth(snippet, this.bigFont);
                for (let i = 0; i < 5; i++) {
                    graphics.drawText((i * textSize) - ((this.frameCount * 2) % textSize), Math.floor(graphics.height() / 2) + 18, snippet, this.bigFont);
                }
            }
        }
    }

    getTeamName(team: Team): string {
        return (team === Team.RED) ? "Red" : "Blue";
    }

    getTeamColour(team: Team): string {
        return (team === Team.RED) ? "#e86a17" : "#419fdd";
    }
}
