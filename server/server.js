const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Раздача статических файлов клиента (сайта)
app.use(express.static(__dirname));

// ---------- ПРОСТАЯ БАЗА ДАННЫХ (вместо lowdb) ----------
const dbFile = path.join(__dirname, 'db.json');
let db = { users: {}, lobbies: {} };

function loadDB() {
  if (fs.existsSync(dbFile)) {
    try { 
      db = JSON.parse(fs.readFileSync(dbFile, 'utf8')); 
    } catch (e) { 
      console.log('Ошибка чтения БД, создаем новую'); 
    }
  }
}

function saveDB() {
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
}

loadDB();

// ---------- Вспомогательные ----------
function generateAvatar() {
  const shapes = ['square', 'circle', 'triangle', 'diamond', 'hexagon', 'star'];
  return shapes[Math.floor(Math.random() * shapes.length)];
}

// ---------- Socket.IO ----------
io.on('connection', (socket) => {
  console.log('Подключён:', socket.id);

  // ---- Регистрация / Вход ----
  socket.on('register', ({ login, nickname }, callback) => {
    const existing = Object.values(db.users).find(u => u.login === login);
    if (existing) {
      return callback({ error: 'Логин уже занят' });
    }
    const userId = crypto.randomUUID();
    const token = crypto.randomUUID();
    const user = {
      id: userId,
      login,
      nickname,
      elo: 1000,
      avatar: generateAvatar(),
      avatarUrl: null,
      token,
      createdAt: Date.now()
    };
    db.users[userId] = user;
    saveDB();
    callback({ success: true, user: { id: userId, login, nickname, elo: user.elo, avatar: user.avatar }, token });
  });

  socket.on('login', ({ token }, callback) => {
    const user = Object.values(db.users).find(u => u.token === token);
    if (!user) return callback({ error: 'Неверный токен' });
    callback({ success: true, user: { id: user.id, login: user.login, nickname: user.nickname, elo: user.elo, avatar: user.avatar } });
  });

  socket.on('updateNickname', ({ userId, nickname }, callback) => {
    const user = db.users[userId];
    if (!user) return callback({ error: 'Пользователь не найден' });
    user.nickname = nickname;
    saveDB();
    callback({ success: true });
  });

  // ---- Лобби ----
  socket.on('getLobbies', (callback) => {
    const lobbies = Object.values(db.lobbies).map(l => ({
      id: l.id,
      name: l.name,
      players: l.players.length,
      maxPlayers: l.maxPlayers,
      hasChat: l.hasChat,
      adminId: l.adminId
    }));
    callback(lobbies);
  });

  socket.on('createLobby', ({ name, maxPlayers, hasChat, user }, callback) => {
    if (Object.values(db.lobbies).some(l => l.name === name)) {
      return callback({ error: 'Лобби с таким именем уже существует' });
    }
    if (maxPlayers < 2 || maxPlayers > 8) {
      return callback({ error: 'Количество игроков: от 2 до 8' });
    }
    const lobbyId = crypto.randomUUID();
    const lobby = {
      id: lobbyId,
      name,
      maxPlayers,
      hasChat,
      adminId: user.id,
      players: [user],
      banned: [],
      chat: [],
      createdAt: Date.now()
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

  socket.on('leaveLobby', ({ lobbyId, user }, callback) => {
    const lobby = db.lobbies[lobbyId];
    if (!lobby) return callback({ error: 'Лобби не найдено' });

    lobby.players = lobby.players.filter(p => p.id !== user.id);
    socket.leave(lobbyId);

    if (lobby.players.length === 0) {
      delete db.lobbies[lobbyId];
    } else if (lobby.adminId === user.id) {
      // Передача админки рандомному игроку
      lobby.adminId = lobby.players[Math.floor(Math.random() * lobby.players.length)].id;
    }
    saveDB();

    callback({ success: true });
    if (db.lobbies[lobbyId]) {
      io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(db.lobbies[lobbyId]));
    }
    io.emit('lobbiesUpdated');
  });

  // ---- Действия админа ----
  socket.on('adminAction', ({ lobbyId, targetId, action, adminId }, callback) => {
    const lobby = db.lobbies[lobbyId];
    if (!lobby || lobby.adminId !== adminId) return callback({ error: 'Нет прав' });

    if (action === 'kick') {
      lobby.players = lobby.players.filter(p => p.id !== targetId);
    } else if (action === 'ban') {
      if (!lobby.banned.includes(targetId)) lobby.banned.push(targetId);
      lobby.players = lobby.players.filter(p => p.id !== targetId);
    } else if (action === 'transferAdmin') {
      if (lobby.players.find(p => p.id === targetId)) {
        lobby.adminId = targetId;
      }
    }
    saveDB();
    callback({ success: true });
    io.to(lobbyId).emit('lobbyUpdated', sanitizeLobby(lobby));
  });

  // ---- Чат ----
  socket.on('chatMessage', ({ lobbyId, user, text }, callback) => {
    const lobby = db.lobbies[lobbyId];
    if (!lobby || !lobby.hasChat) return callback({ error: 'Чат выключен' });

    const msg = { id: crypto.randomUUID(), userId: user.id, nickname: user.nickname, text, time: Date.now() };
    lobby.chat.push(msg);
    if (lobby.chat.length > 30) lobby.chat.shift(); // каждое 31-е удаляется
    saveDB();

    io.to(lobbyId).emit('newMessage', msg);
    callback({ success: true });
  });

  // ---- Отключение ----
  socket.on('disconnect', () => {
    // Здесь можно добавить логику выхода при закрытии вкладки
  });
});

function sanitizeLobby(lobby) {
  return {
    id: lobby.id,
    name: lobby.name,
    maxPlayers: lobby.maxPlayers,
    hasChat: lobby.hasChat,
    adminId: lobby.adminId,
    players: lobby.players.map(p => ({ id: p.id, login: p.login, nickname: p.nickname, elo: p.elo, avatar: p.avatar })),
    chat: lobby.chat
  };
}

// Слушаем порт RelaxDev и разрешаем внешние подключения (0.0.0.0)
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
