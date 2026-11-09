const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- ЗАЩИТА ОТ ПАДЕНИЙ ---
process.on('uncaughtException', (err) => {
  console.error('КРИТИЧЕСКАЯ ОШИБКА (uncaughtException):', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Необработанный rejection:', reason);
});
// --------------------------

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Health-check для RelaxDev
app.get('/health', (req, res) => res.send('ok'));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, '../client')));

const dbFile = path.join(__dirname, 'db.json');
let db = { users: {}, lobbies: {} };

function loadDB() {
  if (fs.existsSync(dbFile)) {
    try { db = JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch (e) {}
  }
}
function saveDB() {
  try {
    fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('Ошибка записи в БД:', e);
  }
}
loadDB();

function generateAvatar() {
  const shapes = ['square', 'circle', 'triangle', 'diamond', 'hexagon', 'star'];
  return shapes[Math.floor(Math.random() * shapes.length)];
}

function sanitizeLobby(lobby) {
  return {
    id: lobby.id,
    name: lobby.name,
    maxPlayers: lobby.maxPlayers,
    hasChat: lobby.hasChat,
    adminId: lobby.adminId,
    players: lobby.players.map(p => ({ id: p.id, login: p.login, nickname: p.nickname, elo: p.elo, avatar: p.avatar, avatarUrl: p.avatarUrl })),
    chat: lobby.chat,
    gameState: lobby.gameState || null
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
    // Прерывание игры, если кто-то вышел
    if (lobby.gameState && (lobby.gameState.creatorId === socket.userId || lobby.gameState.guesserId === socket.userId)) {
      lobby.gameState = null;
      io.to(lobbyId).emit('gameCancelled', { reason: 'Игрок вышел из игры' });
    }
  }
  saveDB();
  
  if (db.lobbies[lobbyId]) {
    io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(db.lobbies[lobbyId]));
  }
  io.emit('lobbiesUpdated');
}

io.on('connection', (socket) => {
  socket.on('register', ({ login, nickname }, callback) => {
    const existing = Object.values(db.users).find(u => u.login === login);
    if (existing) return callback({ error: 'Логин уже занят' });
    
    const userId = crypto.randomUUID();
    const token = crypto.randomUUID();
    const user = { id: userId, login, nickname, elo: 1000, avatar: generateAvatar(), avatarUrl: null, token, createdAt: Date.now() };
    
    db.users[userId] = user;
    saveDB();
    socket.userId = userId;
    callback({ success: true, user: { id: userId, login, nickname, elo: user.elo, avatar: user.avatar, avatarUrl: user.avatarUrl }, token });
  });

  socket.on('login', ({ token }, callback) => {
    const user = Object.values(db.users).find(u => u.token === token);
    if (!user) return callback({ error: 'Неверный токен' });
    socket.userId = user.id;
    callback({ success: true, user: { id: user.id, login: user.login, nickname: user.nickname, elo: user.elo, avatar: user.avatar, avatarUrl: user.avatarUrl } });
  });

  socket.on('updateNickname', ({ userId, nickname }, callback) => {
    const user = db.users[userId];
    if (!user) return callback({ error: 'Пользователь не найден' });
    user.nickname = nickname;
    saveDB();
    callback({ success: true });
  });

  socket.on('updateAvatar', ({ userId, avatarUrl }, callback) => {
    const user = db.users[userId];
    if (!user) return callback({ error: 'Пользователь не найден' });
    user.avatarUrl = avatarUrl;
    saveDB();
    Object.values(db.lobbies).forEach(lobby => {
      const p = lobby.players.find(p => p.id === userId);
      if (p) p.avatarUrl = avatarUrl;
    });
    callback({ success: true });
    io.emit('lobbiesUpdated');
  });

  socket.on('getLobbies', (callback) => {
    callback(Object.values(db.lobbies).map(l => ({
      id: l.id, name: l.name, players: l.players.length, maxPlayers: l.maxPlayers, hasChat: l.hasChat, adminId: l.adminId
    })));
  });

  socket.on('createLobby', ({ name, maxPlayers, hasChat, user }, callback) => {
    if (Object.values(db.lobbies).some(l => l.name === name)) return callback({ error: 'Лобби с таким именем уже существует' });
    const lobbyId = crypto.randomUUID();
    const lobby = {
      id: lobbyId, name, maxPlayers, hasChat, adminId: user.id,
      players: [user], banned: [], chat: [], gameState: null, createdAt: Date.now()
    };
    db.lobbies[lobbyId] = lobby;
    saveDB();
    socket.join(lobbyId);
    callback({ success: true, lobby: sanitizeLobby(lobby) });
    io.emit('lobbiesUpdated');
  });

  socket.on('joinLobby', ({ lobbyId, user }, callback) => {
    const lobby = db.lobbies[lobbyId];
    if (!lobby) return callback({ error: 'Лобби не найдено' });
    if (lobby.banned.includes(user.id)) return callback({ error: 'Вы забанены в этом лобби' });
    if (lobby.players.length >= lobby.maxPlayers) return callback({ error: 'Лобби заполнено' });
    if (lobby.players.find(p => p.id === user.id)) return callback({ error: 'Вы уже в лобби' });

    lobby.players.push(user);
    saveDB();
    socket.join(lobbyId);
    callback({ success: true, lobby: sanitizeLobby(lobby) });
    io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(lobby));
    io.emit('lobbiesUpdated');
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
      if (lobby.players.find(p => p.id === socket.userId)) {
        handleLeaveLobby(socket, lobby, lobbyId);
        break;
      }
    }
  });

  socket.on('adminAction', ({ lobbyId, targetId, action, adminId }, callback) => {
    const lobby = db.lobbies[lobbyId];
    if (!lobby || lobby.adminId !== adminId) return callback({ error: 'Нет прав' });

    let kicked = false;
    if (action === 'kick') {
      lobby.players = lobby.players.filter(p => p.id !== targetId);
      kicked = true;
    } else if (action === 'ban') {
      if (!lobby.banned.includes(targetId)) lobby.banned.push(targetId);
      lobby.players = lobby.players.filter(p => p.id !== targetId);
      kicked = true;
    } else if (action === 'transferAdmin') {
      if (lobby.players.find(p => p.id === targetId)) lobby.adminId = targetId;
    }
    saveDB();
    callback({ success: true });
    
    if (kicked) {
      io.to(lobbyId).emit('kickedPlayer', { targetId, lobbyId }); // Чтобы выкинуть его интерфейс
    }
    io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(lobby));
  });

  socket.on('chatMessage', ({ lobbyId, user, text }, callback) => {
    const lobby = db.lobbies[lobbyId];
    if (!lobby || !lobby.hasChat) return callback({ error: 'Чат выключен' });

    const msg = { id: crypto.randomUUID(), userId: user.id, nickname: user.nickname, text, time: Date.now() };
    lobby.chat.push(msg);
    if (lobby.chat.length > 30) lobby.chat.shift();
    saveDB();
    io.to(lobbyId).emit('newMessage', msg);
    callback({ success: true });
  });

  // ================= ИГРОВАЯ ЛОГИКА =================

  // Запуск выбора игры
  socket.on('openGameMenu', ({ lobbyId }, callback) => {
    const lobby = db.lobbies[lobbyId];
    if (!lobby) return callback({ error: 'Лобби не найдено' });
    lobby.gameState = { status: 'menu' };
    saveDB();
    io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(lobby));
    callback({ success: true });
  });

  // Выбор игры
  socket.on('selectGame', ({ lobbyId, gameId }, callback) => {
    const lobby = db.lobbies[lobbyId];
    if (!lobby) return callback({ error: 'Ошибка' });
    
    const randomCreator = lobby.players[Math.floor(Math.random() * lobby.players.length)];
    lobby.gameState = {
      status: 'creating',
      gameId,
      creatorId: randomCreator.id,
      creatorName: randomCreator.nickname,
      sequence: [null, null, null, null, null],
      guesserId: null,
      guesserName: null,
      round: 1,
      guess: [null, null, null, null, null]
    };
    saveDB();
    io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(lobby));
    io.to(lobbyId).emit('gameStartedAnimation', { creatorName: randomCreator.nickname });
    callback({ success: true });
  });

  // Действия в игре (поставить/убрать фигуру)
  socket.on('gameAction', ({ lobbyId, playerId, action, index, shape, role }, callback) => {
    const lobby = db.lobbies[lobbyId];
    if (!lobby || !lobby.gameState) return callback({ error: 'Игра не найдена' });

    const gs = lobby.gameState;
    const isCreator = role === 'creator' && gs.creatorId === playerId;
    const isGuesser = role === 'guesser' && gs.guesserId === playerId;

    if (isCreator || isGuesser) {
      const targetArr = isCreator ? gs.sequence : gs.guess;
      if (action === 'place') targetArr[index] = shape;
      if (action === 'remove') targetArr[index] = null;
      
      saveDB();
      io.to(lobbyId).emit('gameStateUpdate', gs);
    }
    callback({ success: true });
  });

  // Создатель загадал
  socket.on('submitSequence', ({ lobbyId, playerId }, callback) => {
    const lobby = db.lobbies[lobbyId];
    if (!lobby || !lobby.gameState) return;
    const gs = lobby.gameState;
    if (gs.creatorId !== playerId || gs.sequence.includes(null)) return callback({ error: 'Ошибка' });

    // Выбираем первого угадывающего (по индексу в лобби)
    const creatorIndex = lobby.players.findIndex(p => p.id === gs.creatorId);
    const nextPlayer = lobby.players[(creatorIndex + 1) % lobby.players.length];

    gs.status = 'guessing';
    gs.guesserId = nextPlayer.id;
    gs.guesserName = nextPlayer.nickname;
    gs.guess = [null, null, null, null, null];
    saveDB();
    io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(lobby));
    callback({ success: true });
  });

  // Угадывающий отправил вариант
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

    // 1. Точное совпадение (Зеленый)
    for (let i = 0; i < 5; i++) {
      if (guess[i] === seq[i]) {
        result[i] = 'green';
        seqCopy[i] = null;
        guessCopy[i] = null;
      }
    }
    // 2. Есть, но не на месте (Желтый)
    for (let i = 0; i < 5; i++) {
      if (guessCopy[i] !== null) {
        const idx = seqCopy.indexOf(guessCopy[i]);
        if (idx !== -1) {
          result[i] = 'yellow';
          seqCopy[idx] = null;
        }
      }
    }

    const isWin = result.every(r => r === 'green');

    if (isWin) {
      // Победа! Считаем ЭЛО
      const counts = {};
      seq.forEach(s => counts[s] = (counts[s] || 0) + 1);
      const maxSame = Math.max(...Object.values(counts));
      
      let guesserElo = 100;
      if (maxSame === 5) guesserElo = 10;
      else if (maxSame === 4) guesserElo = 21;
      else if (maxSame === 3) guesserElo = 39;
      else if (maxSame === 2) {
        const pairs = Object.values(counts).filter(c => c === 2).length;
        if (pairs > 1) guesserElo = 12;
        else guesserElo = 68;
      }

      const creatorElo = gs.round * 5;

      const creator = db.users[gs.creatorId];
      const guesser = db.users[gs.guesserId];
      if (creator) creator.elo += creatorElo;
      if (guesser) guesser.elo += guesserElo;

      gs.status = 'ended';
      gs.result = result;
      gs.winnerName = gs.guesserName;
      saveDB();
      
      io.to(lobbyId).emit('gameResult', { result, winnerName: gs.guesserName, sequence: seq });
      
      setTimeout(() => {
        const l = db.lobbies[lobbyId];
        if (l) {
          l.gameState = null;
          saveDB();
          io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(l));
        }
      }, 4000); // Через 4 секунды возвращаем всех в лобби
      
    } else {
      // Не угадал. Передаем ход
      gs.round++;
      if (gs.round > 10) {
        // Проигрыш по раундам
        const creator = db.users[gs.creatorId];
        if (creator) creator.elo += 50;
        
        gs.status = 'ended';
        gs.result = result;
        gs.winnerName = null;
        saveDB();
        
        io.to(lobbyId).emit('gameResult', { result, winnerName: null, sequence: seq });
        setTimeout(() => {
          const l = db.lobbies[lobbyId];
          if (l) { l.gameState = null; saveDB(); io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(l)); }
        }, 4000);
        return;
      }

      // Следующий игрок
      const currentIndex = lobby.players.findIndex(p => p.id === gs.guesserId);
      const nextPlayer = lobby.players[(currentIndex + 1) % lobby.players.length];
      
      gs.guesserId = nextPlayer.id;
      gs.guesserName = nextPlayer.nickname;
      gs.guess = [null, null, null, null, null];
      
      saveDB();
      io.to(lobbyId).emit('gameResultNext', { result, nextGuesserName: nextPlayer.nickname, sequence: seq });
      io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(lobby));
    }
    callback({ success: true });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Сервер на порту ${PORT}`));
