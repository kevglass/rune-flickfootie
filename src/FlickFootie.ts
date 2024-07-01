import { graphics, physics, sound } from "toglib";
import {
    GameState,
    GameUpdate,
    Team,
    inputDelay,
    targetScreenHeight,
    targetScreenWidth,
} from "./logic";
import { ASSETS } from "./lib/assets";
import { PlayerId } from "dusk-games-sdk";

/**
 * Flick Footie uses the TOGL pucks table as a football field. Flick your player to get the ball
 * into the goal.
 */
export class FlickFootie implements graphics.Game {
    /** The current state of the game received from Rune SDK */
    game?: GameState;
    /** The amount fo scaling we're applying - this is calculated in the render loop */
    scale = 1;

    /** A white circle that lets us draw dots quickly */
    whiteCircle: graphics.GameImage;
    /** The background image of the pitch in portrait */
    bg: graphics.GameImage;
    /** The background image of the pitch in landscape */
    bgl: graphics.GameImage;
    /** The image used for the ball */
    ball: graphics.GameImage;
    /** The image used for team 1's players - blue - thanks Kenney! */
    team1: graphics.GameImage;
    /** The image used for team 2's players - red - thanks Kenney! */
    team2: graphics.GameImage;
    /** The partial ring that spins round players ready to be moved */
    spinRing: graphics.GameImage;
    /** Image for the drag hand */
    tap: graphics.GameImage;

    /** The smaller font used for most text */
    font: graphics.GameFont;
    /** The larger font use for celebrations */
    bigFont: graphics.GameFont;
    /** The number of frames that have been rendered, used for simply animations */
    frameCount = 0;
    /** The horizontal offset the table is being rendered at - based on keeping the aspect ratio but filling the screen */
    offsetX = 0;
    /** The vertical offset the table is being rendered at - based on keeping the aspect ratio but filling the screen */
    offsetY = 0;
    /** True if the game is being played in landscape */
    landscape = false;

    /** The mouse x-coordinate in physics world coordinates */
    mx = 0;
    /** The mouse y-coordinate in physics world coordinates */
    my = 0;
    /** The ID of the local player */
    localPlayerId?: PlayerId;
    /** The puck if any is currently being dragged */
    draggingPuck?: physics.Puck;
    /** The x element of a unit vector in the direction of the drag */
    dragX = 0;
    /** The y element of a unit vector in the direction of the drag */
    dragY = 0;
    /** The power of the drag (length of drag scaled) to be applied */
    dragPower = 0;

    /** The shaped text holder at the bottom of the screen */
    bottomBar: graphics.GameImage;
    /** The shaped text holder at the top of the screen */
    topBar: graphics.GameImage;

    /** Set to the team that scored if we're currently celebrating a goal */
    goalScored?: Team;
    /** Set to the winning team if we're currently celebrating the end of the game  */
    gameOver?: Team;

    /** The sound played when a goal is scored */
    sfxGoal: sound.Sound;
    /** The sound played when two players hit */
    sfxHit: sound.Sound;
    /** The sound played when the ball is hit */
    sfxBall: sound.Sound;
    /** The sound played at the start of a round */
    sfxWhistle: sound.Sound;

    /** If its the first shot then show the little hand helping to understand how to play */
    firstShot = true;
    
    constructor() {
        // we're going to use the WebGL renderer with 5 pixels of texture padding
        // to prevent artifacts 
        graphics.init(graphics.RendererType.WEBGL, false, undefined, 5);

        // load all the images
        this.whiteCircle = graphics.loadImage(ASSETS["whitecircle.png"]);
        this.bg = graphics.loadImage(ASSETS["bg.png"]);
        this.bgl = graphics.loadImage(ASSETS["bgl.png"]);
        this.ball = graphics.loadImage(ASSETS["ball.png"]);
        this.team1 = graphics.loadImage(ASSETS["team1.png"]);
        this.team2 = graphics.loadImage(ASSETS["team2.png"]);
        this.bottomBar = graphics.loadImage(ASSETS["bottom-bar.png"]);
        this.topBar = graphics.loadImage(ASSETS["top-bar.png"]);
        this.spinRing = graphics.loadImage(ASSETS["spinring.png"]);
        this.tap = graphics.loadImage(ASSETS["tap.png"]);
        this.font = graphics.generateFont(16, "white");
        this.bigFont = graphics.generateFont(50, "white");

        // load all the sounds
        this.sfxGoal = sound.loadSound(ASSETS["goal.mp3"]);
        this.sfxHit = sound.loadSound(ASSETS["hit.mp3"]);
        this.sfxBall = sound.loadSound(ASSETS["ball.mp3"]);
        this.sfxWhistle = sound.loadSound(ASSETS["whistle.mp3"]);
    }

    start(): void {
        // kick off the TOGL rendering loop
        graphics.startRendering(this);
    }

    /**
     * Callback from Rune with the game state
     * 
     * @param update The latest game update
     */
    gameUpdate(update: GameUpdate): void {
        this.game = update.game;
        this.localPlayerId = update.yourPlayerId;

        // only set when the game has just started, this copes with 
        // restarting the game - we clear up the client state when
        // the game has started
        if (update.game.gameStart) {
            this.goalScored = undefined;
            this.gameOver = undefined;
            setTimeout(() => { sound.playSound(this.sfxWhistle) }, 100);
        }

        // process notifications from the game logic
        for (const event of update.game.gameEvents) {
            // the ball collided with something
            if (event.type === "ball") {
                sound.playSound(this.sfxBall);
            }
            // the players collided with each other
            if (event.type === "players") {
                sound.playSound(this.sfxHit);
            }
            // a goal was scored
            if (event.type === "goal") {
                sound.playSound(this.sfxGoal);
                this.goalScored = event.team;
            }
            // the game finished
            if (event.type === "gameOver") {
                this.gameOver = event.winner;
            }
            // the pitch was reset to start the next round
            if (event.type === "reset") {
                sound.playSound(this.sfxWhistle);
                this.goalScored = undefined;
            }
        }
    }

    /**
     * Convert the screen coordinates provided into physics world coordinates
     * based on the scaling in the rendering 
     * 
     * @param x The x coordinate on the screen
     * @param y The y coordinate on the screen
     * @returns The coordinates of the equivalent point in the game world
     */
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

        // if we're playing as the blue team the world is flipped
        if (this.myTeam() === Team.BLUE) {
            y = targetScreenHeight - y;
        }
        return { x, y }
    }

    mouseDown(px: number, py: number): void {
        // if we're currently showing a celebration don't let the players
        // do anything
        const ready = !this.gameOver && !this.goalScored;
        if (!ready) {
            return;
        }

        // get the physics world coordinates
        const { x, y } = this.toWorldCoordinates(px, py);
        this.mx = x;
        this.my = y;

        // if we're able to drag a player at this stage then check it's our go
        if (this.game && this.game.atRest && this.game.whoseTurn === this.myTeam()) {
            // find the player thats close enough where the mouse/finger has gone down
            const puck = this.game.table.pucks.find(p => {
                const dx = Math.abs(this.mx - p.position.x);
                const dy = Math.abs(this.my - p.position.y);

                return (dx * dx) + (dy * dy) < p.radius * p.radius * 2;
            });

            // make sure the puck is on our team, if it is start the dragging process
            if (puck && puck.data?.team === this.myTeam()) {
                this.draggingPuck = puck;
                this.dragX = this.mx - this.draggingPuck.position.x;
                this.dragY = this.my - this.draggingPuck.position.y;
                // get the drag force and the unit vector for direction
                this.dragPower = Math.sqrt((this.dragX * this.dragX) + (this.dragY * this.dragY));
                this.dragX /= this.dragPower;
                this.dragY /= this.dragPower;
            }
        }

        // maximum drag power is 140
        this.dragPower = Math.min(140, this.dragPower);
    }

    mouseDrag(px: number, py: number): void {
        // get the physics world coordinates
        const { x, y } = this.toWorldCoordinates(px, py);
        this.mx = x;
        this.my = y;

        if (this.draggingPuck) {
            // the player has dragged a bit more so adjust our force and direction
            this.dragX = this.mx - this.draggingPuck.position.x;
            this.dragY = this.my - this.draggingPuck.position.y;
            this.dragPower = Math.sqrt((this.dragX * this.dragX) + (this.dragY * this.dragY));
            this.dragX /= this.dragPower;
            this.dragY /= this.dragPower;
        }

        // maximum drag power is 140
        this.dragPower = Math.min(140, this.dragPower);
    }

    mouseUp(): void {
        // maximum drag power is 140
        this.dragPower = Math.min(140, this.dragPower);

        // if we're dragging out the player, then do the release
        // and shoot the puck
        if (this.draggingPuck) {
            // note if we're close to the original puck, then just clear the puck
            if (this.dragPower > 10 && this.game) {
                this.firstShot = false;
                Dusk.actions.shoot({
                    puckId: this.draggingPuck.id,
                    dx: -this.dragX,
                    dy: -this.dragY,
                    power: this.dragPower * 3,
                });
            }

            // we have a delay between letting go and firing the puck
            // to allow for some network latency. Don't clear the puck
            // selected until after the delay to prevent artifacts in rendering
            // during the input delay
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

    /**
     * Retrieve the team this player is on
     * 
     * @returns The team this player is on
     */
    myTeam(): Team {
        return this.game?.playerTeams[this.localPlayerId ?? ""] ?? Team.NONE;
    }

    /**
     * Notification that all resources have been loaded. Once the load is complete
     * we can tell Rune to start the game
     */
    resourcesLoaded(): void {
        // initialise the Rune SDK and register the callback to get
        // game updates
        Dusk.initClient({
            onChange: (update) => {
                this.gameUpdate(update);
            },
        });
    }

    render(): void {
        // only render half the frames - makes it reasonable to run on low end Android
        // devices
        this.frameCount++;
        if (this.frameCount % 2 === 0) {
            return;
        }

        graphics.fillRect(0, 0, graphics.width(), graphics.height(), "#dbd882");

        // consider anything where width is greater than height as landscape
        this.landscape = graphics.width() > graphics.height();

        // determine the best scale for the game world so we get the best
        // size on screen while not overlapping the edges
        const targetWidth = this.landscape ? targetScreenHeight : targetScreenWidth;
        const targetHeight = this.landscape ? targetScreenWidth : targetScreenHeight;
        this.scale = graphics.width() / targetWidth;
        if (targetHeight * this.scale > graphics.height()) {
            this.scale = graphics.height() / targetHeight;
        }
        this.scale *= 0.9;

        // center the world in the game screen
        const actualScreenWidth = this.scale * targetWidth;
        const actualScreenHeight = this.scale * targetHeight;
        this.offsetX = Math.floor((graphics.width() - actualScreenWidth) / 2);
        this.offsetY = Math.floor((graphics.height() - actualScreenHeight) / 2);

        graphics.push();
        graphics.translate(this.offsetX, this.offsetY);
        graphics.scale(this.scale, this.scale);

        // draw the background
        if (this.landscape) {
            graphics.drawImage(this.bgl, -50, -50, targetScreenHeight + 100, targetScreenWidth + 100);
        } else {
            graphics.drawImage(this.bg, -50, -50, targetScreenWidth + 100, targetScreenHeight + 100);
        }

        // we're only ready to take a shot if we're not celebrating and we're not waiting
        // for a shot to apply
        const ready = !this.gameOver && !this.goalScored && !this.game?.pendingShot;

        if (this.game) {
            const goalSize = Math.floor(targetScreenWidth / 6);
            const middle = Math.floor(targetScreenWidth / 2);
            graphics.alpha(0.35);
            graphics.fillRect(middle-goalSize, 32, (goalSize * 2), 20, this.myTeam() === Team.BLUE ? this.getTeamColour(Team.RED) : this.getTeamColour(Team.BLUE));
            graphics.fillRect(middle-goalSize, 58 + this.game?.table.height, (goalSize * 2), 20, this.myTeam() === Team.BLUE ? this.getTeamColour(Team.BLUE) : this.getTeamColour(Team.RED));
            graphics.alpha(1);

            let drawingDrag = false;

            // if we're currently dragging a puck away to shoot it and we've not already let it 
            // go and its actually our turn then draw the drag markers
            if (((this.draggingPuck && ready) || (this.game.pendingShot && this.game.whoseTurn !== this.myTeam()))) {
                const puck = this.draggingPuck ?? this.game.table.pucks.find(p => p.id === this.game?.pendingShot?.id);
                if (puck) {
                    drawingDrag = true;
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
                        scaleBack = Math.max(0, (this.game.pendingShot.fireAt - Dusk.gameTime()) / inputDelay);
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

            // puck to draw from
            const firstPucks = [5, 10];

            // draw the game world, cycle through the pucks 
            // drawing them with the graphics based on their data 
            for (const puck of this.game.table.pucks) {
                let puckX = Math.floor(puck.position.x)
                let puckY = Math.floor(this.myTeam() === Team.BLUE ? targetScreenHeight - puck.position.y : puck.position.y);
                if (this.landscape) {
                    const t = puckX;
                    puckX = puckY;
                    puckY = t;
                }

                // if we're ready to shoot and we're drawing our pucks then draw a spinning 
                // circle around them to indicate to the player they should drag
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

                // draw the actual puck
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
                    
                if (this.firstShot && !drawingDrag && puck.data?.team === this.myTeam() && this.game.whoseTurn === this.myTeam() && ready && this.game.atRest) {
                    if (firstPucks.includes(puck.id)) {
                        const xo = (1 - Math.sin((this.frameCount * 0.02) % Math.PI)) * -50;
                        const yo = (1 - Math.sin((this.frameCount * 0.02) % Math.PI)) * 30;
                
                        graphics.drawImage(this.tap, puckX + xo, puckY + yo)
                    }
                }
            }

            graphics.pop();

            // draw out whose turn it is at the moment
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

            // draw the game scores
            graphics.drawImage(this.topBar, -this.topBar.width + 40, 0, this.topBar.width, this.topBar.height, this.getTeamColour(Team.RED));
            graphics.drawText(Math.floor((30 - graphics.textWidth(this.game.scores[Team.RED] + "", this.font)) / 2), 18, this.game.scores[Team.RED] + "", this.font);
            graphics.drawImage(this.topBar, graphics.width() - 40, 0, this.topBar.width, this.topBar.height, this.getTeamColour(Team.BLUE));
            graphics.drawText(graphics.width() - 30 + Math.floor((30 - graphics.textWidth(this.game.scores[Team.BLUE] + "", this.font)) / 2), 18, this.game.scores[Team.BLUE] + "", this.font);


            // If the game is over, show the result
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
            // If a goal has just been scored, then show the celebration
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
        } else {
            graphics.pop();
        }

    }

    getTeamName(team: Team): string {
        return (team === Team.RED) ? "Red" : "Blue";
    }

    getTeamColour(team: Team): string {
        return (team === Team.RED) ? "#e86a17" : "#419fdd";
    }
}
