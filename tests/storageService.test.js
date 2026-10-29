import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  saveCaseLocally,
  loadCaseLocally,
  listSavedCases,
  deleteCaseLocally,
} from '../src/services/storageService.js';

// Polyfill in-memory localStorage for node test runner
const memoryStore = new Map();
globalThis.localStorage = {
  getItem: (key) => (memoryStore.has(key) ? memoryStore.get(key) : null),
  setItem: (key, val) => memoryStore.set(key, String(val)),
  removeItem: (key) => memoryStore.delete(key),
  clear: () => memoryStore.clear(),
};

describe('Storage Service (Local Persistence & Privacy)', () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it('saves and loads a pedigree case with schema versioning and metadata', () => {
    const testData = {
      people: {
        p1: { id: 'p1', name: 'کیس آزمایشی', sex: 'female', spouseIds: [], childIds: [] },
      },
    };

    const saveRes = saveCaseLocally('CASE-001', testData, 'پرونده ژنتیکی خانواده الف');
    assert.equal(saveRes.success, true);

    const loadRes = loadCaseLocally('CASE-001');
    assert.equal(loadRes.success, true);
    assert.ok(loadRes.data);
    assert.equal(loadRes.data.schemaVersion, 2);
    assert.equal(loadRes.data.people.p1.name, 'کیس آزمایشی');
    assert.equal(loadRes.data.metadata.title, 'پرونده ژنتیکی خانواده الف');
  });

  it('updates case index and lists saved cases', () => {
    saveCaseLocally('CASE-10', { people: {} }, 'مورد ۱۰');
    saveCaseLocally('CASE-20', { people: { a: { id: 'a' } } }, 'مورد ۲۰');

    const cases = listSavedCases();
    assert.equal(cases.length, 2);
    assert.equal(cases[0].id, 'CASE-20');
    assert.equal(cases[1].id, 'CASE-10');
  });

  it('deletes a case and updates index', () => {
    saveCaseLocally('CASE-DEL', { people: {} }, 'حذف‌شدنی');
    assert.equal(listSavedCases().length, 1);

    deleteCaseLocally('CASE-DEL');
    assert.equal(listSavedCases().length, 0);

    const loadRes = loadCaseLocally('CASE-DEL');
    assert.equal(loadRes.success, false);
  });
});
