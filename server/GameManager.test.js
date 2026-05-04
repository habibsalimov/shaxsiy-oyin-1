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

test("host can update their display name", () => {
  const { gm, room } = createPlayingRoom();

  const result = gm.updateHostName("host-socket", { hostName: "Xushnud" });

  assert.equal(result.room.hostName, "Xushnud");
  assert.equal(gm.getGameState(room).hostName, "Xushnud");
});

test("rooms include host buzzer setting defaults", () => {
  const { room } = createPlayingRoom();

  assert.equal(room.settings.wrongAnswerLimit, 3);
  assert.equal(room.settings.queuedAnswers, false);
  assert.equal(room.settings.latencyCompensation, true);
  assert.equal(room.settings.timerStartSound, "gudok");
  assert.equal(room.settings.buzzerSound, "pop");
  assert.equal(room.settings.timerEndSound, "ding");
  assert.equal(room.settings.falstartSound, "error");
});

test("host can update wrong answer limit, ping compensation, and sound preferences", () => {
  const { gm, room } = createPlayingRoom();

  gm.updateSettings("host-socket", {
    wrongAnswerLimit: "0",
    queuedAnswers: true,
    latencyCompensation: false,
    timerStartSound: "off",
    buzzerSound: "button",
    timerEndSound: "notification",
    falstartSound: "off",
  });

  assert.equal(room.settings.wrongAnswerLimit, 1);
  assert.equal(room.settings.queuedAnswers, true);
  assert.equal(room.settings.latencyCompensation, false);
  assert.equal(room.settings.timerStartSound, "off");
  assert.equal(room.settings.buzzerSound, "button");
  assert.equal(room.settings.timerEndSound, "notification");
  assert.equal(room.settings.falstartSound, "off");
});

test("buzz timing can ignore latency compensation when host disables it", () => {
  const { gm, room } = createPlayingRoom();
  const player = room.players[0];
  player.latency = 100;
  room.settings.latencyCompensation = false;

  const originalNow = Date.now;
  Date.now = () => 1000;

  try {
    gm.buzz(player.socketId);
  } finally {
    Date.now = originalNow;
  }

  assert.equal(room.buzzOrder[0].effectiveTime, 1000);
});

test("host can reset every player score without removing the room setup", () => {
  const { gm, room } = createPlayingRoom();
  const player = room.players[0];

  gm.correctScore("host-socket", { playerId: player.id, ti: 0, ni: 0 });
  room.cellData["0-0"] = {
    history: [{ playerId: player.id, playerName: player.name, result: "correct", nominal: 10, ts: Date.now() }],
  };
  room.activeCell = { ti: 0, ni: 0 };
  room.timerEnd = Date.now() + 7000;
  room.timerStarted = true;
  room.buzzOrder = [{ playerId: player.id, socketId: player.socketId, name: player.name, effectiveTime: Date.now() }];
  room.falstartBlocked.add(player.id);
  room.cellLocked = true;

  const result = gm.resetAllScores("host-socket");

  assert.equal(result.room, room);
  assert.deepEqual(room.players.map(p => p.name), ["Ali"]);
  assert.deepEqual(room.topicNames, ["1-mavzu"]);
  assert.deepEqual(room.topicScores, []);
  assert.deepEqual(room.topicNominals, []);
  assert.deepEqual(room.cellData, {});
  assert.deepEqual(room.activeCell, { ti: 0, ni: 0 });
  assert.equal(room.timerEnd, null);
  assert.equal(room.timerStarted, false);
  assert.deepEqual(room.buzzOrder, []);
  assert.deepEqual([...room.falstartBlocked], []);
  assert.equal(room.cellLocked, false);
});

test("timer expiry keeps the host on the current question and blocks buzzing", () => {
  const gm = new GameManager();
  const { code } = gm.createRoom("host-socket", {
    hostName: "Host",
    rounds: 2,
    topics: ["1-mavzu", "2-mavzu"],
    nominals: [10, 20],
    timer: 7,
    falstart: false,
  });
  gm.joinRoom("player-socket-1", { code, playerName: "Ali", isHost: false });
  gm.startGame("host-socket");
  gm.startTimer("host-socket", { ti: 0, ni: 0 });
  const room = gm.getRoomForSocket("host-socket");

  gm.handleTimerExpiry(room, 0, 0);

  assert.deepEqual(room.activeCell, { ti: 0, ni: 0 });
  assert.equal(room.cellLocked, true);
  assert.equal(room.timerEnd, null);
  assert.equal(room.timerStarted, false);
  assert.equal(room.cellData["0-0"].history.at(-1).result, "no_answer");
  assert.equal(gm.buzz("player-socket-1"), null);
  assert.deepEqual(room.buzzOrder, []);
});

test("host next question after timer expiry advances and unlocks the next cell", () => {
  const gm = new GameManager();
  const { code } = gm.createRoom("host-socket", {
    hostName: "Host",
    rounds: 2,
    topics: ["1-mavzu", "2-mavzu"],
    nominals: [10, 20],
    timer: 7,
    falstart: false,
  });
  gm.joinRoom("player-socket-1", { code, playerName: "Ali", isHost: false });
  gm.startGame("host-socket");
  gm.startTimer("host-socket", { ti: 0, ni: 0 });
  const room = gm.getRoomForSocket("host-socket");
  gm.handleTimerExpiry(room, 0, 0);

  gm.skipQuestion("host-socket", { ti: 0, ni: 0 });

  assert.deepEqual(room.activeCell, { ti: 0, ni: 1 });
  assert.equal(room.cellLocked, false);
});

test("host can pause and resume a running timer with remaining time preserved", () => {
  const { gm, room } = createPlayingRoom();
  const player = room.players[0];
  const originalNow = Date.now;

  try {
    Date.now = () => 1000;
    gm.startTimer("host-socket", { ti: 0, ni: 0 });

    Date.now = () => 3000;
    const pauseResult = gm.pauseTimer("host-socket");

    assert.equal(pauseResult.remainingMs, 5000);
    assert.equal(room.timerEnd, null);
    assert.equal(room.timerPausedRemaining, 5000);
    assert.equal(room.timerStarted, true);
    assert.equal(gm.buzz(player.socketId), null);

    Date.now = () => 8000;
    const resumeResult = gm.resumeTimer("host-socket");

    assert.equal(resumeResult.ms, 5000);
    assert.equal(room.timerEnd, 13000);
    assert.equal(room.timerPausedRemaining, null);
    assert.equal(room.timerStarted, true);
  } finally {
    Date.now = originalNow;
  }
});

test("host cannot start timer after a player has already buzzed", () => {
  const { gm, room } = createPlayingRoom();
  const player = room.players[0];

  gm.buzz(player.socketId);
  const result = gm.startTimer("host-socket", { ti: 0, ni: 0 });

  assert.equal(result, null);
  assert.deepEqual(room.buzzOrder.map(b => b.playerId), [player.id]);
  assert.equal(room.timerEnd, null);
});

test("wrong answer restarts a full timer when no queued buzzes remain", () => {
  const { gm, code, room } = createPlayingRoom();
  const firstPlayer = room.players[0];
  gm.joinRoom("player-socket-2", {
    code,
    playerName: "Vali",
    isHost: false,
  });
  const secondPlayer = room.players[1];
  const originalNow = Date.now;

  try {
    Date.now = () => 1000;
    gm.startTimer("host-socket", { ti: 0, ni: 0 });

    Date.now = () => 3000;
    gm.buzz(firstPlayer.socketId);

    assert.equal(room.timerEnd, null);
    assert.equal(room.timerHeldByBuzz, true);

    Date.now = () => 3500;
    const result = gm.judge("host-socket", { playerId: firstPlayer.id, result: "wrong" });

    assert.deepEqual(room.activeCell, { ti: 0, ni: 0 });
    assert.equal(room.timerEnd, 10500);
    assert.equal(room.timerStarted, true);
    assert.equal(room.timerHeldByBuzz, false);
    assert.equal(result.timerEnd, 10500);
    assert.equal(result.ms, 7000);
    assert.equal(gm.buzz(firstPlayer.socketId), null);
    assert.equal(gm.buzz(secondPlayer.socketId).room, room);
  } finally {
    Date.now = originalNow;
  }
});

test("queued answers mode passes answer right to the next queued player", () => {
  const { gm, code, room } = createPlayingRoom();
  gm.joinRoom("player-socket-2", { code, playerName: "Vali", isHost: false });
  room.settings.queuedAnswers = true;
  const [firstPlayer, secondPlayer] = room.players;

  gm.startTimer("host-socket", { ti: 0, ni: 0 });
  gm.buzz(firstPlayer.socketId);
  gm.buzz(secondPlayer.socketId);
  const result = gm.judge("host-socket", { playerId: firstPlayer.id, result: "wrong" });

  assert.equal(result.room, room);
  assert.deepEqual(room.buzzOrder.map(b => b.playerId), [secondPlayer.id]);
  assert.equal(room.timerEnd, null);
  assert.equal(room.timerStarted, true);
});

test("single-answer mode only keeps late buzzes for display and restarts after wrong answer", () => {
  const { gm, code, room } = createPlayingRoom();
  gm.joinRoom("player-socket-2", { code, playerName: "Vali", isHost: false });
  gm.joinRoom("player-socket-3", { code, playerName: "Soli", isHost: false });
  const [firstPlayer, latePlayer, blockedLatePlayer] = room.players;
  const originalNow = Date.now;

  try {
    Date.now = () => 1000;
    gm.startTimer("host-socket", { ti: 0, ni: 0 });

    Date.now = () => 2000;
    gm.buzz(firstPlayer.socketId);
    Date.now = () => 2080;
    gm.buzz(latePlayer.socketId);
    Date.now = () => 2201;
    assert.equal(gm.buzz(blockedLatePlayer.socketId), null);
    assert.deepEqual(room.buzzOrder.map(b => b.playerId), [firstPlayer.id, latePlayer.id]);

    Date.now = () => 2500;
    const result = gm.judge("host-socket", { playerId: firstPlayer.id, result: "wrong" });

    assert.deepEqual(room.buzzOrder, []);
    assert.equal(result.timerEnd, 9500);
    assert.equal(result.ms, 7000);
    assert.equal(gm.buzz(firstPlayer.socketId), null);

    Date.now = () => 2600;
    assert.equal(gm.buzz(latePlayer.socketId).room, room);
  } finally {
    Date.now = originalNow;
  }
});

test("question locks when the wrong answer limit is reached", () => {
  const { gm, code, room } = createPlayingRoom();
  gm.joinRoom("player-socket-2", { code, playerName: "Vali", isHost: false });
  gm.joinRoom("player-socket-3", { code, playerName: "Soli", isHost: false });
  room.settings.wrongAnswerLimit = 2;
  const [firstPlayer, secondPlayer, thirdPlayer] = room.players;
  const originalNow = Date.now;

  try {
    Date.now = () => 1000;
    gm.startTimer("host-socket", { ti: 0, ni: 0 });
    gm.buzz(firstPlayer.socketId);
    gm.judge("host-socket", { playerId: firstPlayer.id, result: "wrong" });

    assert.equal(room.cellLocked, false);
    assert.equal(room.timerStarted, true);

    Date.now = () => 2000;
    gm.buzz(secondPlayer.socketId);
    gm.buzz(thirdPlayer.socketId);
    const result = gm.judge("host-socket", { playerId: secondPlayer.id, result: "wrong" });

    assert.equal(result.room, room);
    assert.deepEqual(room.activeCell, { ti: 0, ni: 0 });
    assert.equal(room.cellLocked, true);
    assert.equal(room.timerEnd, null);
    assert.equal(room.timerStarted, false);
    assert.deepEqual(room.buzzOrder, []);
    assert.equal(gm.buzz(thirdPlayer.socketId), null);
    assert.equal(gm.startTimer("host-socket", { ti: 0, ni: 0 }), null);
  } finally {
    Date.now = originalNow;
  }
});

test("falstart is recorded in cell history and blocks that player for the whole question", () => {
  const gm = new GameManager();
  const { code } = gm.createRoom("host-socket", {
    hostName: "Host",
    rounds: 1,
    topics: ["1-mavzu"],
    nominals: [10],
    timer: 7,
    falstart: true,
  });
  gm.joinRoom("player-socket-1", { code, playerName: "Ali", isHost: false });
  gm.joinRoom("player-socket-2", { code, playerName: "Vali", isHost: false });
  gm.joinRoom("player-socket-3", { code, playerName: "Soli", isHost: false });
  gm.startGame("host-socket");
  const room = gm.getRoomForSocket("host-socket");
  const [falstartPlayer, answerPlayer] = room.players;

  const falstartResult = gm.buzz(falstartPlayer.socketId);

  assert.equal(falstartResult.falstart, true);
  assert.deepEqual(room.falstartBlocked, new Set([falstartPlayer.id]));
  assert.equal(room.cellData["0-0"].history[0].result, "falstart");
  assert.equal(room.cellData["0-0"].history[0].playerId, falstartPlayer.id);
  assert.deepEqual(gm.getGameState(room).falstartBlocked, [falstartPlayer.id]);

  gm.startTimer("host-socket", { ti: 0, ni: 0 });
  gm.buzz(answerPlayer.socketId);
  gm.judge("host-socket", { playerId: answerPlayer.id, result: "wrong" });

  assert.deepEqual(room.activeCell, { ti: 0, ni: 0 });
  assert.deepEqual(room.falstartBlocked, new Set([falstartPlayer.id]));
  assert.equal(gm.buzz(falstartPlayer.socketId), null);
});

test("question locks when every player has falstarted", () => {
  const gm = new GameManager();
  const { code } = gm.createRoom("host-socket", {
    hostName: "Host",
    rounds: 1,
    topics: ["1-mavzu"],
    nominals: [10],
    timer: 7,
    falstart: true,
  });
  gm.joinRoom("player-socket-1", { code, playerName: "Ali", isHost: false });
  gm.joinRoom("player-socket-2", { code, playerName: "Vali", isHost: false });
  gm.startGame("host-socket");
  const room = gm.getRoomForSocket("host-socket");
  const [firstPlayer, secondPlayer] = room.players;

  gm.buzz(firstPlayer.socketId);

  assert.equal(room.cellLocked, false);
  assert.equal(gm.startTimer("host-socket", { ti: 0, ni: 0 }).room, room);
  gm.resetCell("host-socket", { ti: 0, ni: 0 });

  gm.buzz(firstPlayer.socketId);
  const result = gm.buzz(secondPlayer.socketId);

  assert.equal(result.falstart, true);
  assert.deepEqual(room.activeCell, { ti: 0, ni: 0 });
  assert.equal(room.cellLocked, true);
  assert.equal(room.timerEnd, null);
  assert.equal(room.timerStarted, false);
  assert.deepEqual(room.buzzOrder, []);
  assert.deepEqual(new Set(room.cellData["0-0"].history.map(h => h.result)), new Set(["falstart"]));
  assert.equal(gm.startTimer("host-socket", { ti: 0, ni: 0 }), null);
});
