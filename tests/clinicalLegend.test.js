import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PEDIGREE_NOMENCLATURE_ITEMS } from '../src/domain/pedigreeNomenclature.js';

describe('Collapsible Clinical Legend & ACMG Pedigree Nomenclature', () => {
  it('contains comprehensive standard ACMG/NSGC symbols', () => {
    assert.ok(Array.isArray(PEDIGREE_NOMENCLATURE_ITEMS));
    assert.ok(PEDIGREE_NOMENCLATURE_ITEMS.length >= 10, 'Must have at least 10 core pedigree symbols');

    const ids = PEDIGREE_NOMENCLATURE_ITEMS.map((item) => item.id);
    assert.ok(ids.includes('male'), 'Must include male symbol');
    assert.ok(ids.includes('female'), 'Must include female symbol');
    assert.ok(ids.includes('unknown_sex'), 'Must include unknown sex symbol');
    assert.ok(ids.includes('affected'), 'Must include affected phenotype symbol');
    assert.ok(ids.includes('carrier_ar'), 'Must include heterozygous carrier symbol');
    assert.ok(ids.includes('mutation_dot'), 'Must include confirmed variant mutation dot');
    assert.ok(ids.includes('proband'), 'Must include proband arrow symbol');
    assert.ok(ids.includes('consanguinity'), 'Must include consanguinity double-line symbol');
    assert.ok(ids.includes('twin_mz'), 'Must include monozygotic twins symbol');
    assert.ok(ids.includes('twin_dz'), 'Must include dizygotic twins symbol');
  });

  it('validates each symbol has complete clinical interpretation and description', () => {
    PEDIGREE_NOMENCLATURE_ITEMS.forEach((item) => {
      assert.ok(item.id, 'Item must have an id');
      assert.ok(item.title, `Item ${item.id} must have a title`);
      assert.ok(item.category, `Item ${item.id} must have a category`);
      assert.ok(item.description && item.description.length > 5, `Item ${item.id} must have a descriptive text`);
      assert.ok(
        item.clinicalInterpretation && item.clinicalInterpretation.length > 10,
        `Item ${item.id} must have detailed clinical interpretation guidance`
      );
    });
  });

  it('strictly distinguishes affected status from heterozygous carrier status in clinical interpretation', () => {
    const affectedItem = PEDIGREE_NOMENCLATURE_ITEMS.find((it) => it.id === 'affected');
    const carrierItem = PEDIGREE_NOMENCLATURE_ITEMS.find((it) => it.id === 'carrier_ar');

    assert.ok(affectedItem, 'Affected item must exist');
    assert.ok(carrierItem, 'Carrier item must exist');

    assert.notEqual(affectedItem.type, carrierItem.type);
    assert.ok(affectedItem.description.includes('پر بودن کامل') || affectedItem.symbolLabel.includes('توپر'));
    assert.ok(carrierItem.description.includes('نیمه') || carrierItem.symbolLabel.includes('نیمه‌پر'));

    // Check clinical distinction
    assert.ok(
      affectedItem.clinicalInterpretation.includes('ناقل') ||
      affectedItem.clinicalInterpretation.includes('اشتباه'),
      'Affected interpretation must caution against confusing affected with carrier'
    );
    assert.ok(
      carrierItem.clinicalInterpretation.includes('فاقد علائم بالینی') ||
      carrierItem.clinicalInterpretation.includes('علائم'),
      'Carrier interpretation must emphasize lack of symptoms in AR carrier'
    );
  });

  it('provides precise clinical interpretation for consanguinity regarding inbreeding coefficient', () => {
    const consang = PEDIGREE_NOMENCLATURE_ITEMS.find((it) => it.id === 'consanguinity');
    assert.ok(consang, 'Consanguinity item must exist');
    assert.ok(
      consang.clinicalInterpretation.includes('همخونی') ||
      consang.clinicalInterpretation.includes('Inbreeding') ||
      consang.clinicalInterpretation.includes('مغلوب'),
      'Consanguinity must document inbreeding coefficient and recessive disease risk'
    );
  });
});
