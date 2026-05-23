const POINTS_TO_WIN = 21;
const MAX_CONTINUOUS_GAMES = 2;
const STORAGE_PREFIX = "badminton-match-setter";
const memoryStore = new Map();
let activeDayKey = todayKey();

const state = {
  players: [],
  currentMatch: null,
  score: { a: 0, b: 0 },
  pointLog: [],
  matches: [],
  stats: new Map(),
  lastWinner: null,
};

const els = {
  todayLabel: document.querySelector("#todayLabel"),
  matchCount: document.querySelector("#matchCount"),
  playerForm: document.querySelector("#playerForm"),
  sampleNamesButton: document.querySelector("#sampleNamesButton"),
  clearTodayButton: document.querySelector("#clearTodayButton"),
  nextMatchButton: document.querySelector("#nextMatchButton"),
  scoreAButton: document.querySelector("#scoreAButton"),
  scoreBButton: document.querySelector("#scoreBButton"),
  undoButton: document.querySelector("#undoButton"),
  swapButton: document.querySelector("#swapButton"),
  finishButton: document.querySelector("#finishButton"),
  exportButton: document.querySelector("#exportButton"),
  currentMatchTitle: document.querySelector("#currentMatchTitle"),
  teamAPlayers: document.querySelector("#teamAPlayers"),
  teamBPlayers: document.querySelector("#teamBPlayers"),
  scoreA: document.querySelector("#scoreA"),
  scoreB: document.querySelector("#scoreB"),
  rotationNote: document.querySelector("#rotationNote"),
  winnerCelebration: document.querySelector("#winnerCelebration"),
  winnerTitle: document.querySelector("#winnerTitle"),
  winnerNames: document.querySelector("#winnerNames"),
  winnerScore: document.querySelector("#winnerScore"),
  memberTable: document.querySelector("#memberTable"),
  historyTable: document.querySelector("#historyTable"),
};

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function storageKey() {
  return `${STORAGE_PREFIX}:${todayKey()}`;
}

function getStorage() {
  try {
    if (window.localStorage) return window.localStorage;
  } catch {
    return null;
  }
  return {
    getItem: (key) => memoryStore.get(key) || null,
    setItem: (key, value) => memoryStore.set(key, value),
    removeItem: (key) => memoryStore.delete(key),
    key: (index) => [...memoryStore.keys()][index],
    get length() {
      return memoryStore.size;
    },
  };
}

function purgeOldDays() {
  const storage = getStorage();
  const currentKey = storageKey();

  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key && key.startsWith(`${STORAGE_PREFIX}:`) && key !== currentKey) {
        storage.removeItem(key);
      }
    }
  } catch {
    [...memoryStore.keys()].forEach((key) => {
      if (key.startsWith(`${STORAGE_PREFIX}:`) && key !== currentKey) {
        memoryStore.delete(key);
      }
    });
  }
}

function checkDayRollover() {
  const nextDayKey = todayKey();
  if (nextDayKey === activeDayKey) {
    render();
    return;
  }

  activeDayKey = nextDayKey;
  purgeOldDays();
  state.matches = [];
  state.lastWinner = null;

  if (state.players.length === 6) {
    initStats();
    setNextMatch();
    saveToday();
  } else {
    render();
  }
}

function makePlayer(name, index) {
  return {
    id: `p${index + 1}`,
    name,
  };
}

function emptyStat() {
  return {
    games: 0,
    wins: 0,
    losses: 0,
    streak: 0,
    partners: {},
    opponents: {},
  };
}

function initStats() {
  state.stats = new Map(state.players.map((player) => [player.id, emptyStat()]));
  state.matches.forEach(applyFinishedMatchToStats);
}

function applyFinishedMatchToStats(match) {
  const teamAIds = match.teamA.map((player) => player.id);
  const teamBIds = match.teamB.map((player) => player.id);
  const activeIds = [...teamAIds, ...teamBIds];
  const winnerIds = match.winner === "A" ? teamAIds : teamBIds;

  state.players.forEach((player) => {
    const stat = state.stats.get(player.id);
    if (activeIds.includes(player.id)) {
      stat.games += 1;
      stat.streak += 1;
      if (winnerIds.includes(player.id)) {
        stat.wins += 1;
      } else {
        stat.losses += 1;
      }
    } else {
      stat.streak = 0;
    }
  });

  addPartner(teamAIds[0], teamAIds[1]);
  addPartner(teamBIds[0], teamBIds[1]);
  teamAIds.forEach((aId) => teamBIds.forEach((bId) => addOpponent(aId, bId)));
}

function addPartner(firstId, secondId) {
  const first = state.stats.get(firstId);
  const second = state.stats.get(secondId);
  first.partners[secondId] = (first.partners[secondId] || 0) + 1;
  second.partners[firstId] = (second.partners[firstId] || 0) + 1;
}

function addOpponent(firstId, secondId) {
  const first = state.stats.get(firstId);
  const second = state.stats.get(secondId);
  first.opponents[secondId] = (first.opponents[secondId] || 0) + 1;
  second.opponents[firstId] = (second.opponents[firstId] || 0) + 1;
}

function combinations(items, size) {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [head, ...tail] = items;
  return [
    ...combinations(tail, size - 1).map((combo) => [head, ...combo]),
    ...combinations(tail, size),
  ];
}

function pairingsForFour(players) {
  const [p1, p2, p3, p4] = players;
  return [
    { teamA: [p1, p2], teamB: [p3, p4] },
    { teamA: [p1, p3], teamB: [p2, p4] },
    { teamA: [p1, p4], teamB: [p2, p3] },
  ];
}

function allPossibleMatches() {
  return combinations(state.players, 4).flatMap(pairingsForFour);
}

function countPartnerRepeats(team) {
  const [first, second] = team;
  return state.stats.get(first.id).partners[second.id] || 0;
}

function countOpponentRepeats(teamA, teamB) {
  return teamA.reduce((total, a) => {
    return total + teamB.reduce((inner, b) => inner + (state.stats.get(a.id).opponents[b.id] || 0), 0);
  }, 0);
}

function scoreCandidate(candidate) {
  const active = [...candidate.teamA, ...candidate.teamB];
  const rest = state.players.filter((player) => !active.some((activePlayer) => activePlayer.id === player.id));
  const activeStats = active.map((player) => state.stats.get(player.id));
  const restStats = rest.map((player) => state.stats.get(player.id));
  const activeGames = activeStats.reduce((sum, stat) => sum + stat.games, 0);
  const restGames = restStats.reduce((sum, stat) => sum + stat.games, 0);
  const streakRisk = activeStats.reduce((sum, stat) => sum + stat.streak, 0);
  const partnerRepeats = countPartnerRepeats(candidate.teamA) + countPartnerRepeats(candidate.teamB);
  const opponentRepeats = countOpponentRepeats(candidate.teamA, candidate.teamB);
  const teamBalance = Math.abs(
    candidate.teamA.reduce((sum, player) => sum + state.stats.get(player.id).wins, 0) -
    candidate.teamB.reduce((sum, player) => sum + state.stats.get(player.id).wins, 0)
  );

  return (activeGames * 8) - (restGames * 4) + (streakRisk * 14) + (partnerRepeats * 12) + (opponentRepeats * 2) + teamBalance;
}

function getNextMatch() {
  const possible = allPossibleMatches();
  const strict = possible.filter((candidate) => {
    return [...candidate.teamA, ...candidate.teamB].every((player) => state.stats.get(player.id).streak < MAX_CONTINUOUS_GAMES);
  });
  const candidates = strict.length ? strict : possible;
  const [best] = candidates.sort((a, b) => scoreCandidate(a) - scoreCandidate(b));
  return {
    ...best,
    relaxed: strict.length === 0,
    rested: state.players.filter((player) => ![...best.teamA, ...best.teamB].some((active) => active.id === player.id)),
  };
}

function setNextMatch() {
  if (state.players.length !== 6) return;
  state.currentMatch = getNextMatch();
  state.score = { a: 0, b: 0 };
  state.pointLog = [];
  render();
}

function startDay(players) {
  state.players = players;
  const saved = loadToday();
  state.matches = saved && samePlayers(saved.players, players) ? saved.matches : [];
  state.lastWinner = state.matches.length ? getWinnerSummary(state.matches[state.matches.length - 1]) : null;
  initStats();
  setNextMatch();
  saveToday();
}

function samePlayers(savedPlayers, players) {
  return savedPlayers && savedPlayers.map((p) => p.name).join("|") === players.map((p) => p.name).join("|");
}

function addPoint(team) {
  if (!state.currentMatch) return;
  state.pointLog.push({ ...state.score });
  state.score[team] += 1;
  if (state.score[team] >= POINTS_TO_WIN) {
    finishMatch();
    return;
  }
  render();
}

function undoPoint() {
  const previous = state.pointLog.pop();
  if (!previous) return;
  state.score = previous;
  render();
}

function swapTeams() {
  if (!state.currentMatch) return;
  const oldA = state.currentMatch.teamA;
  state.currentMatch.teamA = state.currentMatch.teamB;
  state.currentMatch.teamB = oldA;
  state.score = { a: state.score.b, b: state.score.a };
  state.pointLog = [];
  render();
}

function finishMatch() {
  if (!state.currentMatch || state.score.a === state.score.b || Math.max(state.score.a, state.score.b) < POINTS_TO_WIN) return;
  const winner = state.score.a > state.score.b ? "A" : "B";
  const finishedMatch = {
    number: state.matches.length + 1,
    date: todayKey(),
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    teamA: state.currentMatch.teamA,
    teamB: state.currentMatch.teamB,
    scoreA: state.score.a,
    scoreB: state.score.b,
    winner,
    rested: state.currentMatch.rested,
  };

  state.matches.push(finishedMatch);
  state.lastWinner = getWinnerSummary(finishedMatch);
  initStats();
  state.currentMatch = null;
  state.score = { a: 0, b: 0 };
  state.pointLog = [];
  saveToday();
  setNextMatch();
}

function saveToday() {
  if (!state.players.length) return;
  getStorage().setItem(storageKey(), JSON.stringify({
    players: state.players,
    matches: state.matches,
  }));
}

function loadToday() {
  try {
    return JSON.parse(getStorage().getItem(storageKey()));
  } catch {
    return null;
  }
}

function clearToday() {
  getStorage().removeItem(storageKey());
  state.matches = [];
  state.lastWinner = null;
  initStats();
  setNextMatch();
}

function playerNames(players) {
  return players.map((player) => player.name).join(" / ");
}

function getWinnerSummary(match) {
  const team = match.winner === "A" ? "Team A" : "Team B";
  const players = match.winner === "A" ? match.teamA : match.teamB;
  return {
    team,
    names: playerNames(players),
    score: `${match.scoreA} - ${match.scoreB}`,
  };
}

function renderCurrentMatch() {
  const hasMatch = Boolean(state.currentMatch);
  els.currentMatchTitle.textContent = hasMatch ? `Match ${state.matches.length + 1}` : "Match not started";
  els.teamAPlayers.textContent = hasMatch ? playerNames(state.currentMatch.teamA) : "-";
  els.teamBPlayers.textContent = hasMatch ? playerNames(state.currentMatch.teamB) : "-";
  els.scoreA.textContent = state.score.a;
  els.scoreB.textContent = state.score.b;

  els.scoreAButton.disabled = !hasMatch;
  els.scoreBButton.disabled = !hasMatch;
  els.undoButton.disabled = !hasMatch || state.pointLog.length === 0;
  els.swapButton.disabled = !hasMatch || state.score.a + state.score.b > 0;
  els.finishButton.disabled = !hasMatch || state.score.a === state.score.b || Math.max(state.score.a, state.score.b) < POINTS_TO_WIN;
  els.nextMatchButton.disabled = state.players.length !== 6;

  if (!hasMatch) {
    els.rotationNote.textContent = "Enter six players and start the day.";
    renderWinnerCelebration();
    return;
  }

  const rested = state.currentMatch.rested.map((player) => player.name).join(", ");
  const relaxedText = state.currentMatch.relaxed
    ? " Rotation warning: everyone had already reached the two-game limit, so this is the fairest available match."
    : "";
  els.rotationNote.textContent = `Resting now: ${rested}.${relaxedText}`;
  renderWinnerCelebration();
}

function renderWinnerCelebration() {
  if (!state.lastWinner) {
    els.winnerCelebration.hidden = true;
    return;
  }

  els.winnerTitle.textContent = `${state.lastWinner.team} won`;
  els.winnerNames.textContent = state.lastWinner.names;
  els.winnerScore.textContent = state.lastWinner.score;
  els.winnerCelebration.hidden = false;
}

function renderStats() {
  if (!state.players.length) {
    els.memberTable.innerHTML = `<tr><td colspan="5">No games yet.</td></tr>`;
    return;
  }

  els.memberTable.innerHTML = state.players.map((player) => {
    const stat = state.stats.get(player.id) || emptyStat();
    return `
      <tr>
        <td data-label="Member">${escapeHtml(player.name)}</td>
        <td data-label="Games">${stat.games}</td>
        <td data-label="W">${stat.wins}</td>
        <td data-label="L">${stat.losses}</td>
        <td data-label="Streak">${stat.streak}</td>
      </tr>
    `;
  }).join("");
}

function renderHistory() {
  if (!state.matches.length) {
    els.historyTable.innerHTML = `<tr><td colspan="7">Finished matches will be stored here for today.</td></tr>`;
    return;
  }

  els.historyTable.innerHTML = state.matches.map((match) => {
    const winner = getWinnerSummary(match);
    return `
      <tr>
        <td data-label="#">${match.number}</td>
        <td data-label="Team A">${escapeHtml(playerNames(match.teamA))}</td>
        <td data-label="Score"><strong>${match.scoreA} - ${match.scoreB}</strong></td>
        <td data-label="Team B">${escapeHtml(playerNames(match.teamB))}</td>
        <td data-label="Winner" class="winner">${winner.team}<br>${escapeHtml(winner.names)}</td>
        <td data-label="Rested">${escapeHtml(playerNames(match.rested))}</td>
        <td data-label="Time">${match.time}</td>
      </tr>
    `;
  }).join("");
}

function render() {
  const date = new Date();
  els.todayLabel.textContent = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  els.matchCount.textContent = `${state.matches.length} ${state.matches.length === 1 ? "match" : "matches"}`;
  els.exportButton.disabled = state.matches.length === 0;
  renderCurrentMatch();
  renderStats();
  renderHistory();
}

function exportCsv() {
  const rows = [
    ["Match", "Team A", "Score A", "Score B", "Team B", "Winner", "Rested", "Time"],
    ...state.matches.map((match) => [
      match.number,
      playerNames(match.teamA),
      match.scoreA,
      match.scoreB,
      playerNames(match.teamB),
      match.winner === "A" ? "Team A" : "Team B",
      playerNames(match.rested),
      match.time,
    ]),
    [],
    ["Member", "Games", "Wins", "Losses", "Current streak"],
    ...state.players.map((player) => {
      const stat = state.stats.get(player.id);
      return [player.name, stat.games, stat.wins, stat.losses, stat.streak];
    }),
  ];

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `badminton-scores-${todayKey()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.playerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const names = [...new FormData(els.playerForm).getAll("player")].map((name) => name.trim()).filter(Boolean);
  const uniqueNames = new Set(names.map((name) => name.toLowerCase()));
  if (names.length !== 6 || uniqueNames.size !== 6) {
    alert("Please enter 6 different player names.");
    return;
  }
  startDay(names.map(makePlayer));
});

els.sampleNamesButton.addEventListener("click", () => {
  const samples = ["Arun", "Bala", "Chitra", "Deepak", "Esha", "Farhan"];
  document.querySelectorAll("input[name='player']").forEach((input, index) => {
    input.value = samples[index];
  });
});

els.clearTodayButton.addEventListener("click", () => {
  if (!state.players.length) {
    getStorage().removeItem(storageKey());
    return;
  }
  if (confirm("Clear today's saved scores for these players?")) {
    clearToday();
  }
});

els.nextMatchButton.addEventListener("click", setNextMatch);
els.scoreAButton.addEventListener("click", () => addPoint("a"));
els.scoreBButton.addEventListener("click", () => addPoint("b"));
els.undoButton.addEventListener("click", undoPoint);
els.swapButton.addEventListener("click", swapTeams);
els.finishButton.addEventListener("click", finishMatch);
els.exportButton.addEventListener("click", exportCsv);

const saved = loadToday();
purgeOldDays();
if (saved && saved.players && saved.players.length === 6) {
  state.players = saved.players;
  state.matches = saved.matches || [];
  state.lastWinner = state.matches.length ? getWinnerSummary(state.matches[state.matches.length - 1]) : null;
  document.querySelectorAll("input[name='player']").forEach((input, index) => {
    input.value = state.players[index].name;
  });
  initStats();
  setNextMatch();
} else {
  render();
}

setInterval(checkDayRollover, 60000);
