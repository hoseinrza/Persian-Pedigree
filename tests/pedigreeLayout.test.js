import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computePedigreeLayout } from '../src/pedigreeLayout.js';

describe('Pedigree Layout Engine Edge Cases', () => {
  it('handles empty pedigree without crashing', () => {
    const layout = computePedigreeLayout({ people: {} });
    assert.deepEqual(layout.nodes, {});
    assert.deepEqual(layout.connectors.mating, []);
    assert.deepEqual(layout.connectors.sibship, []);
    assert.equal(layout.bounds.width, 0);
    assert.equal(layout.bounds.height, 0);
  });

  it('handles a single isolated individual', () => {
    const layout = computePedigreeLayout({
      people: {
        p1: { id: 'p1', name: 'تنها', sex: 'male', spouseIds: [], childIds: [] },
      },
    });
    assert.ok(layout.nodes.p1);
    assert.equal(typeof layout.nodes.p1.x, 'number');
    assert.equal(typeof layout.nodes.p1.y, 'number');
    assert.equal(layout.connectors.mating.length, 0);
  });

  it('correctly creates double mating line for consanguineous couples', () => {
    // First cousins marriage
    const people = {
      gf: { id: 'gf', sex: 'male', spouseIds: ['gm'], childIds: ['f1', 'f2'] },
      gm: { id: 'gm', sex: 'female', spouseIds: ['gf'], childIds: ['f1', 'f2'] },
      f1: { id: 'f1', sex: 'male', fatherId: 'gf', motherId: 'gm', spouseIds: ['sp1'], childIds: ['c1'] },
      sp1: { id: 'sp1', sex: 'female', spouseIds: ['f1'], childIds: ['c1'] },
      f2: { id: 'f2', sex: 'female', fatherId: 'gf', motherId: 'gm', spouseIds: ['sp2'], childIds: ['c2'] },
      sp2: { id: 'sp2', sex: 'male', spouseIds: ['f2'], childIds: ['c2'] },
      c1: { id: 'c1', sex: 'male', fatherId: 'f1', motherId: 'sp1', spouseIds: ['c2'], childIds: [] },
      c2: { id: 'c2', sex: 'female', fatherId: 'sp2', motherId: 'f2', spouseIds: ['c1'], childIds: [] },
    };

    const layout = computePedigreeLayout({ people });
    const cousinMating = layout.connectors.mating.find(
      (m) => Array.isArray(m.parents) && m.parents.includes('c1') && m.parents.includes('c2')
    );
    assert.ok(cousinMating, 'Expected mating connector between cousins');
    assert.equal(cousinMating.consanguineous, true);
  });

  it('handles multi-spouse layout and positions children with correct mother/father', () => {
    const people = {
      husband: { id: 'husband', sex: 'male', spouseIds: ['wife1', 'wife2'], childIds: ['ch1', 'ch2'] },
      wife1: { id: 'wife1', sex: 'female', spouseIds: ['husband'], childIds: ['ch1'] },
      wife2: { id: 'wife2', sex: 'female', spouseIds: ['husband'], childIds: ['ch2'] },
      ch1: { id: 'ch1', sex: 'male', fatherId: 'husband', motherId: 'wife1', spouseIds: [], childIds: [] },
      ch2: { id: 'ch2', sex: 'female', fatherId: 'husband', motherId: 'wife2', spouseIds: [], childIds: [] },
    };

    const layout = computePedigreeLayout({ people });
    assert.equal(layout.connectors.mating.length, 2);
    assert.ok(layout.nodes.ch1);
    assert.ok(layout.nodes.ch2);
  });

  it('renders twin bars for MZ twins and apex markers for unknown zygosity', () => {
    const people = {
      f: { id: 'f', sex: 'male', spouseIds: ['m'], childIds: ['tw1', 'tw2', 'tw3', 'tw4'] },
      m: { id: 'm', sex: 'female', spouseIds: ['f'], childIds: ['tw1', 'tw2', 'tw3', 'tw4'] },
      tw1: { id: 'tw1', sex: 'male', fatherId: 'f', motherId: 'm', twinType: 'identical', twinGroupId: 'tg_mz' },
      tw2: { id: 'tw2', sex: 'male', fatherId: 'f', motherId: 'm', twinType: 'identical', twinGroupId: 'tg_mz' },
      tw3: { id: 'tw3', sex: 'male', fatherId: 'f', motherId: 'm', twinType: 'unknown', twinGroupId: 'tg_unk' },
      tw4: { id: 'tw4', sex: 'female', fatherId: 'f', motherId: 'm', twinType: 'unknown', twinGroupId: 'tg_unk' },
    };

    const layout = computePedigreeLayout({ people });
    assert.ok(layout.connectors.twinBars.length >= 1, 'Expected at least 1 horizontal twin bar for MZ twins');
    assert.ok(layout.connectors.twinMarks.length >= 1, 'Expected at least 1 unknown zygosity mark (?)');
  });
});
