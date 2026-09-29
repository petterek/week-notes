// ----- Entity callout host: listen for hover-* events bubbling from cards
// (composed events cross every shadow boundary) and drive the dumb
// <entity-callout> singleton. Services are loaded lazily on first hover. -----
(function(){
    var cal = document.getElementById('appEntityCallout');
    if (!cal) return;
    var ready = customElements.whenDefined('entity-callout');
    var cache = { person: null, company: null, place: null };
    var loading = null;
    function svc(name){
        var ns = window['week-note-services'] || {};
        return ns[name + '_service'];
    }
    function loadAll(){
        if (cache.person && cache.company && cache.place) return Promise.resolve();
        if (loading) return loading;
        loading = Promise.all([
            Promise.resolve((svc('people')    && svc('people').list())    || []),
            Promise.resolve((svc('companies') && svc('companies').list()) || []),
            Promise.resolve((svc('places')    && svc('places').list())    || []),
        ]).then(function(arr){
            cache.person  = arr[0] || [];
            cache.company = arr[1] || [];
            cache.place   = arr[2] || [];
        });
        return loading;
    }
    function lookup(kind, key){
        var list = cache[kind];
        if (!list || !key) return null;
        if (kind === 'person') {
            var lk = String(key).toLowerCase();
            var p = list.find(function(x){ return (x.key && x.key.toLowerCase() === lk) || (x.name && x.name.toLowerCase() === lk); });
            if (!p) return null;
            var company = p.primaryCompanyKey ? (cache.company || []).find(function(c){ return c.key === p.primaryCompanyKey; }) : null;
            return Object.assign({}, p, { company: company });
        }
        return list.find(function(x){ return x.key === key; }) || null;
    }
    ['person','company','place'].forEach(function(kind){
        document.addEventListener('hover-' + kind, function(e){
            var d = e.detail || {};
            ready.then(function(){
                if (!d.entering) { cal.hide(); return; }
                loadAll().then(function(){
                    cal.setData({ kind: kind, key: d.key, entity: lookup(kind, d.key), x: d.x, y: d.y });
                });
            });
        });
    });

    // ----- Navigation: clicking an <entity-mention> emits select-* events.
    // Replicate the old anchor behaviour (href="/people..." / "/people#tab=companies&key=...")
    // through the SPA router so chips remain navigable. -----
    function nav(url) {
        if (window.SPA && typeof window.SPA.navigate === 'function') window.SPA.navigate(url);
        else window.location.assign(url);
    }
    document.addEventListener('select-person', function(e){
        var key = (e.detail && e.detail.key) || '';
        nav('/people' + (key ? '#p-' + encodeURIComponent(key) : ''));
    });
    document.addEventListener('select-company', function(e){
        var key = (e.detail && e.detail.key) || '';
        nav('/people' + (key ? '#tab=companies&key=' + encodeURIComponent(key) : ''));
    });
    document.addEventListener('select-place', function(e){
        var key = (e.detail && e.detail.key) || '';
        nav('/people' + (key ? '#tab=places&key=' + encodeURIComponent(key) : ''));
    });

    // ----- Bridge legacy ".mention-link" anchors -> hover-* events. -----
    // Mention links live in the light DOM (rendered by linkMentions). They
    // emit no events themselves; this watcher converts mouseover/mouseout to
    // the same composed hover-* events that cards dispatch, so the callout
    // host above handles them uniformly.
    function dispatchMention(a, entering, ev) {
        var compKey = a.getAttribute('data-company-key');
        var personKey = a.getAttribute('data-person-key');
        var key, kind;
        if (compKey) { key = compKey; kind = 'company'; }
        else if (personKey) { key = personKey; kind = 'person'; }
        else {
            key = (a.textContent || '').trim().toLowerCase();
            kind = a.classList.contains('mention-company') ? 'company' : 'person';
        }
        if (!key) return;
        document.dispatchEvent(new CustomEvent('hover-' + kind, {
            bubbles: true, composed: true,
            detail: { key: key, entering: entering, x: ev.clientX, y: ev.clientY },
        }));
    }
    document.addEventListener('mouseover', function(e){
        var a = e.target.closest && e.target.closest('.mention-link');
        if (!a) return;
        dispatchMention(a, true, e);
    });
    document.addEventListener('mouseout', function(e){
        var a = e.target.closest && e.target.closest('.mention-link');
        if (!a) return;
        var to = e.relatedTarget;
        if (to && to.closest && to.closest('.mention-link') === a) return;
        dispatchMention(a, false, e);
    });
    document.addEventListener('mousemove', function(e){
        if (!cal.hasAttribute('visible')) return;
        var a = e.target.closest && e.target.closest('.mention-link');
        if (!a) return;
        cal.position && cal.position(e.clientX, e.clientY);
    });
})();

(function(){
    function getRouteManifest() {
        var manifest = window.WN_PAGE_ROUTES;
        if (!manifest || !Array.isArray(manifest.routes) || !Array.isArray(manifest.patterns)) {
            throw new Error('Missing page route manifest');
        }
        return manifest;
    }

    function normalizePathname(input) {
        if (input == null || input === '') return '/';
        try {
            var parsed = new URL(String(input), location.origin);
            if (parsed.pathname === '/index.html') return '/';
            return parsed.pathname || '/';
        } catch (_) {
            var path = String(input);
            var hash = path.indexOf('#');
            if (hash >= 0) path = path.slice(0, hash);
            var query = path.indexOf('?');
            if (query >= 0) path = path.slice(0, query);
            if (!path) return '/';
            if (path === '/index.html') return '/';
            return path.charAt(0) === '/' ? path : '/' + path;
        }
    }

    function compileRouteResolver(manifest) {
        var staticRoutes = Object.create(null);
        var patternRoutes = [];
        var routes = (manifest && manifest.routes) || [];
        var patterns = (manifest && manifest.patterns) || [];

        for (var i = 0; i < routes.length; i++) {
            var route = routes[i] || {};
            if (!route.path || !route.fragment) continue;
            staticRoutes[route.path] = route;
            var aliases = Array.isArray(route.aliases) ? route.aliases : [];
            for (var a = 0; a < aliases.length; a++) staticRoutes[aliases[a]] = route;
        }
        for (var j = 0; j < patterns.length; j++) {
            var pattern = patterns[j] || {};
            if (!pattern.pattern || !pattern.pattern.source || !pattern.fragment) continue;
            patternRoutes.push({
                pattern: new RegExp(pattern.pattern.source, pattern.pattern.flags || ''),
                route: pattern,
            });
        }

        function resolve(pathname) {
            var path = normalizePathname(pathname);
            if (Object.prototype.hasOwnProperty.call(staticRoutes, path)) return staticRoutes[path];
            for (var k = 0; k < patternRoutes.length; k++) {
                if (patternRoutes[k].pattern.test(path)) return patternRoutes[k].route;
            }
            return null;
        }

        return resolve;
    }

    function initMarked() {
        if (window.marked && typeof window.marked.use === 'function') {
            try { window.marked.use({ breaks: true, gfm: true }); } catch (_) {}
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMarked, { once: true });
    } else {
        initMarked();
    }

    var resolveRoute = compileRouteResolver(getRouteManifest());

    // ----- SPA router. Maps URL paths to static HTML fragments under /pages/. -----
    (function(){
        var content = document.getElementById('content');
        if (!content) return;

        function fragmentFor(pathname) {
            var route = resolveRoute(pathname);
            return route && route.fragment ? route.fragment : null;
        }

        function applyFragment(html, pushPath) {
            var titleMatch = html.match(/<title>([^<]*)<\/title>/i);
            if (titleMatch) {
                document.title = titleMatch[1];
                html = html.replace(titleMatch[0], '');
            }
            if (pushPath) {
                history.pushState({ spa: true }, '', pushPath);
            }
            content.innerHTML = html;
            document.dispatchEvent(new CustomEvent('spa:navigated', { detail: { path: location.pathname } }));
        }

        function navigate(pathname, push) {
            var parsed;
            try {
                parsed = new URL(pathname, location.href);
            } catch (_) {
                window.location.href = pathname;
                return;
            }
            var frag = fragmentFor(parsed.pathname);
            if (!frag) {
                window.location.href = parsed.href;
                return;
            }
            fetch(frag, { headers: { 'Accept': 'text/html' } })
                .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
                .then(function(html){ applyFragment(html, push ? (parsed.pathname + parsed.search + parsed.hash) : null); })
                .catch(function(){ window.location.href = parsed.href; });
        }

        document.addEventListener('click', function(e){
            if (e.defaultPrevented) return;
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            var a = e.target.closest && e.target.closest('a[href]');
            if (!a) return;
            if (a.target && a.target !== '' && a.target !== '_self') return;
            var url;
            try { url = new URL(a.href, location.href); } catch (_) { return; }
            if (url.origin !== location.origin) return;
            if (a.hasAttribute('download')) return;
            if (!fragmentFor(url.pathname)) return;
            e.preventDefault();
            navigate(url.pathname + url.search + url.hash, true);
        });

        window.addEventListener('popstate', function(){
            navigate(location.pathname + location.search + location.hash, false);
        });

        window.spaNavigate = function(pathname){
            try {
                var u = new URL(pathname, location.href);
                if (u.origin !== location.origin) return false;
                if (!fragmentFor(u.pathname)) return false;
                navigate(u.pathname + u.search + u.hash, true);
                return true;
            } catch (_) {
                return false;
            }
        };
        window.SPA = window.SPA || {};
        window.SPA.navigate = window.spaNavigate;

        function hydrate(){
            if (content.children.length === 0 && content.textContent.trim() === '') {
                navigate(location.pathname + location.search + location.hash, false);
            }
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', hydrate);
        } else {
            hydrate();
        }
    })();

    // Auto-wire any <details data-persist-key="..."> in the SPA fragment so its
    // open/closed state is remembered across navigations.
    (function(){
        function wire(root){
            (root || document).querySelectorAll('details[data-persist-key]').forEach(function(d){
                if (d._persistWired) return;
                d._persistWired = true;
                var key = d.getAttribute('data-persist-key');
                if (localStorage.getItem(key) === 'true') d.open = true;
                d.addEventListener('toggle', function(){
                    localStorage.setItem(key, d.open ? 'true' : 'false');
                });
            });
        }
        document.addEventListener('spa:navigated', function(){ wire(document); });
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function(){ wire(document); });
        } else { wire(document); }
    })();

    // Tasks page: intercept task:request-edit and route it into the sticky
    // inline <task-create-full id="tasksPageCreate"> instead of opening the modal.
    (function(){
        document.addEventListener('task:request-edit', function(ev){
            var form = document.querySelector('task-create-full#tasksPageCreate');
            if (!form) return;
            if (form.contains(ev.target)) return;
            ev.stopImmediatePropagation();
            var detail = ev.detail || {};
            var task = detail.task || {};
            var cb = (typeof detail.callback === 'function') ? detail.callback : null;

            var lists = document.querySelectorAll('task-open-list');
            for (var li = 0; li < lists.length; li++) {
                var sh0 = lists[li].shadowRoot;
                if (!sh0) continue;
                var prior = sh0.querySelectorAll('.sidebar-task.editing');
                for (var pi = 0; pi < prior.length; pi++) prior[pi].classList.remove('editing');
            }
            var editingRow = null;
            if (task && task.id) {
                for (var i = 0; i < lists.length && !editingRow; i++) {
                    var sh = lists[i].shadowRoot;
                    if (!sh) continue;
                    var row = sh.querySelector('.sidebar-task[data-taskid="' + CSS.escape(task.id) + '"]');
                    if (row) editingRow = row;
                }
                if (editingRow) editingRow.classList.add('editing');
            }
            function clearEditingMark(){
                if (editingRow) {
                    try { editingRow.classList.remove('editing'); } catch(_){}
                    editingRow = null;
                }
            }

            function clearForm(){
                form._task = null;
                if (form._input) form._input.value = '';
                if (form._noteIn) form._noteIn.value = '';
                if (form._setDue) form._setDue('');
                if (form._respSel) form._respSel.value = '';
                if (form._goalSel) form._goalSel.value = '';
                if (form._apply) form._apply();
            }

            if (task && task.id) {
                form.task = task;
            } else {
                clearForm();
            }
            if (editingRow) {
                var doScroll = function(){
                    try {
                        var card = form.closest('.card-create') || form;
                        var cardHeight = card.offsetHeight || card.getBoundingClientRect().height;
                        editingRow.style.scrollMarginTop = (cardHeight + 12) + 'px';
                        editingRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } catch(_){}
                };
                requestAnimationFrame(function(){ requestAnimationFrame(doScroll); });
            } else {
                try { form.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(_){}
            }
            requestAnimationFrame(function(){
                try {
                    var t = form.shadowRoot && form.shadowRoot.querySelector('input.txt');
                    if (t) { t.focus(); try { t.setSelectionRange(t.value.length, t.value.length); } catch(_){} }
                } catch(_){}
            });

            function done(result){
                form.removeEventListener('task:created', onCreated);
                form.removeEventListener('task:updated', onUpdated);
                clearEditingMark();
                clearForm();
                if (cb) { try { cb(result); } catch(_){} }
            }
            function onCreated(e){
                var t = (e.detail && e.detail.task) || {};
                done({ saved: true, id: t.id || null, patch: {
                    text: t.text || '', note: t.note || '',
                    responsible: t.responsible || '', dueDate: t.dueDate || '',
                    goalId: t.goalId || null,
                } });
            }
            function onUpdated(e){
                var d = e.detail || {};
                done({ saved: true, id: d.id || null, patch: d.patch || {} });
            }
            form.addEventListener('task:created', onCreated);
            form.addEventListener('task:updated', onUpdated);
        }, true);
    })();

    document.addEventListener('keydown',function(e){
        if(!e.altKey||e.ctrlKey||e.metaKey)return;
        var t=e.target;
        if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;
        var btn=document.querySelector('#appNav nav-button[data-key="'+e.key.toLowerCase()+'"]');
        if(btn){e.preventDefault();var href=btn.getAttribute('href');if(window.spaNavigate&&window.spaNavigate(href))return;window.location.href=href;}
    });

    document.addEventListener('keydown', function(e){
        if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
        var path = (typeof e.composedPath === 'function') ? e.composedPath() : [e.target];
        for (var i = 0; i < path.length; i++) {
            var n = path[i];
            if (!n || !n.tagName) continue;
            if (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.isContentEditable) return;
        }
        var hm = document.querySelector('help-modal');
        if (hm && typeof hm.open === 'function') { e.preventDefault(); hm.open(); }
    });

    document.addEventListener('keydown', function(e){
        if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
        var path = (typeof e.composedPath === 'function') ? e.composedPath() : [e.target];
        for (var i = 0; i < path.length; i++) {
            var n = path[i];
            if (!n || !n.tagName) continue;
            if (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.isContentEditable) return;
        }
        if (typeof window.openSearch === 'function') { e.preventDefault(); window.openSearch(); }
    });

    (function(){
        function updateSelected(){
            var path = location.pathname || '/';
            document.querySelectorAll('nav-button[href]').forEach(function(btn){
                var href = btn.getAttribute('href') || '';
                var match = false;
                if (href === '/') match = (path === '/' || path === '');
                else match = (path === href || path.indexOf(href + '/') === 0);
                if (match) btn.setAttribute('selected', '');
                else btn.removeAttribute('selected');
            });
        }
        document.addEventListener('spa:navigated', updateSelected);
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', updateSelected);
        else updateSelected();
    })();

    // ----- Global wiring of component events -----
    (function(){
        function pad2(n){ return String(n).padStart(2,'0'); }
        function go(url){ window.location.href = url; }

        document.addEventListener('nav-clicked', function(e){
            var href = e.detail && e.detail.href;
            if (!href) return;
            e.preventDefault();
            if (window.spaNavigate && window.spaNavigate(href)) return;
            go(href);
        });

        document.addEventListener('mention-clicked', function(e){
            var id = e.detail && e.detail.id;
            if (!id) return;
            e.preventDefault();
            fetch('/api/companies').then(function(r){ return r.ok ? r.json() : []; }).then(function(companies){
                var isCompany = (companies || []).some(function(c){ return c.key === id; });
                if (isCompany) go('/people#tab=companies&key=' + encodeURIComponent(id));
                else go('/people#p-' + encodeURIComponent(id));
            }).catch(function(){ go('/people'); });
        });

        document.addEventListener('week-clicked', function(e){
            var d = e.detail || {};
            if (!d.year || !d.weekNumber) return;
            e.preventDefault();
            go('/calendar/' + d.year + '-W' + pad2(d.weekNumber));
        });

        function readWF(detail){
            if (!detail || !detail.week || !detail.file) return null;
            return { week: detail.week, file: detail.file, fileEnc: encodeURIComponent(detail.file) };
        }
        function handleView(e){
            var p = readWF(e.detail); if (!p) return;
            e.preventDefault();
            if (typeof window.openNoteViewModal === 'function') window.openNoteViewModal(p.week, p.fileEnc);
            else go('/note/' + p.week + '/' + p.fileEnc);
        }
        function handlePresent(e){
            var p = readWF(e.detail); if (!p) return;
            e.preventDefault();
            if (typeof window.openPresentation === 'function') window.openPresentation(p.week, p.fileEnc);
            else window.open('/present/' + p.week + '/' + p.fileEnc + '?fs=1', '_blank');
        }
        function handleEdit(e){
            var p = readWF(e.detail); if (!p) return;
            e.preventDefault();
            go('/editor/' + p.week + '/' + p.fileEnc);
        }
        function handleDelete(e){
            var p = readWF(e.detail); if (!p) return;
            e.preventDefault();
            var path = (typeof e.composedPath === 'function') ? e.composedPath() : [];
            var card = null;
            for (var i = 0; i < path.length; i++) {
                var n = path[i];
                if (n && n.nodeType === 1 && n.tagName === 'NOTE-CARD') { card = n; break; }
            }
            if (!card) card = e.target && e.target.closest && e.target.closest('note-card');
            var name = p.file.replace(/\.md$/, '');
            if (!confirm('Slette notatet "' + name + '"?\n\nDette kan ikke angres.')) return;
            fetch('/api/notes/' + p.week + '/' + p.fileEnc, { method: 'DELETE' })
                .then(function(resp){
                    if (!resp.ok) { alert('Kunne ikke slette notatet.'); return; }
                    if (card && card.remove) card.remove();
                    document.dispatchEvent(new CustomEvent('note:deleted', {
                        bubbles: true, detail: { week: p.week, file: p.file },
                    }));
                })
                .catch(function(err){ alert('Nettverksfeil: ' + (err && err.message || err)); });
        }
        document.addEventListener('view', handleView);
        document.addEventListener('present', handlePresent);
        document.addEventListener('delete', handleDelete);
        document.addEventListener('note:view', handleView);
        document.addEventListener('note:present', handlePresent);
        document.addEventListener('note:edit', handleEdit);

        function notify(selector, method, detail) {
            function walk(root) {
                root.querySelectorAll(selector).forEach(function(el){
                    if (typeof el[method] === 'function') el[method](detail);
                });
                root.querySelectorAll('*').forEach(function(el){
                    if (el.shadowRoot) walk(el.shadowRoot);
                });
            }
            walk(document);
        }
        document.addEventListener('task:created', function(e){
            notify('task-open-list', 'taskCreated', e.detail || {});
        });
        document.addEventListener('task:completed', function(e){
            notify('task-open-list', 'taskCompleted', e.detail || {});
            notify('task-completed', 'taskCompleted', e.detail || {});
        });
        document.addEventListener('task:uncompleted', function(e){
            notify('task-open-list', 'taskUncompleted', e.detail || {});
            notify('task-completed', 'taskUncompleted', e.detail || {});
        });

        document.addEventListener('task-closed', function(e){
            var d = e.detail || {};
            var id = d.taskId;
            if (!id) return;
            var ev = d.done ? 'task:completed' : 'task:uncompleted';
            document.dispatchEvent(new CustomEvent(ev, {
                bubbles: true, detail: { id: id },
            }));
        });

        function ensureSummaryModal() {
            var m = document.getElementById('summaryModal');
            if (m) return m;
            m = document.createElement('modal-container');
            m.id = 'summaryModal';
            m.setAttribute('size', 'lg');
            var t = document.createElement('span');
            t.setAttribute('slot', 'title');
            m.appendChild(t);
            var body = document.createElement('div');
            body.className = 'summary-modal-body';
            body.style.cssText = 'min-height:120px;font-size:0.95em;line-height:1.55;';
            m.appendChild(body);
            document.body.appendChild(m);
            return m;
        }
        function setSummaryBody(modal, html) {
            var body = modal.querySelector('.summary-modal-body');
            if (body) body.innerHTML = html;
        }
        function escapeHtmlClient(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        function renderMarkdown(md) {
            var src = String(md == null ? '' : md).trim();
            var fence = src.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/);
            if (fence) src = fence[1].trim();
            var html;
            if (window.marked && typeof window.marked.parse === 'function') {
                try { html = window.marked.parse(src); } catch (_) {}
            }
            if (!html) {
                html = '<pre style="white-space:pre-wrap;font-family:inherit">' + escapeHtmlClient(src) + '</pre>';
            }
            html = html.replace(/(^|[\s\n(\[>])@([a-zA-ZæøåÆØÅ][a-zA-ZæøåÆØÅ0-9_-]*)/g,
                function(_m, pre, name) {
                    return pre + '<entity-mention kind="person" key="'
                        + escapeHtmlClient(name.toLowerCase()) + '" label="'
                        + escapeHtmlClient(name) + '"></entity-mention>';
                });
            return html;
        }
        function saveSummary(week, markdown) {
            return fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder: week, file: 'summarize.md', content: markdown }),
            }).then(function(r){ return r.json().then(function(j){ return { ok: r.ok, j: j }; }); });
        }

        function runSummarize(week) {
            var modal = ensureSummaryModal();
            modal.setTitle('Oppsummering &mdash; uke ' + escapeHtmlClient(week));
            setSummaryBody(modal, '<p style="color:var(--text-muted)">⏳ Oppsummerer uke ' + escapeHtmlClient(week) + ' &hellip;</p>');
            modal.setButtons([
                { label: 'Lukk', variant: 'ghost', action: function(m){ m.close('button'); }, dismiss: false },
            ]);
            modal.open();
            fetch('/api/summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ week: week }),
            }).then(function(r){ return r.json().then(function(j){ return { ok: r.ok, j: j }; }); })
            .then(function(res){
                if (!res.ok || !res.j || !res.j.ok) {
                    var msg = (res.j && (res.j.error || res.j.message)) || 'Ukjent feil';
                    setSummaryBody(modal,
                        '<p style="color:var(--danger,#c53030)"><strong>Kunne ikke oppsummere:</strong> '
                        + escapeHtmlClient(msg) + '</p>');
                    return;
                }
                var md = res.j.summary || '';
                setSummaryBody(modal, renderMarkdown(md));
                modal.setButtons([
                    { label: 'Lukk', variant: 'ghost', action: function(m){ m.close('button'); }, dismiss: false },
                    { label: 'Kjør på nytt', action: function(){ runSummarize(week); return false; }, dismiss: false },
                    { label: '💾 Lagre som notat', primary: true, action: function(m, btn){
                        btn.disabled = true;
                        return saveSummary(week, md).then(function(res2){
                            if (!res2.ok) {
                                alert('Kunne ikke lagre: ' + ((res2.j && res2.j.error) || 'feil'));
                                return false;
                            }
                            document.querySelectorAll('week-section').forEach(function(ws){
                                if (ws.getAttribute('week') === week && typeof ws.refresh === 'function') ws.refresh();
                            });
                        }, function(){ alert('Lagring feilet'); return false; });
                    } },
                ]);
            }, function(err){
                setSummaryBody(modal,
                    '<p style="color:var(--danger,#c53030)"><strong>Nettverksfeil:</strong> '
                    + escapeHtmlClient(err && err.message || err) + '</p>');
            });
        }

        function showSavedSummary(week) {
            var modal = ensureSummaryModal();
            modal.setTitle('Oppsummering &mdash; uke ' + escapeHtmlClient(week));
            setSummaryBody(modal, '<p style="color:var(--text-muted)">⏳ Henter lagret oppsummering &hellip;</p>');
            modal.setButtons([
                { label: 'Lukk', variant: 'ghost', action: function(m){ m.close('button'); }, dismiss: false },
            ]);
            modal.open();
            fetch('/api/notes/' + encodeURIComponent(week) + '/summarize.md/raw')
                .then(function(r){ return r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)); })
                .then(function(md){
                    setSummaryBody(modal, renderMarkdown(md));
                    modal.setButtons([
                        { label: 'Lukk', variant: 'ghost', action: function(m){ m.close('button'); }, dismiss: false },
                        { label: '✨ Kjør på nytt', action: function(){ runSummarize(week); return false; }, dismiss: false },
                    ]);
                }, function(err){
                    setSummaryBody(modal,
                        '<p style="color:var(--danger,#c53030)"><strong>Kunne ikke hente:</strong> '
                        + escapeHtmlClient(err && err.message || err) + '</p>');
                });
        }

        window.summarizeWeek = runSummarize;
        window.showWeekSummary = showSavedSummary;
        document.addEventListener('week-section:summarize', function(e){
            var w = e.detail && e.detail.week;
            if (w) runSummarize(w);
        });
        document.addEventListener('week-section:show-summary', function(e){
            var w = e.detail && e.detail.week;
            if (w) showSavedSummary(w);
        });

        document.addEventListener('task-completed:undo', function(e){
            var id = e.detail && e.detail.id;
            if (!id) return;
            e.preventDefault();
            var reg = window['week-note-services'];
            var svc = reg && reg.tasks_service;
            if (!svc || typeof svc.toggle !== 'function') return;
            Promise.resolve(svc.toggle(id)).then(function(){
                document.dispatchEvent(new CustomEvent('task:uncompleted', {
                    bubbles: true, detail: { id: id },
                }));
            });
        });

        window.openNoteViewModal = function(week, fileEnc) {
            if (!week || !fileEnc) return;
            var existing = document.querySelector('note-view[data-search-modal]');
            if (existing) existing.remove();
            var v = document.createElement('note-view');
            v.setAttribute('notes_service', 'week-note-services.notes_service');
            v.setAttribute('data-search-modal', '1');
            v.addEventListener('note-view:close', function(){
                try { v.remove(); } catch (_) {}
            });
            document.body.appendChild(v);
            if (typeof v.open === 'function') v.open(week + '/' + fileEnc);
            else v.setAttribute('path', week + '/' + fileEnc), v.setAttribute('open', '');
        };

        document.addEventListener('element-selected', function(e){
            var d = e.detail || {};
            var t = d.type, id = d.identifier || '';
            if (!t) return;
            e.preventDefault();
            if (typeof window.__closeGlobalSearch === 'function') window.__closeGlobalSearch();
            if (t === 'note') {
                var i = id.indexOf('/');
                if (i < 0) return;
                var week = id.slice(0, i), fileEnc = id.slice(i + 1);
                if (typeof window.openNoteViewModal === 'function') window.openNoteViewModal(week, fileEnc);
                else go('/editor/' + week + '/' + fileEnc);
            } else if (t === 'meeting') {
                go('/calendar#m-' + encodeURIComponent(id));
            } else if (t === 'person') {
                fetch('/api/companies').then(function(r){ return r.ok ? r.json() : []; }).then(function(companies){
                    var isCompany = (companies || []).some(function(c){ return c.key === id; });
                    if (isCompany) go('/people#tab=companies&key=' + encodeURIComponent(id));
                    else go('/people#p-' + encodeURIComponent(id));
                }).catch(function(){ go('/people#p-' + encodeURIComponent(id)); });
            } else if (t === 'task') {
                go('/tasks#t-' + encodeURIComponent(id));
            } else if (t === 'result') {
                go('/results#r-' + encodeURIComponent(id));
            }
        });
    })();

})();
