'use strict';

const $ = (id) => document.getElementById(id);
const STATUS_LABELS = { todo: 'To do', in_progress: 'In progress', done: 'Done' };

const state = { projects: [], tasks: [], projectId: null, editingProject: null, editingTask: null };

async function api(method, path, payload) {
  const options = { method, headers: {} };
  if (payload !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(payload);
  }
  let res;
  try {
    res = await fetch(path, options);
  } catch (e) {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON body */ }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

function showError(err) {
  const box = $('error');
  box.textContent = err.message;
  box.hidden = false;
}
function clearError() { $('error').hidden = true; }

async function run(fn) {
  clearError();
  try { await fn(); } catch (err) { showError(err); }
}

function el(tag, { text, className, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  for (const c of children) node.append(c);
  return node;
}

function button(label, onClick, { className = 'btn', ariaLabel } = {}) {
  const b = el('button', { text: label, className, attrs: { type: 'button' } });
  if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
  b.addEventListener('click', onClick);
  return b;
}

// ---- Projects ----

async function loadProjects() {
  $('projects-loading').hidden = false;
  try {
    state.projects = await api('GET', '/projects');
  } finally {
    $('projects-loading').hidden = true;
  }
  renderProjects();
}

function renderProjects() {
  const list = $('project-list');
  list.replaceChildren();
  $('projects-empty').hidden = state.projects.length > 0;
  for (const p of state.projects) {
    const selected = p.id === state.projectId;
    const li = el('li', { className: selected ? 'selected' : '' });
    const open = button(p.name, () => selectProject(p.id), {
      className: 'btn', ariaLabel: `Open project ${p.name}`,
    });
    if (selected) open.setAttribute('aria-current', 'true');
    li.append(el('p', { className: 'item-title' }, [open]));
    if (p.description) li.append(el('p', { text: p.description, className: 'item-desc' }));
    li.append(el('div', { className: 'item-actions' }, [
      button('Edit', () => editProject(p), { ariaLabel: `Edit project ${p.name}` }),
      button('Delete', () => deleteProject(p), { className: 'btn danger', ariaLabel: `Delete project ${p.name}` }),
    ]));
    list.append(li);
  }
}

function resetProjectForm() {
  state.editingProject = null;
  $('project-form').reset();
  $('project-form-title').textContent = 'New project';
  $('project-submit').textContent = 'Add project';
  $('project-cancel').hidden = true;
}

function editProject(p) {
  state.editingProject = p.id;
  $('project-name').value = p.name;
  $('project-description').value = p.description || '';
  $('project-form-title').textContent = 'Edit project';
  $('project-submit').textContent = 'Save project';
  $('project-cancel').hidden = false;
  $('project-name').focus();
}

async function submitProject(event) {
  event.preventDefault();
  const name = $('project-name').value.trim();
  const payload = { name, description: $('project-description').value.trim() };
  await run(async () => {
    if (state.editingProject) await api('PATCH', `/projects/${encodeURIComponent(state.editingProject)}`, payload);
    else await api('POST', '/projects', payload);
    resetProjectForm();
    await loadProjects();
  });
}

async function deleteProject(p) {
  if (!window.confirm(`Delete project "${p.name}" and all its tasks?`)) return;
  await run(async () => {
    await api('DELETE', `/projects/${encodeURIComponent(p.id)}`);
    if (state.projectId === p.id) {
      state.projectId = null;
      state.tasks = [];
      showTasksArea();
    }
    if (state.editingProject === p.id) resetProjectForm();
    await loadProjects();
  });
}

// ---- Tasks ----

function tasksPath(suffix = '') {
  return `/projects/${encodeURIComponent(state.projectId)}/tasks${suffix}`;
}

function showTasksArea() {
  const project = state.projects.find((p) => p.id === state.projectId);
  $('tasks-heading').textContent = project ? `Tasks in ${project.name}` : 'Tasks';
  $('tasks-prompt').hidden = Boolean(project);
  $('tasks-area').hidden = !project;
}

async function selectProject(id) {
  state.projectId = id;
  resetTaskForm();
  renderProjects();
  showTasksArea();
  await run(loadTasks);
}

async function loadTasks() {
  $('tasks-loading').hidden = false;
  $('task-list').replaceChildren();
  $('tasks-empty').hidden = true;
  const id = state.projectId;
  try {
    const tasks = await api('GET', tasksPath());
    if (id !== state.projectId) return; // user switched project meanwhile
    state.tasks = tasks;
  } finally {
    $('tasks-loading').hidden = true;
  }
  renderTasks();
}

function renderTasks() {
  const list = $('task-list');
  list.replaceChildren();
  $('tasks-empty').hidden = state.tasks.length > 0;
  for (const t of state.tasks) {
    const li = el('li');
    li.append(el('p', { text: t.title, className: t.status === 'done' ? 'item-title done-title' : 'item-title' }));
    if (t.description) li.append(el('p', { text: t.description, className: 'item-desc' }));
    li.append(el('p', { className: 'item-meta' }, [
      el('span', { text: STATUS_LABELS[t.status] || t.status, className: `badge ${t.status}` }),
      el('span', { text: `Assignee: ${t.assignee || 'unassigned'}` }),
      el('span', { text: `Due: ${t.due_date || 'no due date'}` }),
    ]));
    const actions = el('div', { className: 'item-actions' });
    if (t.status !== 'done') {
      actions.append(button('Mark complete', () => completeTask(t), { ariaLabel: `Mark task ${t.title} complete` }));
    }
    actions.append(
      button('Edit', () => editTask(t), { ariaLabel: `Edit task ${t.title}` }),
      button('Delete', () => deleteTask(t), { className: 'btn danger', ariaLabel: `Delete task ${t.title}` })
    );
    li.append(actions);
    list.append(li);
  }
}

function resetTaskForm() {
  state.editingTask = null;
  $('task-form').reset();
  $('task-form-title').textContent = 'New task';
  $('task-submit').textContent = 'Add task';
  $('task-cancel').hidden = true;
}

function editTask(t) {
  state.editingTask = t.id;
  $('task-title').value = t.title;
  $('task-description').value = t.description || '';
  $('task-status').value = t.status;
  $('task-assignee').value = t.assignee || '';
  $('task-due').value = t.due_date || '';
  $('task-form-title').textContent = 'Edit task';
  $('task-submit').textContent = 'Save task';
  $('task-cancel').hidden = false;
  $('task-title').focus();
}

async function submitTask(event) {
  event.preventDefault();
  const title = $('task-title').value.trim();
  const assignee = $('task-assignee').value.trim();
  const due = $('task-due').value;
  const payload = { title, description: $('task-description').value.trim(), status: $('task-status').value };
  const editing = state.editingTask;
  // The API accepts assignee only as a string (empty string clears it) and has no way to clear a due date,
  // so new tasks omit empty values and edits send an empty assignee explicitly.
  if (assignee || editing) payload.assignee = assignee;
  if (due) payload.due_date = due;
  await run(async () => {
    if (editing) await api('PATCH', tasksPath(`/${encodeURIComponent(editing)}`), payload);
    else await api('POST', tasksPath(), payload);
    resetTaskForm();
    await loadTasks();
  });
}

async function completeTask(t) {
  await run(async () => {
    await api('PATCH', tasksPath(`/${encodeURIComponent(t.id)}`), { status: 'done' });
    await loadTasks();
  });
}

async function deleteTask(t) {
  if (!window.confirm(`Delete task "${t.title}"?`)) return;
  await run(async () => {
    await api('DELETE', tasksPath(`/${encodeURIComponent(t.id)}`));
    if (state.editingTask === t.id) resetTaskForm();
    await loadTasks();
  });
}

$('project-form').addEventListener('submit', submitProject);
$('project-cancel').addEventListener('click', resetProjectForm);
$('task-form').addEventListener('submit', submitTask);
$('task-cancel').addEventListener('click', resetTaskForm);

run(loadProjects);
