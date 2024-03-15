import { graphics, physics } from "togl";
import {
    GameState,
    GameUpdate,
    Team,
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

    constructor() {
        graphics.init(graphics.RendererType.WEBGL, false, undefined, 5);

        this.whiteCircle = graphics.loadImage(ASSETS["whitecircle.png"]);
        this.bg = graphics.loadImage(ASSETS["bg.png"]);
        this.bgl = graphics.loadImage(ASSETS["bgl.png"]);
        this.ball = graphics.loadImage(ASSETS["ball.png"]);
        this.team1 = graphics.loadImage(ASSETS["team1.png"]);
        this.team2 = graphics.loadImage(ASSETS["team2.png"]);
        this.spinRing = graphics.loadImage(ASSETS["spinring.png"]);
        this.font = graphics.generateFont(20, "white");
    }

    start(): void {
        graphics.startRendering(this);
    }

    gameUpdate(update: GameUpdate): void {
        this.game = update.game;
        this.localPlayerId = update.yourPlayerId;
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
            this.draggingPuck = undefined;
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
        if (this.game) {
            if (this.draggingPuck) {
                const puck = this.draggingPuck;
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
                graphics.push();
                graphics.translate(puckX, puckY);
                graphics.rotate(this.landscape ? Math.atan2(dragX, -dragY) : Math.atan2(-dragY, dragX));
                graphics.fillRect(0, 0, this.dragPower, 5, "rgba(255,255,255,0.5)");
                graphics.fillRect(this.dragPower, -10, 5, 20, "white");

                for (let i=0;i<8;i++) {
                    graphics.drawImage(this.whiteCircle, -5 - (i * this.dragPower / 3), -5, 10, 10);
                }
                graphics.pop();
            }
            for (const puck of this.game.table.pucks) {
                let puckX = Math.floor(puck.position.x)
                let puckY = Math.floor(this.myTeam() === Team.BLUE ? targetScreenHeight - puck.position.y : puck.position.y);
                if (this.landscape) {
                    const t = puckX;
                    puckX = puckY;
                    puckY = t;
                }

                if (this.game.atRest && puck.data?.team === this.game.whoseTurn && this.game.whoseTurn === this.myTeam() && !this.draggingPuck) {
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
                graphics.rotate((this.myTeam() === Team.BLUE ? Math.PI : 0) + (this.landscape ? -Math.PI/2 : 0));
                graphics.drawImage(
                    puck.data?.team === Team.BLUE ? this.team1 : puck.data?.team === Team.RED ? this.team2 : this.ball,
                    -puck.radius,
                    -puck.radius,
                    puck.radius * 2,
                    puck.radius * 2
                );
                graphics.pop();
            }

        }

        // let puckX = Math.floor(this.mx)
        // let puckY = Math.floor(this.myTeam() === Team.BLUE ? targetScreenHeight - this.my : this.my);
        // if (this.landscape) {
        //     const t = puckX;
        //     puckX = puckY;
        //     puckY = t;
        // }
        // graphics.drawImage(this.whiteCircle, puckX-10,puckY-10,20,20);

        graphics.pop();

        // graphics.fillRect(5, 5, 70, 50, "black");
        // graphics.drawText(10, 30, "" + graphics.getFPS(), this.font, "white");
        // graphics.drawText(10, 50, "" + this.game?.table.atRest, this.font, "white");
    }
}
