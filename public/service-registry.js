import { ContextService } from '/services/context.js';
import { MeetingsService } from '/services/meetings.js';
import { NotesService } from '/services/notes.js';
import { PeopleService, CompaniesService, PlacesService, TeamsService } from '/services/people.js';
import { ResultsService } from '/services/results.js';
import { GoalsService } from '/services/goals.js';
import { SearchService } from '/services/search.js';
import { SettingsService } from '/services/settings.js';
import { TaskService } from '/services/tasks.js';

export const registry = {
    companies_service: CompaniesService,
    context_service:   ContextService,
    meetings_service:  MeetingsService,
    notes_service:     NotesService,
    people_service:    PeopleService,
    places_service:    PlacesService,
    teams_service:     TeamsService,
    results_service:   ResultsService,
    goals_service:     GoalsService,
    search_service:    SearchService,
    settings_service:  SettingsService,
    tasks_service:     TaskService,
};

export function installServiceRegistry(target) {
    const root = target || window;
    window['week-note-services'] = registry;
    window.WeekNoteServices = registry;
    window.mePersonKey = window.WN_ME_PERSON_KEY || '';
    if (root !== window) {
        root['week-note-services'] = registry;
        root.WeekNoteServices = registry;
        root.mePersonKey = root.WN_ME_PERSON_KEY || '';
    }
    document.dispatchEvent(new CustomEvent('week-note-services:ready', { detail: registry }));
    return registry;
}

installServiceRegistry();
