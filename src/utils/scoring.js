import { DEFAULT_NOMINALS } from './constants.js';

export function getTotal(scores, id, nominals) {
  if (!scores[id]) return 0;
  const noms = nominals || DEFAULT_NOMINALS;
  return noms.reduce((acc, n) => {
    const r = scores[id][n];
    if (r === "correct") return acc + n;
    if (r === "wrong")   return acc - n;
    return acc;
  }, 0);
}

export function rebuildSnapshots(topicScores, nominals) {
  const result = topicScores.map(ts => ({ ...ts }));
  const playerIds = Object.keys(result[0] || {}).filter(k => k !== '__snapshot');
  for (let i = 0; i < result.length; i++) {
    const snapshot = {};
    playerIds.forEach(pid => {
      snapshot[pid] = result
        .slice(0, i + 1)
        .reduce((sum, ts) => sum + getTotal(ts, pid, nominals), 0);
    });
    result[i] = { ...result[i], __snapshot: snapshot };
  }
  return result;
}

export function initScores(players, nominals) {
  const s = {};
  players.forEach(p => {
    s[p.socketId] = {};
    nominals.forEach(n => { s[p.socketId][n] = null; });
  });
  return s;
}
