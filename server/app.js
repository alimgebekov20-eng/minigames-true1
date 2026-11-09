const socket = io();
const app = document.getElementById('app');

let currentUser = null;
let currentLobby = null;
let currentModal = null;

// ---------- Инициализация ----------
function init() {
  const savedToken = localStorage.getItem('token');
  if (savedToken) {
    socket.emit('login', { token: savedToken }, (res) => {
      if (res.error) {
        localStorage.removeItem('token');
        renderAuth();
      } else {
        currentUser = res.user;
        renderMainMenu();
      }
    });
  } else {
    renderAuth();
  }
}

// ---------- Экран входа ----------
function renderAuth() {
  app.innerHTML = `
    <div class="card auth-screen">
      <h1>🎮 Mini Games</h1>
      <div>
        <label>Логин (уникальный, нельзя изменить)</label>
        <input id="reg-login" placeholder="Например: pro_player" />
      </div>
      <div>
        <label>Никнейм (отображаемое имя)</label>
        <input id="reg-nickname" placeholder="Ваше имя" />
      </div>
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

// ---------- Главное меню ----------
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
    </div>
  `;
  document.getElementById('btn-search').onclick = renderSearchLobby;
  document.getElementById('btn-create').onclick = renderCreateLobby;
  document.getElementById('btn-settings').onclick = renderSettings;
}

// ---------- Поиск лобби ----------
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
          <div>
            <div class="name">${l.name}</div>
            <div class="meta">${l.players}/${l.maxPlayers} игроков ${l.hasChat ? '· 💬 Чат вкл' : ''}</div>
          </div>
          <button class="primary" style="padding:8px 16px;">Войти</button>
        </div>
      `).join('') : '<p style="color:var(--text-muted);text-align:center;padding:20px;">Лобби не найдены</p>';

      listEl.querySelectorAll('.lobby-item').forEach(el => {
        el.onclick = () => {
          const lobbyId = el.dataset.id;
          socket.emit('joinLobby', { lobbyId, user: currentUser }, (res) => {
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
  
  socket.off('lobbiesUpdated');
  socket.on('lobbiesUpdated', loadLobbies);
}

// ---------- Создание лобби ----------
function renderCreateLobby() {
  app.innerHTML = `
    <div class="card" style="max-width:500px;margin:0 auto;">
      <h2><i class="fas fa-plus"></i> Создать лобби</h2>
      <div style="margin-top:20px;">
        <label>Название лобби (уникальное)</label>
        <input id="lobby-name" placeholder="Например: Топчики" />
      </div>
      <div style="margin-top:16px;">
        <label>Макс. игроков (2-8)</label>
        <input id="lobby-max" type="number" min="2" max="8" value="4" />
      </div>
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
    if (maxPlayers < 2 || maxPlayers > 8) return alert('От 2 до 8 игроков');
    
    socket.emit('createLobby', { name, maxPlayers, hasChat, user: currentUser }, (res) => {
      if (res.error) return alert(res.error);
      currentLobby = res.lobby;
      renderLobby();
    });
  };
}

// ---------- Экран лобби ----------
function renderLobby() {
  const isAdmin = currentLobby.adminId === currentUser.id;
  const adminClass = isAdmin ? 'admin' : '';

  app.innerHTML = `
    <div class="card lobby-screen ${adminClass}">
      <div class="lobby-header">
        <h2><i class="fas fa-users"></i> ${currentLobby.name}</h2>
        <span style="color:var(--text-muted);font-weight:600;">${currentLobby.players.length}/${currentLobby.maxPlayers}</span>
      </div>
      
      <div class="lobby-body">
        <div class="players-panel">
          <div class="player-list" id="player-list">
            ${renderPlayerList()}
          </div>
        </div>
        
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
    socket.emit('leaveLobby', { lobbyId: currentLobby.id, user: currentUser }, (res) => {
      if (res.error) return alert(res.error);
      currentLobby = null;
      renderMainMenu();
    });
  };

  if (isAdmin) {
    document.getElementById('start-btn').onclick = () => alert('Мини-игра пока не реализована');
    
    document.querySelectorAll('.player-item').forEach(el => {
      el.onclick = () => {
        const targetId = el.dataset.id;
        if (targetId === currentUser.id) return; 
        openPlayerModal(targetId);
      };
    });
  }

  if (currentLobby.hasChat) {
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');

    function renderMessages() {
      chatMessages.innerHTML = currentLobby.chat.map(m => `
        <div class="chat-msg"><span class="author">${m.nickname}:</span>${m.text}</div>
      `).join('');
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    renderMessages();

    function sendMessage() {
      const text = chatInput.value.trim();
      if (!text) return;
      socket.emit('chatMessage', { lobbyId: currentLobby.id, user: currentUser, text }, (res) => {
        if (res.error) return alert(res.error);
        chatInput.value = '';
      });
    }
    chatSend.onclick = sendMessage;
    chatInput.onkeydown = (e) => { if (e.key === 'Enter') sendMessage(); };

    socket.off('newMessage');
    socket.on('newMessage', (msg) => {
      currentLobby.chat.push(msg);
      if (currentLobby.chat.length > 30) currentLobby.chat.shift();
      renderMessages();
    });
  }

  socket.off('lobbyUpdated');
  socket.on('lobbyUpdated', (lobby) => {
    currentLobby = lobby;
    renderLobby();
  });
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

// ---------- Модалка действий с игроком (Админ) ----------
function openPlayerModal(targetId) {
  const target = currentLobby.players.find(p => p.id === targetId);
  if (!target) return;

  if (currentModal) currentModal.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <button class="close-btn" title="Закрыть"><i class="fas fa-arrow-left"></i></button>
      <h3><i class="fas fa-user"></i> Игрок</h3>
      <div style="display:flex;align-items:center;gap:16px;">
        <div class="avatar" style="width:64px;height:64px;font-size:28px;">${renderAvatar(target)}</div>
        <div>
          <div style="font-size:20px;font-weight:700;">${target.nickname}</div>
          <div style="color:var(--text-muted);margin-bottom:4px;">@${target.login}</div>
          <div style="color:var(--primary);font-weight:700;"><i class="fas fa-trophy"></i> ${target.elo} ELO</div>
        </div>
      </div>
      <div class="actions">
        <button class="danger" data-action="kick"><i class="fas fa-user-minus"></i> Кик</button>
        <button class="danger" data-action="ban"><i class="fas fa-ban"></i> Бан</button>
        <button class="primary" data-action="admin"><i class="fas fa-crown"></i> Админ</button>
      </div>
    </div>
  `;

  overlay.querySelector('.close-btn').onclick = () => {
    overlay.remove();
    currentModal = null;
  };

  overlay.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = () => {
      const action = btn.dataset.action;
      const labels = { kick: 'кикнуть', ban: 'забанить', admin: 'передать права админа' };
      
      if (confirm(`Вы уверены, что хотите ${labels[action]} игрока ${target.nickname}?`)) {
        socket.emit('adminAction', {
          lobbyId: currentLobby.id,
          targetId: target.id,
          action: action === 'admin' ? 'transferAdmin' : action,
          adminId: currentUser.id
        }, (res) => {
          if (res.error) alert(res.error);
          overlay.remove();
          currentModal = null;
        });
      }
    };
  });

  document.body.appendChild(overlay);
  currentModal = overlay;
}

// ---------- Настройки (НОВАЯ ВЕРСИЯ) ----------
function renderSettings() {
  app.innerHTML = `
    <div class="card" style="max-width:500px;margin:0 auto;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <h2><i class="fas fa-cog"></i> Настройки</h2>
        <button class="secondary" id="back-btn"><i class="fas fa-arrow-left"></i> Назад</button>
      </div>

      <!-- Блок аватарки -->
      <div style="display:flex; align-items:center; gap:16px; margin-bottom:24px; padding-bottom:24px; border-bottom:1px solid var(--surface-2);">
        <div class="avatar" id="settings-avatar-preview" style="width:72px;height:72px;font-size:32px;">
          ${renderAvatar(currentUser)}
        </div>
        <div>
          <input type="file" id="avatar-upload" accept="image/*" style="display:none;" />
          <button class="primary" id="btn-upload-avatar" style="padding:8px 16px; font-size:14px;">
            <i class="fas fa-camera"></i> Загрузить фото
          </button>
          <div style="font-size:12px; color:var(--text-muted); margin-top:8px;">JPG, PNG</div>
        </div>
      </div>

      <div>
        <label>Никнейм</label>
        <input id="setting-nickname" value="${currentUser.nickname}" />
        <button class="primary" id="save-nickname" style="margin-top:12px;width:100%;">Сохранить никнейм</button>
      </div>
      
      <button class="secondary" id="logout-btn" style="margin-top:32px; width:100%; color:var(--danger);">
        <i class="fas fa-sign-out-alt"></i> Выйти из аккаунта
      </button>
    </div>
  `;
  
  document.getElementById('back-btn').onclick = renderMainMenu;
  
  document.getElementById('save-nickname').onclick = () => {
    const newNick = document.getElementById('setting-nickname').value.trim();
    if (!newNick) return alert('Введите никнейм');
    
    socket.emit('updateNickname', { userId: currentUser.id, nickname: newNick }, (res) => {
      if (res.error) return alert(res.error);
      currentUser.nickname = newNick;
      alert('Никнейм успешно обновлён!');
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
        alert('Аватарка обновлена!');
      });
    });
  };

  document.getElementById('logout-btn').onclick = () => {
    if (confirm('Точно выйти из аккаунта?')) {
      localStorage.removeItem('token');
      window.location.reload();
    }
  };
}

// Функция сжатия картинки
function compressImage(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const MAX_SIZE = 128;
      let width = img.width;
      let height = img.height;

      if (width > height && width > MAX_SIZE) {
        height *= MAX_SIZE / width;
        width = MAX_SIZE;
      } else if (height > MAX_SIZE) {
        width *= MAX_SIZE / height;
        height = MAX_SIZE;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Запуск
init();
