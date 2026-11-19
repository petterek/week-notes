export function taskOrigin(task, { meetingSeries = [], meetings = [], goals = [] }, weekForDate) {
    if (task.meetingSeriesId) {
        const series = meetingSeries.find(s => s.id === task.meetingSeriesId);
        return {
            type: 'meetings', kind: 'meeting-series', id: task.meetingSeriesId,
            label: `Møteserie: ${series?.title || task.meetingSeriesId}`,
            href: `/meeting-series#ms-${encodeURIComponent(task.meetingSeriesId)}`,
        };
    }
    if (task.meetingId) {
        const meeting = meetings.find(m => m.id === task.meetingId);
        return {
            type: 'meetings', kind: 'meeting', id: task.meetingId,
            label: `Møte: ${meeting?.title || task.meetingId}`,
            href: meeting?.seriesId ? `/meeting-occurrence/${encodeURIComponent(task.meetingId)}`
                : meeting?.date ? `/calendar/${weekForDate(new Date(`${meeting.date}T00:00:00Z`))}#m-${encodeURIComponent(task.meetingId)}` : null,
        };
    }
    if (task.noteRef && /^[^/]+\/[^/]+\.md$/.test(task.noteRef)) {
        const [week, file] = task.noteRef.split('/');
        return {
            type: 'notes', kind: 'note', id: task.noteRef,
            label: `Notat: ${file.replace(/\.md$/, '')} (${week})`,
            href: `/${encodeURIComponent(week)}/${encodeURIComponent(file)}`,
        };
    }
    if (task.goalId) {
        const goal = goals.find(g => g.id === task.goalId);
        return {
            type: 'goals', kind: 'goal', id: task.goalId,
            label: `Mål: ${goal?.title || goal?.text || task.goalId}`,
            href: `/goals#g-${encodeURIComponent(task.goalId)}`,
        };
    }
    return { type: 'other', label: '', href: null };
}
