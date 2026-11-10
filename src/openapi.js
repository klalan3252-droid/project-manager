'use strict';
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

module.exports = YAML.parse(fs.readFileSync(path.join(__dirname, '..', 'openapi.yaml'), 'utf8'));
