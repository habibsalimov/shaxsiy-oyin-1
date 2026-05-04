import test from "node:test";
import assert from "node:assert/strict";
import { GameManager } from "./GameManager.js";

function createPlayingRoom() {
  const gm = new GameManager();
  const { code } = gm.createRoom("host-socket", {
    hostName: "Host",
    rounds: 1,
    topics: ["1-mavzu"],
    nominals: [10],
    timer: 7,
    falstart: false,
  });

  const joinResult = gm.joinRoom("player-socket-1", {
    code,
    playerName: "Ali",
    isHost: false,
  });

  gm.startGame("host-socket");

  return {
    gm,
    code,
    room: joinResult.room,
  };
}

test("reconnect keeps the same player identity and score entries", () => {
  const { gm, code, room } = createPlayingRoom();
  const player = room.players[0];

  gm.startTimer("host-socket", { ti: 0, ni: 0 });
  gm.judge("host-socket", { playerId: player.id, result: "correct" });

  assert.equal(room.topicScores[0][player.id][10], "correct");

  gm.handleDisconnect("player-socket-1");
  const reconnectResult = gm.joinRoom("player-socket-2", {
    code,
    playerName: "Ali",
    isHost: false,
  });

  assert.equal(reconnectResult.room.players[0].id, player.id);
  assert.equal(reconnectResult.room.players[0].socketId, "player-socket-2");
  assert.equal(reconnectResult.room.topicScores[0][player.id][10], "correct");
});

test("finished results keep scores after a player reconnects", () => {
  const { gm, code, room } = createPlayingRoom();
  const player = room.players[0];

  gm.startTimer("host-socket", { ti: 0, ni: 0 });
  gm.judge("host-socket", { playerId: player.id, result: "correct" });

  gm.handleDisconnect("player-socket-1");
  gm.joinRoom("player-socket-2", {
    code,
    playerName: "Ali",
    isHost: false,
  });

  const originalSetTimeout = global.setTimeout;
  global.setTimeout = () => ({});
  let finished;

  try {
    finished = gm.finishGame("host-socket");
  } finally {
    global.setTimeout = originalSetTimeout;
  }

  assert.deepEqual(finished.result.players, [{ id: player.id, name: "Ali" }]);
  assert.equal(finished.result.topicScores[0][player.id][10], "correct");
});

test("player management uses stable player IDs instead of socket IDs", () => {
  const { gm, room } = createPlayingRoom();
  const player = room.players[0];

  gm.blockPlayer("host-socket", { playerId: player.id });
  assert.equal(gm.buzz(player.socketId), null);
  assert.deepEqual(gm.getGameState(room).blockedPlayers, [player.id]);

  gm.blockPlayer("host-socket", { playerId: player.id });
  const removeResult = gm.removePlayer("host-socket", { playerId: player.id });

  assert.equal(removeResult.removedSocketId, "player-socket-1");
  assert.deepEqual(room.players, []);
  assert.equal(gm.getRoomForSocket("player-socket-1"), null);
});

test("resetting a cell clears its play state and unlocks it for reuse", () => {
  const { gm, room } = createPlayingRoom();
  const player = room.players[0];

  gm.correctScore("host-socket", { playerId: player.id, ti: 0, ni: 0 });
  room.cellData["0-0"] = {
    history: [{ playerId: player.id, playerName: player.name, result: "correct", nominal: 10, ts: Date.now() }],
  };
  room.buzzOrder = [{ playerId: player.id, socketId: player.socketId, name: player.name, effectiveTime: Date.now() }];
  room.falstartBlocked.add(player.id);
  gm.lockCell("host-socket");
  assert.equal(room.cellLocked, true);

  gm.resetCell("host-socket", { ti: 0, ni: 0 });

  assert.deepEqual(room.cellData["0-0"].history, []);
  assert.equal(room.topicScores[0][player.id][10], null);
  assert.deepEqual(room.activeCell, { ti: 0, ni: 0 });
  assert.equal(room.timerEnd, null);
  assert.equal(room.timerStarted, false);
  assert.deepEqual(room.buzzOrder, []);
  assert.deepEqual([...room.falstartBlocked], []);
  assert.equal(room.cellLocked, false);
});

test("host can rename an existing topic", () => {
  const { gm, room } = createPlayingRoom();

  const result = gm.renameTopic("host-socket", { ti: 0, name: "Tarix" });

  assert.equal(result.room.topicNames[0], "Tarix");
  assert.deepEqual(gm.getGameState(room).topicNames, ["Tarix"]);
});
