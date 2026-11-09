'use strict';
const express = require('express');
const { createStore } = require('./store');
const { ValidationError } = require('./validate');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');
const openapi = require('./openapi');

function createApp() {
  const store = createStore();
  const app = express();
  app.use(express.json());

  app.get('/openapi.json', (req, res) => res.json(openapi));

  const { router: projects, notFound } = projectRoutes(store);
  // Tasks are mounted first so /projects/:id/tasks is not shadowed by the project router.
  app.use('/projects/:projectId/tasks', taskRoutes(store, notFound));
  app.use('/projects', projects);

  app.use((req, res) => res.status(404).json({ error: 'not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError || err.type === 'entity.parse.failed' || err.status === 400) {
      return res.status(400).json({ error: err instanceof ValidationError ? err.message : 'invalid JSON body' });
    }
    if (err.status === 404) return res.status(404).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: 'internal server error' });
  });

  return app;
}

module.exports = { createApp };
