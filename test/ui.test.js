'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

async function getHtml() {
  const res = await srv.call('GET', '/');
  return res;
}

function tags(html, name) {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) || [];
}
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4]) : null;
}

test('AC-1: GET / serves an HTML page with title and main landmark', async () => {
  const res = await getHtml();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/html/);
  assert.match(res.text, /<title>[^<]+<\/title>/i);
  assert.match(res.text, /<main\b/i);
  assert.match(res.text, /<header\b/i);
  assert.match(res.text, /<html[^>]*\blang=/i);
});

test('AC-1/AC-8: referenced CSS and JS are served with correct content types', async () => {
  const { text } = await getHtml();
  const links = tags(text, 'link').filter((t) => /stylesheet/i.test(attr(t, 'rel') || ''));
  const scripts = tags(text, 'script').filter((t) => attr(t, 'src'));
  assert.ok(links.length >= 1, 'a stylesheet link');
  assert.ok(scripts.length >= 1, 'a script with src');
  for (const l of links) {
    const r = await srv.call('GET', attr(l, 'href'));
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /^text\/css/);
    assert.ok(r.text.length > 0);
  }
  for (const s of scripts) {
    const r = await srv.call('GET', attr(s, 'src'));
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /javascript/);
    assert.ok(r.text.length > 0);
  }
});

test('AC-2: API and 404 behaviour unchanged', async () => {
  const p = await srv.call('GET', '/projects');
  assert.equal(p.status, 200);
  assert.ok(Array.isArray(p.body));
  const o = await srv.call('GET', '/openapi.json');
  assert.equal(o.status, 200);
  assert.match(o.headers.get('content-type'), /json/);
  const n = await srv.call('GET', '/nope');
  assert.equal(n.status, 404);
  assert.deepEqual(n.body, { error: 'not found' });
});

test('AC-6: every input/select/textarea in the page has a label', async () => {
  const { text } = await getHtml();
  const fields = [...tags(text, 'input'), ...tags(text, 'select'), ...tags(text, 'textarea')]
    .filter((t) => (attr(t, 'type') || '').toLowerCase() !== 'hidden');
  assert.ok(fields.length >= 5, 'form fields present in the page');
  for (const f of fields) {
    const id = attr(f, 'id');
    const labelled = attr(f, 'aria-label') || attr(f, 'aria-labelledby') ||
      (id && new RegExp(`<label\\b[^>]*\\sfor\\s*=\\s*["']?${id}["']?[\\s>]`, 'i').test(text));
    assert.ok(labelled, `field has a label: ${f}`);
  }
});

test('AC-6/AC-7: viewport meta, focus-visible and mobile media query', async () => {
  const { text } = await getHtml();
  assert.match(text, /<meta[^>]+name=["']viewport["'][^>]*>/i);
  const css = await srv.call('GET', attr(tags(text, 'link').find((t) => /stylesheet/i.test(attr(t, 'rel') || '')), 'href'));
  assert.match(css.text, /:focus-visible/);
  assert.match(css.text, /@media[^{]*max-width/);
});
