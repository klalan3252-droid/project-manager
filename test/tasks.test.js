'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

let s, pid, pid2;
before(async () => {
  s = await startServer();
  pid = (await s.call('POST', '/projects', { name: 'P1' })).body.id;
  pid2 = (await s.call('POST', '/projects', { name: 'P2' })).body.id;
});
after(async () => { await s.close(); });

function assertError(res, status) {
  assert.equal(res.status, status);
  assert.equal(typeof res.body?.error, 'string');
  assert.ok(res.body.error.length > 0);
}
const mk = async (p, body) => (await s.call('POST', `/projects/${p}/tasks`, body));

test('create task with defaults', async () => {
  const r = await mk(pid, { title: 'T', ignored: true });
  assert.equal(r.status, 201);
  assert.equal(typeof r.body.id, 'string');
  assert.equal(r.body.project_id, pid);
  assert.equal(r.body.title, 'T');
  assert.equal(r.body.description, '');
  assert.equal(r.body.status, 'todo');
  assert.equal(r.body.assignee, null);
  assert.equal(r.body.due_date, null);
  assert.equal(new Date(r.body.created_at).toISOString(), r.body.created_at);
  assert.equal(r.body.ignored, undefined);
});

test('create task with all fields', async () => {
  const r = await mk(pid, { title: 'Full', description: 'd', status: 'in_progress', assignee: 'sam', due_date: '2026-12-01' });
  assert.equal(r.status, 201);
  assert.equal(r.body.description, 'd');
  assert.equal(r.body.status, 'in_progress');
  assert.equal(r.body.assignee, 'sam');
  assert.equal(r.body.due_date, '2026-12-01');
});

test('list returns only own project tasks and supports status filter', async () => {
  const a = (await s.call('POST', '/projects', { name: 'L1' })).body.id;
  const b = (await s.call('POST', '/projects', { name: 'L2' })).body.id;
  const t1 = (await mk(a, { title: 'a1' })).body;
  const t2 = (await mk(a, { title: 'a2', status: 'done' })).body;
  const t3 = (await mk(b, { title: 'b1' })).body;
  const all = await s.call('GET', `/projects/${a}/tasks`);
  assert.equal(all.status, 200);
  assert.deepEqual(all.body.map((t) => t.id).sort(), [t1.id, t2.id].sort());
  const done = await s.call('GET', `/projects/${a}/tasks?status=done`);
  assert.equal(done.status, 200);
  assert.deepEqual(done.body.map((t) => t.id), [t2.id]);
  const ip = await s.call('GET', `/projects/${a}/tasks?status=in_progress`);
  assert.deepEqual(ip.body, []);
  const bl = await s.call('GET', `/projects/${b}/tasks`);
  assert.deepEqual(bl.body.map((t) => t.id), [t3.id]);
});

test('invalid ?status filter is 400', async () => {
  assertError(await s.call('GET', `/projects/${pid}/tasks?status=bogus`), 400);
});

test('get, patch, delete a task', async () => {
  const t = (await mk(pid, { title: 'Orig', description: 'keep', assignee: 'a', due_date: '2026-01-31' })).body;
  const url = `/projects/${pid}/tasks/${t.id}`;
  const g = await s.call('GET', url);
  assert.equal(g.status, 200);
  assert.deepEqual(g.body, t);
  const p = await s.call('PATCH', url, { status: 'done', junk: 1 });
  assert.equal(p.status, 200);
  assert.deepEqual(p.body, { ...t, status: 'done' });
  const p2 = await s.call('PATCH', url, { title: 'Renamed', due_date: '2026-02-28' });
  assert.equal(p2.body.title, 'Renamed');
  assert.equal(p2.body.due_date, '2026-02-28');
  assert.equal(p2.body.status, 'done');
  assert.equal(p2.body.assignee, 'a');
  assert.deepEqual((await s.call('GET', url)).body, p2.body);
  const d = await s.call('DELETE', url);
  assert.equal(d.status, 204);
  assert.equal(d.text, '');
  assertError(await s.call('GET', url), 404);
  assert.equal((await s.call('GET', `/projects/${pid}/tasks`)).body.find((x) => x.id === t.id), undefined);
});

const badCreate = [
  ['missing title', {}],
  ['empty title', { title: '' }],
  ['non-string title', { title: 1 }],
  ['bad status', { title: 'x', status: 'blocked' }],
  ['non-string status', { title: 'x', status: 1 }],
  ['malformed due_date', { title: 'x', due_date: '12/01/2026' }],
  ['impossible due_date', { title: 'x', due_date: '2026-02-30' }],
  ['non-string due_date', { title: 'x', due_date: 20261201 }],
  ['non-string description', { title: 'x', description: 1 }],
  ['non-string assignee', { title: 'x', assignee: 1 }],
];
for (const [label, body] of badCreate) {
  test(`create task 400: ${label}`, async () => {
    const p = (await s.call('POST', '/projects', { name: 'bad' })).body.id;
    assertError(await mk(p, body), 400);
    assert.deepEqual((await s.call('GET', `/projects/${p}/tasks`)).body, []);
  });
}

test('create task 400 on invalid JSON', async () => {
  assertError(await s.call('POST', `/projects/${pid}/tasks`, undefined, { raw: '{bad' }), 400);
});

const badPatch = [
  ['empty title', { title: '' }],
  ['non-string title', { title: 1 }],
  ['bad status', { status: 'nope' }],
  ['malformed due_date', { due_date: 'tomorrow' }],
  ['wrong type description', { description: [] }],
  ['valid field plus invalid field', { title: 'changed', status: 'nope' }],
];
for (const [label, body] of badPatch) {
  test(`patch task 400 without partial change: ${label}`, async () => {
    const t = (await mk(pid, { title: 'Keep' })).body;
    const url = `/projects/${pid}/tasks/${t.id}`;
    assertError(await s.call('PATCH', url, body), 400);
    assert.deepEqual((await s.call('GET', url)).body, t);
  });
}

test('patch task 400 on invalid JSON', async () => {
  const t = (await mk(pid, { title: 'Keep' })).body;
  assertError(await s.call('PATCH', `/projects/${pid}/tasks/${t.id}`, undefined, { raw: '{bad' }), 400);
});

test('404s for unknown project on every task endpoint', async () => {
  assertError(await s.call('POST', '/projects/nope/tasks', { title: 'x' }), 404);
  assertError(await s.call('GET', '/projects/nope/tasks'), 404);
  assertError(await s.call('GET', '/projects/nope/tasks/abc'), 404);
  assertError(await s.call('PATCH', '/projects/nope/tasks/abc', { title: 'x' }), 404);
  assertError(await s.call('DELETE', '/projects/nope/tasks/abc'), 404);
});

test('404s for unknown task id', async () => {
  assertError(await s.call('GET', `/projects/${pid}/tasks/nope`), 404);
  assertError(await s.call('PATCH', `/projects/${pid}/tasks/nope`, { title: 'x' }), 404);
  assertError(await s.call('DELETE', `/projects/${pid}/tasks/nope`), 404);
});

test('404s for task belonging to a different project', async () => {
  const t = (await mk(pid, { title: 'Mine' })).body;
  const url = `/projects/${pid2}/tasks/${t.id}`;
  assertError(await s.call('GET', url), 404);
  assertError(await s.call('PATCH', url, { title: 'stolen' }), 404);
  assertError(await s.call('DELETE', url), 404);
  const still = await s.call('GET', `/projects/${pid}/tasks/${t.id}`);
  assert.equal(still.status, 200);
  assert.equal(still.body.title, 'Mine');
});

test('404 wins over body validation for unknown project', async () => {
  assertError(await s.call('POST', '/projects/nope/tasks', { title: '' }), 404);
});
