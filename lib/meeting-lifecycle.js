'use strict';

function isSeriesOccurrence(meeting) {
    return !!(meeting && meeting.seriesId);
}

function isClosedOccurrence(meeting) {
    return !!(meeting && meeting.status === 'closed');
}

function validateSeriesOccurrence(meeting) {
    return isSeriesOccurrence(meeting) ? '' : 'not a series occurrence';
}

function validateOpenSeriesOccurrence(meeting) {
    if (!isSeriesOccurrence(meeting)) return 'not a series occurrence';
    if (isClosedOccurrence(meeting)) return 'closed occurrence is read-only';
    return '';
}

function reindexAgendaItems(items) {
    if (!Array.isArray(items)) return [];
    return items
        .slice()
        .sort((a, b) => (Number(a && a.order) || 0) - (Number(b && b.order) || 0))
        .map((item, idx) => ({ ...item, order: idx }));
}

function syncOccurrenceOutcomesToSeries(meeting, seriesList, now = new Date().toISOString()) {
    if (!isSeriesOccurrence(meeting) || !Array.isArray(meeting.agenda) || !Array.isArray(seriesList)) return false;
    const series = seriesList.find(s => s && s.id === meeting.seriesId);
    if (!series || !Array.isArray(series.agendaItems)) return false;
    const byId = new Map(series.agendaItems.map(item => [item.id, item]));
    let changed = false;

    for (const entry of meeting.agenda) {
        const item = byId.get(entry.agendaItemId);
        if (!item) continue;
        const nextState = entry.outcome === 'resolved'
            ? 'resolved'
            : entry.outcome === 'cancelled'
                ? 'cancelled'
                : 'queued';
        item.state = nextState;
        item.updatedAt = now;
        changed = true;
    }

    if (changed) series.updated = now;
    return changed;
}

module.exports = {
    isSeriesOccurrence,
    isClosedOccurrence,
    validateSeriesOccurrence,
    validateOpenSeriesOccurrence,
    reindexAgendaItems,
    syncOccurrenceOutcomesToSeries,
};
