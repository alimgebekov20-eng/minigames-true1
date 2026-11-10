const socket = io();
const app = document.getElementById('app');

let currentUser = null;
let currentLobby = null;
let currentModal = null;
let gameCooldown = false;
let animTimeouts = [];
let isShowingResult = false;

const SHAPES = [
  { id: 'circle', icon: 'fa-circle', color: '#3b82f6' },
  { id: 'square', icon: 'fa-square', color: '#ef4444' },
  { id: 'triangle', icon: 'fa-play', color: '#22c55e' },
  { id: 'diamond', icon: 'fa-gem', color: '#eab308' },
  { id: 'pentagon', icon: 'fa-star', color: '#a855f7' }
];

const COLORS_SHOP = [
  { id: 'default', name: 'Обычный', price: 0, css: '' },
  { id: 'red', name: 'Красный', price: 75, css: 'color: #ef4444; text-shadow: 0 0 5px #ef4444' },
  { id: 'green', name: 'Зеленый', price: 75, css: 'color: #22c55e; text-shadow: 0 0 5px #22c55e' },
  { id: 'blue', name: 'Синий', price: 75, css: 'color: #3b82f6; text-shadow: 0 0 5px #3b82f6' },
  { id: 'yellow', name: 'Желтый', price: 75, css: 'color: #eab308; text-shadow: 0 0 5px #eab308' },
  { id: 'orange', name: 'Оранжевый', price: 75, css: 'color: #f97316; text-shadow: 0 0 5px #f97316' },
  { id: 'pink', name: 'Розовый', price: 75, css: 'color: #ec4899; text-shadow: 0 0 5px #ec4899' },
  { id: 'white', name: 'Белый', price: 75, css: 'color: #ffffff; text-shadow: 0 0 5px #ffffff' },
  
  { id: 'rainbow', name: 'Радужный', price: 200, css: 'anim-rainbow' },
  { id: 'fire', name: 'Огонь', price: 300, css: 'anim-fire' },
  { id: 'ocean', name: 'Океан', price: 300, css: 'anim-ocean' },
  { id: 'acid', name: 'Кислота', price: 300, css: 'anim-acid' },
  { id: 'matrix', name: 'Матрица', price: 300, css: 'anim-matrix' },
  { id: 'darkpurple', name: 'Тьма', price: 300, css: 'anim-darkpurple' },
  { id: 'gold', name: 'Золото', price: 300, css: 'anim-gold' },
  
  { id: 'legend1', name: 'Бог Грома', price: 1000, css: 'legend-lightning' },
  { id: 'legend2', name: 'Космос', price: 1000, css: 'legend-space' },
  
  { id: 'mythic', name: 'Сингулярность', price: 5000, css: 'mythic-singularity' }
];

let ownedColors = ['default'];

function init() {
  const savedToken = localStorage.getItem('token');
  if (savedToken) {
    socket.emit('login', { token: savedToken }, (res) => {
      if (res.error) { localStorage.removeItem('token'); renderAuth(); } 
      else { currentUser = res.user; renderMainMenu(); }
    });
  } else { renderAuth(); }
}

function getColorClass(colorId) {
  const c = COLORS_SHOP.find(x => x.id === colorId);
  return c ? c.css : '';
}

// ОБНОВЛЕННАЯ ФУНКЦИЯ ДЛЯ МИФИЧЕСКОГО ЦВЕТА
function formatName(user) {
  const cssClass = getColorClass(user.nameColor || 'default');
  
  if (cssClass === 'mythic-singularity') {
    return `<span class="mythic-wrapper">
      <span class="mythic-text">${user.nickname}</span>
      <span class="black-hole"></span>
    </span>`;
  }
  
  if (cssClass.startsWith('anim-') || cssClass.startsWith('legend-')) {
    return `<span class="${cssClass}">${user.nickname}</span>`;
  }
  return `<span style="${cssClass}">${user.nickname}</span>`;
}

function renderAvatar(user) {
  if (user.avatarUrl) return `<img src="${user.avatarUrl}" alt="avatar" />`;
  return `<i class="shape-${user.avatar || 'circle'}" style="font-style:normal;"></i>`;
}

function launchConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0'; canvas.style.left = '0';
  canvas.style.width = '100vw'; canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899'];

  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * width,
      y: height - Math.random() * 100,
      vx: (Math.random() - 0.5) * 8,
      vy: -Math.random() * 15 - 5,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10
    });
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);
    let active = false;
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.4; p.vx *= 0.99; p.rotation += p.rotSpeed;
      if (p.y < height + 50) {
        active = true;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rotation * Math.PI / 180);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore();
      }
    });
    if (active) requestAnimationFrame(animate);
    else canvas.remove();
  }
  animate();
}

function renderAuth() {
  app.innerHTML = `
    <div class="card auth-screen">
      <h1>🎮 Mini Games</h1>
      <div><label>Логин</label><input id="reg-login" placeholder="pro_player" /></div>
      <div><label>Никнейм</label><input id="reg-nickname" placeholder="Ваше имя" /></div>
      <button class="primary" id="reg-btn" style="margin-top:8px;"><i class="fas fa-user-plus"></i> Создать аккаунт</button>
    </div>
  `;
  document.getElementById('reg-btn').onclick = () => {
    const login = document.getElementById('reg-login').value.trim();
    const nickname = document.getElementById('reg-nickname').value.trim();
    if (!login || !nickname) return alert('Заполните поля');
    socket.emit('register', { login, nickname }, (res) => {
      if (res.error) return alert(res.error);
      localStorage.setItem('token', res.token);
      currentUser = res.user; renderMainMenu();
    });
  };
}

function renderMainMenu() {
  app.innerHTML = `
    <div class="main-menu">
      <div class="top-bar">
        <div class="avatar">${renderAvatar(currentUser)}</div>
        <div class="info">
          <button class="shop-btn-top" id="btn-shop-main"><i class="fas fa-palette"></i> Магазин цветов</button>
          <div class="name">${formatName(currentUser)}</div>
          <div class="login">@${currentUser.login}</div>
        </div>
        <div class="elo"><i class="fas fa-trophy"></i> ${currentUser.elo}</div>
      </div>
      <div class="menu-grid">
        <button class="menu-btn secondary" id="btn-search"><i class="fas fa-search"></i> Поиск лобби</button>
        <button class="menu-btn secondary" id="btn-create"><i class="fas fa-plus"></i> Создать лобби</button>
        <button class="menu-btn secondary" id="btn-leaderboard"><i class="fas fa-crown"></i> Списки лидеров</button>
        <button class="menu-btn secondary" id="btn-settings"><i class="fas fa-cog"></i> Настройки</button>
      </div>
      <div style="position:fixed; bottom:10px; left:15px; color:var(--text-muted); font-size:12px;">v0.5(wip)</div>
    </div>
  `;
  document.getElementById('btn-search').onclick = renderSearchLobby;
  document.getElementById('btn-create').onclick = renderCreateLobby;
  document.getElementById('btn-leaderboard').onclick = renderLeaderboard;
  document.getElementById('btn-settings').onclick = renderSettings;
  document.getElementById('btn-shop-main').onclick = renderShop;
}

function renderLeaderboard() {
  app.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h2><i class="fas fa-crown" style="color:#eab308"></i> Таблица Лидеров</h2>
        <button class="secondary" id="back-btn"><i class="fas fa-arrow-left"></i> Назад</button>
      </div>
      <input id="lb-search" placeholder="Поиск по нику..." style="margin-bottom:16px;" />
      <div id="lb-list" class="leaderboard-list"></div>
      <div id="lb-my-place" class="my-place-card" style="display:none;"></div>
    </div>
  `;
  document.getElementById('back-btn').onclick = renderMainMenu;
  
  const searchInput = document.getElementById('lb-search');
  const listEl = document.getElementById('lb-list');
  const myPlaceEl = document.getElementById('lb-my-place');
  let allTop100 = [];

  socket.emit('getLeaderboard', { userId: currentUser.id }, ({ top100, userRank }) => {
    allTop100 = top100;
    myPlaceEl.style.display = 'flex';
    myPlaceEl.innerHTML = `
      <div style="font-size:20px; font-weight:bold; color:#eab308;">#${userRank}</div>
      <div style="flex:1; margin-left:16px;">
        <div style="font-size:18px;">${formatName(currentUser)}</div>
        <div style="font-size:12px; color:var(--text-muted)">@${currentUser.login}</div>
      </div>
      <div style="font-weight:bold;"><i class="fas fa-trophy"></i> ${currentUser.elo}</div>
    `;

    function renderList(filter = '') {
      const filtered = allTop100.filter(u => u.nickname.toLowerCase().includes(filter.toLowerCase()) || u.login.toLowerCase().includes(filter.toLowerCase()));
      listEl.innerHTML = filtered.length ? filtered.map(u => `
        <div class="lb-item ${u.id === currentUser.id ? 'is-me' : ''}">
          <div style="width:40px; font-weight:bold; color:var(--text-muted);">#${u.rank}</div>
          <div class="avatar" style="width:32px;height:32px;font-size:14px;">${renderAvatar(u)}</div>
          <div style="flex:1; margin-left:10px;">${formatName(u)}</div>
          <div style="font-weight:bold; color:var(--primary);">${u.elo}</div>
        </div>
      `).join('') : '<div style="text-align:center; padding:20px; color:var(--text-muted)">Не найдено</div>';
    }
    renderList();
    searchInput.oninput = (e) => renderList(e.target.value);
  });
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
      const filtered = lobbies.filter(l => l.name.toLowerCase().includes(input.value.toLowerCase()));
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
            currentLobby = res.lobby; renderLobby();
          });
        };
      });
    });
  }
  loadLobbies(); input.oninput = loadLobbies;
  socket.off('lobbiesUpdated'); socket.on('lobbiesUpdated', loadLobbies);
}

function renderCreateLobby() {
  app.innerHTML = `
    <div class="card" style="max-width:500px;margin:0 auto;">
      <h2><i class="fas fa-plus"></i> Создать лобби</h2>
      <div style="margin-top:20px;"><label>Название лобби</label><input id="lobby-name" /></div>
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
      currentLobby = res.lobby; renderLobby();
    });
  };
}

function renderLobby() {
  const isAdmin = currentLobby.adminId === currentUser.id;
  const adminClass = isAdmin ? 'admin' : '';
  
  if (currentLobby.gameState) {
    if (currentLobby.gameState.status === 'menu') return renderGameMenu();
    if (currentLobby.gameState.status === 'creating') return renderGameCreating();
    if (currentLobby.gameState.status === 'guessing') return renderGameGuessing();
    if (currentLobby.gameState.status === 'ended') return; 
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
    socket.emit('leaveLobby', { lobbyId: currentLobby.id }, () => { currentLobby = null; renderMainMenu(); });
  };
  if (isAdmin) document.getElementById('start-btn').onclick = () => socket.emit('openGameMenu', { lobbyId: currentLobby.id });
  document.querySelectorAll('.player-item').forEach(el => el.onclick = () => openPlayerModal(el.dataset.id));

  if (currentLobby.hasChat) {
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    function renderMessages() {
      chatMessages.innerHTML = currentLobby.chat.map(m => `<div class="chat-msg"><span class="author">${formatName(m)}:</span>${m.text}</div>`).join('');
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    renderMessages();

    document.getElementById('chat-send').onclick = () => {
      const text = chatInput.value.trim(); if (!text) return;
      socket.emit('chatMessage', { lobbyId: currentLobby.id, user: currentUser, text }, () => chatInput.value = '');
    };
    chatInput.onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('chat-send').click(); };

    socket.off('newMessage'); socket.on('newMessage', (msg) => {
      currentLobby.chat.push(msg); if (currentLobby.chat.length > 30) currentLobby.chat.shift();
      renderMessages();
    });
  }
}

function renderPlayerList() {
  return currentLobby.players.map(p => `
    <div class="player-item" data-id="${p.id}">
      <div class="avatar">${renderAvatar(p)}</div>
      <div class="info"><div class="nick">${formatName(p)} ${p.id === currentLobby.adminId ? '👑' : ''}</div><div class="login">@${p.login}</div></div>
      <div class="elo"><i class="fas fa-trophy"></i> ${p.elo}</div>
    </div>
  `).join('');
}

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
          <div style="font-size:20px;font-weight:700;">${formatName(target)}</div>
          <div style="color:var(--text-muted);margin-bottom:4px;">@${target.login}</div>
          <div style="color:var(--primary);font-weight:700;"><i class="fas fa-trophy"></i> ${target.elo} ELO</div>
          <div id="modal-rank" style="color:#eab308;font-weight:bold;font-size:14px;margin-top:4px;">Загрузка...</div>
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
  
  socket.emit('getPlayerRank', { targetId: target.id }, (res) => {
    const rankEl = document.getElementById('modal-rank');
    if (rankEl) rankEl.innerHTML = `<i class="fas fa-medal"></i> Место: #${res.rank}`;
  });

  overlay.querySelector('.close-btn').onclick = () => { overlay.remove(); currentModal = null; };
  
  if (isAdmin && !isMe) {
    overlay.querySelectorAll('[data-action]').forEach(btn => {
      btn.onclick = () => {
        const action = btn.dataset.action;
        const labels = { kick: 'кикнуть', ban: 'забанить', admin: 'передать админку' };
        if (confirm(`Вы уверены, что хотите ${labels[action]} игрока ${target.nickname}?`)) {
          socket.emit('adminAction', { lobbyId: currentLobby.id, targetId: target.id, action: action === 'admin' ? 'transferAdmin' : action, adminId: currentUser.id }, (res) => {
            if (res.error) alert(res.error); overlay.remove(); currentModal = null;
          });
        }
      };
    });
  }
  document.body.appendChild(overlay); currentModal = overlay;
}

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
    document.getElementById('select-game-btn').onclick = () => socket.emit('selectGame', { lobbyId: currentLobby.id, gameId: 'sequence' });
  }
}

function renderGameCreating() {
  const gs = currentLobby.gameState;
  const isCreator = gs.creatorId === currentUser.id;
  animTimeouts.forEach(clearTimeout); animTimeouts = [];

  if (!isCreator) {
    app.innerHTML = `
      <div class="game-anim-container">
        <h1 class="game-title-anim">Угадай Последовательность</h1>
        <h2 id="creator-text" style="opacity:0; transition:opacity 0.5s; z-index:10;">Выбирает ${gs.creatorName}</h2>
      </div>
    `;
    launchConfetti();
    setTimeout(() => { const el = document.getElementById('creator-text'); if(el) el.style.opacity = 1; }, 500);
    return;
  }

  app.innerHTML = `
    <div class="card game-screen">
      <div class="game-header"><h2>Ты Загадываешь!</h2><div class="timer" id="game-timer">15</div></div>
      <div class="game-board">${[0,1,2,3,4].map(i => `<div class="game-slot" id="slot-${i}" data-index="${i}"></div>`).join('')}</div>
      <div class="game-shapes-bar">${SHAPES.map(s => `<div class="shape-btn" style="background:${s.color}" data-shape="${s.id}"><i class="fas ${s.icon}"></i></div>`).join('')}</div>
      <div style="margin-top:20px; text-align:center;"><button class="primary" id="submit-seq-btn" style="font-size:20px; padding:15px 40px;" disabled>Загадать</button></div>
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
        <div class="game-board">${[0,1,2,3,4].map(i => `<div class="game-slot" id="slot-${i}"></div>`).join('')}</div>
      </div>
    `;
    updateGameBoardVisual(gs.guess);
    socket.off('gameStateUpdate'); socket.on('gameStateUpdate', (newGs) => {
      if (newGs.status === 'guessing') updateGameBoardVisual(newGs.guess);
    });
    return;
  }

  app.innerHTML = `
    <div class="card game-screen">
      <div class="game-header"><h2>Ты Угадываешь! (Раунд ${gs.round})</h2></div>
      <div class="game-board">${[0,1,2,3,4].map(i => `<div class="game-slot" id="slot-${i}" data-index="${i}"></div>`).join('')}</div>
      <div class="game-shapes-bar">${SHAPES.map(s => `<div class="shape-btn" style="background:${s.color}" data-shape="${s.id}"><i class="fas ${s.icon}"></i></div>`).join('')}</div>
      <div style="margin-top:20px; text-align:center;"><button class="primary" id="submit-guess-btn" style="font-size:20px; padding:15px 40px;" disabled>Угадать</button></div>
    </div>
  `;
  startGameLogic(gs, 'guesser');
}

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
      
      if (localArr[index]) {
        gameCooldown = true;
        socket.emit('gameAction', { lobbyId: currentLobby.id, playerId: currentUser.id, action: 'remove', index, role }, () => {
          localArr[index] = null; updateUI(); setTimeout(() => gameCooldown = false, 200);
        });
        return;
      }
      
      if (selectedShape) {
        gameCooldown = true;
        socket.emit('gameAction', { lobbyId: currentLobby.id, playerId: currentUser.id, action: 'place', index, shape: selectedShape, role }, () => {
          localArr[index] = selectedShape; selectedShape = null;
          document.querySelectorAll('.shape-btn').forEach(b => b.style.transform = 'scale(1)');
          updateUI(); setTimeout(() => gameCooldown = false, 200);
        });
      }
    };
  });

  const submitBtn = document.getElementById(role === 'creator' ? 'submit-seq-btn' : 'submit-guess-btn');
  if (submitBtn) {
    submitBtn.onclick = () => {
      submitBtn.disabled = true;
      if (role === 'creator') socket.emit('submitSequence', { lobbyId: currentLobby.id, playerId: currentUser.id });
      else socket.emit('submitGuess', { lobbyId: currentLobby.id, playerId: currentUser.id });
    };
  }

  if (role === 'creator') {
    let time = 15;
    const timerEl = document.getElementById('game-timer');
    const interval = setInterval(() => {
      time--; if (timerEl) timerEl.innerText = time;
      if (time <= 0) {
        clearInterval(interval);
        if (timerEl) timerEl.innerText = "0";
        alert('Время вышло! Но вы можете закончить расстановку и нажать "Загадать".');
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
      } else slot.innerHTML = '';
    }
  });
}

socket.on('gameTurnResult', ({ result, nextGuesserName, guess }) => {
  isShowingResult = true;
  
  app.innerHTML = `
    <div class="card game-screen" style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:500px; background:transparent; box-shadow:none;">
      <div class="game-board">
        ${[0,1,2,3,4].map(i => `<div class="game-slot" id="slot-${i}"></div>`).join('')}
      </div>
      
      <div style="margin-top: 20px; padding: 16px; background: var(--surface); border-radius: 12px; border: 1px solid var(--surface-2);">
        <div style="text-align:center; font-size:14px; color:var(--text-muted); margin-bottom:12px;">Твой выбор:</div>
        <div style="display:flex; gap:10px; justify-content:center;">
          ${guess.map(g => {
            const s = SHAPES.find(x => x.id === g);
            return `<div style="width:40px; height:40px; border-radius:8px; background:${s.color}; display:flex; align-items:center; justify-content:center; color:white; font-size:20px;"><i class="fas ${s.icon}"></i></div>`;
          }).join('')}
        </div>
      </div>

      <h2 style="margin-top: 30px; font-size: 20px; opacity:0; transition:opacity 0.5s;" id="next-turn-text">Следующий: <strong style="color:var(--primary);">${nextGuesserName}</strong></h2>
    </div>
  `;

  result.forEach((color, i) => {
    setTimeout(() => {
      const sl = document.getElementById(`slot-${i}`);
      if (sl) {
        sl.style.backgroundColor = color === 'green' ? 'var(--success)' : color === 'yellow' ? 'var(--warning)' : 'var(--danger)';
        sl.style.borderColor = 'transparent';
        sl.innerHTML = ''; 
      }
    }, 100 + i * 100);
  });

  setTimeout(() => {
    const tt = document.getElementById('next-turn-text'); if(tt) tt.style.opacity = 1;
  }, 600);

  setTimeout(() => {
    isShowingResult = false;
    renderLobby(); 
  }, 5000);
});

socket.on('gameResult', ({ result, winnerName, sequence }) => {
  isShowingResult = true;
  
  app.innerHTML = `
    <div class="card game-screen" style="background:transparent;box-shadow:none; align-items:center; justify-content:center;">
      <div class="game-board" id="result-board">
        ${[0,1,2,3,4].map(i => `<div class="game-slot" id="slot-${i}"></div>`).join('')}
      </div>
      <h1 id="win-text" style="text-align:center;font-size:36px;margin-top:40px;opacity:0;transition:opacity 0.5s;color:var(--primary);">${winnerName ? 'ПОБЕДИЛ ' + winnerName : 'НИКТО НЕ ВЫИГРАЛ'}</h1>
    </div>
  `;

  updateGameBoardVisual(sequence);
  
  result.forEach((color, i) => {
    setTimeout(() => {
      const sl = document.getElementById(`slot-${i}`);
      if (sl) {
        sl.style.backgroundColor = color === 'green' ? 'var(--success)' : color === 'yellow' ? 'var(--warning)' : 'var(--danger)';
        sl.style.borderColor = 'transparent';
      }
    }, 100 + i * 100);
  });

  setTimeout(() => { const wt = document.getElementById('win-text'); if (wt) wt.style.opacity = 1; }, 1000);

  setTimeout(() => {
    isShowingResult = false;
    renderLobby();
  }, 4500);
});

socket.on('kickedPlayer', ({ targetId, lobbyId }) => {
  if (currentUser.id === targetId && currentLobby && currentLobby.id === lobbyId) {
    currentLobby = null; alert('Вас исключили из лобби!'); renderMainMenu();
  }
});

socket.on('gameCancelled', ({ reason }) => {
  isShowingResult = false;
  if (currentLobby) currentLobby.gameState = null;
  alert(reason); renderLobby();
});

socket.on('lobbyUpdated', (lobby) => {
  if (!currentLobby) return;
  const oldGs = currentLobby.gameState;
  currentLobby = lobby;
  const newGs = lobby.gameState;

  if (isShowingResult) {
    if (!newGs) { isShowingResult = false; renderLobby(); }
    return;
  }

  if (document.querySelector('.lobby-screen') || (!newGs && !oldGs)) {
    renderLobby();
  } else if (newGs && (!oldGs || oldGs.status !== newGs.status || oldGs.guesserId !== newGs.guesserId || oldGs.round !== newGs.round)) {
    if (newGs.status === 'menu') renderGameMenu();
    if (newGs.status === 'creating') renderGameCreating();
    if (newGs.status === 'guessing') renderGameGuessing();
  }
});

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
    const newNick = document.getElementById('setting-nickname').value.trim(); if (!newNick) return;
    socket.emit('updateNickname', { userId: currentUser.id, nickname: newNick }, (res) => {
      if (res.error) return alert(res.error); currentUser.nickname = newNick; renderMainMenu();
    });
  };
  
  const fileInput = document.getElementById('avatar-upload');
  document.getElementById('btn-upload-avatar').onclick = () => fileInput.click();
  fileInput.onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    openAvatarEditor(file, (base64) => {
      socket.emit('updateAvatar', { userId: currentUser.id, avatarUrl: base64 }, (res) => {
        if (res.error) return alert(res.error); currentUser.avatarUrl = base64;
        document.getElementById('settings-avatar-preview').innerHTML = renderAvatar(currentUser);
      });
    });
  };
  document.getElementById('logout-btn').onclick = () => {
    if (confirm('Выйти из аккаунта?')) { localStorage.removeItem('token'); window.location.reload(); }
  };
}

function renderShop() {
  app.innerHTML = `
    <div class="card" style="max-width:800px;margin:0 auto;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <h2><i class="fas fa-palette"></i> Магазин цветов</h2>
        <button class="secondary" id="back-btn"><i class="fas fa-arrow-left"></i> Назад</button>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; background:var(--surface-2); padding:12px; border-radius:8px;">
        <div>Твое ЭЛО: <strong id="shop-elo-display" style="color:var(--primary);font-size:18px;">${currentUser.elo}</strong></div>
        <button class="danger" id="dev-unlock" style="padding:6px 12px; font-size:12px;">[DEV] Открыть всё (+10000 ELO)</button>
      </div>
      <div class="shop-grid" id="shop-grid"></div>
    </div>
  `;
  document.getElementById('back-btn').onclick = renderMainMenu;
  
  document.getElementById('dev-unlock').onclick = () => {
    socket.emit('devUnlockAll', { userId: currentUser.id }, (res) => {
      if (res.success) { 
        currentUser.elo = res.newElo; 
        document.getElementById('shop-elo-display').innerText = currentUser.elo;
        drawShop(); 
      }
    });
  };

  const grid = document.getElementById('shop-grid');
  
  function drawShop() {
    grid.innerHTML = COLORS_SHOP.map(c => {
      const isOwned = ownedColors.includes(c.id) || c.id === 'default' || currentUser.elo >= 9000;
      const isEquipped = (currentUser.nameColor || 'default') === c.id;
      
      const cssClass = c.css.includes('anim-') || c.css.includes('legend-') || c.css.includes('mythic-') ? c.css : '';
      const style = cssClass ? '' : c.css;

      return `
        <div class="shop-item ${isEquipped ? 'equipped' : ''}">
          <div class="shop-name ${cssClass}" style="${style}">${c.name}</div>
          <div style="font-size:12px; color:var(--text-muted);">${c.price === 0 ? 'Бесплатно' : c.price + ' ELO'}</div>
          <div style="margin-top:10px;">
            ${isEquipped ? '<span style="color:var(--success);font-size:12px;font-weight:bold;">Надето</span>' : 
              isOwned ? `<button class="primary" style="padding:4px 10px; font-size:12px;" onclick="equipColor('${c.id}')">Надеть</button>` :
              `<button class="primary" style="padding:4px 10px; font-size:12px;" onclick="buyColor('${c.id}', ${c.price})">Купить</button>`
            }
          </div>
        </div>
      `;
    }).join('');
  }

  window.buyColor = (id, price) => {
    if (currentUser.elo < price) return alert('Недостаточно ЭЛО!');
    if (confirm('Купить цвет за ' + price + ' ELO?')) {
      socket.emit('buyColor', { userId: currentUser.id, colorId: id, price }, (res) => {
        if (res.error) return alert(res.error);
        
        currentUser.elo = res.newElo;
        currentUser.nameColor = id;
        if (!ownedColors.includes(id)) ownedColors.push(id);
        
        const eloDisplay = document.getElementById('shop-elo-display');
        if (eloDisplay) eloDisplay.innerText = currentUser.elo;
        
        drawShop();
      });
    }
  };

  window.equipColor = (id) => {
    socket.emit('equipColor', { userId: currentUser.id, colorId: id }, (res) => {
      if (res.error) return alert(res.error);
      currentUser.nameColor = id;
      drawShop();
    });
  };

  drawShop();
}

function openAvatarEditor(file, onSave) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const overlay = document.createElement('div');
      overlay.className = 'avatar-editor-overlay';
      overlay.innerHTML = `
        <h2 style="margin-bottom:20px; font-size:18px;">Редактор аватарки</h2>
        <div class="editor-crop-area" id="crop-area">
          <img id="crop-image" src="${e.target.result}" />
          <div class="editor-grid"></div>
        </div>
        <div class="editor-controls">
          <i class="fas fa-search-minus" style="color:var(--text-muted)"></i>
          <input type="range" id="zoom-range" min="1" max="4" step="0.01" value="1" />
          <i class="fas fa-search-plus" style="color:var(--text-muted)"></i>
        </div>
        <div class="editor-buttons">
          <button id="cancel-crop">Отмена</button>
          <button id="save-crop" style="font-weight:700;">Готово</button>
        </div>
      `;
      document.body.appendChild(overlay);

      const cropArea = document.getElementById('crop-area');
      const cropImage = document.getElementById('crop-image');
      const zoomRange = document.getElementById('zoom-range');
      const CROP_SIZE = 300;
      
      let scale = 1;
      let translateX = 0;
      let translateY = 0;
      let startX, startY, isDragging = false;

      const imgRatio = img.width / img.height;
      if (imgRatio > 1) {
        cropImage.style.height = CROP_SIZE + 'px';
        cropImage.style.width = (img.width * (CROP_SIZE / img.height)) + 'px';
      } else {
        cropImage.style.width = CROP_SIZE + 'px';
        cropImage.style.height = (img.height * (CROP_SIZE / img.width)) + 'px';
      }

      const updateTransform = () => {
        if (translateX === 0 && translateY === 0) {
           const w = cropImage.width; const h = cropImage.height;
           translateX = (CROP_SIZE - w) / 2;
           translateY = (CROP_SIZE - h) / 2;
        }
        const w = cropImage.width * scale;
        const h = cropImage.height * scale;
        
        if (translateX > 0) translateX = 0;
        if (translateY > 0) translateY = 0;
        if (translateX < CROP_SIZE - w) translateX = CROP_SIZE - w;
        if (translateY < CROP_SIZE - h) translateY = CROP_SIZE - h;

        cropImage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
      };
      setTimeout(updateTransform, 10);

      zoomRange.oninput = (e) => { scale = parseFloat(e.target.value); updateTransform(); };

      cropArea.onmousedown = (e) => { e.preventDefault(); isDragging = true; startX = e.clientX - translateX; startY = e.clientY - translateY; };
      window.onmousemove = (e) => { if (!isDragging) return; translateX = e.clientX - startX; translateY = e.clientY - startY; updateTransform(); };
      window.onmouseup = () => { isDragging = false; };

      cropArea.ontouchstart = (e) => { if (e.touches.length === 1) { isDragging = true; startX = e.touches[0].clientX - translateX; startY = e.touches[0].clientY - translateY; } };
      cropArea.ontouchmove = (e) => { if (isDragging && e.touches.length === 1) { e.preventDefault(); translateX = e.touches[0].clientX - startX; translateY = e.touches[0].clientY - startY; updateTransform(); } };
      cropArea.ontouchend = () => { isDragging = false; };

      document.getElementById('cancel-crop').onclick = () => { overlay.remove(); window.onmousemove = null; window.onmouseup = null; };

      document.getElementById('save-crop').onclick = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const outputSize = 256;
        const ratio = outputSize / CROP_SIZE;
        
        ctx.translate(translateX * ratio, translateY * ratio);
        ctx.scale(scale * ratio, scale * ratio);
        ctx.drawImage(img, 0, 0, cropImage.width, cropImage.height);

        const base64 = canvas.toDataURL('image/jpeg', 0.9);
        
        overlay.remove();
        window.onmousemove = null; window.onmouseup = null;
        onSave(base64);
      };
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

init();
