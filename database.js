"use strict";

const { DatabaseSync } = require('node:sqlite');
const { randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const path = require('node:path');

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function publicUser(user) {
  if (!user) return null;
  const { id, username, role, plan, status } = user;
  return { id, username, role, plan, status };
}

function openDatabase(filename = path.join(__dirname, 'data', 'nexus.sqlite')) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const connection = new DatabaseSync(filename, { timeout: 5000 });
  try {
    connection.exec('PRAGMA journal_mode = WAL;');
    // A primeira abertura cria a tabela e os três acessos de demonstração.
    // A versão evita recriar usuários removidos em reinicializações posteriores.
    connection.exec('BEGIN IMMEDIATE');
    if (connection.prepare('PRAGMA user_version').get().user_version === 0) {
      connection.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
          plan TEXT NOT NULL CHECK (plan IN ('Basic', 'Premium', 'Infinite')),
          status TEXT NOT NULL CHECK (status IN ('Ativo', 'Inativo'))
        );
      `);
      const insert = connection.prepare('INSERT INTO users (username, password_hash, role, plan, status) VALUES (?, ?, ?, ?, ?)');
      for (const [username, password, role, plan, status] of [
        ['admin', 'admin', 'admin', 'Infinite', 'Ativo'],
        ['user', '123', 'user', 'Premium', 'Ativo'],
        ['visitante', 'abc', 'user', 'Basic', 'Inativo']
      ]) insert.run(username, hashPassword(password), role, plan, status);
      connection.exec('PRAGMA user_version = 1');
    }
    connection.exec('COMMIT');
  } catch (error) {
    try { connection.exec('ROLLBACK'); } catch {}
    connection.close();
    throw error;
  }

  const byUsername = connection.prepare('SELECT * FROM users WHERE username = ?');
  const byId = connection.prepare('SELECT * FROM users WHERE id = ?');
  const list = connection.prepare("SELECT id, username, role, plan, status FROM users WHERE role != 'admin' ORDER BY id");
  const insert = connection.prepare("INSERT INTO users (username, password_hash, role, plan, status) VALUES (?, ?, 'user', ?, ?)");
  const update = connection.prepare("UPDATE users SET username = ?, password_hash = ?, plan = ?, status = ? WHERE id = ? AND role = 'user'");
  const remove = connection.prepare("DELETE FROM users WHERE id = ? AND role = 'user'");
  return {
    getByUsername: username => byUsername.get(username),
    getById: id => byId.get(id),
    listUsers: () => list.all(),
    addUser(data) {
      const result = insert.run(data.username, hashPassword(data.password), data.plan, data.status);
      return publicUser(byId.get(Number(result.lastInsertRowid)));
    },
    updateUser(user, data) {
      const passwordHash = data.password ? hashPassword(data.password) : user.password_hash;
      update.run(data.username, passwordHash, data.plan, data.status, user.id);
      return publicUser(byId.get(user.id));
    },
    deleteUser: id => remove.run(id),
    close: () => connection.close()
  };
}

module.exports = { openDatabase, verifyPassword, publicUser };
