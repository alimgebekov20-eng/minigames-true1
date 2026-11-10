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

// База цветов
const COLORS_SHOP = [
  { id: 'default', name: 'Обычный', price: 0, css: '' },
  { id: 'red', name: 'Красный', price: 75, css: 'color: #ef4444' },
  { id: 'green', name: 'Зеленый', price: 75, css: 'color: #22c55e' },
  { id: 'blue', name: 'Синий', price: 75, css: 'color: #3b82f6' },
  { id: 'yellow', name: 'Желтый', price: 75, css: 'color: #eab308' },
  { id: 'orange', name: 'Оранжевый', price: 75, css: 'color: #f97316' },
  { id: 'pink', name: 'Розовый', price: 75, css: 'color: #ec4899' },
  { id: 'white', name: 'Белый', price: 75, css: 'color: #ffffff' },
  { id: 'rainbow', name: 'Радужный', price: 200, css: 'anim-rainbow' },
  { id: 'darkpurple', name: 'Тьма', price: 300, css: 'anim-darkpurple' },
  { id: 'fire', name: 'Огонь', price: 300, css: 'anim-fire' },
  { id: 'ocean', name: 'Океан', price: 300, css: 'anim-ocean' },
  { id: 'acid', name: 'Кислота', price: 300, css: 'anim-acid' },
  { id: 'gold', name: 'Золото', price: 300, css: 'anim-gold' },
  { id: 'matrix', name: 'Матрица', price: 300, css: 'anim-matrix' },
  { id: 'legend1', name: 'Бог Грома (Легенда)', price: 1000, css: 'legend-passive-1', triggers: ['trigger-lightning', 'trigger-shake', 'trigger-glow'] },
  { id: 'legend2', name: 'Космос (Легенда)', price: 1000, css: 'legend-passive-2', triggers: ['trigger-stars', 'trigger-warp', 'trigger-blackhole'] },
  { id: 'mythic', name: 'Сингулярность (Миф)', price: 5000, css: 'mythic-passive', triggers: ['trigger-supernova', 'trigger-glitch', 'trigger-matrix-rain', 'trigger-blood', 'trigger-angel'] }
];

let ownedColors = ['default']; // По умолчанию
let colorTriggerInterval = null;

function init() {
  const savedToken = localStorage.getItem('token');
  if (savedToken) {
    socket.emit('login', { token: savedToken }, (res) => {
      if (res.error) { localStorage.removeItem('token'); renderAuth(); } 
      else { currentUser = res.user; renderMainMenu(); startNameColorEngine(); }
    });
  } else { renderAuth(); }
}

function getColorClass(colorId) {
  const c = COLORS_SHOP.find(x => x.id === colorId);
  return c ? c.css : '';
}

function formatName(user) {
  const cssClass = getColorClass(user.nameColor || 'default');
  if (cssClass.includes('anim-') || cssClass.includes('passive')) {
    return `<span class="${cssClass}">${user.nickname}</span>`;
  }
  return `<span style="${cssClass}">${user.nickname}</span>`;
}

// Движок анимаций
function startNameColorEngine() {
  if (colorTriggerInterval) clearInterval(colorTriggerInterval);
  
  function scheduleNext() {
    const delay = Math.floor(Math.random() * 20000) + 25000; // 25-45 сек
    colorTriggerInterval = setTimeout(() => {
      playRandomTrigger();
      scheduleNext();
    }, delay);
  }

  function playRandomTrigger() {
    const colorData = COLORS_SHOP.find(x => x.id === (currentUser?.nameColor || 'default'));
    if (!colorData || !colorData.triggers || colorData.triggers.length === 0) return;

    // Находим все элементы с нашим ником
    const elements = document.querySelectorAll('.dynamic-name');
    if (elements.length === 0) return;

    const randomTrigger = colorData.triggers[Math.floor(Math.random() * colorData.triggers.length)];

    elements.forEach(el => {
      el.classList.remove(colorData.css); // Убираем пассивку
      el.classList.add(randomTrigger);   // Включаем триггер
      
      setTimeout(() => {
        el.classList.remove(randomTrigger); // Убираем триггер
        el.classList.add(colorData.css);    // Возвращаем пассивку
      }, 3000); // Триггер длится 3 секунды
    });
  }

  scheduleNext();
}

// Конфети
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
      y: height - Math.random() * 100, // Начинают снизу
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
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.4; // Гравитация
      p.vx *= 0.99; // Сопротивление воздуха
      p.rotation += p.rotSpeed;

      if (p.y < height + 50) {
        active = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation * Math.PI / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
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
      currentUser = res.user; renderMainMenu(); startNameColorEngine();
    });
  };
}

function renderMainMenu() {
  app.innerHTML = `
    <div class="main-menu">
      <div class="top-bar">
        <div class="avatar">${renderAvatar(currentUser)}</div>
        <div class="info">
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
      <div style="position:fixed; bottom:10px; left:15px; color:var(--text-muted); font-size:12px;">v0.4(wip)</div>
    </div>
  `;
  document.getElementById('btn-search').onclick = renderSearchLobby;
  document.getElementById('btn-create').onclick = renderCreateLobby;
  document.getElementById('btn-leaderboard').onclick = renderLeaderboard;
  document.getElementById('btn-settings').onclick = renderSettings;
}

// ... (Остальные функции рендера лобби и игры остаются такими же, кроме игры) ...
// Я покажу только измененные/новые функции, чтобы не спамить 1000 строк одинакового кода.

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

    // Своя карточка
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
      <div style="margin-top:24px;">
        <button class="primary" id="btn-shop" style="width:100%; background:linear-gradient(90deg, #a855f7, #3b82f6);"><i class="fas fa-palette"></i> Магазин цветов (${currentUser.elo} ELO)</button>
      </div>
      <button class="secondary" id="logout-btn" style="margin-top:32px; width:100%; color:var(--danger);"><i class="fas fa-sign-out-alt"></i> Выйти из аккаунта</button>
    </div>
  `;
  document.getElementById('back-btn').onclick = renderMainMenu;
  document.getElementById('btn-shop').onclick = renderShop;
  
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
        <div>Твое ЭЛО: <strong style="color:var(--primary);font-size:18px;">${currentUser.elo}</strong></div>
        <button class="danger" id="dev-unlock" style="padding:6px 12px; font-size:12px;">[DEV] Открыть всё (+10000 ELO)</button>
      </div>
      <div class="shop-grid" id="shop-grid"></div>
    </div>
  `;
  document.getElementById('back-btn').onclick = renderSettings;
  
  document.getElementById('dev-unlock').onclick = () => {
    socket.emit('devUnlockAll', { userId: currentUser.id }, (res) => {
      if (res.success) { currentUser.elo = res.newElo; renderShop(); }
    });
  };

  const grid = document.getElementById('shop-grid');
  
  function drawShop() {
    grid.innerHTML = COLORS_SHOP.map(c => {
      const isOwned = ownedColors.includes(c.id) || c.id === 'default' || currentUser.elo >= 9000; // 9000+ elo = dev режим
      const isEquipped = (currentUser.nameColor || 'default') === c.id;
      
      const cssClass = c.css.includes('anim-') || c.css.includes('passive') ? c.css : '';
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
        drawShop();
        startNameColorEngine(); // Перезапускаем движок для новых триггеров
      });
    }
  };

  window.equipColor = (id) => {
    socket.emit('equipColor', { userId: currentUser.id, colorId: id }, (res) => {
      if (res.error) return alert(res.error);
      currentUser.nameColor = id;
      drawShop();
      startNameColorEngine();
    });
  };

  drawShop();
}

// Старт игры (Анимация с конфети)
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

  // Создатель видит интерфейс с фигурами, но таймер исправлен
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

// Исправленный таймер
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
        // Исправлено: Не кикаем, а просто пишем что время вышло
        alert('Время вышло! Но вы можете закончить расстановку и нажать "Загадать".');
      }
    }, 1000);
    animTimeouts.push(interval);
  }
}

// Вставляем formatName в чат и лобби
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

// Чат
// В функции renderLobby в блоке рендера чата замени на:
// chatMessages.innerHTML = currentLobby.chat.map(m => `<div class="chat-msg"><span class="author">${formatName(m)}:</span>${m.text}</div>`).join('');

init();
