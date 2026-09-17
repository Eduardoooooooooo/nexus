"use strict";

const { randomBytes } = require('node:crypto');
const { createMusicMetadata } = require('./music-metadata');
const { openDatabase, verifyPassword, publicUser } = require('./database');
const COOKIE = 'nexus_session';
const SESSION_SECONDS = 8 * 60 * 60;

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}
async function readJson(request) {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') fail(415, 'Envie os dados como JSON.');
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16 * 1024) fail(413, 'Dados muito grandes.');
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail(400, 'JSON inválido.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Dados inválidos.');
  return body;
}
function textField(body, key, max, allowEmpty = false) {
  if (typeof body[key] !== 'string') fail(400, `Campo ${key} inválido.`);
  const value = body[key].trim();
  if ((!allowEmpty && !value) || value.length > max) fail(400, `Campo ${key} inválido.`);
  return value;
}
function userFields(body, editing = false) {
  const username = textField(body, 'username', 80);
  const password = textField(body, 'password', 128, editing);
  if (!['Basic', 'Premium'].includes(body.plan)) fail(400, 'Plano inválido.');
  if (!['Ativo', 'Inativo'].includes(body.status)) fail(400, 'Status inválido.');
  return { username, password, plan: body.plan, status: body.status };
}

function createApi({ databasePath, metadataOptions } = {}) {
  const musicMetadata = createMusicMetadata(metadataOptions);
  const db = openDatabase(databasePath);
  const sessions = new Map();
  function tokenFrom(request) {
    return (request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  }
  function sessionUser(request) {
    const token = tokenFrom(request);
    const session = sessions.get(token);
    if (!session) return null;
    const user = db.getById(session.userId);
    if (session.expires <= Date.now() || !user || user.status !== 'Ativo') {
      sessions.delete(token);
      return null;
    }
    return user;
  }
  function revokeUser(id) {
    for (const [token, session] of sessions) if (session.userId === id) sessions.delete(token);
  }
  function cookie(response, token, maxAge) {
    response.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`);
  }
  function requireMethod(request, response, methods) {
    if (!methods.includes(request.method)) {
      response.setHeader('Allow', methods.join(', '));
      fail(405, 'Método não permitido.');
    }
  }
  async function handle(request, response, pathname) {
    try {
      if (!['GET', 'HEAD'].includes(request.method) && request.headers.origin) {
        let origin;
        try { origin = new URL(request.headers.origin); } catch { fail(403, 'Origem não permitida.'); }
        if (origin.host !== request.headers.host || !['http:', 'https:'].includes(origin.protocol)) fail(403, 'Origem não permitida.');
      }
      if (pathname === '/api/login') {
        requireMethod(request, response, ['POST']);
        const body = await readJson(request);
        const username = textField(body, 'username', 80);
        const password = textField(body, 'password', 128);
        const user = db.getByUsername(username);
        if (!user || !verifyPassword(password, user.password_hash)) fail(401, 'Credenciais inválidas.');
        if (user.status !== 'Ativo') fail(403, 'Conta Inativa. Contate o suporte.');
        for (const [token, session] of sessions) if (session.expires <= Date.now()) sessions.delete(token);
        sessions.delete(tokenFrom(request));
        const token = randomBytes(32).toString('hex');
        sessions.set(token, { userId: user.id, expires: Date.now() + SESSION_SECONDS * 1000 });
        cookie(response, token, SESSION_SECONDS);
        json(response, 200, { user: publicUser(user) });
        return;
      }
      if (pathname === '/api/session') {
        requireMethod(request, response, ['GET']);
        json(response, 200, { user: publicUser(sessionUser(request)) });
        return;
      }
      if (pathname === '/api/logout') {
        requireMethod(request, response, ['POST']);
        sessions.delete(tokenFrom(request));
        cookie(response, '', 0);
        json(response, 200, { message: 'Sessão encerrada.' });
        return;
      }
      if (pathname === '/api/music/metadata') {
        requireMethod(request, response, ['GET']);
        if (!sessionUser(request)) fail(401, 'Entre novamente para continuar.');
        const params = new URL(request.url, 'http://localhost').searchParams;
        const result = await musicMetadata.lookup({ artist: params.get('artist'), track: params.get('track') });
        json(response, 200, result);
        return;
      }
      if (pathname === '/api/music/discover') {
        requireMethod(request, response, ['GET']);
        if (!sessionUser(request)) fail(401, 'Entre novamente para continuar.');
        const params = new URL(request.url, 'http://localhost').searchParams;
        json(response, 200, await musicMetadata.discover(params.get('limit')));
        return;
      }
      if (pathname === '/api/music/search') {
        requireMethod(request, response, ['GET']);
        if (!sessionUser(request)) fail(401, 'Entre novamente para continuar.');
        const params = new URL(request.url, 'http://localhost').searchParams;
        json(response, 200, await musicMetadata.searchCatalog(params.get('q'), params.get('limit')));
        return;
      }
      if (pathname !== '/api/users' && !pathname.startsWith('/api/users/')) fail(404, 'Rota não encontrada.');
      const currentUser = sessionUser(request);
      if (!currentUser) fail(401, 'Entre novamente para continuar.');
      if (currentUser.role !== 'admin') fail(403, 'Acesso restrito ao administrador.');
      if (pathname === '/api/users') {
        requireMethod(request, response, ['GET', 'POST']);
        if (request.method === 'GET') { json(response, 200, { users: db.listUsers() }); return; }
        const data = userFields(await readJson(request));
        if (db.getByUsername(data.username)) fail(409, 'Usuário já existe!');
        json(response, 201, { user: db.addUser(data), message: 'Usuário criado com sucesso!' });
        return;
      }
      requireMethod(request, response, ['PUT', 'DELETE']);
      let username;
      try { username = decodeURIComponent(pathname.slice('/api/users/'.length)); }
      catch { fail(400, 'Usuário inválido.'); }
      const user = db.getByUsername(username);
      if (!user) fail(404, 'Usuário não encontrado.');
      if (user.role === 'admin') fail(403, 'O administrador principal não pode ser alterado por esta tela.');
      if (request.method === 'DELETE') {
        db.deleteUser(user.id);
        revokeUser(user.id);
        json(response, 200, { message: 'Usuário removido.' });
        return;
      }
      const data = userFields(await readJson(request), true);
      const conflict = db.getByUsername(data.username);
      if (conflict && conflict.id !== user.id) fail(409, 'Novo nome de usuário já está em uso.');
      const updated = db.updateUser(user, data);
      if (data.password || data.status !== 'Ativo') revokeUser(user.id);
      json(response, 200, { user: updated, message: 'Usuário atualizado com sucesso!' });
    } catch (error) {
      if (!error.status) console.error('Erro na API:', error.message);
      if (!response.headersSent && !response.destroyed) json(response, error.status || 500, { message: error.status ? error.message : 'Erro ao acessar o banco de dados.' });
    }
  }
  return { handle, close() { sessions.clear(); db.close(); } };
}

module.exports = { createApi };
