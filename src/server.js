'use strict';
const { createApp } = require('./app');

const port = Number(process.env.PORT) || 3000;

if (require.main === module) {
  createApp().listen(port, '0.0.0.0', () => console.log(`Listening on port ${port}`));
}
