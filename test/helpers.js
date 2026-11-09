'use strict';
const { createApp } = require('../src/app');

async function startServer() {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(method, path, body, opts = {}) {
    const init = { method, headers: {} };
    if (opts.raw !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = opts.raw;
    } else if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(base + path, init);
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
    return { status: res.status, body: json, text, headers: res.headers };
  }
  return {
    base,
    call,
    close: () => new Promise((r) => { server.close(r); server.closeAllConnections && server.closeAllConnections(); }),
  };
}

module.exports = { startServer };
