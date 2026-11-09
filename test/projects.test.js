'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

let s;
before(async () => { s = await startServer(); });
after(async () => { await s.close(); });

function assertError(res, status) {
  assert.equal(res.status, status);
  assert.equal(typeof res.body?.error, 'string');
  assert.ok(res.body.error.length > 0);
}

test('POST /projects creates a project (201)', async () => {
  const res = await s.call('POST', '/projects', { name: 'Alpha', description: 'first', extra: 1 });
  assert.equal(res.status, 201);
  assert.equal(typeof res.body.id, 'string');
  assert.ok(res.body.id.length > 0);
  assert.equal(res.body.name, 'Alpha');
  assert.equal(res.body.description, 'first');
  assert.ok(!Number.isNaN(Date.parse(res.body.created_at)));
  assert.equal(new Date(res.body.created_at).toISOString(), res.body.created_at);
  assert.equal(res.body.extra, undefined);
});

test('description defaults to empty string; ids are unique', async () => {
  const a = await s.call('POST', '/projects', { name: 'NoDesc' });
  const b = await s.call('POST', '/projects', { name: 'NoDesc' });
  assert.equal(a.status, 201);
  assert.equal(a.body.description, '');
  assert.notEqual(a.body.id, b.body.id);
});

test('GET /projects lists and GET /projects/:id returns it', async () => {
  const c = await s.call('POST', '/projects', { name: 'Listed' });
  const list = await s.call('GET', '/projects');
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body));
  assert.deepEqual(list.body.find((p) => p.id === c.body.id), c.body);
  const one = await s.call('GET', `/projects/${c.body.id}`);
  assert.equal(one.status, 200);
  assert.deepEqual(one.body, c.body);
});

test('PATCH updates only supplied fields', async () => {
  const c = await s.call('POST', '/projects', { name: 'Old', description: 'keep' });
  const r1 = await s.call('PATCH', `/projects/${c.body.id}`, { name: 'New' });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.name, 'New');
  assert.equal(r1.body.description, 'keep');
  assert.equal(r1.body.id, c.body.id);
  assert.equal(r1.body.created_at, c.body.created_at);
  const r2 = await s.call('PATCH', `/projects/${c.body.id}`, { description: 'changed' });
  assert.equal(r2.body.name, 'New');
  assert.equal(r2.body.description, 'changed');
  const got = await s.call('GET', `/projects/${c.body.id}`);
  assert.deepEqual(got.body, r2.body);
});

test('DELETE returns 204 then 404 for project and its tasks; cascades', async () => {
  const c = await s.call('POST', '/projects', { name: 'Doomed' });
  const id = c.body.id;
  const t = await s.call('POST', `/projects/${id}/tasks`, { title: 'x' });
  assert.equal(t.status, 201);
  const d = await s.call('DELETE', `/projects/${id}`);
  assert.equal(d.status, 204);
  assert.equal(d.text, '');
  assertError(await s.call('GET', `/projects/${id}`), 404);
  assertError(await s.call('GET', `/projects/${id}/tasks`), 404);
  assertError(await s.call('GET', `/projects/${id}/tasks/${t.body.id}`), 404);
  const list = await s.call('GET', '/projects');
  assert.equal(list.body.find((p) => p.id === id), undefined);
});

for (const [label, body] of [
  ['missing name', {}],
  ['empty name', { name: '' }],
  ['non-string name', { name: 5 }],
  ['null name', { name: null }],
  ['non-string description', { name: 'ok', description: 5 }],
]) {
  test(`POST /projects 400: ${label}`, async () => {
    const before = (await s.call('GET', '/projects')).body.length;
    assertError(await s.call('POST', '/projects', body), 400);
    assert.equal((await s.call('GET', '/projects')).body.length, before);
  });
}

test('POST /projects 400 on invalid JSON', async () => {
  assertError(await s.call('POST', '/projects', undefined, { raw: '{bad' }), 400);
});

test('PATCH /projects 400 leaves project unchanged', async () => {
  const c = await s.call('POST', '/projects', { name: 'Stay', description: 'd' });
  for (const body of [{ name: '' }, { name: 3 }, { name: 'ok', description: 4 }]) {
    assertError(await s.call('PATCH', `/projects/${c.body.id}`, body), 400);
  }
  assertError(await s.call('PATCH', `/projects/${c.body.id}`, undefined, { raw: '{bad' }), 400);
  const got = await s.call('GET', `/projects/${c.body.id}`);
  assert.deepEqual(got.body, c.body);
});

test('unknown project id returns 404 on get/patch/delete', async () => {
  assertError(await s.call('GET', '/projects/nope'), 404);
  assertError(await s.call('PATCH', '/projects/nope', { name: 'x' }), 404);
  assertError(await s.call('DELETE', '/projects/nope'), 404);
});
