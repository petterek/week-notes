'use strict';

const COLLECTIONS = Object.freeze({
    tasks: Object.freeze({ idField: 'id' }),
    people: Object.freeze({ idField: 'key' }),
    meetings: Object.freeze({ idField: 'id' }),
    'meeting-series': Object.freeze({ idField: 'id' }),
    companies: Object.freeze({ idField: 'key' }),
    places: Object.freeze({ idField: 'key' }),
    results: Object.freeze({ idField: 'id' }),
    teams: Object.freeze({ idField: 'key' }),
    goals: Object.freeze({ idField: 'id' }),
});

module.exports = { COLLECTIONS };
