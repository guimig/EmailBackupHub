'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Catalog = require('../assets/js/report-catalog.js');

function localStorageFixture() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    values
  };
}

test('first catalog visit establishes baseline without labeling all reports as new', () => {
  const storage = localStorageFixture();
  const result = Catalog.read(storage, ['relatorio-a', 'relatorio-b']);
  assert.equal(result.available, true);
  assert.deepEqual(result.state.seen, ['relatorio-a', 'relatorio-b']);
  assert.deepEqual(result.state.unread, []);
  assert.ok(storage.getItem(Catalog.KEY));
});

test('future reports are detected automatically from the index and persist until acknowledged', () => {
  const storage = localStorageFixture();
  Catalog.read(storage, ['relatorio-a']);
  const next = Catalog.read(storage, ['relatorio-a', 'relatorio-b', 'relatorio-c']);
  assert.deepEqual(next.state.unread, ['relatorio-b', 'relatorio-c']);
  assert.deepEqual(Catalog.read(storage, ['relatorio-a', 'relatorio-b', 'relatorio-c']).state.unread,
    ['relatorio-b', 'relatorio-c']);
  assert.ok(Catalog.persist(storage, Catalog.acknowledge(next.state)));
  assert.deepEqual(Catalog.read(storage, ['relatorio-a', 'relatorio-b', 'relatorio-c']).state.unread, []);
  assert.deepEqual(Catalog.read(storage, ['relatorio-a', 'relatorio-b', 'relatorio-c', 'novo-gerado-por-email']).state.unread,
    ['novo-gerado-por-email']);
});

test('favorites apply generically to any slug, do not affect report order', () => {
  const storage = localStorageFixture();
  const state = Catalog.read(storage, ['rap', 'novo-relatorio', 'gru']).state;
  const next = Catalog.toggleFavorite(state, 'novo-relatorio');
  assert.deepEqual(next.favorites, ['novo-relatorio']);
  assert.ok(Catalog.persist(storage, next));
  assert.deepEqual(Catalog.read(storage, ['rap', 'novo-relatorio', 'gru']).state.favorites, ['novo-relatorio']);
  const reports = [{ slug: 'rap' }, { slug: 'novo-relatorio' }, { slug: 'gru' }];
  assert.deepEqual(Catalog.filterByScope(reports, 'favorites', next), [reports[1]]);
  assert.deepEqual(Catalog.filterByScope(reports, 'all', next), reports);
  assert.deepEqual(Catalog.filterByScope(reports, 'new', next), []);
  assert.deepEqual(Catalog.toggleFavorite(next, 'novo-relatorio').favorites, []);
});

test('invalid slugs are skipped without code changes or unsafe local paths', () => {
  const storage = localStorageFixture();
  const state = Catalog.read(storage, ['relatorio-a', '../invalido', 'javascript:alert']).state;
  assert.deepEqual(state.seen, ['relatorio-a']);
  assert.equal(Catalog.validSlug('relatorio-futuro-2027'), true);
  assert.equal(Catalog.validSlug('../invalido'), false);
  assert.equal(Catalog.toggleFavorite(state, 'javascript:alert').favorites.length, 0);
});

test('corrupted storage is preserved and private browsing produces usable in-memory state', () => {
  const storage = localStorageFixture();
  storage.setItem(Catalog.KEY, '{bad json');
  const result = Catalog.read(storage, ['novo-relatorio']);
  assert.equal(result.available, false);
  assert.equal(storage.getItem(Catalog.KEY), '{bad json');
  const blocked = { getItem() { throw Error('SecurityError'); }, setItem() { throw Error('QuotaError'); } };
  assert.equal(Catalog.read(blocked, ['novo-relatorio']).available, false);
  assert.equal(Catalog.persist(blocked, result.state), false);
  const temporary = Catalog.read(null, ['novo-relatorio']);
  assert.equal(temporary.available, false);
  assert.deepEqual(temporary.state.seen, ['novo-relatorio']);
});
