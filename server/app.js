const socket = io();
const app = document.getElementById('app');

let currentUser = null;
let currentLobby = null;
let currentModal = null;

// Глобальные переменные для игры
let gameCooldown = false;
let animTimeouts = [];

function init() {
  const savedToken = localStorage.getItem('token');
  if (savedToken) {
    socket.emit('login', { token: savedToken }, (res) => {
      if (res.error) { localStorage.removeItem('token'); renderAuth(); } 
      else { currentUser = res.user; renderMainMenu(); }
    });
  } else { renderAuth(); }
}

function renderAuth() {
  app.innerHTML = `
    <div class="card auth-screen">
      <h1>🎮 Mini Games</h1>
      <div><label>Логин (уникальный)</label><input id="reg-login" placeholder="pro_player" /></div>
      <div><label>Никнейм</label><input id="reg-nickname" placeholder="Ваше имя" /></div>
      <button class="primary" id="reg-btn" style="margin-top:8px;"><i class="fas fa-user-plus"></i> Создать аккаунт</button>
    </div>
  `;
  document.getElementById('reg-btn').onclick = () => {
    const login = document.getElementById('reg-login').value.trim();
    const nickname = document.getElementById('reg-nickname').value.trim();
    if (!login || !nickname) return alert('Заполните все поля');
    
    socket.emit('register', { login, nickname }, (res) => {
      if (res.error) return alert(res.error);
      localStorage.setItem('token', res.token);
      currentUser = res.user;
      renderMainMenu();
    });
  };
}

function renderMainMenu() {
  app.innerHTML = `
    <div class="main-menu">
      <div class="top-bar">
        <div class="avatar">${renderAvatar(currentUser)}</div>
        <div class="info">
          <div class="name">${currentUser.nickname}</div>
          <div class="login">@${currentUser.login}</div>
        </div>
        <div class="elo"><i class="fas fa-trophy"></i> ${currentUser.elo}</div>
      </div>
      <div class="menu-grid">
        <button class="menu-btn secondary" id="btn-search"><i class="fas fa-search"></i> Поиск лобби</button>
        <button class="menu-btn secondary" id="btn-create"><i class="fas fa-plus"></i> Создать лобби</button>
        <button class="menu-btn secondary" id="btn-settings"><i class="fas fa-cog"></i> Настройки</button>
      </div>
      <div style="position:fixed; bottom:10px; left:15px; color:var(--text-muted); font-size:12px;">v0.2(wip)</div>
    </div>
  `;
  document.getElementById('btn-search').onclick = renderSearchLobby;
  document.getElementById('btn-create').onclick = renderCreateLobby;
  document.getElementById('btn-settings').onclick = renderSettings;
}

function renderSearchLobby() {
  app.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h2><i class="fas fa-search"></i> Поиск лобби</h2>
        <button class="secondary" id="back-btn"><i class="fas fa-arrow-left"></i> Назад</button>
      </div>
      <input id="search-input" placeholder="Поиск по имени..." style="margin-bottom:16px;" />
      <div id="lobby-list" class="lobby-list"></div>
    </div>
  `;
  document.getElementById('back-btn').onclick = renderMainMenu;
  const listEl = document.getElementById('lobby-list');
  const input = document.getElementById('search-input');

  function loadLobbies() {
    socket.emit('getLobbies', (lobbies) => {
      const filter = input.value.toLowerCase();
      const filtered = lobbies.filter(l => l.name.toLowerCase().includes(filter));
      listEl.innerHTML = filtered.length ? filtered.map(l => `
        <div class="lobby-item" data-id="${l.id}">
          <div><div class="name">${l.name}</div><div class="meta">${l.players}/${l.maxPlayers} игроков ${l.hasChat ? '· 💬' : ''}</div></div>
          <button class="primary" style="padding:8px 16px;">Войти</button>
        </div>
      `).join('') : '<p style="color:var(--text-muted);text-align:center;padding:20px;">Пусто</p>';

      listEl.querySelectorAll('.lobby-item').forEach(el => {
        el.onclick = () => {
          socket.emit('joinLobby', { lobbyId: el.dataset.id, user: currentUser }, (res) => {
            if (res.error) return alert(res.error);
            currentLobby = res.lobby;
            renderLobby();
          });
        };
      });
    });
  }
  loadLobbies();
  input.oninput = loadLobbies;
  socket.off('lobbiesUpdated'); socket.on('lobbiesUpdated', loadLobbies);
}

function renderCreateLobby() {
  app.innerHTML = `
    <div class="card" style="max-width:500px;margin:0 auto;">
      <h2><i class="fas fa-plus"></i> Создать лобби</h2>
      <div style="margin-top:20px;"><label>Название лобби</label><input id="lobby-name" placeholder="Топчики" /></div>
      <div style="margin-top:16px;"><label>Макс. игроков (2-8)</label><input id="lobby-max" type="number" min="2" max="8" value="4" /></div>
      <div style="margin-top:16px;display:flex;align-items:center;gap:8px;">
        <input id="lobby-chat" type="checkbox" checked style="width:20px;height:20px;" />
        <label for="lobby-chat" style="margin:0;font-size:16px;cursor:pointer;">Включить чат</label>
      </div>
      <div style="margin-top:24px;display:flex;gap:12px;">
        <button class="primary" id="create-btn" style="flex:1;">Создать</button>
        <button class="secondary" id="cancel-btn" style="flex:1;">Отмена</button>
      </div>
    </div>
  `;
  document.getElementById('cancel-btn').onclick = renderMainMenu;
  document.getElementById('create-btn').onclick = () => {
    const name = document.getElementById('lobby-name').value.trim();
    const maxPlayers = parseInt(document.getElementById('lobby-max').value);
    const hasChat = document.getElementById('lobby-chat').checked;
    if (!name) return alert('Введите название');
    
    socket.emit('createLobby', { name, maxPlayers, hasChat, user: currentUser }, (res) => {
      if (res.error) return alert(res.error);
      currentLobby = res.lobby;
      renderLobby();
    });
  };
}

function renderLobby() {
  const isAdmin = currentLobby.adminId === currentUser.id;
  const adminClass = isAdmin ? 'admin' : '';
  
  // Если игра запущена (статус не null)
  if (currentLobby.gameState) {
    if (currentLobby.gameState.status === 'menu') return renderGameMenu();
    if (currentLobby.gameState.status === 'creating') return renderGameCreating();
    if (currentLobby.gameState.status === 'guessing') return renderGameGuessing();
    if (currentLobby.gameState.status === 'ended') return; // Ждем возврата
  }

  app.innerHTML = `
    <div class="card lobby-screen ${adminClass}">
      <div class="lobby-header">
        <h2><i class="fas fa-users"></i> ${currentLobby.name}</h2>
        <span style="color:var(--text-muted);font-weight:600;">${currentLobby.players.length}/${currentLobby.maxPlayers}</span>
      </div>
      
      <div class="lobby-body">
        <div class="players-panel"><div class="player-list">${renderPlayerList()}</div></div>
        ${currentLobby.hasChat ? `
        <div class="chat-panel">
          <h3><i class="fas fa-comments"></i> Чат</h3>
          <div class="chat-messages" id="chat-messages"></div>
          <div class="chat-input">
            <input id="chat-input" placeholder="Сообщение..." autocomplete="off" />
            <button class="primary" id="chat-send"><i class="fas fa-paper-plane"></i></button>
          </div>
        </div>` : ''}
      </div>
      
      <div class="bottom-bar">
        <button class="secondary leave-btn" id="leave-btn"><i class="fas fa-sign-out-alt"></i> Выйти</button>
        ${isAdmin ? `<button class="primary start-btn" id="start-btn"><i class="fas fa-play"></i> Начать</button>` : ''}
      </div>
    </div>
  `;

  document.getElementById('leave-btn').onclick = () => {
    socket.emit('leaveLobby', { lobbyId: currentLobby.id }, () => {
      currentLobby = null;
      renderMainMenu();
    });
  };

  if (isAdmin) {
    document.getElementById('start-btn').onclick = () => {
      socket.emit('openGameMenu', { lobbyId: currentLobby.id });
    };
  }

  document.querySelectorAll('.player-item').forEach(el => {
    el.onclick = () => openPlayerModal(el.dataset.id);
  });

  if (currentLobby.hasChat) {
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    function renderMessages() {
      chatMessages.innerHTML = currentLobby.chat.map(m => `<div class="chat-msg"><span class="author">${m.nickname}:</span>${m.text}</div>`).join('');
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    renderMessages();

    document.getElementById('chat-send').onclick = () => {
      const text = chatInput.value.trim();
      if (!text) return;
      socket.emit('chatMessage', { lobbyId: currentLobby.id, user: currentUser, text }, () => chatInput.value = '');
    };
    chatInput.onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('chat-send').click(); };

    socket.off('newMessage'); socket.on('newMessage', (msg) => {
      currentLobby.chat.push(msg);
      if (currentLobby.chat.length > 30) currentLobby.chat.shift();
      renderMessages();
    });
  }
}

function renderPlayerList() {
  return currentLobby.players.map(p => `
    <div class="player-item" data-id="${p.id}">
      <div class="avatar">${renderAvatar(p)}</div>
      <div class="info">
        <div class="nick">${p.nickname} ${p.id === currentLobby.adminId ? '👑' : ''}</div>
        <div class="login">@${p.login}</div>
      </div>
      <div class="elo"><i class="fas fa-trophy"></i> ${p.elo}</div>
    </div>
  `).join('');
}

function renderAvatar(user) {
  if (user.avatarUrl) return `<img src="${user.avatarUrl}" alt="avatar" />`;
  return `<i class="shape-${user.avatar}" style="font-style:normal;"></i>`;
}

// ================= МОДАЛКА ПРОФИЛЯ =================
function openPlayerModal(targetId) {
  const target = currentLobby.players.find(p => p.id === targetId);
  if (!target) return;

  if (currentModal) currentModal.remove();
  const isAdmin = currentLobby.adminId === currentUser.id;
  const isMe = target.id === currentUser.id;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <button class="close-btn" title="Закрыть"><i class="fas fa-arrow-left"></i></button>
      <h3><i class="fas fa-user"></i> Игрок</h3>
      <div style="display:flex;align-items:center;gap:16px; margin-bottom:20px;">
        <div class="avatar" style="width:64px;height:64px;font-size:28px;">${renderAvatar(target)}</div>
        <div>
          <div style="font-size:20px;font-weight:700;">${target.nickname}</div>
          <div style="color:var(--text-muted);margin-bottom:4px;">@${target.login}</div>
          <div style="color:var(--primary);font-weight:700;"><i class="fas fa-trophy"></i> ${target.elo} ELO</div>
        </div>
      </div>
      ${isAdmin && !isMe ? `
      <div class="actions">
        <button class="danger" data-action="kick"><i class="fas fa-user"></i> Кик</button>
        <button class="danger" data-action="ban"><i class="fas fa-ban"></i> Бан</button>
        <button class="primary" data-action="admin"><i class="fas fa-crown"></i> Админ</button>
      </div>` : ''}
    </div>
  `;

  overlay.querySelector('.close-btn').onclick = () => { overlay.remove(); currentModal = null; };
  
  if (isAdmin && !isMe) {
    overlay.querySelectorAll('[data-action]').forEach(btn => {
      btn.onclick = () => {
        const action = btn.dataset.action;
        const labels = { kick: 'кикнуть', ban: 'забанить', admin: 'передать админку' };
        if (confirm(`Вы уверены, что хотите ${labels[action]} игрока ${target.nickname}?`)) {
          socket.emit('adminAction', { lobbyId: currentLobby.id, targetId: target.id, action: action === 'admin' ? 'transferAdmin' : action, adminId: currentUser.id }, (res) => {
            if (res.error) alert(res.error);
            overlay.remove();
            currentModal = null;
          });
        }
      };
    });
  }
  document.body.appendChild(overlay);
  currentModal = overlay;
}

// ================= ИГРОВОЙ ИНТЕРФЕЙС =================

const SHAPES = [
  { id: 'circle', icon: 'fa-circle', color: '#3b82f6' }, // Синий
  { id: 'square', icon: 'fa-square', color: '#ef4444' }, // Красный
  { id: 'triangle', icon: 'fa-play', color: '#22c55e' }, // Зеленый (повернем)
  { id: 'diamond', icon: 'fa-gem', color: '#eab308' },   // Желтый
  { id: 'pentagon', icon: 'fa-star', color: '#a855f7' }  // Фиолетовый
];

function renderGameMenu() {
  const isAdmin = currentLobby.adminId === currentUser.id;
  app.innerHTML = `
    <div class="card game-menu">
      <div class="lobby-header" style="margin-bottom:20px;">
        <h2><i class="fas fa-gamepad"></i> Выбор игры</h2>
        <button class="secondary" id="back-btn" ${!isAdmin ? 'disabled' : ''}><i class="fas fa-arrow-left"></i> Назад</button>
      </div>
      <div class="game-grid">
        <div class="game-card" style="background: linear-gradient(135deg, #1e293b 0%, #3b82f6 100%);">
          <div class="game-banner"><i class="fas fa-brain" style="font-size:60px;color:white;"></i></div>
          <div class="game-info">
            <div class="game-name">Угадай Последовательность</div>
            ${isAdmin ? `<button class="primary" id="select-game-btn">Выбрать</button>` : '<span style="color:var(--text-muted)">Ждем админа...</span>'}
          </div>
        </div>
      </div>
    </div>
  `;
  if (isAdmin) {
    document.getElementById('back-btn').onclick = () => socket.emit('leaveGameMenu', { lobbyId: currentLobby.id });
    document.getElementById('select-game-btn').onclick = () => {
      socket.emit('selectGame', { lobbyId: currentLobby.id, gameId: 'sequence' });
    };
  }
}

function renderGameCreating() {
  const gs = currentLobby.gameState;
  const isCreator = gs.creatorId === currentUser.id;
  
  // Очищаем старые таймеры при перерисовке
  animTimeouts.forEach(clearTimeout); animTimeouts = [];

  if (!isCreator) {
    app.innerHTML = `
      <div class="game-anim-container">
        <h1 class="boom-text" id="boom-text">БУМ!</h1>
        <h2 id="creator-text" style="opacity:0; transition:opacity 0.5s;">Выбирает ${gs.creatorName}</h2>
      </div>
    `;
    setTimeout(() => document.getElementById('creator-text').style.opacity = 1, 500);
    return;
  }

  // Если мы создатель
  app.innerHTML = `
    <div class="card game-screen">
      <div class="game-header">
        <h2>Ты Загадываешь!</h2>
        <div class="timer" id="game-timer">15</div>
      </div>
      <div class="game-board">
        ${[0,1,2,3,4].map(i => `<div class="game-slot" id="slot-${i}" data-index="${i}"></div>`).join('')}
      </div>
      <div class="game-shapes-bar">
        ${SHAPES.map(s => `<div class="shape-btn" style="background:${s.color}" data-shape="${s.id}"><i class="fas ${s.icon}"></i></div>`).join('')}
      </div>
      <div style="margin-top:20px; text-align:center;">
        <button class="primary" id="submit-seq-btn" style="font-size:20px; padding:15px 40px;" disabled>Загадать</button>
      </div>
    </div>
  `;

  startGameLogic(gs, 'creator');
}

function renderGameGuessing() {
  const gs = currentLobby.gameState;
  const isGuesser = gs.guesserId === currentUser.id;

  if (!isGuesser) {
    app.innerHTML = `
      <div class="card game-screen" style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:400px;">
        <h2 style="margin-bottom:20px;">Угадывает ${gs.guesserName}...</h2>
        <div class="game-board">
          ${[0,1,2,3,4].map(i => `<div class="game-slot" id="slot-${i}"></div>`).join('')}
        </div>
      </div>
    `;
    // Отображаем текущий ввод угадывающего
    updateGameBoardVisual(gs.guess);
    
    // Слушаем обновления его действий
    socket.off('gameStateUpdate');
    socket.on('gameStateUpdate', (newGs) => {
      if (newGs.status === 'guessing') updateGameBoardVisual(newGs.guess);
    });
    return;
  }

  // Если мы угадываем
  app.innerHTML = `
    <div class="card game-screen">
      <div class="game-header">
        <h2>Ты Угадываешь! (Раунд ${gs.round})</h2>
      </div>
      <div class="game-board">
        ${[0,1,2,3,4].map(i => `<div class="game-slot" id="slot-${i}" data-index="${i}"></div>`).join('')}
      </div>
      <div class="game-shapes-bar">
        ${SHAPES.map(s => `<div class="shape-btn" style="background:${s.color}" data-shape="${s.id}"><i class="fas ${s.icon}"></i></div>`).join('')}
      </div>
      <div style="margin-top:20px; text-align:center;">
        <button class="primary" id="submit-guess-btn" style="font-size:20px; padding:15px 40px;" disabled>Угадать</button>
      </div>
    </div>
  `;

  startGameLogic(gs, 'guesser');
}

// Общая логика кликов для загадывающего и угадывающего
function startGameLogic(gs, role) {
  let selectedShape = null;
  let localArr = role === 'creator' ? gs.sequence : gs.guess;
  
  const updateUI = () => {
    updateGameBoardVisual(localArr);
    const btn = document.getElementById(role === 'creator' ? 'submit-seq-btn' : 'submit-guess-btn');
    if (btn) btn.disabled = localArr.includes(null);
  };

  updateUI();

  document.querySelectorAll('.shape-btn').forEach(btn => {
    btn.onclick = () => {
      if (gameCooldown) return;
      document.querySelectorAll('.shape-btn').forEach(b => b.style.transform = 'scale(1)');
      selectedShape = btn.dataset.shape;
      btn.style.transform = 'scale(1.2)';
    };
  });

  document.querySelectorAll('.game-slot').forEach(slot => {
    slot.onclick = () => {
      if (gameCooldown) return;
      const index = parseInt(slot.dataset.index);
      
      // Если в слоте есть фигура - убираем её
      if (localArr[index]) {
        gameCooldown = true;
        socket.emit('gameAction', { lobbyId: currentLobby.id, playerId: currentUser.id, action: 'remove', index, role }, () => {
          localArr[index] = null;
          updateUI();
          setTimeout(() => gameCooldown = false, 200);
        });
        return;
      }
      
      // Если выбрана фигура - ставим
      if (selectedShape) {
        gameCooldown = true;
        socket.emit('gameAction', { lobbyId: currentLobby.id, playerId: currentUser.id, action: 'place', index, shape: selectedShape, role }, () => {
          localArr[index] = selectedShape;
          selectedShape = null;
          document.querySelectorAll('.shape-btn').forEach(b => b.style.transform = 'scale(1)');
          updateUI();
          setTimeout(() => gameCooldown = false, 200);
        });
      }
    };
  });

  const submitBtn = document.getElementById(role === 'creator' ? 'submit-seq-btn' : 'submit-guess-btn');
  if (submitBtn) {
    submitBtn.onclick = () => {
      submitBtn.disabled = true;
      if (role === 'creator') {
        socket.emit('submitSequence', { lobbyId: currentLobby.id, playerId: currentUser.id });
      } else {
        socket.emit('submitGuess', { lobbyId: currentLobby.id, playerId: currentUser.id });
      }
    };
  }

  // Обратный отсчет для загадывающего
  if (role === 'creator') {
    let time = 15;
    const timerEl = document.getElementById('game-timer');
    const interval = setInterval(() => {
      time--;
      if (timerEl) timerEl.innerText = time;
      if (time <= 0) {
        clearInterval(interval);
        // Если не успел - принудительно отправляем (или кикаем из игры)
        if (localArr.includes(null)) {
          socket.emit('leaveLobby', { lobbyId: currentLobby.id }); // Выкидываем в главное меню
          alert('Вы не успели загадать последовательность!');
        }
      }
    }, 1000);
    animTimeouts.push(interval);
  }
}

function updateGameBoardVisual(arr) {
  arr.forEach((shapeId, i) => {
    const slot = document.getElementById(`slot-${i}`);
    if (slot) {
      if (shapeId) {
        const s = SHAPES.find(x => x.id === shapeId);
        slot.innerHTML = `<div class="shape-in-slot" style="background:${s.color}"><i class="fas ${s.icon}"></i></div>`;
      } else {
        slot.innerHTML = '';
      }
    }
  });
}

// Слушатели результата
socket.on('gameResult', ({ result, winnerName, sequence }) => {
  if (!currentLobby || !currentLobby.gameState) return;
  
  // Анимация результата
  app.innerHTML = `
    <div class="card game-screen" style="background:transparent;box-shadow:none;">
      <div class="game-board" id="result-board">
        ${[0,1,2,3,4].map(i => `<div class="game-slot" id="slot-${i}"></div>`).join('')}
      </div>
      <h1 id="win-text" style="text-align:center;font-size:36px;margin-top:30px;opacity:0;transition:opacity 0.5s;color:var(--primary);">${winnerName ? 'ПОБЕДИЛ ' + winnerName : 'НИКТО НЕ ВЫИГРАЛ'}</h1>
    </div>
  `;

  updateGameBoardVisual(sequence);
  
  // Красим слоты
  result.forEach((color, i) => {
    setTimeout(() => {
      document.getElementById(`slot-${i}`).style.backgroundColor = 
        color === 'green' ? 'var(--success)' : 
        color === 'yellow' ? 'var(--warning)' : 'var(--danger)';
      document.getElementById(`slot-${i}`).style.borderColor = 'transparent';
    }, 100 + i * 100);
  });

  setTimeout(() => {
    const wt = document.getElementById('win-text');
    if (wt) wt.style.opacity = 1;
  }, 1000);
});

socket.on('gameResultNext', ({ result, nextGuesserName, sequence }) => {
  // Показываем результат хода, потом переходим к след.
  app.innerHTML = `
    <div class="card game-screen" style="background:transparent;box-shadow:none;">
      <div class="game-board">
        ${[0,1,2,3,4].map(i => `<div class="game-slot" id="slot-${i}"></div>`).join('')}
      </div>
    </div>
  `;
  updateGameBoardVisual(sequence);
  result.forEach((color, i) => {
    setTimeout(() => {
      const sl = document.getElementById(`slot-${i}`);
      sl.style.backgroundColor = color === 'green' ? 'var(--success)' : color === 'yellow' ? 'var(--warning)' : 'var(--danger)';
      sl.style.borderColor = 'transparent';
    }, 100 + i * 100);
  });

  setTimeout(() => {
    app.innerHTML = `<h1 style="text-align:center;">Угадывает ${nextGuesserName}...</h1>`;
  }, 5000);
});

socket.on('kickedPlayer', ({ targetId, lobbyId }) => {
  if (currentUser.id === targetId && currentLobby && currentLobby.id === lobbyId) {
    currentLobby = null;
    alert('Вас исключили из лобби!');
    renderMainMenu();
  }
});

socket.on('gameCancelled', ({ reason }) => {
  currentLobby.gameState = null;
  alert(reason);
  renderLobby();
});

// Глобальный слушатель обновлений лобби
socket.on('lobbyUpdated', (lobby) => {
  if (!currentLobby) return;
  const oldGs = currentLobby.gameState;
  currentLobby = lobby;
  const newGs = lobby.gameState;
  
  // Если мы в лобби
  if (document.querySelector('.lobby-screen') || (!newGs && !oldGs)) {
    renderLobby();
  } 
  // Если игра началась
  else if (newGs && (!oldGs || oldGs.status !== newGs.status || oldGs.guesserId !== newGs.guesserId || oldGs.round !== newGs.round)) {
    if (newGs.status === 'menu') renderGameMenu();
    if (newGs.status === 'creating') renderGameCreating();
    if (newGs.status === 'guessing') renderGameGuessing();
  }
});

// Настройки (без изменений)
function renderSettings() {
  app.innerHTML = `
    <div class="card" style="max-width:500px;margin:0 auto;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <h2><i class="fas fa-cog"></i> Настройки</h2>
        <button class="secondary" id="back-btn"><i class="fas fa-arrow-left"></i> Назад</button>
      </div>
      <div style="display:flex; align-items:center; gap:16px; margin-bottom:24px; padding-bottom:24px; border-bottom:1px solid var(--surface-2);">
        <div class="avatar" id="settings-avatar-preview" style="width:72px;height:72px;font-size:32px;">${renderAvatar(currentUser)}</div>
        <div>
          <input type="file" id="avatar-upload" accept="image/*" style="display:none;" />
          <button class="primary" id="btn-upload-avatar" style="padding:8px 16px; font-size:14px;"><i class="fas fa-camera"></i> Загрузить фото</button>
        </div>
      </div>
      <div>
        <label>Никнейм</label>
        <input id="setting-nickname" value="${currentUser.nickname}" />
        <button class="primary" id="save-nickname" style="margin-top:12px;width:100%;">Сохранить никнейм</button>
      </div>
      <button class="secondary" id="logout-btn" style="margin-top:32px; width:100%; color:var(--danger);"><i class="fas fa-sign-out-alt"></i> Выйти из аккаунта</button>
    </div>
  `;
  document.getElementById('back-btn').onclick = renderMainMenu;
  document.getElementById('save-nickname').onclick = () => {
    const newNick = document.getElementById('setting-nickname').value.trim();
    if (!newNick) return alert('Введите никнейм');
    socket.emit('updateNickname', { userId: currentUser.id, nickname: newNick }, (res) => {
      if (res.error) return alert(res.error);
      currentUser.nickname = newNick;
      alert('Никнейм обновлён!');
      renderMainMenu();
    });
  };
  const fileInput = document.getElementById('avatar-upload');
  document.getElementById('btn-upload-avatar').onclick = () => fileInput.click();
  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    compressImage(file, (base64) => {
      socket.emit('updateAvatar', { userId: currentUser.id, avatarUrl: base64 }, (res) => {
        if (res.error) return alert(res.error);
        currentUser.avatarUrl = base64;
        document.getElementById('settings-avatar-preview').innerHTML = renderAvatar(currentUser);
      });
    });
  };
  document.getElementById('logout-btn').onclick = () => {
    if (confirm('Выйти из аккаунта?')) { localStorage.removeItem('token'); window.location.reload(); }
  };
}

function compressImage(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const MAX_SIZE = 128;
      let width = img.width; let height = img.height;
      if (width > height && width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
      else if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
      canvas.width = width; canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

init();
