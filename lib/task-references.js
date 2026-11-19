'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { COLLECTIONS } = require('./collections-manifest');
const { taskOrigin } = require('../domains/_shared/task-origin.js');

function readDirectory(dir) {
    try { return fs.readdirSync(dir, { withFileTypes: true }); }
    catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
}

function getTaskReferences(task, core) {
    const collections = Object.fromEntries(Object.keys(COLLECTIONS).map(name => [
        name, core.loadCollection(name).filter(record => !record.deleted),
    ]));
    const sources = {
        meetingSeries: collections['meeting-series'], meetings: collections.meetings, goals: collections.goals,
    };
    const originFor = record => taskOrigin(record, sources, core.dateToIsoWeek);
    const origin = originFor(task);
    const mentions = [];
    const add = (reference, texts) => {
        if (texts.some(text => core.extractTaskRefs(text).has(task.id))) {
            const { kind, id, label, href } = reference;
            mentions.push({ kind, id, label, href });
        }
    };
    const root = core.dataDir();
    for (const week of readDirectory(root).filter(d => d.isDirectory() && /^\d{4}-(?:W\d{2}|\d{1,2})$/.test(d.name))) {
        for (const file of readDirectory(path.join(root, week.name)).filter(f => f.isFile() && f.name.endsWith('.md'))) {
            add(originFor({ noteRef: `${week.name}/${file.name}` }), [
                fs.readFileSync(path.join(root, week.name, file.name), 'utf8'),
            ]);
        }
    }
    for (const meeting of collections.meetings) {
        add(originFor({ meetingId: meeting.id }), [
            meeting.title, meeting.notes, meeting.minutes,
            ...(meeting.agenda || []).flatMap(a => [a.title, a.notes]),
            ...(meeting.decisions || []).map(d => d.text),
        ]);
    }
    for (const series of collections['meeting-series']) {
        add(originFor({ meetingSeriesId: series.id }), [
            series.title, series.description, ...(series.agendaItems || []).map(a => a.title),
        ]);
    }
    for (const goal of collections.goals) {
        add(originFor({ goalId: goal.id }), [goal.title, goal.description]);
    }
    for (const result of collections.results) {
        add({
            kind: 'result', id: result.id, label: `Resultat: ${(result.text || result.id).slice(0, 120)}`,
            href: `/results#r-${encodeURIComponent(result.id)}`,
        }, [result.text]);
    }
    for (const source of collections.tasks) {
        if (source.id === task.id) continue;
        add({
            kind: 'task', id: source.id, label: `Oppgave: ${source.text || source.id}`,
            href: `/tasks#t-${encodeURIComponent(source.id)}`,
        }, [source.text, source.note, source.comment, ...(source.comments || []).map(c => c.text)]);
    }
    for (const [collection, kind, label, prefix] of [
        ['people', 'person', 'Person', 'p'],
        ['companies', 'company', 'Firma', 'c'],
        ['places', 'place', 'Sted', 'pl'],
        ['teams', 'team', 'Team', 't'],
    ]) {
        for (const record of collections[collection]) {
            add({
                kind, id: record.key, label: `${label}: ${record.name || record.key}`,
                href: `/people#${prefix}-${encodeURIComponent(record.key)}`,
            }, [record.notes]);
        }
    }
    mentions.sort((a, b) => a.label.localeCompare(b.label, 'nb') || a.id.localeCompare(b.id));
    return { origin: origin.label ? origin : null, mentions };
}

module.exports = { getTaskReferences };
