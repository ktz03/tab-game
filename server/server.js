/**
 * Tab Game - Local Development Server
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = 8008;

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const RANKINGS_FILE = path.join(DATA_DIR, 'rankings.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      return new Map(JSON.parse(data));
    }
  } catch (err) {
    console.error('Error loading users:', err);
  }
  return new Map();
}

function saveUsers() {
  try {
    const data = JSON.stringify([...users]);
    fs.writeFileSync(USERS_FILE, data, 'utf8');
  } catch (err) {
    console.error('Error saving users:', err);
  }
}

function loadRankings() {
  try {
    if (fs.existsSync(RANKINGS_FILE)) {
      const data = fs.readFileSync(RANKINGS_FILE, 'utf8');
      return new Map(JSON.parse(data));
    }
  } catch (err) {
    console.error('Error loading rankings:', err);
  }
  return new Map();
}

function saveRankings() {
  try {
    const data = JSON.stringify([...rankings]);
    fs.writeFileSync(RANKINGS_FILE, data, 'utf8');
  } catch (err) {
    console.error('Error saving rankings:', err);
  }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function verifyPassword(password, hashedPassword) {
  return hashPassword(password) === hashedPassword;
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

const users = loadUsers();
const rankings = loadRankings();
const games = new Map();
const waitingPlayers = new Map();
const sseClients = new Map();

function generateGameId() {
  return crypto.randomBytes(8).toString('hex');
}

function rollDice() {
  const rand = Math.random();
  let lightCount;
  if (rand < 0.0625) lightCount = 0;
  else if (rand < 0.3125) lightCount = 1;
  else if (rand < 0.6875) lightCount = 2;
  else if (rand < 0.9375) lightCount = 3;
  else lightCount = 4;

  const stickValues = [false, false, false, false];
  const indices = [0, 1, 2, 3];
  for (let i = 0; i < lightCount; i++) {
    const idx = Math.floor(Math.random() * indices.length);
    stickValues[indices[idx]] = true;
    indices.splice(idx, 1);
  }

  const value = lightCount === 0 ? 6 : lightCount;
  const keepPlaying = [1, 4, 6].includes(value);

  return { stickValues, value, keepPlaying };
}

function initializeBoard(size) {
  const pieces = new Array(4 * size).fill(null);
  for (let i = 0; i < size; i++) {
    pieces[i] = { color: 'Blue', inMotion: false, reachedLastRow: false };
  }
  for (let i = 0; i < size; i++) {
    pieces[3 * size + (size - 1 - i)] = { color: 'Red', inMotion: false, reachedLastRow: false };
  }
  return pieces;
}

function calculateTarget(row, col, steps, isBlue, size) {
  let newRow = row;
  let newCol = col;

  for (let i = 0; i < steps; i++) {
    if (isBlue) {
      if (newRow === 0 || newRow === 2) {
        newCol++;
        if (newCol >= size) { newRow++; newCol = size - 1; }
      } else {
        newCol--;
        if (newCol < 0) {
          if (newRow === 1) { newRow++; newCol = 0; }
          else if (newRow === 3) return null;
        }
      }
    } else {
      if (newRow === 3 || newRow === 1) {
        newCol--;
        if (newCol < 0) { newRow--; newCol = 0; }
      } else {
        newCol++;
        if (newCol >= size) {
          if (newRow === 2) { newRow--; newCol = size - 1; }
          else if (newRow === 0) return null;
        }
      }
    }
    if (newRow < 0 || newRow >= 4) return null;
  }

  return newRow * size + newCol;
}

function canMove(game, nick) {
  const color = game.players[nick];
  const size = game.size;
  
  for (let i = 0; i < game.pieces.length; i++) {
    const piece = game.pieces[i];
    if (!piece || piece.color !== color) continue;
    if (!piece.inMotion && game.dice.value !== 1) continue;
    
    const row = Math.floor(i / size);
    const col = i % size;
    const target = calculateTarget(row, col, game.dice.value, color === 'Blue', size);
    
    if (target !== null) {
      const targetPiece = game.pieces[target];
      if (!targetPiece || targetPiece.color !== color) {
        return true;
      }
    }
  }
  
  return false;
}

function sendSSEUpdate(gameId, data) {
  const game = games.get(gameId);
  if (!game) return;

  for (const nick of Object.keys(game.players)) {
    const key = `${nick}-${gameId}`;
    const client = sseClients.get(key);
    if (client) {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  }
}

function updateRanking(group, size, winnerNick, loserNick) {
  const key = `${group}-${size}`;
  let rankingList = rankings.get(key) || [];
  
  let winner = rankingList.find(r => r.nick === winnerNick);
  if (winner) {
    winner.games++;
    winner.victories++;
  } else {
    rankingList.push({ nick: winnerNick, games: 1, victories: 1 });
  }
  
  let loser = rankingList.find(r => r.nick === loserNick);
  if (loser) {
    loser.games++;
  } else {
    rankingList.push({ nick: loserNick, games: 1, victories: 0 });
  }
  
  rankingList.sort((a, b) => b.victories - a.victories || a.games - b.games);
  
  rankings.set(key, rankingList);
  saveRankings();
}

app.post('/register', (req, res) => {
  const { nick, password } = req.body;
  
  if (!nick || !password) {
    return res.json({ error: 'Missing nick or password' });
  }

  const existingHash = users.get(nick);
  if (existingHash) {
    if (!verifyPassword(password, existingHash)) {
      return res.json({ error: 'User registered with a different password' });
    }
  } else {
    users.set(nick, hashPassword(password));
    saveUsers();
  }

  res.json({});
});

function validateCredentials(nick, password) {
  const hashedPassword = users.get(nick);
  if (!hashedPassword) return false;
  return verifyPassword(password, hashedPassword);
}

app.post('/join', (req, res) => {
  const { group, nick, password, size } = req.body;

  if (!validateCredentials(nick, password)) {
    return res.json({ error: 'Invalid credentials' });
  }

  if (![7, 9, 11, 13, 15].includes(size)) {
    return res.json({ error: `invalid size '${size}'` });
  }

  const waitKey = `${group}-${size}`;
  const waiting = waitingPlayers.get(waitKey);

  if (waiting && waiting.nick !== nick) {
    const gameId = waiting.gameId;
    const game = games.get(gameId);
    
    const colors = Math.random() > 0.5 ? ['Blue', 'Red'] : ['Red', 'Blue'];
    game.players[waiting.nick] = colors[0];
    game.players[nick] = colors[1];
    game.turn = colors[0] === 'Blue' ? waiting.nick : nick;
    game.initial = game.turn;
    
    waitingPlayers.delete(waitKey);

    setTimeout(() => {
      sendSSEUpdate(gameId, {
        pieces: game.pieces,
        players: game.players,
        turn: game.turn,
        initial: game.initial,
        step: 'from'
      });
    }, 100);

    res.json({ game: gameId });
  } else {
    const gameId = generateGameId();
    games.set(gameId, {
      id: gameId,
      group,
      size,
      pieces: initializeBoard(size),
      players: {},
      turn: null,
      initial: null,
      step: 'from',
      dice: null,
      selected: [],
      winner: null
    });
    
    waitingPlayers.set(waitKey, { nick, gameId });
    res.json({ game: gameId });
  }
});

app.post('/leave', (req, res) => {
  const { nick, password, game: gameId } = req.body;

  if (!validateCredentials(nick, password)) {
    return res.json({ error: 'Invalid credentials' });
  }

  const game = games.get(gameId);
  if (game) {
    const opponent = Object.keys(game.players).find(n => n !== nick);
    if (opponent) {
      game.winner = opponent;
      updateRanking(game.group, game.size, opponent, nick);
      sendSSEUpdate(gameId, { winner: opponent });
    }
    games.delete(gameId);
  }

  res.json({});
});

app.post('/roll', (req, res) => {
  const { nick, password, game: gameId, size } = req.body;

  if (!validateCredentials(nick, password)) {
    return res.json({ error: 'Invalid credentials' });
  }

  const game = games.get(gameId);
  if (!game) {
    return res.json({ error: 'Game not found' });
  }

  if (game.turn !== nick) {
    return res.json({ error: 'Not your turn to play' });
  }

  if (game.dice) {
    return res.json({ error: 'Already rolled' });
  }

  const dice = rollDice();
  game.dice = dice;

  const mustPass = !canMove(game, nick);
  game.mustPass = mustPass;

  sendSSEUpdate(gameId, {
    dice,
    turn: game.turn,
    mustPass
  });

  res.json({});
});

app.post('/pass', (req, res) => {
  const { nick, password, game: gameId, size } = req.body;

  if (!validateCredentials(nick, password)) {
    return res.json({ error: 'Invalid credentials' });
  }

  const game = games.get(gameId);
  if (!game || game.turn !== nick) {
    return res.json({ error: 'Not your turn' });
  }

  const players = Object.keys(game.players);
  game.turn = players.find(n => n !== nick);
  game.dice = null;
  game.step = 'from';
  game.selected = [];
  game.mustPass = null;

  sendSSEUpdate(gameId, {
    turn: game.turn,
    step: 'from',
    dice: null,
    selected: []
  });

  res.json({});
});

app.post('/notify', (req, res) => {
  const { nick, password, game: gameId, move } = req.body;

  if (!validateCredentials(nick, password)) {
    return res.json({ error: 'Invalid credentials' });
  }

  const game = games.get(gameId);
  if (!game || game.turn !== nick) {
    return res.json({ error: 'Not your turn' });
  }

  const color = game.players[nick];
  const size = game.size;

  if (game.step === 'from') {
    const piece = game.pieces[move];
    if (!piece || piece.color !== color) {
      return res.json({ error: 'Invalid piece selection' });
    }

    if (!piece.inMotion && game.dice.value !== 1) {
      return res.json({ error: 'Piece not in motion, need Tab (1)' });
    }

    game.selected = [move];
    game.step = 'to';

    sendSSEUpdate(gameId, {
      selected: game.selected,
      step: 'to'
    });

  } else if (game.step === 'to') {
    if (game.selected.length > 0 && game.selected[0] === move) {
      game.selected = [];
      game.step = 'from';
      
      sendSSEUpdate(gameId, {
        selected: [],
        step: 'from'
      });
      return res.json({});
    }
    
    const clickedPiece = game.pieces[move];
    if (clickedPiece && clickedPiece.color === color) {
      if (!clickedPiece.inMotion && game.dice.value !== 1) {
        return res.json({ error: 'Piece not in motion, need Tab (1)' });
      }
      
      game.selected = [move];
      
      sendSSEUpdate(gameId, {
        selected: game.selected,
        step: 'to'
      });
      return res.json({});
    }
    
    const fromIndex = game.selected[0];
    const piece = game.pieces[fromIndex];
    const row = Math.floor(fromIndex / size);
    const col = fromIndex % size;
    const targetIndex = calculateTarget(row, col, game.dice.value, color === 'Blue', size);

    if (move !== targetIndex) {
      return res.json({ error: 'Invalid target' });
    }

    game.pieces[fromIndex] = null;
    
    piece.inMotion = true;
    const toRow = Math.floor(move / size);
    if ((color === 'Blue' && toRow === 3) || (color === 'Red' && toRow === 0)) {
      piece.reachedLastRow = true;
    }
    game.pieces[move] = piece;

    const blueCount = game.pieces.filter(p => p && p.color === 'Blue').length;
    const redCount = game.pieces.filter(p => p && p.color === 'Red').length;

    if (blueCount === 0 || redCount === 0) {
      const winnerColor = blueCount === 0 ? 'Red' : 'Blue';
      game.winner = Object.entries(game.players).find(([n, c]) => c === winnerColor)[0];
      const loser = Object.keys(game.players).find(n => n !== game.winner);
      
      updateRanking(game.group, game.size, game.winner, loser);
      
      sendSSEUpdate(gameId, {
        pieces: game.pieces,
        winner: game.winner
      });
      return res.json({});
    }

    if (game.dice.keepPlaying) {
      game.dice = null;
      game.step = 'from';
      game.selected = [];
    } else {
      const players = Object.keys(game.players);
      game.turn = players.find(n => n !== nick);
      game.dice = null;
      game.step = 'from';
      game.selected = [];
    }

    sendSSEUpdate(gameId, {
      pieces: game.pieces,
      turn: game.turn,
      step: 'from',
      dice: null,
      selected: []
    });
  }

  res.json({});
});

app.get('/update', (req, res) => {
  const { nick, game: gameId } = req.query;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const key = `${nick}-${gameId}`;
  sseClients.set(key, res);

  const game = games.get(gameId);
  if (game && game.turn) {
    res.write(`data: ${JSON.stringify({
      pieces: game.pieces,
      players: game.players,
      turn: game.turn,
      initial: game.initial,
      step: game.step
    })}\n\n`);
  }

  req.on('close', () => {
    sseClients.delete(key);
  });
});

app.post('/ranking', (req, res) => {
  const { group, size } = req.body;
  const key = `${group}-${size}`;
  const ranking = rankings.get(key) || [];
  res.json({ ranking });
});

app.listen(PORT, () => {
  console.log(`Tab Game Server running at http://localhost:${PORT}`);
});