import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computePedigreeLayout } from '../src/pedigreeLayout.js';

/**
 * Generates a synthetic pedigree of approximately targetSize nodes
 * with realistic nuclear families, multiple generations, and sibling groups.
 */
function generateSyntheticPedigree(targetSize) {
  const people = {};
  let count = 0;

  // Root generation
  const rootM = `p_root_m`;
  const rootF = `p_root_f`;
  people[rootM] = { id: rootM, name: 'Root Male', sex: 'male', spouseIds: [rootF], childIds: [] };
  people[rootF] = { id: rootF, name: 'Root Female', sex: 'female', spouseIds: [rootM], childIds: [] };
  count += 2;

  let activeParents = [{ m: rootM, f: rootF }];
  let gen = 1;

  while (count < targetSize && activeParents.length > 0) {
    const nextParents = [];
    for (const couple of activeParents) {
      if (count >= targetSize) break;
      const numChildren = Math.min(4, targetSize - count);
      for (let c = 0; c < numChildren; c++) {
        const cId = `p_g${gen}_c${count}`;
        const isMale = c % 2 === 0;
        const sId = `p_g${gen}_s${count}`;

        people[cId] = {
          id: cId,
          name: `Gen ${gen} #${count}`,
          sex: isMale ? 'male' : 'female',
          fatherId: couple.m,
          motherId: couple.f,
          spouseIds: [sId],
          childIds: [],
        };
        people[couple.m].childIds.push(cId);
        people[couple.f].childIds.push(cId);
        count++;

        if (count < targetSize) {
          people[sId] = {
            id: sId,
            name: `Spouse ${gen} #${count}`,
            sex: isMale ? 'female' : 'male',
            spouseIds: [cId],
            childIds: [],
          };
          count++;
          nextParents.push({
            m: isMale ? cId : sId,
            f: isMale ? sId : cId,
          });
        }
      }
    }
    activeParents = nextParents.slice(0, 8); // control exponential branching width
    gen++;
  }

  return { people, actualSize: Object.keys(people).length, generations: gen };
}

describe('Pedigree Layout Performance Benchmark', () => {
  it('benchmarks layout engine at ~100 individuals', () => {
    const { people, actualSize } = generateSyntheticPedigree(100);
    assert.ok(actualSize >= 80, `Expected ~100 nodes, got ${actualSize}`);

    const start = performance.now();
    const layout = computePedigreeLayout({ people });
    const duration = performance.now() - start;

    console.log(`[BENCHMARK] Size: ${actualSize} nodes | Layout Time: ${duration.toFixed(2)} ms | Connectors: ${layout.connectors.mating.length + layout.connectors.sibship.length}`);
    assert.ok(duration < 200, `Layout for ~100 nodes took ${duration} ms (threshold: 200ms)`);
    assert.ok(layout.bounds.width > 0);
    assert.ok(layout.bounds.height > 0);
  });

  it('benchmarks layout engine at ~500 individuals', () => {
    const { people, actualSize } = generateSyntheticPedigree(500);
    assert.ok(actualSize >= 400, `Expected ~500 nodes, got ${actualSize}`);

    const start = performance.now();
    const layout = computePedigreeLayout({ people });
    const duration = performance.now() - start;

    console.log(`[BENCHMARK] Size: ${actualSize} nodes | Layout Time: ${duration.toFixed(2)} ms | Connectors: ${layout.connectors.mating.length + layout.connectors.sibship.length}`);
    assert.ok(duration < 1000, `Layout for ~500 nodes took ${duration} ms (threshold: 1000ms)`);
    assert.ok(layout.bounds.width > 0);
  });

  it('benchmarks layout engine at ~1000 individuals', () => {
    const { people, actualSize } = generateSyntheticPedigree(1000);
    assert.ok(actualSize >= 800, `Expected ~1000 nodes, got ${actualSize}`);

    const start = performance.now();
    const layout = computePedigreeLayout({ people });
    const duration = performance.now() - start;

    console.log(`[BENCHMARK] Size: ${actualSize} nodes | Layout Time: ${duration.toFixed(2)} ms | Connectors: ${layout.connectors.mating.length + layout.connectors.sibship.length}`);
    assert.ok(duration < 3000, `Layout for ~1000 nodes took ${duration} ms (threshold: 3000ms)`);
    assert.ok(layout.bounds.width > 0);
  });
});
