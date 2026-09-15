"use strict";

// Dados persistidos no SQLite pelo servidor; nenhum usuário fica no navegador.
class ApiDB {
  async request(url, options = {}) {
    let response;
    try {
      response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
      });
    } catch { throw new Error('Não foi possível conectar ao servidor. Inicie o projeto com npm start.'); }
    if (!response.headers.get('content-type')?.includes('application/json'))
      throw new Error('Abra o projeto pelo servidor Node.js (npm start), em http://localhost:3000.');
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Não foi possível concluir a operação.');
    return result;
  }
  async getSession() { return (await this.request('/api/session')).user; }
  async authenticate(username, password) {
    try { return [true, (await this.request('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) })).user]; }
    catch (error) { return [false, error.message]; }
  }
  async getAllUsers() {
    const { users } = await this.request('/api/users');
    return new Map(users.map(user => [user.username, user]));
  }
  async mutate(url, method, data) {
    try {
      const result = await this.request(url, { method, ...(data ? { body: JSON.stringify(data) } : {}) });
      return [true, result.message];
    } catch (error) { return [false, error.message]; }
  }
  addUser(username, password, plan, status) {
    return this.mutate('/api/users', 'POST', { username, password, plan, status });
  }
  updateUser(oldUsername, username, password, plan, status) {
    return this.mutate('/api/users/' + encodeURIComponent(oldUsername), 'PUT', { username, password, plan, status });
  }
  deleteUser(username) { return this.mutate('/api/users/' + encodeURIComponent(username), 'DELETE'); }
  logout() { return this.request('/api/logout', { method: 'POST' }); }
}

// Cada página inicializa somente seus próprios controles.
async function initializeApp() {
  const db = new ApiDB();
  const $ = id => document.getElementById(id);
  const loginForm = $('login-form');
  // A sessão é validada no servidor; os dados antigos de demonstração não são usados.
  const currentUser = await db.getSession();
  const username = currentUser?.username;
  const hasSession = Boolean(currentUser);

  if (loginForm) {
    if (hasSession) {
      location.replace('/painel');
      return;
    }
    $('show-password').onchange = event => {
      $('login-password').type = event.target.checked ? 'text' : 'password';
    };
    loginForm.onsubmit = event => {
      event.preventDefault();
      const button = $('login-submit');
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = 'Autenticando...';
      $('login-error').textContent = '';
      setTimeout(async () => {
        const username = $('login-user').value.trim();
        const [success, result] = await db.authenticate(username, $('login-password').value.trim());
        button.disabled = false;
        button.textContent = 'Entrar';
        if (!success) { $('login-error').textContent = result; return; }
        location.replace('/painel');
      }, 800);
    };
    $('login-user').focus();
    return;
  }

  if (!hasSession) {
    location.replace('/login');
    return;
  }
  // Revalida a sessão ao retornar pelo histórico do navegador.
  window.addEventListener('pageshow', event => {
    if (event.persisted) location.reload();
  });
  const userForm = $('user-form');
  const dialog = $('user-dialog');
  let editingUsername = null;
  let playing = false;
  let timer = null;

  function notify(message, success = true) {
    const node = $('toast-template').content.firstElementChild.cloneNode(true);
    node.textContent = message;
    node.dataset.error = String(!success);
    $('notifications').append(node);
    setTimeout(() => node.remove(), 3000);
  }
  function showScreen(name) {
    for (const screen of ['admin', 'user']) $(screen + '-screen').hidden = screen !== name;
  }
  function switchTab(name) {
    document.querySelectorAll('[data-view]').forEach(view => { view.hidden = view.dataset.view !== name; });
    document.querySelectorAll('[data-tab]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.tab === name)); });
  }
  function stopPlayer() {
    playing = false;
    clearTimeout(timer);
    timer = null;
    $('player-toggle').textContent = '▶';
    $('player-toggle').setAttribute('aria-label', 'Reproduzir');
  }
  function animateProgress() {
    if (!playing) return;
    const progress = $('player-progress');
    if (progress.value >= 1) {
      progress.value = 0;
      stopPlayer();
      return;
    }
    progress.value = Math.min(1, progress.value + 0.01);
    timer = setTimeout(animateProgress, 500);
  }
  function togglePlay() {
    if (playing) return stopPlayer();
    playing = true;
    $('player-toggle').textContent = '⏸';
    $('player-toggle').setAttribute('aria-label', 'Pausar');
    animateProgress();
  }
  async function showLogin() {
    stopPlayer();
    $('vmz')?.pause();
    try { await db.logout(); location.replace('/login'); }
    catch (error) { notify(error.message, false); }
  }
  async function populateUsers() {
    const body = $('users-body');
    let users;
    try { users = await db.getAllUsers(); }
    catch (error) { notify(error.message, false); return; }
    body.replaceChildren();
    $('empty-users').hidden = users.size !== 0;
    for (const [username, data] of users) {
      const row = $('user-row-template').content.firstElementChild.cloneNode(true);
      const field = name => row.querySelector('[data-field="' + name + '"]');
      field('username').textContent = username;
      field('password').textContent = '••••••••';
      field('plan').textContent = data.plan;
      field('plan').dataset.premium = String(data.plan === 'Premium');
      field('status').textContent = data.status;
      field('status').dataset.active = String(data.status === 'Ativo');
      row.querySelector('[data-action="edit"]').onclick = () => openUserDialog(username, data);
      row.querySelector('[data-action="delete"]').onclick = async event => {
        const button = event.currentTarget;
        button.disabled = true;
        const [success, message] = await db.deleteUser(username);
        if (success) await populateUsers();
        else button.disabled = false;
        notify(message, success);
      };
      body.append(row);
    }
  }

  function openUserDialog(username = null, data = null) {
    editingUsername = username;
    userForm.reset();
    $('dialog-title').textContent = username === null ? 'Criar Novo Usuário' : 'Editar Usuário';
    $('edit-user').value = username ?? '';
    $('edit-password').value = '';
    $('edit-password').required = username === null;
    $('edit-password').placeholder = username === null ? 'Senha' : 'Deixe vazio para manter a senha';
    $('edit-plan').value = data?.plan ?? 'Basic';
    $('edit-status').value = data?.status ?? 'Ativo';
    $('user-error').textContent = '';
    dialog.showModal();
  }
  userForm.onsubmit = async event => {
    event.preventDefault();
    const username = $('edit-user').value.trim();
    const password = $('edit-password').value.trim();
    if (!username || (editingUsername === null && !password)) { $('user-error').textContent = 'Preencha usuário e senha.'; return; }
    const args = [username, password, $('edit-plan').value, $('edit-status').value];
    const submit = userForm.querySelector('[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;
    const [success, message] = editingUsername === null ? await db.addUser(...args) : await db.updateUser(editingUsername, ...args);
    submit.disabled = false;
    if (!success) { $('user-error').textContent = message; return; }
    await populateUsers();
    dialog.close();
    notify(message);
  };
  $('cancel-user').onclick = () => dialog.close();
  $('add-user').onclick = () => openUserDialog();
  document.querySelectorAll('[data-logout]').forEach(button => { button.onclick = showLogin; });
  document.querySelectorAll('[data-tab]').forEach(button => { button.onclick = () => switchTab(button.dataset.tab); });
  document.querySelectorAll('[data-track]').forEach(button => {
    button.onclick = () => {
      $('song-title').textContent = 'Epic Soundtrack ' + button.dataset.track;
      $('song-artist').textContent = 'Composer Name';
      stopPlayer();
      togglePlay();

      if (button.dataset.track === '1') tocarSom();
    };
  });
  $('player-toggle').onclick = togglePlay;
  if (currentUser.role === 'admin') {
    populateUsers();
    showScreen('admin');
  } else {
    $('welcome').textContent = 'Bem-vindo, ' + username;
    $('profile-plan').textContent = currentUser.plan;
    switchTab('movies');
    showScreen('user');
  }
}

function startApp() {
  initializeApp().catch(error => {
    const loginError = document.getElementById('login-error');
    if (loginError) { loginError.textContent = error.message; return; }
    const template = document.getElementById('toast-template');
    const target = document.getElementById('notifications');
    if (template && target) {
      const node = template.content.firstElementChild.cloneNode(true);
      node.textContent = error.message;
      node.dataset.error = 'true';
      target.append(node);
    }
  });
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startApp, { once: true });
  else startApp();
}
if (typeof module !== 'undefined' && module.exports) module.exports = { ApiDB };

 function tocarSom() {
      const audio = document.getElementById('vmz');
      if (audio) {
        if (audio.paused) {
          audio.play();
        } else {
          audio.pause();
        }
      }
    }
