'use strict';

const MAX_FILE_BYTES = 512 * 1024;
const MAX_EVENTS = 500;

function calendarError(message) {
    const error = new Error(message);
    error.status = 400;
    return error;
}

function parts(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    const values = Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]));
    return {
        date: `${values.year}-${values.month}-${values.day}`,
        time: `${values.hour}:${values.minute}`,
        stamp: Date.UTC(+values.year, +values.month - 1, +values.day, +values.hour, +values.minute, +values.second),
    };
}

function parseDate(value, zone, localZone, allDay) {
    const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value || '');
    if (!match || (!allDay && !match[4]) || (allDay && match[4])) throw calendarError(`Ugyldig kalenderdato: ${value}`);
    const [, y, mo, d, h = '00', mi = '00', s = '00', utc] = match;
    const stamp = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
    if (new Date(stamp).toISOString().slice(0, 19) !== `${y}-${mo}-${d}T${h}:${mi}:${s}`) {
        throw calendarError(`Ugyldig kalenderdato: ${value}`);
    }
    if (allDay || (!zone && !utc)) return { date: `${y}-${mo}-${d}`, time: allDay ? '' : `${h}:${mi}`, stamp };
    if (utc) return parts(new Date(stamp), localZone);
    const resolvedZone = zone === 'W. Europe Standard Time' ? 'Europe/Berlin' : zone;
    let instant = stamp;
    try {
        for (let i = 0; i < 4; i++) instant += stamp - parts(new Date(instant), resolvedZone).stamp;
        if (parts(new Date(instant), resolvedZone).stamp !== stamp) throw calendarError(`Tidspunktet finnes ikke i ${zone}: ${value}`);
        return parts(new Date(instant), localZone);
    } catch (error) {
        if (error instanceof RangeError) throw calendarError(`Ukjent tidssone: ${zone}`);
        throw error;
    }
}

function unescapeText(value) {
    return value.replace(/\\([nN,;\\])/g, (_match, ch) => ch.toLowerCase() === 'n' ? '\n' : ch);
}

function eventProperty(properties, name) {
    return properties.find(p => p.name === name);
}

function teamsJoinUrl(value) {
    for (const match of (value || '').matchAll(/https:\/\/[^\s<>\\]+/gi)) {
        const candidate = match[0].replace(/[.,;)\]]+$/, '');
        try {
            const url = new URL(candidate);
            if (url.protocol === 'https:' && !url.username && !url.password &&
                ['teams.microsoft.com', 'teams.live.com'].includes(url.hostname.toLowerCase()) &&
                (/^\/l\/meetup-join\//i.test(url.pathname) || /^\/meet\//i.test(url.pathname))) {
                return url.href;
            }
        } catch (_) {
            // Continue looking for a valid Teams join URL.
        }
    }
    return '';
}

function convertEvent(properties, timeZone) {
    const uid = eventProperty(properties, 'UID')?.value?.trim();
    const start = eventProperty(properties, 'DTSTART');
    const end = eventProperty(properties, 'DTEND');
    const title = eventProperty(properties, 'SUMMARY')?.value;
    if (!uid || !start || !title?.trim()) throw calendarError('Hendelsen mangler UID, starttid eller tittel');
    const allDay = start.params.VALUE === 'DATE' || /^\d{8}$/.test(start.value);
    const from = parseDate(start.value, start.params.TZID, timeZone, allDay);
    let to = end ? parseDate(end.value, end.params.TZID || start.params.TZID, timeZone, allDay) : null;
    if (allDay) {
        if (to && to.stamp <= from.stamp) throw calendarError('Sluttid må være etter starttid');
        if (to) to = { ...to, date: new Date(to.stamp - 86400000).toISOString().slice(0, 10) };
    } else if (to && `${to.date} ${to.time}` <= `${from.date} ${from.time}`) {
        throw calendarError('Sluttid må være etter starttid');
    }
    const recurrence = eventProperty(properties, 'RECURRENCE-ID')?.value;
    const notes = unescapeText(eventProperty(properties, 'DESCRIPTION')?.value || '');
    const joinUrl = teamsJoinUrl(eventProperty(properties, 'X-MICROSOFT-SKYPETEAMSMEETINGURL')?.value)
        || teamsJoinUrl(notes);
    return {
        calendarUid: recurrence ? `${uid}#${recurrence}` : uid,
        date: from.date, start: from.time, end: to?.time || '',
        ...(to && to.date !== from.date ? { endDate: to.date } : {}),
        title: unescapeText(title).trim(),
        notes,
        ...(joinUrl ? { joinUrl } : {}),
        location: unescapeText(eventProperty(properties, 'LOCATION')?.value || ''),
        type: 'meeting', attendees: [], placeKey: '', noteRef: '',
    };
}

function parseCalendar(content, timeZone) {
    if (typeof content !== 'string' || !content.trim()) throw calendarError('Kalenderfilen mangler');
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) {
        const error = calendarError('Kalenderfilen er for stor (maks 512 KB)');
        error.status = 413;
        throw error;
    }
    if (typeof timeZone !== 'string' || !timeZone) throw calendarError('Lokal tidssone mangler');
    try { parts(new Date(), timeZone); }
    catch (error) {
        if (error instanceof RangeError) throw calendarError('Ukjent lokal tidssone');
        throw error;
    }
    const lines = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    const unfolded = [];
    for (const line of lines) {
        if (/^[ \t]/.test(line) && unfolded.length) unfolded[unfolded.length - 1] += line.slice(1);
        else unfolded.push(line);
    }
    const stack = [];
    const events = [];
    let properties = [];
    let version = '';
    let recurring = 0;
    let seenEvents = 0;
    let closed = false;
    for (const line of unfolded) {
        if (!line) continue;
        if (closed) throw calendarError('Uventede data etter kalenderen');
        const sep = line.indexOf(':');
        if (sep < 0) throw calendarError('Ugyldig kalenderlinje');
        const key = line.slice(0, sep);
        const value = line.slice(sep + 1);
        if (key === 'BEGIN') {
            if (!stack.length && value !== 'VCALENDAR') throw calendarError('Forventet VCALENDAR');
            stack.push(value);
            if (value === 'VEVENT') {
                if (stack.length !== 2) throw calendarError('Ugyldig VEVENT');
                properties = [];
            }
        } else if (key === 'END') {
            if (stack.pop() !== value) throw calendarError('Kalenderen har ubalanserte seksjoner');
            if (value === 'VCALENDAR') closed = true;
            if (value === 'VEVENT') {
                if (++seenEvents > MAX_EVENTS) throw calendarError('For mange hendelser (maks 500)');
                if (eventProperty(properties, 'RRULE')) recurring++;
                if (eventProperty(properties, 'STATUS')?.value !== 'CANCELLED') events.push(convertEvent(properties, timeZone));
            }
        } else if (stack.at(-1) === 'VEVENT') {
            const [name, ...paramParts] = key.split(';');
            const params = {};
            for (const param of paramParts) {
                const equals = param.indexOf('=');
                if (equals !== -1) params[param.slice(0, equals).toUpperCase()] = param.slice(equals + 1).replace(/^"|"$/g, '');
            }
            if (params.ENCODING && params.ENCODING !== '8BIT') throw calendarError(`Ustøttet tegnkoding: ${params.ENCODING}`);
            properties.push({ name: name.toUpperCase(), params, value });
        } else if (stack.length === 1 && key === 'VERSION') version = value.trim();
    }
    if (!closed || stack.length || !['1.0', '2.0'].includes(version)) throw calendarError('Forventet vCalendar 1.0 eller iCalendar 2.0');
    if (!events.length) throw calendarError('Kalenderfilen inneholder ingen aktive hendelser');
    return { events, recurring };
}

module.exports = { parseCalendar, MAX_FILE_BYTES };
