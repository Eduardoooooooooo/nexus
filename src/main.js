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

// Player conectado ao elemento <audio>; os eventos atualizam os controles.
function createAudioPlayer({ audio, playButton, previousButton, nextButton, shuffleButton, repeatButton, muteButton, progress, currentTime, totalTime, volume, trackButtons, title, artist, durationLabels, notify, onTrackChange = () => {} }) {
  const buttons = [...trackButtons];
  let selected = null;
  let wantsPlay = false;
  let attempt = 0;
  let reportedError = false;
  let shuffle = false;
  let repeatMode = 'off';

  function setIcon(button, name) {
    let icon = button.querySelector?.('i');
    if (!icon && button.ownerDocument) {
      icon = button.ownerDocument.createElement('i');
      button.replaceChildren(icon);
    }
    if (icon) icon.className = `ph ph-${name}`;
  }

  function updateButtons() {
    const active = !audio.paused && !audio.ended;
    setIcon(playButton, active ? 'pause' : 'play');
    playButton.setAttribute('aria-label', active ? 'Pausar' : 'Reproduzir');
    buttons.forEach(button => {
      const playingThis = button === selected && active;
      const icon = button.querySelector('[data-play-icon]');
      if (icon) icon.className = playingThis ? 'ph ph-pause' : 'ph ph-play';
      else setIcon(button, playingThis ? 'pause' : 'play');
      button.setAttribute('aria-label', `${playingThis ? 'Pausar' : 'Reproduzir'} ${button.dataset.title || 'faixa ' + button.dataset.track}`);
    });
  }
  function updateProgress() {
    const canSeek = Boolean(selected) && Number.isFinite(audio.duration) && audio.duration > 0;
    progress.disabled = !canSeek;
    progress.value = canSeek ? Math.min(1, audio.currentTime / audio.duration) : 0;
    const format = value => {
      const seconds = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
      return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    };
    if (currentTime) currentTime.textContent = format(audio.currentTime);
    if (totalTime) totalTime.textContent = format(canSeek ? audio.duration : 0);
    if (selected && Number.isFinite(audio.duration)) {
      const duration = durationLabels.find(label => label.dataset.duration === selected.dataset.track);
      if (duration) {
        selected.dataset.localDuration = String(audio.duration);
        duration.title = 'Duração do arquivo local';
        const seconds = Math.floor(audio.duration);
        duration.textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
      }
    }
  }
  function reportError(message) {
    wantsPlay = false;
    updateButtons();
    if (!reportedError) { reportedError = true; notify(message, false); }
  }
  function stop() {
    attempt++;
    wantsPlay = false;
    audio.pause();
    updateButtons();
  }
  async function play() {
    const currentAttempt = ++attempt;
    wantsPlay = true;
    reportedError = false;
    try {
      if (audio.ended) audio.currentTime = 0;
      await audio.play();
      if (currentAttempt === attempt) updateButtons();
    } catch (error) {
      if (currentAttempt !== attempt || error.name === 'AbortError') return;
      reportError(error.name === 'NotAllowedError'
        ? 'O navegador bloqueou a reprodução. Clique novamente em reproduzir.'
        : 'Não foi possível reproduzir a música. Verifique se o servidor Node.js está atualizado e em execução.');
    }
  }
  function selectTrack(button, { restart = false } = {}) {
    if (!button?.dataset.src) {
      notify('Esta faixa ainda não possui um arquivo de áudio.', false);
      return;
    }
    if (selected === button && !restart) {
      if (wantsPlay || !audio.paused) stop();
      else return play();
      return;
    }
    stop();
    selected = button;
    audio.src = button.dataset.src;
    title.textContent = button.dataset.title;
    artist.textContent = button.dataset.artist;
    progress.value = 0;
    progress.disabled = true;
    onTrackChange();
    return play();
  }
  function toggle() {
    if (!selected) return selectTrack(buttons.find(button => button.dataset.src));
    if (wantsPlay || !audio.paused) stop();
    else return play();
  }
  function moveTrack(direction, { fromEnded = false } = {}) {
    const playlist = buttons.filter(button => button.dataset.src);
    if (!playlist.length) return;
    const currentIndex = playlist.indexOf(selected);
    if (fromEnded && !shuffle && repeatMode === 'off' && currentIndex === playlist.length - 1) {
      wantsPlay = false;
      audio.currentTime = 0;
      updateButtons();
      updateProgress();
      return;
    }
    let index;
    if (shuffle && playlist.length > 1) {
      do { index = Math.floor(Math.random() * playlist.length); } while (index === currentIndex);
    } else index = currentIndex === -1 ? 0 : (currentIndex + direction + playlist.length) % playlist.length;
    return selectTrack(playlist[index], { restart: true });
  }
  function seek() {
    if (progress.disabled || !selected || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const fraction = Number(progress.value);
    if (!Number.isFinite(fraction)) return;
    audio.currentTime = Math.max(0, Math.min(1, fraction)) * audio.duration;
    updateProgress();
  }
  progress.addEventListener('input', seek);
  progress.disabled = true;
  if (previousButton) {
    previousButton.disabled = !buttons.some(button => button.dataset.src);
    previousButton.onclick = () => moveTrack(-1);
  }
  if (nextButton) {
    nextButton.disabled = !buttons.some(button => button.dataset.src);
    nextButton.onclick = () => moveTrack(1);
  }
  if (shuffleButton) shuffleButton.onclick = () => {
    shuffle = !shuffle;
    shuffleButton.dataset.active = String(shuffle);
    shuffleButton.setAttribute('aria-pressed', String(shuffle));
    shuffleButton.setAttribute('aria-label', shuffle ? 'Desativar reprodução aleatória' : 'Ativar reprodução aleatória');
  };
  if (repeatButton) repeatButton.onclick = () => {
    repeatMode = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
    repeatButton.dataset.active = String(repeatMode !== 'off');
    repeatButton.dataset.mode = repeatMode;
    repeatButton.setAttribute('aria-pressed', String(repeatMode !== 'off'));
    repeatButton.setAttribute('aria-label', repeatMode === 'one' ? 'Repetir esta música' : repeatMode === 'all' ? 'Repetir todas as músicas' : 'Ativar repetição');
    setIcon(repeatButton, repeatMode === 'one' ? 'repeat-once' : 'repeat');
  };
  audio.addEventListener('emptied', () => { progress.value = 0; progress.disabled = true; });
  audio.addEventListener('playing', () => { wantsPlay = true; updateButtons(); });
  audio.addEventListener('pause', () => { wantsPlay = false; updateButtons(); });
  audio.addEventListener('ended', () => {
    wantsPlay = false;
    if (repeatMode === 'one' && selected) selectTrack(selected, { restart: true });
    else moveTrack(1, { fromEnded: true });
  });
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('loadedmetadata', updateProgress);
  audio.addEventListener('durationchange', updateProgress);
  audio.addEventListener('error', () => {
    if (selected) reportError('Não foi possível carregar o arquivo de áudio. Confira se ele existe na pasta de músicas.');
  });
  let previousVolume = Math.max(Number(volume.value) || 50, 1);
  function updateMuteButton() {
    if (!muteButton) return;
    const muted = audio.muted || audio.volume === 0;
    setIcon(muteButton, muted ? 'speaker-slash' : 'speaker-high');
    muteButton.setAttribute('aria-label', muted ? 'Desmutar' : 'Mutar');
    muteButton.setAttribute('aria-pressed', String(muted));
  }
  volume.addEventListener('input', () => {
    const value = Number(volume.value);
    audio.volume = value / 100;
    if (value > 0) { previousVolume = value; audio.muted = false; }
    updateMuteButton();
  });
  if (muteButton) muteButton.onclick = () => {
    const muted = audio.muted || audio.volume === 0;
    if (muted) {
      audio.muted = false;
      if (audio.volume === 0) { audio.volume = previousVolume / 100; volume.value = previousVolume; }
    } else { previousVolume = Math.max(Number(volume.value) || 50, 1); audio.muted = true; }
    updateMuteButton();
  };
  audio.addEventListener('volumechange', updateMuteButton);
  audio.volume = Number(volume.value) / 100;
  updateMuteButton();
  updateProgress();
  buttons.forEach(button => { button.onclick = () => selectTrack(button); });
  playButton.onclick = toggle;
  updateButtons();
  return { stop, toggle, selectTrack, resume: play, getSelectedTrack: () => selected };
}

function createVideoViewer({ button, dialog, stage, video, closeButton, heading, errorLabel, audio, volume, player, notify, document: doc }) {
  let active = false;
  let enteredFullscreen = false;
  let startTime = 0;
  let wasPlaying = false;
  let failed = false;
  let generation = 0;

  function finish() {
    if (!active) return;
    active = false;
    generation++;
    const resume = failed ? wasPlaying : !video.paused && !video.ended;
    const position = video.readyState > 0 && !failed ? video.currentTime : startTime;
    video.pause();
    if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(position, audio.duration);
    audio.volume = video.volume;
    audio.muted = video.muted;
    volume.value = Math.round(video.volume * 100);
    video.removeAttribute('src');
    video.load();
    if (doc.fullscreenElement && stage.contains(doc.fullscreenElement)) doc.exitFullscreen().catch(() => {});
    if (dialog.open) dialog.close();
    if (resume) player.resume();
    button.focus();
  }

  function open() {
    if (active) return;
    const track = player.getSelectedTrack();
    if (!track) { notify('Selecione uma música antes de abrir o videoclipe.', false); return; }
    if (!track.dataset.video) { notify('Esta música ainda não tem videoclipe cadastrado.', false); return; }
    const currentGeneration = ++generation;
    active = true;
    failed = false;
    enteredFullscreen = false;
    startTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    wasPlaying = !audio.paused;
    player.stop();
    heading.textContent = track.dataset.title;
    errorLabel.textContent = '';
    video.volume = audio.volume;
    video.muted = audio.muted;
    video.src = track.dataset.video;
    dialog.showModal();
    closeButton.focus();
    // Solicita tela cheia dentro do clique, antes de qualquer espera de rede.
    if (stage.requestFullscreen) {
      try {
        stage.requestFullscreen().catch(() => {
          if (active && currentGeneration === generation) errorLabel.textContent = 'Tela cheia indisponível. O clipe continua aberto nesta janela.';
        });
      } catch { errorLabel.textContent = 'Tela cheia indisponível. O clipe continua aberto nesta janela.'; }
    }
    video.play().catch(error => {
      if (!active || currentGeneration !== generation || error.name === 'AbortError') return;
      failed = true;
      errorLabel.textContent = 'Não foi possível iniciar o clipe. Tente o botão de reprodução do vídeo.';
    });
  }
  video.addEventListener('loadedmetadata', () => {
    if (active && Number.isFinite(video.duration)) video.currentTime = Math.min(startTime, Math.max(0, video.duration - 0.1));
  });
  video.addEventListener('playing', () => { failed = false; });
  video.addEventListener('error', () => {
    if (active) { failed = true; errorLabel.textContent = 'Não foi possível carregar o videoclipe. Confira o arquivo e reinicie o servidor Node.js.'; }
  });
  doc.addEventListener('fullscreenchange', () => {
    if (!active) return;
    if (doc.fullscreenElement && stage.contains(doc.fullscreenElement)) enteredFullscreen = true;
    else if (enteredFullscreen && !doc.fullscreenElement) finish();
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
  dialog.addEventListener('close', finish);
  closeButton.onclick = finish;
  button.onclick = open;
  return { open, close: finish };
}

// Enriquece apenas as faixas cadastradas, sem interromper a reprodução local.
function createLibraryFeatures({ username, user, buttons, rows, allMusicItems, movieCards, player, switchTab, notify, elements, document: doc, storage = localStorage }) {
  const playable = [...buttons].filter(button => button.dataset.src);
  const byId = new Map(playable.map(button => [button.dataset.track, button]));
  const rowById = new Map([...rows].map(row => [row.dataset.musicRow, row]));
  const storageKey = `nexus-library:${username}`;
  const defaults = { liked: [], pinned: [], recent: [], tastes: [], playlists: {}, settings: { compact: false, showSources: true } };
  let state = structuredClone(defaults);
  let collection = 'all';
  let lastContentTab = 'movies';

  try {
    const saved = JSON.parse(storage.getItem(storageKey));
    if (saved && typeof saved === 'object') state = {
      liked: Array.isArray(saved.liked) ? saved.liked.filter(id => byId.has(String(id))).map(String) : [],
      pinned: Array.isArray(saved.pinned) ? saved.pinned.filter(id => byId.has(String(id))).map(String) : [],
      recent: Array.isArray(saved.recent) ? saved.recent.filter(id => byId.has(String(id))).map(String).slice(0, 20) : [],
      tastes: Array.isArray(saved.tastes) ? saved.tastes.filter(value => typeof value === 'string') : [],
      playlists: saved.playlists && typeof saved.playlists === 'object' && !Array.isArray(saved.playlists)
        ? Object.fromEntries(Object.entries(saved.playlists).filter(([name, ids]) => name.trim() && Array.isArray(ids)).map(([name, ids]) => [name.slice(0, 60), ids.filter(id => byId.has(String(id))).map(String)])) : {},
      settings: { ...defaults.settings, ...(saved.settings || {}) }
    };
  } catch { state = structuredClone(defaults); }

  function save() { storage.setItem(storageKey, JSON.stringify(state)); }
  function toggle(list, id) {
    const index = list.indexOf(id);
    if (index === -1) list.push(id); else list.splice(index, 1);
  }
  function normalized(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  function updateButtons() {
    for (const [id, row] of rowById) {
      const liked = state.liked.includes(id), pinned = state.pinned.includes(id);
      const like = row.querySelector('[data-like]'), pin = row.querySelector('[data-pin]');
      like.dataset.active = String(liked);
      like.setAttribute('aria-pressed', String(liked));
      like.setAttribute('aria-label', liked ? 'Remover dos favoritos' : 'Curtir música');
      like.querySelector('i').className = 'ph ph-heart';
      pin.dataset.active = String(pinned);
      pin.setAttribute('aria-pressed', String(pinned));
      pin.setAttribute('aria-label', pinned ? 'Desafixar música' : 'Fixar música');
      pin.querySelector('i').className = 'ph ph-push-pin';
    }
  }
  function populatePlaylists() {
    elements.playlists.replaceChildren();
    const names = Object.keys(state.playlists).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    elements.emptyPlaylists.hidden = names.length !== 0;
    for (const name of names) {
      const item = elements.playlistTemplate.content.firstElementChild.cloneNode(true);
      const open = item.querySelector('[data-open-playlist]');
      open.querySelector('[data-playlist-name]').textContent = name;
      open.querySelector('[data-playlist-count]').textContent = state.playlists[name].length;
      open.onclick = () => showCollection('playlist', name);
      item.querySelector('[data-delete-playlist]').onclick = () => {
        delete state.playlists[name];
        if (collection === `playlist:${name}`) showCollection('all');
        save(); populatePlaylists();
        notify('Playlist removida.');
      };
      elements.playlists.append(item);
    }
    for (const row of rowById.values()) {
      const select = row.querySelector('[data-add-playlist]');
      select.replaceChildren();
      const placeholder = doc.createElement('option');
      placeholder.value = ''; placeholder.textContent = 'Adicionar à playlist…';
      select.append(placeholder);
      for (const name of names) {
        const option = doc.createElement('option');
        option.value = name; option.textContent = name;
        select.append(option);
      }
    }
  }
  function applySettings() {
    doc.body.classList.toggle('compact-library', Boolean(state.settings.compact));
    doc.body.classList.toggle('hide-music-sources', !state.settings.showSources);
    elements.compact.checked = Boolean(state.settings.compact);
    elements.showSources.checked = Boolean(state.settings.showSources);
  }
  function visibleIds() {
    if (collection === 'liked') return state.liked;
    if (collection === 'pinned') return state.pinned;
    if (collection === 'recent') return state.recent;
    if (collection.startsWith('playlist:')) return state.playlists[collection.slice(9)] || [];
    return [...byId.keys()];
  }
  function applyMusicFilter() {
    const query = normalized(elements.musicSearch.value);
    const allowed = new Set(visibleIds());
    const tasteSet = new Set(state.tastes);
    let count = 0;
    for (const item of allMusicItems) {
      const button = item.querySelector('[data-track]');
      const id = button?.dataset.track;
      let visible = collection === 'all' ? true : Boolean(id && allowed.has(id));
      if (collection === 'releases') visible = Boolean(button?.dataset.release);
      if (query) visible = visible && normalized(item.textContent).includes(query);
      if (tasteSet.size && button?.dataset.src) {
        const genres = new Set((button.dataset.genres || '').split(',').filter(Boolean));
        visible = visible && [...tasteSet].some(taste => genres.has(taste));
      } else if (tasteSet.size && !button?.dataset.src) visible = false;
      item.hidden = !visible;
      if (visible) count++;
    }
    elements.musicEmpty.hidden = count !== 0;
    elements.collectionCount.textContent = `${count} ${count === 1 ? 'item' : 'itens'}`;
  }
  function showCollection(type, name = '') {
    collection = type === 'playlist' ? `playlist:${name}` : type;
    const titles = { all: 'Todas as músicas', liked: 'Músicas curtidas', pinned: 'Músicas fixadas', recent: 'Ouvidas recentemente', releases: 'Lançamentos' };
    elements.collectionTitle.textContent = type === 'playlist' ? name : titles[type];
    elements.libraryButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.library === type && type !== 'playlist')));
    switchTab('music');
    applyMusicFilter();
  }
  function recordRecent() {
    const id = player.getSelectedTrack()?.dataset.track;
    if (!id) return;
    state.recent = [id, ...state.recent.filter(item => item !== id)].slice(0, 20);
    save();
    if (collection === 'recent') applyMusicFilter();
  }
  function renderSearch() {
    const query = normalized(elements.globalSearch.value.trim());
    elements.searchResults.replaceChildren();
    if (!query) { switchTab(lastContentTab); return; }
    const matches = [];
    for (const button of playable) if (normalized(`${button.dataset.title} ${button.dataset.artist}`).includes(query)) matches.push({ type: 'Música', title: button.dataset.title, subtitle: button.dataset.artist, action: () => { elements.globalSearch.value = ''; showCollection('all'); player.selectTrack(button); } });
    for (const card of movieCards) if (normalized(card.textContent).includes(query)) matches.push({ type: 'Filme ou série', title: card.querySelector('h3')?.textContent || card.textContent.trim(), subtitle: 'Catálogo NEXUS', action: () => { elements.globalSearch.value = ''; switchTab('movies'); card.scrollIntoView({ behavior: 'smooth', block: 'center' }); } });
    for (const match of matches) {
      const result = elements.searchTemplate.content.firstElementChild.cloneNode(true);
      result.querySelector('[data-result-type]').textContent = match.type;
      result.querySelector('[data-result-title]').textContent = match.title;
      result.querySelector('[data-result-subtitle]').textContent = match.subtitle;
      result.onclick = match.action;
      elements.searchResults.append(result);
    }
    elements.searchEmpty.hidden = matches.length !== 0;
    switchTab('search');
  }
  function filterMovies() {
    const query = normalized(elements.movieSearch.value);
    let count = 0;
    for (const card of movieCards) {
      const visible = normalized(card.textContent).includes(query);
      card.hidden = !visible;
      if (visible) count++;
    }
    elements.movieEmpty.hidden = count !== 0;
  }
  function openProfile() {
    elements.profileName.textContent = username;
    elements.profileRole.textContent = user.role === 'admin' ? 'Administrador' : 'Usuário';
    elements.profilePlan.textContent = user.plan;
    elements.profileDialog.showModal();
  }

  for (const [id, row] of rowById) {
    row.querySelector('[data-like]').onclick = () => { toggle(state.liked, id); save(); updateButtons(); if (collection === 'liked') applyMusicFilter(); };
    row.querySelector('[data-pin]').onclick = () => { toggle(state.pinned, id); save(); updateButtons(); if (collection === 'pinned') applyMusicFilter(); };
    row.querySelector('[data-add-playlist]').onchange = event => {
      const name = event.target.value;
      if (!name) return;
      if (!state.playlists[name].includes(id)) state.playlists[name].push(id);
      save(); populatePlaylists(); event.target.value = '';
      notify(`Adicionada à playlist “${name}”.`);
    };
  }
  elements.newPlaylist.onclick = () => { elements.playlistForm.reset(); elements.playlistError.textContent = ''; elements.playlistDialog.showModal(); };
  elements.cancelPlaylist.onclick = () => elements.playlistDialog.close();
  elements.playlistForm.onsubmit = event => {
    event.preventDefault();
    const name = elements.playlistName.value.trim();
    if (!name || name.length > 60) { elements.playlistError.textContent = 'Use um nome de até 60 caracteres.'; return; }
    if (Object.hasOwn(state.playlists, name)) { elements.playlistError.textContent = 'Essa playlist já existe.'; return; }
    state.playlists[name] = []; save(); populatePlaylists(); elements.playlistDialog.close(); showCollection('playlist', name);
  };
  elements.libraryButtons.forEach(button => { button.onclick = () => showCollection(button.dataset.library); });
  elements.tasteButtons.forEach(button => {
    button.onclick = () => {
      toggle(state.tastes, button.dataset.taste); save();
      button.setAttribute('aria-pressed', String(state.tastes.includes(button.dataset.taste)));
      applyMusicFilter();
    };
    button.setAttribute('aria-pressed', String(state.tastes.includes(button.dataset.taste)));
  });
  elements.musicSearch.addEventListener('input', applyMusicFilter);
  elements.movieSearch.addEventListener('input', filterMovies);
  elements.globalSearch.addEventListener('input', renderSearch);
  elements.profileButton.onclick = openProfile;
  elements.closeProfile.onclick = () => elements.profileDialog.close();
  elements.compact.onchange = () => { state.settings.compact = elements.compact.checked; save(); applySettings(); };
  elements.showSources.onchange = () => { state.settings.showSources = elements.showSources.checked; save(); applySettings(); };
  updateButtons(); populatePlaylists(); applySettings(); applyMusicFilter(); filterMovies();
  return { recordRecent, showCollection, setLastTab: name => { if (name !== 'search') lastContentTab = name; } };
}


function createMetadataCatalog({ db, buttons, player, cover, sourceLinks, statusLabel, document: doc }) {
  const tracks = [...buttons].filter(button => button.dataset.src && button.dataset.queryArtist);
  let loading = null;
  let loaded = false;
  function image(node, url, title) {
    if (!node) return;
    node.hidden = !url;
    node.alt = 'Capa de ' + title;
    const placeholder = node.parentElement?.querySelector('[data-cover-placeholder]');
    const playerPlaceholder = node.parentElement?.querySelector('#song-cover-placeholder');
    if (placeholder) placeholder.textContent = String(title || 'M').trim().slice(0, 2).toUpperCase();
    if (placeholder) placeholder.hidden = Boolean(url);
    if (playerPlaceholder) playerPlaceholder.hidden = Boolean(url);
    if (url) {
      node.onerror = () => {
        node.hidden = true;
        if (placeholder) placeholder.hidden = false;
        if (playerPlaceholder) playerPlaceholder.hidden = false;
      };
      node.src = url;
    } else node.removeAttribute('src');
  }
  function links(container, metadata) {
    for (const provider of ['spotify', 'lastfm']) {
      const link = container.querySelector(`[data-provider="${provider}"]`);
      if (!link) continue;
      const url = metadata?.links?.[provider];
      link.hidden = !url;
      if (url) link.href = url;
      else link.removeAttribute('href');
    }
  }
  function syncPlayer() {
    const selected = player.getSelectedTrack();
    const metadata = selected?.metadata;
    image(cover, metadata?.coverUrl, selected?.dataset.title || 'música');
    links(sourceLinks, metadata);
    if (selected) {
      doc.getElementById('song-title').textContent = selected.dataset.title;
      doc.getElementById('song-artist').textContent = selected.dataset.artist;
    }
  }
  async function load() {
    if (loaded) return;
    if (loading) return loading;
    loading = (async () => {
      statusLabel.textContent = 'Buscando informações das músicas…';
      let successes = 0;
      for (const button of tracks) {
        try {
          const params = new URLSearchParams({ artist: button.dataset.queryArtist, track: button.dataset.queryTitle });
          const { metadata } = await db.request('/api/music/metadata?' + params);
          if (!metadata) continue;
          successes++;
          button.metadata = metadata;
          button.dataset.title = metadata.title;
          button.dataset.artist = metadata.artists.join(', ');
          const row = button.closest('[data-music-row]');
          row.querySelector('[data-music-title]').textContent = button.dataset.title;
          row.querySelector('[data-music-artist]').textContent = button.dataset.artist;
          image(row.querySelector('[data-music-cover]'), metadata.coverUrl, metadata.title);
          links(row, metadata);
          const label = row.querySelector('[data-duration]');
          if (metadata.durationMs && !button.dataset.localDuration) {
            const seconds = Math.floor(metadata.durationMs / 1000);
            label.textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
            label.title = 'Duração informada pelo catálogo; o arquivo local pode ter outra duração.';
          }
          syncPlayer();
        } catch { /* Mantém título, artista e arquivo locais quando a consulta falhar. */ }
      }
      loaded = successes === tracks.length && tracks.length > 0;
      statusLabel.textContent = successes === tracks.length && tracks.length
        ? 'Informações das músicas atualizadas.'
        : successes ? 'Algumas músicas não têm informações adicionais disponíveis.' : 'Informações adicionais indisponíveis. Exibindo os dados locais.';
    })().finally(() => { loading = null; });
    return loading;
  }
  return { load, syncPlayer };
}

function createOnlineCatalog({ db, search, template, discover, results, collectionTitle, collectionCount }) {
  let discoverLoaded = false;
  let timer = null;
  let requestId = 0;
  function durationLabel(milliseconds) {
    if (!milliseconds) return '';
    const seconds = Math.floor(milliseconds / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function render(target, result, query = '') {
    target.list.replaceChildren();
    if (target.title) target.title.textContent = query ? `Resultados para “${query}”` : 'Ranking global do Spotify';
    if (query) {
      collectionTitle.textContent = 'Pesquisa no Spotify';
      collectionCount.textContent = `${result.tracks.length} resultados`;
    }
    result.tracks.forEach((track, index) => {
      const card = template.content.firstElementChild.cloneNode(true);
      const spotify = track.links?.spotify;
      const lastfm = track.links?.lastfm;
      const primary = spotify;
      const cover = card.querySelector('[data-online-cover]');
      const placeholder = card.querySelector('[data-online-placeholder]');
      placeholder.textContent = track.title.trim().slice(0, 2).toUpperCase();
      if (track.coverUrl) {
        cover.src = track.coverUrl;
        cover.alt = `Capa de ${track.title}`;
        cover.hidden = false;
        placeholder.hidden = true;
        cover.onerror = () => { cover.hidden = true; placeholder.hidden = false; };
      }
      const primaryLink = card.querySelector('[data-online-primary]');
      if (primary) primaryLink.href = primary;
      else { primaryLink.removeAttribute('href'); primaryLink.setAttribute('aria-disabled', 'true'); }
      primaryLink.setAttribute('aria-label', `${primary ? 'Abrir' : 'Ver'} ${track.title}${track.source ? ' no ' + track.source : ''}`);
      card.querySelector('[data-online-rank]').textContent = query ? (track.kind || 'Música') : String(index + 1).padStart(2, '0');
      card.querySelector('[data-online-title]').textContent = track.title;
      card.querySelector('[data-online-artist]').textContent = track.kind === 'Artista' ? 'Perfil de artista' : track.artists.join(', ');
      card.querySelector('[data-online-duration]').textContent = durationLabel(track.durationMs);
      for (const [selector, url] of [['[data-online-spotify]', spotify], ['[data-online-lastfm]', lastfm]]) {
        const link = card.querySelector(selector);
        link.hidden = !url;
        if (url) link.href = url;
      }
      target.list.append(card);
    });
    const credentialsInvalid = result.providers?.spotify === 'invalid_credentials';
    target.status.textContent = result.tracks.length
      ? `${result.tracks.length} ${query ? 'resultados encontrados' : 'músicas no ranking'}.`
      : credentialsInvalid ? 'As credenciais do Spotify foram recusadas. Atualize o Client ID e o Client Secret no .env.' : 'Nenhum resultado disponível no Spotify.';
  }
  async function request(query = '') {
    const current = ++requestId;
    results.section.hidden = !query;
    discover.section.hidden = Boolean(query);
    const target = query ? results : discover;
    target.status.textContent = query ? 'Pesquisando músicas, artistas e álbuns no Spotify…' : 'Carregando o ranking global do Spotify…';
    try {
      const endpoint = query
        ? '/api/music/search?' + new URLSearchParams({ q: query, limit: '20' })
        : '/api/music/discover?limit=12';
      const result = await db.request(endpoint);
      if (current !== requestId) return;
      render(target, result, query);
      if (!query) discoverLoaded = true;
    } catch (error) {
      if (current !== requestId) return;
      target.list.replaceChildren();
      target.status.textContent = error.message;
    }
  }
  search.addEventListener('input', () => {
    clearTimeout(timer);
    const query = search.value.trim();
    timer = setTimeout(() => request(query), query ? 400 : 200);
  });
  return { load() { if (!discoverLoaded && !search.value.trim()) return request(); } };
}

// Cada página inicializa somente seus próprios controles.
async function initializeApp() {
  const db = new ApiDB();
  const $ = id => document.getElementById(id);
  const loginForm = $('login-form');
  const currentUser = await db.getSession();
  const destination = user => user?.role === 'admin' ? '/admin' : '/painel';

  if (loginForm) {
    if (currentUser) { location.replace(destination(currentUser)); return; }
    $('show-password').onchange = event => { $('login-password').type = event.target.checked ? 'text' : 'password'; };
    loginForm.onsubmit = event => {
      event.preventDefault();
      const button = $('login-submit');
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = 'Autenticando...';
      $('login-error').textContent = '';
      setTimeout(async () => {
        const [success, result] = await db.authenticate($('login-user').value.trim(), $('login-password').value.trim());
        button.disabled = false;
        button.textContent = 'Entrar';
        if (!success) { $('login-error').textContent = result; return; }
        location.replace(destination(result));
      }, 800);
    };
    $('login-user').focus();
    return;
  }

  if (!currentUser) { location.replace('/login'); return; }
  const page = document.body.dataset.page;
  if (page === 'admin' && currentUser.role !== 'admin') { location.replace('/painel'); return; }
  if (page === 'user' && currentUser.role === 'admin') { location.replace('/admin'); return; }
  if (!['admin', 'user'].includes(page)) { location.replace(destination(currentUser)); return; }

  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  function notify(message, success = true) {
    const node = $('toast-template').content.firstElementChild.cloneNode(true);
    node.textContent = message;
    node.dataset.error = String(!success);
    $('notifications').append(node);
    setTimeout(() => node.remove(), 3000);
  }
  async function logout(stop = () => {}) {
    stop();
    try { await db.logout(); location.replace('/login'); }
    catch (error) { notify(error.message, false); }
  }

  if (page === 'admin') {
    const userForm = $('user-form');
    const dialog = $('user-dialog');
    const search = $('admin-user-search');
    const planFilter = $('admin-plan-filter');
    const statusFilter = $('admin-status-filter');
    let editingUsername = null;
    let users = new Map();
    $('admin-name').textContent = currentUser.username;

    function filteredUsers() {
      const query = search.value.trim().toLocaleLowerCase('pt-BR');
      return [...users].filter(([username, data]) =>
        (!query || username.toLocaleLowerCase('pt-BR').includes(query)) &&
        (!planFilter.value || data.plan === planFilter.value) &&
        (!statusFilter.value || data.status === statusFilter.value));
    }
    function updateSummary() {
      const list = [...users.values()];
      const active = list.filter(user => user.status === 'Ativo').length;
      $('stat-total').textContent = list.length;
      $('stat-active').textContent = active;
      $('stat-premium').textContent = list.filter(user => user.plan === 'Premium').length;
      $('stat-inactive').textContent = list.length - active;
      $('stat-active-rate').textContent = (list.length ? Math.round(active / list.length * 100) : 0) + '% do total';
      $('admin-updated').textContent = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date());
    }
    function renderUsers() {
      const list = filteredUsers();
      const body = $('users-body');
      body.replaceChildren();
      $('empty-users').hidden = list.length !== 0;
      $('user-result-count').textContent = list.length + (list.length === 1 ? ' resultado' : ' resultados');
      for (const [username, data] of list) {
        const row = $('user-row-template').content.firstElementChild.cloneNode(true);
        const field = name => row.querySelector('[data-field="' + name + '"]');
        field('avatar').textContent = username.slice(0, 2).toUpperCase();
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
          if (success) await populateUsers(); else button.disabled = false;
          notify(message, success);
        };
        body.append(row);
      }
    }
    async function populateUsers() {
      try { users = await db.getAllUsers(); }
      catch (error) { notify(error.message, false); return; }
      updateSummary();
      renderUsers();
    }
    function openUserDialog(username = null, data = null) {
      editingUsername = username;
      userForm.reset();
      $('dialog-title').textContent = username === null ? 'Criar novo usuário' : 'Editar usuário';
      $('edit-user').value = username ?? '';
      $('edit-password').value = '';
      $('edit-password').required = username === null;
      $('edit-password').placeholder = username === null ? 'Crie uma senha' : 'Deixe vazio para manter';
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
    search.addEventListener('input', renderUsers);
    planFilter.addEventListener('change', renderUsers);
    statusFilter.addEventListener('change', renderUsers);
    $('cancel-user').onclick = () => dialog.close();
    $('add-user').onclick = () => openUserDialog();
    document.querySelectorAll('[data-logout]').forEach(button => { button.onclick = () => logout(); });
    await populateUsers();
    return;
  }

  const username = currentUser.username;
  let onlineCatalog;
  function switchTab(name) {
    if (name === 'music') { metadataCatalog.load(); onlineCatalog?.load(); }
    libraryCatalog?.setLastTab(name);
    document.querySelectorAll('[data-view]').forEach(view => { view.hidden = view.dataset.view !== name; });
    document.querySelectorAll('[data-tab]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.tab === name)); });
  }
  let libraryCatalog;
  const player = createAudioPlayer({
    audio: $('vmz'), playButton: $('player-toggle'), progress: $('player-progress'),
    previousButton: $('voltar'), nextButton: $('player-next'), muteButton: $('player-mute'),
    shuffleButton: $('player-shuffle'), repeatButton: $('player-repeat'),
    currentTime: $('player-current-time'), totalTime: $('player-total-time'),
    volume: $('player-volume'), trackButtons: document.querySelectorAll('[data-track]'),
    title: $('song-title'), artist: $('song-artist'), durationLabels: [...document.querySelectorAll('[data-duration]')], notify,
    onTrackChange: () => { metadataCatalog.syncPlayer(); libraryCatalog?.recordRecent(); }
  });
  const metadataCatalog = createMetadataCatalog({
    db, buttons: document.querySelectorAll('[data-track]'), player,
    cover: $('song-cover'), sourceLinks: $('song-sources'), statusLabel: $('metadata-status'), document
  });
  onlineCatalog = createOnlineCatalog({
    db, search: $('music-search'), template: $('online-track-template'),
    discover: { section: $('online-catalog'), title: $('online-title'), status: $('online-status'), list: $('online-tracks') },
    results: { section: $('spotify-search-results'), title: $('spotify-search-title'), status: $('spotify-search-status'), list: $('spotify-search-list') },
    collectionTitle: $('music-collection-title'), collectionCount: $('music-collection-count')
  });
  libraryCatalog = createLibraryFeatures({
    username, user: currentUser, buttons: document.querySelectorAll('[data-track]'),
    rows: document.querySelectorAll('[data-music-row]'), allMusicItems: document.querySelectorAll('[data-music-item]'),
    movieCards: document.querySelectorAll('[data-movie-card]'), player, switchTab, notify, document,
    elements: {
      globalSearch: $('global-search'), movieSearch: $('movie-search'), musicSearch: $('music-search'),
      movieEmpty: $('movies-empty'), musicEmpty: $('music-empty'), searchResults: $('search-results'), searchEmpty: $('search-empty'),
      searchTemplate: $('search-result-template'), collectionTitle: $('music-collection-title'), collectionCount: $('music-collection-count'),
      libraryButtons: [...document.querySelectorAll('[data-library]')], tasteButtons: [...document.querySelectorAll('[data-taste]')],
      playlists: $('playlist-list'), emptyPlaylists: $('empty-playlists'), playlistTemplate: $('playlist-item-template'), newPlaylist: $('new-playlist'),
      playlistDialog: $('playlist-dialog'), playlistForm: $('playlist-form'), playlistName: $('playlist-name'), playlistError: $('playlist-error'), cancelPlaylist: $('cancel-playlist'),
      profileButton: $('profile-button'), profileDialog: $('profile-dialog'), closeProfile: $('close-profile'),
      profileName: $('profile-name'), profileRole: $('profile-role'), profilePlan: $('profile-plan-detail'), compact: $('setting-compact'), showSources: $('setting-sources')
    }
  });
  createVideoViewer({
    button: $('player-fullscreen'), dialog: $('video-dialog'), stage: $('video-stage'), video: $('music-video'),
    closeButton: $('video-close'), heading: $('video-title'), errorLabel: $('video-error'), audio: $('vmz'),
    volume: $('player-volume'), player, notify, document
  });
  document.querySelectorAll('[data-logout]').forEach(button => { button.onclick = () => logout(player.stop); });
  document.querySelectorAll('[data-tab]').forEach(button => { button.onclick = () => switchTab(button.dataset.tab); });
  $('user-top-name').textContent = username;
  $('user-top-plan').textContent = 'Plano ' + currentUser.plan;
  switchTab('movies');
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
if (typeof module !== 'undefined' && module.exports) module.exports = { ApiDB, createAudioPlayer, createVideoViewer, createMetadataCatalog, createOnlineCatalog, createLibraryFeatures };
