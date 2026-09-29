const { test, expect } = require('@playwright/test');
const {
    isSeriesOccurrence,
    isClosedOccurrence,
    validateSeriesOccurrence,
    validateOpenSeriesOccurrence,
    reindexAgendaItems,
    syncOccurrenceOutcomesToSeries,
} = require('../../lib/meeting-lifecycle.js');

test('meeting lifecycle helpers gate plain and closed occurrences', () => {
    expect(isSeriesOccurrence({ seriesId: 'ms_1' })).toBe(true);
    expect(isSeriesOccurrence({})).toBe(false);
    expect(isClosedOccurrence({ status: 'closed' })).toBe(true);
    expect(isClosedOccurrence({ status: 'in-progress' })).toBe(false);
    expect(validateSeriesOccurrence({ seriesId: 'ms_1' })).toBe('');
    expect(validateSeriesOccurrence({})).toBe('not a series occurrence');
    expect(validateOpenSeriesOccurrence({ seriesId: 'ms_1', status: 'planned' })).toBe('');
    expect(validateOpenSeriesOccurrence({ seriesId: 'ms_1', status: 'closed' })).toBe('closed occurrence is read-only');
    expect(validateOpenSeriesOccurrence({})).toBe('not a series occurrence');
});

test('meeting lifecycle helpers reindex queue order after deletion', () => {
    const items = reindexAgendaItems([
        { id: 'a', order: 0, title: 'A' },
        { id: 'c', order: 2, title: 'C' },
    ]);
    expect(items.map(item => item.order)).toEqual([0, 1]);
    expect(items.map(item => item.id)).toEqual(['a', 'c']);

    const appended = reindexAgendaItems([...items, { id: 'd', order: items.length, title: 'D' }]);
    expect(appended.map(item => item.order)).toEqual([0, 1, 2]);
    expect(appended.map(item => item.id)).toEqual(['a', 'c', 'd']);
});

test('meeting lifecycle helpers sync occurrence outcomes back to the series', () => {
    const series = [{
        id: 'ms_1',
        agendaItems: [
            { id: 'a', state: 'queued' },
            { id: 'b', state: 'queued' },
            { id: 'c', state: 'queued' },
        ],
    }];
    const meeting = {
        seriesId: 'ms_1',
        agenda: [
            { agendaItemId: 'a', outcome: 'resolved' },
            { agendaItemId: 'b', outcome: 'deferred' },
            { agendaItemId: 'c', outcome: null },
        ],
    };

    expect(syncOccurrenceOutcomesToSeries(meeting, series, '2099-01-01T00:00:00.000Z')).toBe(true);
    expect(series[0].agendaItems.map(item => item.state)).toEqual(['resolved', 'queued', 'queued']);
    expect(series[0].updated).toBe('2099-01-01T00:00:00.000Z');
    expect(series[0].agendaItems.every(item => item.updatedAt === '2099-01-01T00:00:00.000Z')).toBe(true);
});
