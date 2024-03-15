import type { OnChangeAction, OnChangeEvent, PlayerId, Players, RuneClient } from "rune-games-sdk/multiplayer"
import { physics } from "togl";

export const targetScreenWidth = 480;
export const targetScreenHeight = 800;

export interface GameState {
  table: physics.Table;
  flickBack: number;
  whoseTurn: Team;
  atRest: boolean;
  playerTeams: Record<PlayerId, Team>
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

Rune.initLogic({
  minPlayers: 2,
  maxPlayers: 2,
  setup: (allPlayerIds): GameState => {
    const initialState: GameState = {
      table: physics.createTable(
        50,
        55,
        targetScreenWidth - 100,
        targetScreenHeight - 105,
        true,
        0.95
      ),
      whoseTurn: Team.BLUE,
      playerTeams: {
        [allPlayerIds[0]]: Team.RED,
        [allPlayerIds[1]]: Team.BLUE,
      },
      flickBack: 0,
      atRest: true
    }

    const playerSize = 23;
    const ballSize = 15;

    initialState.table.friction = 0.5;
    initialState.table.horizontalGap = Math.floor(targetScreenWidth / 6);

    const ball = physics.createPuck(initialState.table, targetScreenWidth / 2, targetScreenHeight / 2, ballSize);
    ball.canUseGap = true;

    initialState.table.pucks.push(ball)
    
    // team1
    initialState.table.pucks.push(physics.createPuck(initialState.table, targetScreenWidth / 2, 80, playerSize, { team: Team.BLUE }));
    initialState.table.pucks.push(physics.createPuck(initialState.table, (targetScreenWidth / 2) - 50, 130, playerSize, { team: Team.BLUE }));
    initialState.table.pucks.push(physics.createPuck(initialState.table, (targetScreenWidth / 2) + 50, 130, playerSize, { team: Team.BLUE }));
    initialState.table.pucks.push(physics.createPuck(initialState.table, (targetScreenWidth / 2) - 90, 270, playerSize, { team: Team.BLUE }));
    initialState.table.pucks.push(physics.createPuck(initialState.table, (targetScreenWidth / 2) + 90, 270, playerSize, { team: Team.BLUE }));
    // team2
    initialState.table.pucks.push(physics.createPuck(initialState.table, targetScreenWidth / 2, targetScreenHeight - 80, playerSize, { team: Team.RED }));
    initialState.table.pucks.push(physics.createPuck(initialState.table, (targetScreenWidth / 2) - 50, targetScreenHeight - 130, playerSize, { team: Team.RED }));
    initialState.table.pucks.push(physics.createPuck(initialState.table, (targetScreenWidth / 2) + 50, targetScreenHeight - 130, playerSize, { team: Team.RED }));
    initialState.table.pucks.push(physics.createPuck(initialState.table, (targetScreenWidth / 2) - 90, targetScreenHeight - 270, playerSize, { team: Team.RED }));
    initialState.table.pucks.push(physics.createPuck(initialState.table, (targetScreenWidth / 2) + 90, targetScreenHeight - 270, playerSize, { team: Team.RED }));

    return initialState;
  },
  updatesPerSecond: 30,
  update: (context) => {
    const table = JSON.parse(JSON.stringify(context.game.table));
    physics.tableStep(15, table)
    physics.tableStep(15, table);
    context.game.table = table;
    context.game.atRest = physics.tableAtRest(table) && context.game.flickBack <= 0;
  },
  actions: {
    shoot: ({ puckId, dx, dy, power }, { game }) => {
      game.whoseTurn = game.whoseTurn === Team.BLUE ? Team.RED : Team.BLUE;
      const puck = game.table.pucks.find(p => p.id === puckId);
      if (puck) {
        puck.velocity.x = dx * power * 0.75;
        puck.velocity.y = dy * power * 0.75;
      }
    },
  },
})
