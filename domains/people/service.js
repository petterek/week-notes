/**
 * PeopleService — wraps /api/people endpoints.
 * CompaniesService — wraps /api/companies endpoints.
 * PlacesService — wraps /api/places endpoints.
 *
 * All three live here because the "people" domain covers people, the
 * companies they belong to, and the places where meetings happen.
 *
 * GET    /api/people              → PeopleService.list()
 * POST   /api/people    {…}       → PeopleService.create(person)
 * PUT    /api/people/:id {…}      → PeopleService.update(id, patch)
 * DELETE /api/people/:id          → PeopleService.remove(id)
 *
 * GET    /api/companies              → CompaniesService.list()
 * POST   /api/companies    {…}       → CompaniesService.create(company)
 * PUT    /api/companies/:id {…}      → CompaniesService.update(id, patch)
 * DELETE /api/companies/:id          → CompaniesService.remove(id)
 *
 * GET    /api/places              → PlacesService.list()
 * POST   /api/places    {…}       → PlacesService.create(place)
 * PUT    /api/places/:id {…}      → PlacesService.update(id, patch)
 * DELETE /api/places/:id          → PlacesService.remove(id)
 */
const PEOPLE = '/api/people';
const COMPANIES = '/api/companies';
const PLACES = '/api/places';

import { apiRequest as req } from '/services/_shared/http.js';

// Persistent in-memory cache for list() endpoints. These collections are
// modified only via this service module, so we can confidently keep a
// process-lifetime cache and bust it on mutations. Concurrent callers
// share the same in-flight promise.
function makeCachedList(path) {
    let cached = null;     // resolved array (cloned per caller)
    let inFlight = null;   // promise of an in-flight fetch
    const clone = (v) => {
        if (v == null) return v;
        try { return structuredClone(v); }
        catch { try { return JSON.parse(JSON.stringify(v)); } catch { return v; } }
    };
    const list = async () => {
        if (cached) return clone(cached);
        if (inFlight) return clone(await inFlight);
        inFlight = req('GET', path).then(v => { cached = v; return v; });
        try { return clone(await inFlight); }
        finally { inFlight = null; }
    };
    list.invalidate = () => { cached = null; inFlight = null; };
    return list;
}

const _peopleList    = makeCachedList(PEOPLE);
const _companiesList = makeCachedList(COMPANIES);
const _placesList    = makeCachedList(PLACES);

export const PeopleService = {
    list:   _peopleList,
    create: async (person)     => { const r = await req('POST',   PEOPLE, person);                              _peopleList.invalidate(); return r; },
    update: async (id, patch)  => { const r = await req('PUT',    `${PEOPLE}/${encodeURIComponent(id)}`, patch); _peopleList.invalidate(); return r; },
    remove: async (id)         => { const r = await req('DELETE', `${PEOPLE}/${encodeURIComponent(id)}`);        _peopleList.invalidate(); return r; },
};

export const CompaniesService = {
    list:   _companiesList,
    create: async (company)    => { const r = await req('POST',   COMPANIES, company);                              _companiesList.invalidate(); return r; },
    update: async (id, patch)  => { const r = await req('PUT',    `${COMPANIES}/${encodeURIComponent(id)}`, patch); _companiesList.invalidate(); return r; },
    remove: async (id)         => { const r = await req('DELETE', `${COMPANIES}/${encodeURIComponent(id)}`);        _companiesList.invalidate(); return r; },
};

export const PlacesService = {
    list:   _placesList,
    create: async (place)      => { const r = await req('POST',   PLACES, place);                                _placesList.invalidate(); return r; },
    update: async (id, patch)  => { const r = await req('PUT',    `${PLACES}/${encodeURIComponent(id)}`, patch); _placesList.invalidate(); return r; },
    remove: async (id)         => { const r = await req('DELETE', `${PLACES}/${encodeURIComponent(id)}`);        _placesList.invalidate(); return r; },
};
