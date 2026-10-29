import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Format CSV rows with standard RFC 4180 escaping and UTF-8 BOM
 */
export function formatPedigreeCSV(people) {
  const headers = [
    'SAMPLE_ID', 'CASE_NAME', 'SEX', 'AFFECTED', 'CARRIER', 'DECEASED',
    'MUTATION', 'ONSET_AGE', 'DEATH_AGE', 'ZYGOSITY', 'MOTHER_ID', 'FATHER_ID', 'SPOUSES', 'CHILDREN'
  ];

  const rows = [
    headers,
    ...people.map((p) => [
      p.id,
      p.name || '',
      p.sex || 'unknown',
      !!p.affected,
      !!p.carrier,
      !!p.deceased,
      !!p.hasMutation,
      p.diseaseOnsetAge ?? '',
      p.deathAge ?? '',
      p.twinType || 'none',
      p.motherId || '',
      p.fatherId || '',
      (p.spouseIds || []).join(';'),
      (p.childIds || []).join(';'),
    ]),
  ];

  const csvBody = rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
  return '\uFEFF' + csvBody;
}

describe('Pedigree Export Service', () => {
  it('formats CSV with RFC 4180 escaping, quote doubling, and UTF-8 BOM', () => {
    const people = [
      {
        id: 'p1',
        name: 'علی "پژوهشگر", فرزند اول',
        sex: 'male',
        affected: true,
        carrier: false,
        spouseIds: ['sp1', 'sp2'],
        childIds: ['c1'],
      },
    ];

    const csv = formatPedigreeCSV(people);
    assert.ok(csv.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM for Persian Excel support');
    assert.ok(csv.includes('"علی ""پژوهشگر"", فرزند اول"'), 'Quotes must be doubled inside fields');
    assert.ok(csv.includes('"sp1;sp2"'));
  });
});
