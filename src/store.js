'use strict';
const { randomUUID } = require('node:crypto');

function createStore() {
  const projects = new Map();
  const tasks = new Map();

  return {
    listProjects: () => [...projects.values()],
    getProject: (id) => projects.get(id),
    createProject({ name, description }) {
      const project = { id: randomUUID(), name, description, created_at: new Date().toISOString() };
      projects.set(project.id, project);
      return project;
    },
    updateProject(id, fields) {
      const project = projects.get(id);
      Object.assign(project, fields);
      return project;
    },
    deleteProject(id) {
      projects.delete(id);
      for (const [taskId, task] of tasks) {
        if (task.project_id === id) tasks.delete(taskId);
      }
    },
    listTasks: (projectId, status) =>
      [...tasks.values()].filter((t) => t.project_id === projectId && (!status || t.status === status)),
    getTask(projectId, id) {
      const task = tasks.get(id);
      return task && task.project_id === projectId ? task : undefined;
    },
    createTask(projectId, fields) {
      const task = { id: randomUUID(), project_id: projectId, ...fields, created_at: new Date().toISOString() };
      tasks.set(task.id, task);
      return task;
    },
    updateTask(task, fields) {
      return Object.assign(task, fields);
    },
    deleteTask: (id) => tasks.delete(id),
  };
}

module.exports = { createStore };
