'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { COLLECTIONS } = require('./collections-manifest');

function readJson(file, missingValue) {
    let text;
    try {
        text = fs.readFileSync(file, 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') return missingValue;
        throw new Error(`Cannot read ${file}: ${error.message}`, { cause: error });
    }
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`Invalid JSON in ${file}: ${error.message}`, { cause: error });
    }
}

function assertRecord(record, file) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
        throw new TypeError(`Expected a JSON record in ${file}`);
    }
}

function readJsonRecord(file, missingValue) {
    const record = readJson(file);
    if (record === undefined) return missingValue;
    assertRecord(record, file);
    return record;
}

function readJsonDirectory(dir) {
    let files;
    try {
        files = fs.readdirSync(dir);
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw new Error(`Cannot read ${dir}: ${error.message}`, { cause: error });
    }
    return files.filter(file => file.endsWith('.json')).map(file => {
        const fullPath = path.join(dir, file);
        const record = readJson(fullPath);
        assertRecord(record, fullPath);
        return record;
    });
}

function collectionPath(contextDir, name) {
    if (typeof name !== 'string' || !Object.hasOwn(COLLECTIONS, name)) {
        throw new TypeError('Invalid collection name');
    }
    return path.join(contextDir, name);
}

function readCollection(contextDir, name) {
    const dir = collectionPath(contextDir, name);
    const records = readJsonDirectory(dir);
    if (records !== null) return records;
    const legacyFile = dir + '.json';
    const legacy = readJson(legacyFile, []);
    if (!Array.isArray(legacy)) {
        throw new TypeError(`Expected an array in ${legacyFile}`);
    }
    for (const record of legacy) assertRecord(record, legacyFile);
    return legacy;
}

function sanitizeItemFilename(value) {
    if (value === undefined || value === null) return '';
    return String(value).replace(/[^A-Za-z0-9._-]/g, '_').replace(/^_+|_+$/g, '').slice(0, 120);
}

function itemStem(item, idField) {
    for (const field of [idField, 'key', 'id'].filter(Boolean)) {
        const stem = sanitizeItemFilename(item[field]);
        if (stem) return stem;
    }
    return 'x' + randomUUID();
}

function writeFileAtomic(file, content) {
    const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
    let mode;
    try {
        mode = fs.statSync(file).mode & 0o777;
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    try {
        fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx', mode: mode ?? 0o666 });
        if (mode !== undefined) fs.chmodSync(temporary, mode);
        fs.renameSync(temporary, file);
    } finally {
        try {
            fs.unlinkSync(temporary);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
    }
}

function writeCollection(contextDir, name, records, idField = COLLECTIONS[name]?.idField) {
    if (!Array.isArray(records)) throw new TypeError('Collection records must be an array');
    const dir = collectionPath(contextDir, name);
    // Validate disk contents even if the caller loaded from cache. Never prune
    // unreadable records, or overwrite a corrupt legacy collection with a subset.
    readCollection(contextDir, name);
    const files = new Map();
    for (const record of records) {
        assertRecord(record, name);
        let stem = itemStem(record, idField);
        while (files.has(stem + '.json')) stem += '_' + randomUUID().slice(0, 8);
        files.set(stem + '.json', JSON.stringify(record, null, 2));
    }
    const initialWrite = !fs.existsSync(dir);
    // Do not expose a partial new directory that would mask legacy records.
    const targetDir = initialWrite ? path.join(contextDir, `.${name}.${randomUUID()}.tmp`) : dir;
    fs.mkdirSync(targetDir, { recursive: true });
    try {
        for (const [file, content] of files) {
            writeFileAtomic(path.join(targetDir, file), content);
        }
        if (initialWrite) fs.renameSync(targetDir, dir);
        // Prune only after every replacement has been written successfully.
        for (const file of fs.readdirSync(dir)) {
            if (file.endsWith('.json') && !files.has(file)) fs.unlinkSync(path.join(dir, file));
        }
    } finally {
        if (initialWrite) fs.rmSync(targetDir, { recursive: true, force: true });
    }
}

module.exports = {
    readJson,
    readJsonRecord,
    readJsonDirectory,
    readCollection,
    writeCollection,
    writeFileAtomic,
    sanitizeItemFilename,
    itemStem,
};
