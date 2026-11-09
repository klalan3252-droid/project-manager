'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

let s, doc, pid, tid;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

before(async () => {
  s = await startServer();
  const r = await s.call('GET', '/openapi.json');
  assert.equal(r.status, 200);
  doc = r.body;
  pid = (await s.call('POST', '/projects', { name: 'C' })).body.id;
  tid = (await s.call('POST', `/projects/${pid}/tasks`, { title: 'C' })).body.id;
});
after(async () => { await s.close(); });

const ops = () => Object.entries(doc.paths).flatMap(([p, item]) =>
  METHODS.filter((m) => item[m]).map((m) => ({ path: p, method: m, op: item[m] })));

const fill = (p, ids) => p.replace('{projectId}', ids.p).replace('{taskId}', ids.t);

// Valid body per operation.
const validBody = {
  'POST /projects': { name: 'N' },
  'PATCH /projects/{projectId}': { name: 'N2' },
  'POST /projects/{projectId}/tasks': { title: 'T' },
  'PATCH /projects/{projectId}/tasks/{taskId}': { status: 'done' },
};
const invalidBody = {
  'POST /projects': { name: '' },
  'PATCH /projects/{projectId}': { name: '' },
  'POST /projects/{projectId}/tasks': { title: '' },
  'PATCH /projects/{projectId}/tasks/{taskId}': { status: 'bogus' },
};

async function fresh() {
  const p = (await s.call('POST', '/projects', { name: 'F' })).body.id;
  const t = (await s.call('POST', `/projects/${p}/tasks`, { title: 'F' })).body.id;
  return { p, t };
}

test('GET /openapi.json is a valid-looking OpenAPI 3 document', () => {
  assert.ok(String(doc.openapi).startsWith('3.'));
  assert.ok(doc.info && doc.info.title && doc.info.version);
  assert.ok(doc.paths && Object.keys(doc.paths).length > 0);
});

test('document describes every required endpoint', () => {
  const have = new Set(ops().map((o) => `${o.method.toUpperCase()} ${o.path}`));
  for (const e of [
    'POST /projects', 'GET /projects',
    'GET /projects/{projectId}', 'PATCH /projects/{projectId}', 'DELETE /projects/{projectId}',
    'POST /projects/{projectId}/tasks', 'GET /projects/{projectId}/tasks',
    'GET /projects/{projectId}/tasks/{taskId}', 'PATCH /projects/{projectId}/tasks/{taskId}',
    'DELETE /projects/{projectId}/tasks/{taskId}', 'GET /openapi.json',
  ]) assert.ok(have.has(e), `missing ${e}`);
});

test('happy path of every documented operation returns its documented success code', async () => {
  for (const { path, method, op } of ops()) {
    const key = `${method.toUpperCase()} ${path}`;
    const ids = await fresh();
    const res = await s.call(method.toUpperCase(), fill(path, ids), validBody[key]);
    const success = Object.keys(op.responses).filter((c) => c.startsWith('2'));
    assert.ok(success.length > 0, `${key} documents no 2xx`);
    assert.ok(success.includes(String(res.status)), `${key}: got ${res.status}, documented ${success}`);
    if (method === 'post') assert.equal(res.status, 201, key);
    if (method === 'delete') assert.equal(res.status, 204, key);
    if (method === 'get' || method === 'patch') assert.equal(res.status, 200, key);
  }
});

test('documented 400 and 404 responses are produced with {error} body', async () => {
  for (const { path, method, op } of ops()) {
    const key = `${method.toUpperCase()} ${path}`;
    const M = method.toUpperCase();
    if (op.responses['400']) {
      const ids = await fresh();
      let res;
      if (invalidBody[key]) res = await s.call(M, fill(path, ids), invalidBody[key]);
      else if (key === 'GET /projects/{projectId}/tasks') res = await s.call(M, fill(path, ids) + '?status=bogus');
      else assert.fail(`no 400 trigger known for ${key}`);
      assert.equal(res.status, 400, key);
      assert.equal(typeof res.body.error, 'string', key);
    }
    if (op.responses['404']) {
      const ids = { p: 'missing-project', t: 'missing-task' };
      const res = await s.call(M, fill(path, ids), validBody[key]);
      assert.equal(res.status, 404, key);
      assert.equal(typeof res.body.error, 'string', key);
      if (path.includes('{taskId}')) {
        const real = await fresh();
        const r2 = await s.call(M, fill(path, { p: real.p, t: 'missing-task' }), validBody[key]);
        assert.equal(r2.status, 404, key);
      }
    }
  }
});

test('operations without a documented 400/404 do not need them, and every status is documented', async () => {
  for (const { path, method, op } of ops()) {
    const key = `${method.toUpperCase()} ${path}`;
    const res = await s.call(method.toUpperCase(), fill(path, await fresh()), validBody[key]);
    assert.ok(Object.keys(op.responses).includes(String(res.status)), key);
  }
});

test('every route the app serves is documented', async () => {
  const documented = new Set(ops().map((o) => `${o.method.toUpperCase()} ${o.path}`));
  const probes = [
    ['GET', '/projects'], ['POST', '/projects'], ['PUT', '/projects'], ['DELETE', '/projects'],
    ['GET', '/projects/{projectId}'], ['POST', '/projects/{projectId}'], ['PUT', '/projects/{projectId}'],
    ['PATCH', '/projects/{projectId}'], ['DELETE', '/projects/{projectId}'],
    ['GET', '/projects/{projectId}/tasks'], ['POST', '/projects/{projectId}/tasks'],
    ['PUT', '/projects/{projectId}/tasks'], ['PATCH', '/projects/{projectId}/tasks'], ['DELETE', '/projects/{projectId}/tasks'],
    ['GET', '/projects/{projectId}/tasks/{taskId}'], ['POST', '/projects/{projectId}/tasks/{taskId}'],
    ['PUT', '/projects/{projectId}/tasks/{taskId}'], ['PATCH', '/projects/{projectId}/tasks/{taskId}'],
    ['DELETE', '/projects/{projectId}/tasks/{taskId}'],
    ['GET', '/openapi.json'], ['POST', '/openapi.json'],
  ];
  for (const [m, p] of probes) {
    const ids = await fresh();
    const res = await s.call(m, fill(p, ids), ['POST', 'PUT', 'PATCH'].includes(m) ? (validBody[`${m} ${p}`] || {}) : undefined);
    const served = ![404, 405].includes(res.status);
    if (served && !documented.has(`${m} ${p}`)) assert.fail(`${m} ${p} is served (${res.status}) but not documented`);
  }
});

test('response bodies conform to documented Project/Task required fields', async () => {
  const schemas = doc.components.schemas;
  const p = (await s.call('GET', `/projects/${pid}`)).body;
  for (const f of schemas.Project.required) assert.ok(f in p, `Project.${f}`);
  const t = (await s.call('GET', `/projects/${pid}/tasks/${tid}`)).body;
  for (const f of schemas.Task.required) assert.ok(f in t, `Task.${f}`);
  assert.deepEqual(schemas.TaskStatus.enum, ['todo', 'in_progress', 'done']);
});
