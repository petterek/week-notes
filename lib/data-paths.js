'use strict';

const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CONTEXTS_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT_DIR, 'data'));

module.exports = { ROOT_DIR, CONTEXTS_DIR };
