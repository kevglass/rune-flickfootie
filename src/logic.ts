import type { OnChangeAction, OnChangeEvent, PlayerId, Players, RuneClient } from "rune-games-sdk/multiplayer"
import { physics } from "toglib/logic";

// The delay between let go of the drag and actually apply the change in ms. This
// absorbs some of the network delay
export const inputDelay = 150;
// The number of goals we're playing to (first to 3!)
export const firstTo = 3;

// these are the sizes we're trying to get the screen to be to match
// the table. If the screen is bigger or smaller the renderer will scale
// context to match and center it
export const targetScreenWidth = 480;
export const targetScreenHeight = 800;

// events that the game logic can fire back to the client for rendering
// all sound effects
export type GameEvent = GoalEvent | BallHit | PlayersHit | Reset | GameOver

// A goal has been scored
export type GoalEvent = {
  type: "goal",
  team: Team
}

// The ball bounced off something
export type BallHit = {
  type: "ball"
}

// Players hit each other
export type PlayersHit = {
  type: "players"
}

// The pitch has been reset for the next round
export type Reset = {
  type: "reset"
}

// The game is complete
export type GameOver = {
  type: "gameOver",
  winner: Team
}

// The game state that is synchronized via
// Rune
export interface GameState {
  // True if the game has just started
  gameStart: boolean;
  // The TOGL physics puck table that we're using
  table: physics.Table;
  // Which team is currently taking a shot
  whoseTurn: Team;
  // True if all the pucks at still
  atRest: boolean;
  // The team that each player is on
  playerTeams: Record<PlayerId, Team>;
  // The player playing for each team
  teamToPlayer: Record<Team, PlayerId>;
  // The puck ID in the physics world of the ball
  ballId: number;
  // The game events that were fired last frame
  gameEvents: GameEvent[];
  // The time at which the game should reset (in Rune.gameTime())
  resetAt: number;
  // The current score for each team
  scores: Record<Team, number>;
  // True if the game is completed
  gameOver: boolean;
  // The shot thats about to be applied. Only there for inputDelay milliseconds
  pendingShot?: Shot;
  // When we should notify Rune the game is over - give us some time to show the ending screen
  apiGameOverAt: number;
  // The status of who won and lost the game for Rune's GameOver call
  gameOverResults: Record<PlayerId, "WON" | "LOST">;
}

// A show thats about to be applied
export type Shot = {
  // the ID of the puck that will be hit
  id: number;
  // the x component of the velocity to apply
  x: number;
  // the y component of the velocity to apply
  y: number;
  // The time at which this shot should be applied (fired)
  fireAt: number;
}

// The teams in game
export enum Team {
  BLUE = 1,
  RED = 2,
  NONE = 0
}

// Quick type so I can pass the complex object that is the 
// Rune onChange blob around without ugliness. 
export type GameUpdate = {
  game: GameState;
  action?: OnChangeAction<GameActions>;
  event?: OnChangeEvent;
  yourPlayerId: PlayerId | undefined;
  players: Players;
  rollbacks: OnChangeAction<GameActions>[];
  previousGame: GameState;
  futureGame?: GameState;
};

type GameActions = {
  // shoot a puck on your turn
  shoot: (params: { puckId: number, dx: number, dy: number, power: number }) => void
}

declare global {
  const Rune: RuneClient<GameState, GameActions>
}

// Quick utility to flip the team
export function otherTeam(team: Team): Team {
  return team === Team.RED ? Team.BLUE : Team.RED;
}

// Reset the game table for the start of a round
function resetTable(state: GameState): void {
  // create a TOGL physics puck table
  state.table = physics.createTable(
    50,
    55,
    targetScreenWidth - 100,
    targetScreenHeight - 105,
    true,
    0.95
  );

  const playerSize = 23;
  const ballSize = 15;

  // nice slidey table
  state.table.friction = 0.5;
  // gap at the top of the bottom of the table
  state.table.horizontalGap = Math.floor(targetScreenWidth / 6);

  // create the ball 
  const ball = physics.createPuck(state.table, targetScreenWidth / 2, targetScreenHeight / 2, ballSize);
  ball.canUseGap = true;
  state.ballId = ball.id;

  state.table.pucks.push(ball)
  
  // team1
  state.table.pucks.push(physics.createPuck(state.table, targetScreenWidth / 2, 80, playerSize, { team: Team.BLUE }));
  state.table.pucks.push(physics.createPuck(state.table, (targetScreenWidth / 2) - 50, 130, playerSize, { team: Team.BLUE }));
  state.table.pucks.push(physics.createPuck(state.table, (targetScreenWidth / 2) + 50, 130, playerSize, { team: Team.BLUE }));
  state.table.pucks.push(physics.createPuck(state.table, (targetScreenWidth / 2) - 90, 270, playerSize, { team: Team.BLUE }));
  state.table.pucks.push(physics.createPuck(state.table, (targetScreenWidth / 2) + 90, 270, playerSize, { team: Team.BLUE }));
  // team2
  state.table.pucks.push(physics.createPuck(state.table, targetScreenWidth / 2, targetScreenHeight - 80, playerSize, { team: Team.RED }));
  state.table.pucks.push(physics.createPuck(state.table, (targetScreenWidth / 2) - 50, targetScreenHeight - 130, playerSize, { team: Team.RED }));
  state.table.pucks.push(physics.createPuck(state.table, (targetScreenWidth / 2) + 50, targetScreenHeight - 130, playerSize, { team: Team.RED }));
  state.table.pucks.push(physics.createPuck(state.table, (targetScreenWidth / 2) - 90, targetScreenHeight - 270, playerSize, { team: Team.RED }));
  state.table.pucks.push(physics.createPuck(state.table, (targetScreenWidth / 2) + 90, targetScreenHeight - 270, playerSize, { team: Team.RED }));
}

function distance(a: physics.Puck, b: physics.Puck): number {
  return physics.lengthVec2(physics.subtractVec2(a.position, b.position));
}

// computer playing
function takeComputerShot(game: GameState) {
  // if the game is over the computer won't take a shot
  if (game.gameOver) {
    return;
  }
  // if we're waiting for a reset the computer won't take a shot
  if (game.resetAt !== 0) {
    return;
  }

  // Computer assumes playing blue
  const pucks = game.table.pucks.filter(p => p.data?.team === game.whoseTurn);
  const ball = game.table.pucks.find(p => p.id === game.ballId);

  if (pucks && ball) {
    // only consider the players behind the ball if there are any (if not
    // all pucks are fair game)
    let players = pucks.filter(p => p.position.y < ball.position.y);
    if (players.length === 0) {
      players = pucks;
    }

    // find the closest player to the ball
    const closest = players.sort((a, b) => distance(a, ball) - distance(b, ball))[0];
    if (closest) {
      // aim roughly at the middle of the ball (with a little random to keep it interesting)
      const ballX = ball.position.x - 5 + (Math.random() * 10)
      const ballY = ball.position.y - 5 + (Math.random() * 10)
      const path = physics.subtractVec2(physics.newVec2(ballX, ballY), closest.position);
      const len = physics.lengthVec2(path);
      const dx = path.x / len;
      const dy = path.y / len;
      const power = 140 * ((ballY > closest.position.y) ? (2 + (1 * Math.random())) : (1  + (1 * Math.random())));

      // set up a shot to run a second or so later 
      game.whoseTurn = game.whoseTurn === Team.BLUE ? Team.RED : Team.BLUE;
      game.pendingShot = {
        id: closest.id,
        x: dx * power * 0.75,
        y: dy * power * 0.75,
        fireAt: Rune.gameTime() + inputDelay + 500
      };
    }
  }
}


Rune.initLogic({
  minPlayers: 1,
  maxPlayers: 2,
  setup: (allPlayerIds): GameState => {
    // create the initial state, we'll initialize the players
    // and ball afterwards
    const initialState: GameState = {
      gameStart: true,
      table: physics.createTable(
        50,
        55,
        targetScreenWidth - 100,
        targetScreenHeight - 105,
        true,
        0.95
      ),
      whoseTurn: Team.RED,
      playerTeams: {
        [allPlayerIds[0]]: Team.RED,
      },
      teamToPlayer: {
        [Team.RED]: allPlayerIds[0],
        [Team.BLUE]: "",
        [Team.NONE]: "",
      },
      atRest: true, 
      ballId: 0,
      gameEvents: [],
      resetAt: 0,
      scores: {
        [Team.BLUE]: 0,
        [Team.RED]: 0,
        [Team.NONE]: 0
      },
      gameOver: false,
      apiGameOverAt: 0,
      gameOverResults: {}
    }

    // if theres a second player assign them, otherwise
    // AI will take over
    if (allPlayerIds.length > 1) {
      initialState.playerTeams[allPlayerIds[1]] = Team.BLUE;
      initialState.teamToPlayer[Team.BLUE] = allPlayerIds[1];
    }

    // setup the table for the first round
    resetTable(initialState);

    return initialState;
  },
  updatesPerSecond: 30,
  update: (context) => {
    // if the game over Rune API function needs to be called
    // then do it
    if (context.game.apiGameOverAt !== 0 && context.game.apiGameOverAt < Rune.gameTime()) {
      context.game.apiGameOverAt = 0;
      Rune.gameOver({ players: context.game.gameOverResults });
      return;
    }

    // if the game is over no point running any updates
    if (context.game.gameOver) {
      return;
    }

    // if theres a shot that needs apply then apply it
    if (context.game.pendingShot && context.game.pendingShot.fireAt < Rune.gameTime()) { 
      // find the puck and shoot it
      const puck = context.game.table.pucks.find(p => p.id === context.game.pendingShot?.id);
      if (puck) {
        puck.velocity.x = context.game.pendingShot.x;
        puck.velocity.y = context.game.pendingShot.y;
      }
      context.game.pendingShot = undefined;
    }

    // clear the game events so we can fire them during the game
    context.game.gameEvents = [];

    // this is here to remove the proxies that Rune puts around the data structures
    // that it maintains. This helps performance on low end Android devices
    const table: physics.Table = JSON.parse(JSON.stringify(context.game.table)) as physics.Table;

    // run the physics in two steps to improve accuracy and record all the collisions
    const collisions = physics.tableStep(15, table).collisions;
    collisions.push(...physics.tableStep(15, table).collisions);

    if (collisions.find(c => c.puckIdA === context.game.ballId || c.puckIdB === context.game.ballId)) {
      // hit the ball
      context.game.gameEvents.push({
        type: "ball"
      })
    }
    if (collisions.find(c => c.puckIdA !== context.game.ballId && c.puckIdB !== context.game.ballId)) {
      // two players hit
      context.game.gameEvents.push({
        type: "players"
      })
    }

    // reset the data after its been processed
    context.game.table = table;
    context.game.atRest = physics.tableAtRest(table);

    // if the game is read to take a shot and its the computer's turn then
    // player the shot
    if (context.game.atRest && !context.game.pendingShot) {
      if (context.game.teamToPlayer[context.game.whoseTurn] === "") {
        // Computer player
        takeComputerShot(context.game);
      }
    }

    // check to see if the ball has made it into one of the goals
    const ball = table.pucks.find(p => p.id === context.game.ballId);
    if (ball && context.game.resetAt === 0) {
      if (ball.position.y < table.y) {
        // red scored!
        context.game.resetAt = Rune.gameTime() + 5000;
        context.game.gameEvents.push({
          type: "goal",
          team: Team.RED
        });
        context.game.scores[Team.RED]++;
      } 
      if (ball.position.y > table.y + table.height) {
        // blue scored!
        context.game.resetAt = Rune.gameTime() + 5000;
        context.game.gameEvents.push({
          type: "goal",
          team: Team.BLUE
        });
        context.game.scores[Team.BLUE]++;
      }
    }

    // if theres a reset pending then we need to reset the 
    // game up
    if (context.game.resetAt < Rune.gameTime() && context.game.resetAt !== 0) {
      context.game.resetAt = 0;
      resetTable(context.game);

      // if Red has reached the target score them they've won!
      if (context.game.scores[Team.RED] === firstTo) {
        context.game.gameOver = true;
        const results: Record<PlayerId, "WON" | "LOST"> = {};
        for (const pid of context.allPlayerIds) {
          results[pid] = "LOST";
        }
        results[context.game.teamToPlayer[Team.RED]] = "WON";
        if (context.game.teamToPlayer[Team.BLUE].length > 0) {
          results[context.game.teamToPlayer[Team.BLUE]] = "LOST";
        }
        context.game.apiGameOverAt = Rune.gameTime() + 3000;
        context.game.gameOverResults = results;

        context.game.gameEvents.push({
          type: "gameOver",
          winner: Team.RED
        });
      // if Blue has reached the target score them they've won!
      } else if (context.game.scores[Team.BLUE] === firstTo) {
        context.game.gameOver = true;
        const results: Record<PlayerId, "WON" | "LOST"> = {};
        for (const pid of context.allPlayerIds) {
          results[pid] = "LOST";
        }
        if (context.game.teamToPlayer[Team.BLUE].length > 0) {
          results[context.game.teamToPlayer[Team.BLUE]] = "WON";
        }
        results[context.game.teamToPlayer[Team.RED]] = "LOST";
        context.game.apiGameOverAt = Rune.gameTime() + 3000;
        context.game.gameOverResults = results;

        context.game.gameEvents.push({
          type: "gameOver",
          winner: Team.BLUE
        });
      // Otherwise just reset the game
      } else {
        context.game.gameEvents.push({
          type: "reset",
        });
      }
    }
    context.game.gameStart = false;
  },
  actions: {
    // the single action in the game, i.e. take a shot
    shoot: ({ puckId, dx, dy, power }, { game }) => {
      if (game.gameOver) {
        return;
      }

      // make sure we're allowed to take a shot at the moment
      if (game.resetAt === 0 && !game.pendingShot) {
        // switch the turn
        game.whoseTurn = game.whoseTurn === Team.BLUE ? Team.RED : Team.BLUE;
        // and the shot to be fired in a delay ms
        game.pendingShot = {
          id: puckId,
          x: dx * power * 0.75,
          y: dy * power * 0.75,
          fireAt: Rune.gameTime() + inputDelay
        };
      } else {
        Rune.invalidAction();
      }
    },
  },
})
