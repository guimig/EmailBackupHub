/* Per-browser report discovery and favorites; never stores report rows or email content. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const KEY = 'emailbackuphub:catalog:v1';
  const MAX_TRACKED = 3000;

  function validSlug(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);
  }

  function safeSlugs(values) {
    return [...new Set((Array.isArray(values) ? values : [])
      .filter(validSlug))].slice(-MAX_TRACKED);
  }

  function emptyState(slugs) {
    return { version: VERSION, seen: safeSlugs(slugs), unread: [], favorites: [] };
  }

  function read(storage, currentSlugs) {
    const current = safeSlugs(currentSlugs);
    if (!storage) return { state: emptyState(current), available: false, message: 'Preferências disponíveis apenas durante esta visita.' };
    try {
      const raw = storage.getItem(KEY);
      if (!raw) {
        const initial = emptyState(current);
        storage.setItem(KEY, JSON.stringify(initial));
        return { state: initial, available: true, message: '' };
      }
      const input = JSON.parse(raw);
      if (!input || input.version !== VERSION || !Array.isArray(input.seen)
        || !Array.isArray(input.unread) || !Array.isArray(input.favorites)) {
        return { state: emptyState(current), available: false, message: 'Preferências anteriores incompatíveis; foram preservadas.' };
      }
      const seen = safeSlugs(input.seen);
      const favorites = safeSlugs(input.favorites);
      const added = current.filter(slug => !seen.includes(slug));
      const active = new Set(current);
      const unread = safeSlugs([...input.unread.filter(slug => active.has(slug)), ...added]);
      const missing = seen.filter(slug => !active.has(slug));
      const state = { version: VERSION, seen: safeSlugs([...seen, ...current]), unread, favorites };
      storage.setItem(KEY, JSON.stringify(state));
      return { state, available: true, message: '', missing };
    } catch {
      return { state: emptyState(current), available: false, message: 'Não foi possível acessar as preferências deste navegador.' };
    }
  }

  function persist(storage, state) {
    if (!storage) return false;
    try {
      storage.setItem(KEY, JSON.stringify({
        version: VERSION,
        seen: safeSlugs(state.seen),
        unread: safeSlugs(state.unread),
        favorites: safeSlugs(state.favorites)
      }));
      return true;
    } catch { return false; }
  }

  function toggleFavorite(state, slug) {
    if (!validSlug(slug)) return state;
    const favorites = new Set(safeSlugs(state.favorites));
    if (favorites.has(slug)) favorites.delete(slug);
    else favorites.add(slug);
    return { ...state, favorites: safeSlugs([...favorites]) };
  }

  function acknowledge(state) {
    return { ...state, unread: [] };
  }

  function filterByScope(reports, scope, state) {
    if (scope !== 'favorites' && scope !== 'new') return reports;
    const selected = new Set(scope === 'favorites' ? state.favorites : state.unread);
    return reports.filter(report => selected.has(report.slug));
  }

  const api = { KEY, VERSION, validSlug, safeSlugs, read, persist, toggleFavorite, acknowledge, filterByScope };
  root.EmailBackupHubCatalog = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
