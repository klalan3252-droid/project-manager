'use strict';

const STATUSES = ['todo', 'in_progress', 'done'];

class ValidationError extends Error {}

function fail(message) {
  throw new ValidationError(message);
}

function body(req) {
  const b = req.body;
  if (b === null || typeof b !== 'object' || Array.isArray(b)) fail('request body must be a JSON object');
  return b;
}

function requiredString(b, key) {
  if (typeof b[key] !== 'string' || b[key].trim() === '') fail(`${key} is required and must be a non-empty string`);
  return b[key];
}

function optionalString(b, key) {
  if (b[key] !== undefined && typeof b[key] !== 'string') fail(`${key} must be a string`);
  return b[key];
}

function status(value) {
  if (!STATUSES.includes(value)) fail(`status must be one of ${STATUSES.join(', ')}`);
  return value;
}

function dueDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('due_date must be a date in YYYY-MM-DD format');
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) fail('due_date must be a real date');
  return value;
}

// Returns only the supplied, validated fields. `required` makes the title/name mandatory.
function pick(b, spec, required) {
  const out = {};
  for (const [key, check] of Object.entries(spec)) {
    if (b[key] === undefined) {
      if (required === key) check(b[key]);
      continue;
    }
    out[key] = check(b[key]);
  }
  return out;
}

const str = (key) => (v) => (typeof v === 'string' ? v : fail(`${key} must be a string`));
const nonEmpty = (key) => (v) =>
  typeof v === 'string' && v.trim() !== '' ? v : fail(`${key} is required and must be a non-empty string`);

function project(req, { partial }) {
  const b = body(req);
  const out = pick(b, { name: nonEmpty('name'), description: str('description') }, partial ? null : 'name');
  if (!partial && out.description === undefined) out.description = '';
  return out;
}

function task(req, { partial }) {
  const b = body(req);
  const out = pick(
    b,
    { title: nonEmpty('title'), description: str('description'), status, assignee: str('assignee'), due_date: dueDate },
    partial ? null : 'title'
  );
  if (!partial) {
    return { description: '', status: 'todo', assignee: null, due_date: null, ...out };
  }
  return out;
}

module.exports = { ValidationError, STATUSES, project, task, status };
