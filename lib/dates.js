// lib/dates.js — pure ISO-8601 week / date helpers. No deps beyond builtins.

function dateToIsoWeek(d) {
    // Canonical ISO 8601 week: target = Thursday of d's week
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
    return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function isoWeekMonday(yearWeek) {
    const parts = (yearWeek || '').split('-W');
    const year = parseInt(parts[0], 10);
    const week = parseInt(parts[1], 10);
    if (!year || !week) return null;
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Dow = (jan4.getUTCDay() + 6) % 7;
    const week1Mon = new Date(jan4);
    week1Mon.setUTCDate(jan4.getUTCDate() - jan4Dow);
    const monday = new Date(week1Mon);
    monday.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
    return monday;
}

function currentIsoWeek() {
    return dateToIsoWeek(new Date());
}

function shiftIsoWeek(yearWeek, delta) {
    const mon = isoWeekMonday(yearWeek);
    if (!mon) return yearWeek;
    mon.setUTCDate(mon.getUTCDate() + delta * 7);
    return dateToIsoWeek(mon);
}

function getCurrentYearWeek() {
    return dateToIsoWeek(new Date());
}

function isoWeekToDateRange(yearWeek) {
    if (!yearWeek) return '';
    const parts = yearWeek.split('-');
    const year = parseInt(parts[0], 10);
    const week = parseInt(parts[1], 10);
    if (!year || !week) return '';
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Dow = (jan4.getUTCDay() + 6) % 7;
    const week1Mon = new Date(jan4);
    week1Mon.setUTCDate(jan4.getUTCDate() - jan4Dow);
    const monday = new Date(week1Mon);
    monday.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const months = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
    const dM = monday.getUTCDate(), mM = monday.getUTCMonth();
    const dS = sunday.getUTCDate(), mS = sunday.getUTCMonth();
    if (mM === mS) return `${dM}.– ${dS}. ${months[mS]}`;
    return `${dM}. ${months[mM]} – ${dS}. ${months[mS]}`;
}

module.exports = {
    dateToIsoWeek,
    isoWeekMonday,
    currentIsoWeek,
    shiftIsoWeek,
    getCurrentYearWeek,
    isoWeekToDateRange,
};
