// Statut « En ligne » du bot Discord (discord-srv.mjs › passerelle) avec un faux WebSocket et une fausse API (aucun réseau) : IDENTIFY (intents 0, jeton,
// statut « 🔮 Carte mystère n° 42 »), battements de cœur, statut changé d'une langue à l'autre, battement sans réponse → reconnexion et RESUME (adresse de
// READY, séquence), RECONNECT, INVALID_SESSION → nouvelle identification, 4004 → arrêt définitif signalé une fois, stop(), sans numéro → manaorbit.app,
// jeton jamais dans le journal, rien avec presence false.
import './setup-env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discordMake, dscPresence, DSC_PRESENCE } from '../discord-srv.mjs';

const TOKEN = 'jeton-secret-du-bot-xyz';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 3000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('délai dépassé'); await sleep(5); } };

/** Monde de test : faux WebSocket (chaque connexion gardée, messages envoyés décodés), fausse API (/gateway/bot), journal. */
function world(o = {}) {
  const socks = [], logs = [], calls = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 1; this.sent = []; this.l = {}; this.closed = null; socks.push(this); }
    addEventListener(k, f) { (this.l[k] = this.l[k] || []).push(f); }
    send(s) { this.sent.push(JSON.parse(s)); }
    close(code) { if (this.closed !== null) return; this.closed = code; this.readyState = 3; setTimeout(() => (this.l.close || []).forEach(f => f({ code })), 0); }
    push(m) { (this.l.message || []).forEach(f => f({ data: JSON.stringify(m) })); }
    drop(code) { this.closed = code; this.readyState = 3; (this.l.close || []).forEach(f => f({ code })); }      // fermée par Discord
    ops(op) { return this.sent.filter(m => m.op === op); }
  }
  const fetch = async (url) => { calls.push(url); return new Response(JSON.stringify({ url: 'wss://gw.test' }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  const log = { log: m => logs.push(String(m)), warn: m => logs.push(String(m)) };
  const d = discordMake({ token: TOKEN, api: 'http://api.test', fetch, log, WebSocket: FakeWS, presenceMs: 60, gwMaxMs: 20, cardNo: o.cardNo || (() => 42), ...(o.presence === false ? { presence: false } : {}) });
  return { d, socks, logs, calls, last: () => socks[socks.length - 1] };
}
const hello = (ws, every = 40) => ws.push({ op: 10, d: { heartbeat_interval: every } });
const ready = (ws, s = 1) => ws.push({ op: 0, t: 'READY', s, d: { session_id: 'sess-1', resume_gateway_url: 'wss://resume.test' } });

test('statut : textes des 10 langues, numéro, repli sans numéro', () => {
  assert.equal(DSC_PRESENCE.length, 10);
  assert.equal(dscPresence(0, 42), '🔮 Carte mystère n° 42'); assert.equal(dscPresence(1, 42), '🔮 Mystery card #42'); assert.equal(dscPresence(2, 7), '🔮 Mysterykarte Nr. 7');
  assert.equal(dscPresence(10, 42), dscPresence(0, 42), 'recommence après la dernière langue'); assert.equal(dscPresence(0, 0), '🔮 manaorbit.app');
  assert.ok(DSC_PRESENCE.every(([, t]) => t.includes('{n}')));
});

test('IDENTIFY, battements, statut qui change de langue, stop()', async () => {
  const w = world(); w.d.start();
  await until(() => w.socks.length === 1);
  const ws = w.last(); assert.equal(ws.url, 'wss://gw.test/?v=10&encoding=json'); assert.deepEqual(w.calls, ['http://api.test/gateway/bot']);
  hello(ws);
  const id = ws.ops(2)[0]; assert.ok(id, 'IDENTIFY envoyé');
  assert.equal(id.d.token, TOKEN); assert.equal(id.d.intents, 0); assert.equal(id.d.presence.status, 'online');
  assert.deepEqual(id.d.presence.activities, [{ type: 4, name: 'Custom Status', state: '🔮 Carte mystère n° 42' }]);
  ready(ws);
  await until(() => ws.ops(1).length >= 1); ws.push({ op: 11 });
  await until(() => ws.ops(3).length >= 2);
  assert.deepEqual(ws.ops(3).slice(0, 2).map(m => m.d.activities[0].state), ['🔮 Mystery card #42', '🔮 Mysterykarte Nr. 42']);
  assert.equal(ws.ops(1)[0].d, 1, 'battement : dernière séquence reçue');
  ws.push({ op: 1 }); assert.ok(ws.ops(1).length >= 2, 'battement demandé par Discord : envoyé tout de suite');
  assert.ok(w.logs.some(l => /bot en ligne/.test(l))); assert.ok(!w.logs.join('\n').includes(TOKEN), 'jeton jamais dans le journal');
  w.d.stop(); assert.equal(ws.closed, 1000);
  await sleep(120); assert.equal(w.socks.length, 1, 'arrêté : aucune reconnexion');
});

test('battement sans réponse → reconnexion et RESUME ; RESUMED → statut renvoyé', async () => {
  const w = world(); w.d.start(); await until(() => w.socks.length === 1);
  const ws = w.last(); hello(ws, 30); ready(ws, 5); ws.push({ op: 0, t: 'MESSAGE_CREATE', s: 9, d: {} });
  await until(() => ws.closed === 4000, 2000);      // 2e battement sans réponse au 1er
  await until(() => w.socks.length === 2);
  const ws2 = w.last(); assert.equal(ws2.url, 'wss://resume.test/?v=10&encoding=json', 'reprise : adresse de READY'); assert.equal(w.calls.length, 1, 'pas de nouvelle demande de /gateway/bot');
  hello(ws2); assert.deepEqual(ws2.ops(6)[0].d, { token: TOKEN, session_id: 'sess-1', seq: 9 }); assert.equal(ws2.ops(2).length, 0);
  ws2.push({ op: 0, t: 'RESUMED', s: 10, d: {} }); assert.equal(ws2.ops(3).length, 1, 'statut renvoyé après la reprise');
  w.d.stop();
});

test('RECONNECT → reprise ; INVALID_SESSION (non reprenable) → nouvelle identification', async () => {
  const w = world(); w.d.start(); await until(() => w.socks.length === 1);
  let ws = w.last(); hello(ws); ready(ws);
  ws.push({ op: 7 }); await until(() => w.socks.length === 2);
  ws = w.last(); hello(ws); assert.equal(ws.ops(6).length, 1, 'RECONNECT : RESUME');
  ws.push({ op: 9, d: false }); await until(() => w.socks.length === 3);
  ws = w.last(); assert.equal(ws.url, 'wss://gw.test/?v=10&encoding=json', 'session perdue : adresse de /gateway/bot'); hello(ws);
  assert.equal(ws.ops(2).length, 1, 'nouvelle identification'); assert.equal(ws.ops(6).length, 0);
  w.d.stop();
});

test('jeton refusé (4004) : arrêt définitif, signalé une fois ; coupure ordinaire : nouvel essai', async () => {
  const w = world(); w.d.start(); await until(() => w.socks.length === 1);
  w.last().drop(1006); await until(() => w.socks.length === 2, 2000);
  w.last().drop(4004); await sleep(150);
  assert.equal(w.socks.length, 2, '4004 : plus de nouvel essai'); assert.equal(w.logs.filter(l => /code 4004/.test(l)).length, 1);
  w.d.stop();
});

test('sans numéro (jeu coupé) : manaorbit.app ; presence false : rien', async () => {
  const w = world({ cardNo: () => 0 }); w.d.start(); await until(() => w.socks.length === 1); hello(w.last());
  assert.equal(w.last().ops(2)[0].d.presence.activities[0].state, '🔮 manaorbit.app'); w.d.stop();
  const off = world({ presence: false }); assert.equal(off.d.gwOn, false); off.d.start(); await sleep(40); assert.equal(off.socks.length, 0); assert.equal(off.calls.length, 0);
});
