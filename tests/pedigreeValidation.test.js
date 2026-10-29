import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePedigreeData,
  wouldCreateCycle,
  detectAncestryCycles,
  sanitizeAndRepairPedigree,
} from '../src/domain/pedigreeValidation.js';

describe('Pedigree Validation & Integrity Layer', () => {
  it('detects direct ancestry cycles (parent of self or loop in ancestry)', () => {
    const people = {
      p1: { id: 'p1', name: 'الف', fatherId: 'p2', childIds: [] },
      p2: { id: 'p2', name: 'ب', fatherId: 'p3', childIds: ['p1'] },
      p3: { id: 'p3', name: 'ج', fatherId: 'p1', childIds: ['p2'] }, // Cycle: p1 -> p2 -> p3 -> p1
    };

    const errors = detectAncestryCycles(people);
    assert.ok(errors.length > 0);
    assert.match(errors[0], /حلقه شجره‌نامه‌ای غیرممکن/);

    const validation = validatePedigreeData({ people });
    assert.equal(validation.isValid, false);
    assert.ok(validation.errors.some((e) => e.includes('حلقه')));
  });

  it('prevents cycle creation ahead of time using wouldCreateCycle', () => {
    const people = {
      p1: { id: 'p1', fatherId: 'p2' },
      p2: { id: 'p2', fatherId: 'p3' },
      p3: { id: 'p3' },
    };

    // p1 is child of p2 who is child of p3.
    // If we make p1 the father of p3, that creates a cycle:
    assert.equal(wouldCreateCycle('p1', 'p3', people), true);

    // Making an unrelated node a father of p3 does not create a cycle:
    people['p4'] = { id: 'p4' };
    assert.equal(wouldCreateCycle('p4', 'p3', people), false);
  });

  it('detects biological sex conflicts in identical (MZ) twins', () => {
    const people = {
      tw1: { id: 'tw1', name: 'قل یک', sex: 'male', twinType: 'identical', twinGroupId: 'tg1' },
      tw2: { id: 'tw2', name: 'قل دو', sex: 'female', twinType: 'identical', twinGroupId: 'tg1' },
    };

    const validation = validatePedigreeData({ people });
    assert.equal(validation.isValid, false);
    assert.ok(validation.errors.some((e) => e.includes('تک‌تخمی همسان')));
  });

  it('validates and preserves valid complex pedigrees (multi-spouses, consanguinity, twins)', () => {
    const people = {
      f: { id: 'f', sex: 'male', spouseIds: ['m1', 'm2'], childIds: ['c1', 'c2'] },
      m1: { id: 'm1', sex: 'female', spouseIds: ['f'], childIds: ['c1'] },
      m2: { id: 'm2', sex: 'female', spouseIds: ['f'], childIds: ['c2'] },
      c1: { id: 'c1', sex: 'male', fatherId: 'f', motherId: 'm1', spouseIds: ['c2'], childIds: [] },
      c2: { id: 'c2', sex: 'female', fatherId: 'f', motherId: 'm2', spouseIds: ['c1'], childIds: [] },
    };

    const validation = validatePedigreeData({ people });
    assert.equal(validation.isValid, true);
    assert.equal(validation.errors.length, 0);
  });

  it('repairs missing reciprocal links without corrupting relationships', () => {
    const uncalibrated = {
      people: {
        husband: { id: 'husband', sex: 'male', spouseIds: ['wife'], childIds: [] },
        wife: { id: 'wife', sex: 'female', spouseIds: [], childIds: ['child1'] }, // missing husband in spouseIds
        child1: { id: 'child1', sex: 'male', motherId: 'wife', spouseIds: [], childIds: [] },
      },
    };

    const { sanitizedData, repairedCount, repairLog } = sanitizeAndRepairPedigree(uncalibrated);
    assert.ok(repairedCount > 0);
    assert.ok(repairLog.length > 0);
    // Wife now has husband in spouseIds
    assert.ok(sanitizedData.people.wife.spouseIds.includes('husband'));
    // Child is listed in wife's childIds
    assert.ok(sanitizedData.people.wife.childIds.includes('child1'));
  });

  it('rejects malformed non-object imports gracefully', () => {
    const nullValidation = validatePedigreeData(null);
    assert.equal(nullValidation.isValid, false);

    const stringValidation = validatePedigreeData('{"bad": true}');
    assert.equal(stringValidation.isValid, false);
  });
});
