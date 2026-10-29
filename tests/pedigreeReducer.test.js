import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pedigreeReducer,
  historyReducer,
  INITIAL_STATE,
} from '../src/state/pedigreeReducer.js';

describe('Pedigree State Reducer & History', () => {
  it('adds a person cleanly into the people record', () => {
    const s0 = { ...INITIAL_STATE, data: { people: {} } };
    const s1 = pedigreeReducer(s0, { type: 'ADD_PERSON', id: 'p1', name: 'سارا', sex: 'female' });

    assert.ok(s1.data.people.p1);
    assert.equal(s1.data.people.p1.name, 'سارا');
    assert.equal(s1.data.people.p1.sex, 'female');
    assert.equal(s1.selectedId, 'p1');
  });

  it('cascades deletion and unlinks spouses, children, and parent references', () => {
    const initialData = {
      people: {
        f: { id: 'f', sex: 'male', spouseIds: ['m'], childIds: ['c'] },
        m: { id: 'm', sex: 'female', spouseIds: ['f'], childIds: ['c'] },
        c: { id: 'c', sex: 'male', fatherId: 'f', motherId: 'm', spouseIds: [], childIds: [] },
      },
    };
    const s0 = { ...INITIAL_STATE, data: initialData };
    const s1 = pedigreeReducer(s0, { type: 'DELETE', id: 'f' });

    assert.equal(s1.data.people.f, undefined);
    assert.deepEqual(s1.data.people.m.spouseIds, []);
    assert.equal(s1.data.people.c.fatherId, null);
    assert.equal(s1.data.people.c.motherId, 'm');
  });

  it('handles undo and redo correctly across multiple actions', () => {
    let hist = { past: [], present: { ...INITIAL_STATE, data: { people: {} } }, future: [] };

    // Action 1: Add Person A
    hist = historyReducer(hist, { type: 'ADD_PERSON', id: 'a', name: 'الف' });
    assert.equal(hist.past.length, 1);
    assert.ok(hist.present.data.people.a);

    // Action 2: Add Person B
    hist = historyReducer(hist, { type: 'ADD_PERSON', id: 'b', name: 'ب' });
    assert.equal(hist.past.length, 2);
    assert.ok(hist.present.data.people.b);

    // Undo: Should revert to only Person A
    hist = historyReducer(hist, { type: 'UNDO' });
    assert.equal(hist.past.length, 1);
    assert.equal(hist.future.length, 1);
    assert.ok(hist.present.data.people.a);
    assert.equal(hist.present.data.people.b, undefined);

    // Redo: Should restore Person B
    hist = historyReducer(hist, { type: 'REDO' });
    assert.equal(hist.past.length, 2);
    assert.equal(hist.future.length, 0);
    assert.ok(hist.present.data.people.b);
  });

  it('does not pollute history stack when panning or zooming', () => {
    let hist = { past: [], present: { ...INITIAL_STATE, zoom: 1, offset: { x: 0, y: 0 } }, future: [] };

    hist = historyReducer(hist, { type: 'ZOOM', factor: 1.2 });
    hist = historyReducer(hist, { type: 'PAN', dx: 50, dy: 50 });

    assert.equal(hist.past.length, 0);
    assert.equal(hist.future.length, 0);
    assert.equal(hist.present.zoom, 1.2);
    assert.deepEqual(hist.present.offset, { x: 50, y: 50 });
  });

  it('preserves existing case and sets error message on invalid LOAD', () => {
    const s0 = { ...INITIAL_STATE, data: { people: { test: { id: 'test', name: 'موجود' } } } };
    const s1 = pedigreeReducer(s0, { type: 'LOAD', data: null });

    assert.ok(s1.data.people.test);
    assert.ok(s1.lastError);
  });
});
