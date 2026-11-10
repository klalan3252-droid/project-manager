'use strict';
const express = require('express');
const validate = require('../validate');

function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

function projectRoutes(store) {
  const router = express.Router();

  router.post('/', (req, res) => {
    res.status(201).json(store.createProject(validate.project(req, { partial: false })));
  });
  router.get('/', (req, res) => res.json(store.listProjects()));

  router.param('projectId', (req, res, next, id) => {
    req.project = store.getProject(id);
    next(req.project ? undefined : notFound('project not found'));
  });

  router.get('/:projectId', (req, res) => res.json(req.project));
  router.patch('/:projectId', (req, res) => {
    res.json(store.updateProject(req.project.id, validate.project(req, { partial: true })));
  });
  router.delete('/:projectId', (req, res) => {
    store.deleteProject(req.project.id);
    res.status(204).end();
  });

  return { router, notFound };
}

module.exports = projectRoutes;
