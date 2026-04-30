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


export const PeopleService = {
    list:   ()           => req('GET',    PEOPLE),
    create: (person)     => req('POST',   PEOPLE, person),
    update: (id, patch)  => req('PUT',    `${PEOPLE}/${encodeURIComponent(id)}`, patch),
    remove: (id)         => req('DELETE', `${PEOPLE}/${encodeURIComponent(id)}`),
};

export const CompaniesService = {
    list:   ()           => req('GET',    COMPANIES),
    create: (company)    => req('POST',   COMPANIES, company),
    update: (id, patch)  => req('PUT',    `${COMPANIES}/${encodeURIComponent(id)}`, patch),
    remove: (id)         => req('DELETE', `${COMPANIES}/${encodeURIComponent(id)}`),
};

export const PlacesService = {
    list:   ()           => req('GET',    PLACES),
    create: (place)      => req('POST',   PLACES, place),
    update: (id, patch)  => req('PUT',    `${PLACES}/${encodeURIComponent(id)}`, patch),
    remove: (id)         => req('DELETE', `${PLACES}/${encodeURIComponent(id)}`),
};
