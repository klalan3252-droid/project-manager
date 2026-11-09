'use strict';
const express = require('express');
const validate = require('../validate');

// Mounted at /projects/:projectId/tasks; the project is looked up by the caller.
function taskRoutes(store, notFound) {
  const router = express.Router({ mergeParams: true });

  router.use((req, res, next) => {
    req.project = store.getProject(req.params.projectId);
    next(req.project ? undefined : notFound('project not found'));
  });

  router.post('/', (req, res) => {
    const fields = validate.task(req, { partial: false });
    res.status(201).json(store.createTask(req.project.id, fields));
  });
  router.get('/', (req, res) => {
    const { status } = req.query;
    if (status !== undefined) validate.status(status);
    res.json(store.listTasks(req.project.id, status));
  });

  router.param('taskId', (req, res, next, id) => {
    req.task = store.getTask(req.project.id, id);
    next(req.task ? undefined : notFound('task not found'));
  });

  router.get('/:taskId', (req, res) => res.json(req.task));
  router.patch('/:taskId', (req, res) => {
    res.json(store.updateTask(req.task, validate.task(req, { partial: true })));
  });
  router.delete('/:taskId', (req, res) => {
    store.deleteTask(req.task.id);
    res.status(204).end();
  });

  return router;
}

module.exports = taskRoutes;
