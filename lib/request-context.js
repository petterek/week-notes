'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

const contexts = new AsyncLocalStorage();

function runWithDataContext(contextId, callback) {
    if (typeof contextId !== 'string' || (contextId && !/^[a-z0-9_-]+$/.test(contextId))) {
        throw new TypeError('Invalid data context');
    }
    return contexts.run(contextId, callback);
}

function requestDataContext() {
    return contexts.getStore();
}

module.exports = { runWithDataContext, requestDataContext };
