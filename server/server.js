const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

process.on('uncaughtException', (err) => console.error('ОШИБКА:', err));
process.on('unhandledRejection', (reason) => console.error('REJECTION:', reason));

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Сброс БД
app.get('/reset-db-123', (req, res) => {
  db = { users: {}, lobbies: {} };
  saveDB();
  res.send('<h1>База данных успешно очищена! Теперь можно регистрироваться.</h1><a href="/">Вернуться на сайт</a>');
});

app.use(express.static(__dirname));

const dbFile = path.join(__dirname, 'db.json');
let db = { users: {}, lobbies: {} };

function loadDB() {
  if (fs.existsSync(dbFile)) { 
    try { 
      const raw = fs.readFileSync(dbFile, 'utf8');
      if (raw.trim() !== '') db = JSON.parse(raw); 
    } catch (e) { console.error('Ошибка чтения БД'); } 
  }
  if (!db.users || typeof db.users !== 'object') db.users = {};
  if (!db.lobbies || typeof db.lobbies !== 'object') db.lobbies = {};
}
function saveDB() {
  try { fs.writeFileSync(dbFile, JSON.stringify(db, null, 2)); } catch (e) {}
}
loadDB();

function generateAvatar() {
  const shapes = ['square', 'circle', 'triangle', 'diamond', 'hexagon', 'star'];
  return shapes[Math.floor(Math.random() * shapes.length)];
}

function sanitizeLobby(lobby) {
  return {
    id: lobby.id, name: lobby.name, maxPlayers: lobby.maxPlayers, hasChat: lobby.hasChat, adminId: lobby.adminId,
    players: lobby.players.map(p => ({ id: p.id, login: p.login, nickname: p.nickname, elo: p.elo, avatar: p.avatar, avatarUrl: p.avatarUrl, nameColor: p.nameColor || 'default' })),
    chat: lobby.chat, gameState: lobby.gameState || null
  };
}

function handleLeaveLobby(socket, lobby, lobbyId) {
  lobby.players = lobby.players.filter(p => p.id !== socket.userId);
  socket.leave(lobbyId);
  
  if (lobby.players.length === 0) {
    delete db.lobbies[lobbyId];
  } else {
    if (lobby.adminId === socket.userId) {
      lobby.adminId = lobby.players[Math.floor(Math.random() * lobby.players.length)].id;
    }
    if (lobby.gameState && (lobby.gameState.creatorId === socket.userId || lobby.gameState.guesserId === socket.userId)) {
      lobby.gameState = null;
      io.to(lobbyId).emit('gameCancelled', { reason: 'Игрок вышел из игры' });
    }
  }
  saveDB();
  
  if (db.lobbies[lobbyId]) io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(db.lobbies[lobbyId]));
  io.emit('lobbiesUpdated');
}

io.on('connection', (socket) => {
  socket.on('register', ({ login, nickname }, callback) => {
    if (!login || !nickname) return callback({ error: 'Заполните все поля' });
    
    let existing = null;
    for (const id in db.users) {
      if (db.users[id] && db.users[id].login === login) { existing = db.users[id]; break; }
    }
    if (existing) return callback({ error: 'Логин уже занят' });
    
    const userId = crypto.randomUUID();
    const token = crypto.randomUUID();
    const user = { id: userId, login, nickname, elo: 1000, avatar: generateAvatar(), avatarUrl: null, nameColor: 'default', token, createdAt: Date.now() };
    
    db.users[userId] = user;
    saveDB();
    socket.userId = userId;
    callback({ success: true, user: { id: userId, login, nickname, elo: user.elo, avatar: user.avatar, avatarUrl: user.avatarUrl, nameColor: user.nameColor }, token });
  });

  socket.on('login', ({ token }, callback) => {
    const user = Object.values(db.users).find(u => u.token === token);
    if (!user) return callback({ error: 'Неверный токен' });
    socket.userId = user.id;
    callback({ success: true, user: { id: user.id, login: user.login, nickname: user.nickname, elo: user.elo, avatar: user.avatar, avatarUrl: user.avatarUrl, nameColor: user.nameColor || 'default' } });
  });

  socket.on('updateNickname', ({ userId, nickname }, callback) => {
    const user = db.users[userId]; if (!user) return callback({ error: 'Ошибка' });
    user.nickname = nickname; saveDB(); callback({ success: true });
  });

  socket.on('updateAvatar', ({ userId, avatarUrl }, callback) => {
    const user = db.users[userId]; if (!user) return callback({ error: 'Ошибка' });
    user.avatarUrl = avatarUrl; saveDB();
    Object.values(db.lobbies).forEach(lobby => {
      const p = lobby.players.find(p => p.id === userId);
      if (p) p.avatarUrl = avatarUrl;
    });
    callback({ success: true }); io.emit('lobbiesUpdated');
  });

  socket.on('buyColor', ({ userId, colorId, price }, callback) => {
    const user = db.users[userId];
    if (!user) return callback({ error: 'Ошибка' });
    if (user.elo < price) return callback({ error: 'Недостаточно ЭЛО' });
    
    user.elo -= price;
    user.nameColor = colorId;
    saveDB();
    callback({ success: true, newElo: user.elo });
  });

  socket.on('equipColor', ({ userId, colorId }, callback) => {
    const user = db.users[userId];
    if (!user) return callback({ error: 'Ошибка' });
    user.nameColor = colorId;
    saveDB();
    callback({ success: true });
  });

  socket.on('devUnlockAll', ({ userId }, callback) => {
    const user = db.users[userId];
    if (!user) return callback({ error: 'Ошибка' });
    user.elo = 10000; 
    saveDB();
    callback({ success: true, newElo: user.elo });
  });

  socket.on('getLeaderboard', ({ userId }, callback) => {
    const sortedUsers = Object.values(db.users).sort((a, b) => b.elo - a.elo);
    const top100 = sortedUsers.slice(0, 100).map((u, index) => ({
      id: u.id, nickname: u.nickname, login: u.login, elo: u.elo, nameColor: u.nameColor || 'default', avatar: u.avatar, avatarUrl: u.avatarUrl, rank: index + 1
    }));
    
    let userRank = sortedUsers.findIndex(u => u.id === userId) + 1;
    if (userRank === 0) userRank = sortedUsers.length + 1;

    callback({ top100, userRank, myData: { nickname: sortedUsers[userRank-1]?.nickname, elo: sortedUsers[userRank-1]?.elo, nameColor: sortedUsers[userRank-1]?.nameColor } });
  });

  socket.on('getPlayerRank', ({ targetId }, callback) => {
    const sortedUsers = Object.values(db.users).sort((a, b) => b.elo - a.elo);
    const rank = sortedUsers.findIndex(u => u.id === targetId) + 1;
    callback({ rank });
  });

  socket.on('getLobbies', (callback) => {
    callback(Object.values(db.lobbies).map(l => ({
      id: l.id, name: l.name, players: l.players.length, maxPlayers: l.maxPlayers, hasChat: l.hasChat, adminId: l.adminId
    })));
  });

  socket.on('createLobby', ({ name, maxPlayers, hasChat, user }, callback) => {
    if (Object.values(db.lobbies).some(l => l.name === name)) return callback({ error: 'Лобби с таким именем уже существует' });
    const lobbyId = crypto.randomUUID();
    const lobby = { id: lobbyId, name, maxPlayers, hasChat, adminId: user.id, players: [user], banned: [], chat: [], gameState: null, createdAt: Date.now() };
    db.lobbies[lobbyId] = lobby;
    saveDB(); socket.join(lobbyId); callback({ success: true, lobby: sanitizeLobby(lobby) }); io.emit('lobbiesUpdated');
  });

  socket.on('joinLobby', ({ lobbyId, user }, callback) => {
    const lobby = db.lobbies[lobbyId];
    if (!lobby) return callback({ error: 'Лобби не найдено' });
    if (lobby.banned.includes(user.id)) return callback({ error: 'Вы забанены' });
    if (lobby.players.length >= lobby.maxPlayers) return callback({ error: 'Лобби заполнено' });
    if (lobby.players.find(p => p.id === user.id)) return callback({ error: 'Вы уже здесь' });

    lobby.players.push(user); saveDB(); socket.join(lobbyId);
    callback({ success: true, lobby: sanitizeLobby(lobby) });
    io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(lobby)); io.emit('lobbiesUpdated');
  });

  socket.on('leaveLobby', ({ lobbyId }, callback) => {
    const lobby = db.lobbies[lobbyId];
    if (lobby) handleLeaveLobby(socket, lobby, lobbyId);
    callback({ success: true });
  });

  socket.on('disconnect', () => {
    if (!socket.userId) return;
    for (const lobbyId in db.lobbies) {
      const lobby = db.lobbies[lobbyId];
      if (lobby.players.find(p => p.id === socket.userId)) { handleLeaveLobby(socket, lobby, lobbyId); break; }
    }
  });

  socket.on('adminAction', ({ lobbyId, targetId, action, adminId }, callback) => {
    const lobby = db.lobbies[lobbyId];
    if (!lobby || lobby.adminId !== adminId) return callback({ error: 'Нет прав' });

    let kicked = false;
    if (action === 'kick') { lobby.players = lobby.players.filter(p => p.id !== targetId); kicked = true; }
    else if (action === 'ban') { if (!lobby.banned.includes(targetId)) lobby.banned.push(targetId); lobby.players = lobby.players.filter(p => p.id !== targetId); kicked = true; }
    else if (action === 'transferAdmin') { if (lobby.players.find(p => p.id === targetId)) lobby.adminId = targetId; }
    saveDB(); callback({ success: true });
    
    if (kicked) io.to(lobbyId).emit('kickedPlayer', { targetId, lobbyId });
    io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(lobby));
  });

  socket.on('chatMessage', ({ lobbyId, user, text }, callback) => {
    const lobby = db.lobbies[lobbyId];
    if (!lobby || !lobby.hasChat) return callback({ error: 'Чат выключен' });
    const msg = { id: crypto.randomUUID(), userId: user.id, nickname: user.nickname, nameColor: user.nameColor, text, time: Date.now() };
    lobby.chat.push(msg); if (lobby.chat.length > 30) lobby.chat.shift(); saveDB();
    io.to(lobbyId).emit('newMessage', msg); callback({ success: true });
  });

  // ================= ИГРА =================

  socket.on('openGameMenu', ({ lobbyId }, callback) => {
    const lobby = db.lobbies[lobbyId];
    if (!lobby) return;
    lobby.gameState = { status: 'menu' }; saveDB();
    io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(lobby)); callback({ success: true });
  });

  socket.on('selectGame', ({ lobbyId, gameId }, callback) => {
    const lobby = db.lobbies[lobbyId];
    if (!lobby || !lobby.players.length) return callback({ error: 'Ошибка' });
    
    const randomCreator = lobby.players[Math.floor(Math.random() * lobby.players.length)];
    lobby.gameState = {
      status: 'creating', gameId, creatorId: randomCreator.id, creatorName: randomCreator.nickname,
      sequence: [null, null, null, null, null], guesserId: null, guesserName: null, round: 1, guess: [null, null, null, null, null]
    };
    saveDB(); io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(lobby));
    io.to(lobbyId).emit('gameStartedAnimation', { gameName: 'Угадай Последовательность', creatorName: randomCreator.nickname }); callback({ success: true });
  });

  socket.on('gameAction', ({ lobbyId, playerId, action, index, shape, role }, callback) => {
    const lobby = db.lobbies[lobbyId];
    if (!lobby || !lobby.gameState) return;
    const gs = lobby.gameState;
    const isCreator = role === 'creator' && gs.creatorId === playerId;
    const isGuesser = role === 'guesser' && gs.guesserId === playerId;

    if (isCreator || isGuesser) {
      const targetArr = isCreator ? gs.sequence : gs.guess;
      if (action === 'place') targetArr[index] = shape;
      if (action === 'remove') targetArr[index] = null;
      saveDB(); io.to(lobbyId).emit('gameStateUpdate', gs);
    }
    callback({ success: true });
  });

  socket.on('submitSequence', ({ lobbyId, playerId }, callback) => {
    const lobby = db.lobbies[lobbyId];
    if (!lobby || !lobby.gameState) return;
    const gs = lobby.gameState;
    if (gs.creatorId !== playerId || gs.sequence.includes(null)) return callback({ error: 'Ошибка' });

    const eligibleGuessers = lobby.players.filter(p => p.id !== gs.creatorId);
    if (eligibleGuessers.length === 0) return; 

    const firstGuesser = eligibleGuessers[0];

    gs.status = 'guessing'; 
    gs.guesserId = firstGuesser.id; 
    gs.guesserName = firstGuesser.nickname;
    gs.guess = [null, null, null, null, null];
    
    saveDB(); io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(lobby)); callback({ success: true });
  });

  socket.on('submitGuess', ({ lobbyId, playerId }, callback) => {
    const lobby = db.lobbies[lobbyId];
    if (!lobby || !lobby.gameState) return;
    const gs = lobby.gameState;
    if (gs.guesserId !== playerId || gs.guess.includes(null)) return callback({ error: 'Ошибка' });

    const seq = gs.sequence;
    const guess = gs.guess;
    const result = new Array(5).fill('red');
    const seqCopy = [...seq];
    const guessCopy = [...guess];

    for (let i = 0; i < 5; i++) {
      if (guess[i] === seq[i]) { result[i] = 'green'; seqCopy[i] = null; guessCopy[i] = null; }
    }
    for (let i = 0; i < 5; i++) {
      if (guessCopy[i] !== null) {
        const idx = seqCopy.indexOf(guessCopy[i]);
        if (idx !== -1) { result[i] = 'yellow'; seqCopy[idx] = null; }
      }
    }

    const isWin = result.every(r => r === 'green');

    if (isWin) {
      const counts = {}; seq.forEach(s => counts[s] = (counts[s] || 0) + 1);
      const maxSame = Math.max(...Object.values(counts));
      let guesserElo = 100;
      if (maxSame === 5) guesserElo = 10;
      else if (maxSame === 4) guesserElo = 21;
      else if (maxSame === 3) guesserElo = 39;
      else if (maxSame === 2) {
        const pairs = Object.values(counts).filter(c => c === 2).length;
        guesserElo = pairs > 1 ? 12 : 68;
      }
      const creatorElo = gs.round * 5;
      const creator = db.users[gs.creatorId]; const guesser = db.users[gs.guesserId];
      if (creator) creator.elo += creatorElo;
      if (guesser) guesser.elo += guesserElo;

      gs.status = 'ended'; gs.result = result; gs.winnerName = gs.guesserName; saveDB();
      
      io.to(lobbyId).emit('gameResult', { result, winnerName: gs.guesserName, sequence: seq });
      
      setTimeout(() => {
        const l = db.lobbies[lobbyId];
        if (l) { l.gameState = null; saveDB(); io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(l)); }
      }, 4000);
      
    } else {
      gs.round++;
      if (gs.round > 10) {
        const creator = db.users[gs.creatorId]; if (creator) creator.elo += 50;
        gs.status = 'ended'; gs.result = result; gs.winnerName = null; saveDB();
        
        io.to(lobbyId).emit('gameResult', { result, winnerName: null, sequence: seq });
        setTimeout(() => {
          const l = db.lobbies[lobbyId];
          if (l) { l.gameState = null; saveDB(); io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(l)); }
        }, 4000);
        return;
      }

      const eligibleGuessers = lobby.players.filter(p => p.id !== gs.creatorId);
      const currentIndex = eligibleGuessers.findIndex(p => p.id === gs.guesserId);
      const nextPlayer = eligibleGuessers[(currentIndex + 1) % eligibleGuessers.length];
      
      gs.guesserId = nextPlayer.id; 
      gs.guesserName = nextPlayer.nickname; 
      gs.guess = [null, null, null, null, null];
      saveDB();
      
      io.to(lobbyId).emit('gameTurnResult', { result, nextGuesserName: nextPlayer.nickname, guess: guess });
      io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(lobby));
    }
    callback({ success: true });
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => console.log(`Сервер на порту ${PORT}`));
