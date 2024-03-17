import type { OnChangeAction, OnChangeEvent, PlayerId, Players, RuneClient } from "rune-games-sdk/multiplayer"
import { physics } from "togl";

export const targetScreenWidth = 480;
export const targetScreenHeight = 800;

export type GameEvent = GoalEvent | BallHit | PlayersHit | Reset | GameOver
export const inputDelay = 150;
export const bestOf = 3;

export type GoalEvent = {
  type: "goal",
  team: Team
}

export type BallHit = {
  type: "ball"
}

export type PlayersHit = {
  type: "players"
}

export type Reset = {
  type: "reset"
}

export type GameOver = {
  type: "gameOver",
  winner: Team
}

export interface GameState {
  gameStart: boolean;
  table: physics.Table;
  whoseTurn: Team;
  atRest: boolean;
  playerTeams: Record<PlayerId, Team>;
  teamToPlayer: Record<Team, PlayerId>;
  ballId: number;
  gameEvents: GameEvent[];
  resetAt: number;
  scores: Record<Team, number>;
  gameOver: boolean;
  pendingShot?: Shot;
  apiGameOverAt: number;
  gameOverResults: Record<PlayerId, "WON" | "LOST">;
}

export type Shot = {
  id: number;
  x: number;
  y: number;
  fireAt: number;
}

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
  shoot: (params: { puckId: number, dx: number, dy: number, power: number }) => void
}

declare global {
  const Rune: RuneClient<GameState, GameActions>
}

export function otherTeam(team: Team): Team {
  return team === Team.RED ? Team.BLUE : Team.RED;
}

function resetTable(state: GameState): void {
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

  state.table.friction = 0.5;
  state.table.horizontalGap = Math.floor(targetScreenWidth / 6);

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

function takeComputerShot(game: GameState) {
  if (game.gameOver) {
    return;
  }
  if (game.resetAt !== 0) {
    return;
  }

  // Computer assumes playing blue
  const pucks = game.table.pucks.filter(p => p.data?.team === game.whoseTurn);
  const ball = game.table.pucks.find(p => p.id === game.ballId);

  if (pucks && ball) {
    let players = pucks.filter(p => p.position.y < ball.position.y);
    if (players.length === 0) {
      players = pucks;
    }

    const closest = players.sort((a, b) => distance(a, ball) - distance(b, ball))[0];
    if (closest) {
      const ballX = ball.position.x - 5 + (Math.random() * 10)
      const ballY = ball.position.y - 5 + (Math.random() * 10)
      const path = physics.subtractVec2(physics.newVec2(ballX, ballY), closest.position);
      const len = physics.lengthVec2(path);
      const dx = path.x / len;
      const dy = path.y / len;
      const power = 140 * ((ballY > closest.position.y) ? (2 + (1 * Math.random())) : (1  + (1 * Math.random())));

      game.whoseTurn = game.whoseTurn === Team.BLUE ? Team.RED : Team.BLUE;
      game.pendingShot = {
        id: closest.id,
        x: dx * power * 0.75,
        y: dy * power * 0.75,
        fireAt: Rune.gameTime() + inputDelay + 1000
      };
    }
  }
}


Rune.initLogic({
  minPlayers: 1,
  maxPlayers: 2,
  setup: (allPlayerIds): GameState => {
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

    resetTable(initialState);
    return initialState;
  },
  updatesPerSecond: 30,
  update: (context) => {
    if (context.game.apiGameOverAt !== 0 && context.game.apiGameOverAt < Rune.gameTime()) {
      context.game.apiGameOverAt = 0;
      Rune.gameOver({ players: context.game.gameOverResults });
    }

    if (context.game.gameOver) {
      return;
    }

    if (context.game.pendingShot && context.game.pendingShot.fireAt < Rune.gameTime()) { 
      const puck = context.game.table.pucks.find(p => p.id === context.game.pendingShot?.id);
      if (puck) {
        puck.velocity.x = context.game.pendingShot.x;
        puck.velocity.y = context.game.pendingShot.y;
      }
      context.game.pendingShot = undefined;
    }

    context.game.gameEvents = [];

    const table: physics.Table = JSON.parse(JSON.stringify(context.game.table)) as physics.Table;
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

    context.game.table = table;
    context.game.atRest = physics.tableAtRest(table);

    if (context.game.atRest && !context.game.pendingShot) {
      if (context.game.teamToPlayer[context.game.whoseTurn] === "") {
        // Computer player
        takeComputerShot(context.game);
      }
    }

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

    if (context.game.resetAt < Rune.gameTime() && context.game.resetAt !== 0) {
      context.game.resetAt = 0;
      resetTable(context.game);

      if (context.game.scores[Team.RED] === bestOf) {
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
      } else if (context.game.scores[Team.BLUE] === bestOf) {
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
      } else {
        context.game.gameEvents.push({
          type: "reset",
        });
      }
    }
    context.game.gameStart = false;
  },
  actions: {
    shoot: ({ puckId, dx, dy, power }, { game }) => {
      if (game.gameOver) {
        return;
      }

      if (game.resetAt === 0 && !game.pendingShot) {
        game.whoseTurn = game.whoseTurn === Team.BLUE ? Team.RED : Team.BLUE;
        game.pendingShot = {
          id: puckId,
          x: dx * power * 0.75,
          y: dy * power * 0.75,
          fireAt: Rune.gameTime() + inputDelay
        };
      }
    },
  },
})
