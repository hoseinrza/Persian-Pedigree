import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGeneticRisk,
  INHERITANCE_MODELS,
  RISK_STATUS,
  CLINICAL_DISCLAIMER_FA,
} from '../src/domain/geneticRisk.js';

describe('Genetic Risk Domain Engine (Mendelian Educational Engine)', () => {
  it('correctly distinguishes affected status from asymptomatic carrier status in AR', () => {
    const data = {
      people: {
        p1: { id: 'p1', name: 'کیس مبتلا', affected: true, sex: 'female', childIds: [] },
      },
    };
    const res = calculateGeneticRisk(data.people.p1, data, INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE);
    assert.equal(res.status, RISK_STATUS.AFFECTED);
    assert.equal(res.isAffected, true);
    // Should NOT report 100% carrier risk for an affected homozygous person
    assert.equal(res.probability, 0.0);
    assert.match(res.probabilityDisplay, /مبتلا/);
    assert.equal(res.isClinical, false);
    assert.equal(res.disclaimer, CLINICAL_DISCLAIMER_FA);
  });

  it('determines parents of an affected child are obligate carriers (100%)', () => {
    const data = {
      people: {
        f: { id: 'f', name: 'پدر', sex: 'male', childIds: ['c1'], spouseIds: ['m'] },
        m: { id: 'm', name: 'مادر', sex: 'female', childIds: ['c1'], spouseIds: ['f'] },
        c1: { id: 'c1', name: 'فرزند مبتلا', sex: 'male', affected: true, fatherId: 'f', motherId: 'm', childIds: [] },
      },
    };
    const fatherRisk = calculateGeneticRisk(data.people.f, data, INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE);
    assert.equal(fatherRisk.status, RISK_STATUS.OBLIGATE_CARRIER);
    assert.equal(fatherRisk.probability, 1.0);
    assert.match(fatherRisk.reason, /ناقل اجباری/);

    const motherRisk = calculateGeneticRisk(data.people.m, data, INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE);
    assert.equal(motherRisk.status, RISK_STATUS.OBLIGATE_CARRIER);
    assert.equal(motherRisk.probability, 1.0);
  });

  it('computes 2/3 (66.7%) Bayesian conditional probability for unaffected sibling of affected child', () => {
    const data = {
      people: {
        f: { id: 'f', name: 'پدر', sex: 'male', childIds: ['c1', 'c2'], spouseIds: ['m'] },
        m: { id: 'm', name: 'مادر', sex: 'female', childIds: ['c1', 'c2'], spouseIds: ['f'] },
        c1: { id: 'c1', name: 'فرزند اول (مبتلا)', sex: 'male', affected: true, fatherId: 'f', motherId: 'm', childIds: [] },
        c2: { id: 'c2', name: 'فرزند دوم (سالم)', sex: 'female', affected: false, fatherId: 'f', motherId: 'm', childIds: [] },
      },
    };
    const siblingRisk = calculateGeneticRisk(data.people.c2, data, INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE);
    assert.equal(siblingRisk.status, RISK_STATUS.CONDITIONAL_CARRIER);
    assert.ok(Math.abs(siblingRisk.probability - (2 / 3)) < 0.001);
    assert.match(siblingRisk.probabilityDisplay, /۶۶\.۷٪/);
  });

  it('identifies unaffected child of an affected parent as an obligate carrier (100%)', () => {
    const data = {
      people: {
        f: { id: 'f', name: 'پدر مبتلا', sex: 'male', affected: true, childIds: ['c1'] },
        m: { id: 'm', name: 'مادر سالم', sex: 'female', childIds: ['c1'] },
        c1: { id: 'c1', name: 'فرزند سالم', sex: 'female', affected: false, fatherId: 'f', motherId: 'm', childIds: [] },
      },
    };
    const childRisk = calculateGeneticRisk(data.people.c1, data, INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE);
    assert.equal(childRisk.status, RISK_STATUS.OBLIGATE_CARRIER);
    assert.equal(childRisk.probability, 1.0);
    assert.match(childRisk.probabilityDisplay, /۱۰۰٪/);
  });

  it('does NOT assign an arbitrary 5% baseline risk when pedigree is uninformative', () => {
    const data = {
      people: {
        p: { id: 'p', name: 'فرد تصادفی بدون سابقه', sex: 'female', spouseIds: [], childIds: [] },
      },
    };
    const risk = calculateGeneticRisk(data.people.p, data, INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE);
    assert.equal(risk.status, RISK_STATUS.INSUFFICIENT_DATA);
    assert.equal(risk.probability, null);
    assert.match(risk.probabilityDisplay, /اطلاعات ناکافی/);
    assert.notEqual(risk.probability, 0.05);
  });

  it('correctly handles X-linked recessive father-to-daughter transmission (100% carrier)', () => {
    const data = {
      people: {
        f: { id: 'f', name: 'پدر همی‌زیگوت مبتلا', sex: 'male', affected: true, childIds: ['d1'] },
        m: { id: 'm', name: 'مادر', sex: 'female', childIds: ['d1'] },
        d1: { id: 'd1', name: 'دختر', sex: 'female', fatherId: 'f', motherId: 'm', childIds: [] },
      },
    };
    const daughterRisk = calculateGeneticRisk(data.people.d1, data, INHERITANCE_MODELS.X_LINKED_RECESSIVE);
    assert.equal(daughterRisk.status, RISK_STATUS.OBLIGATE_CARRIER);
    assert.equal(daughterRisk.probability, 1.0);
    assert.match(daughterRisk.reason, /کروموزوم X/);
  });

  it('includes explicit non-diagnostic educational disclaimers on every calculation', () => {
    const data = { people: { p: { id: 'p', name: 'تست' } } };
    const res = calculateGeneticRisk(data.people.p, data);
    assert.equal(res.isClinical, false);
    assert.ok(res.disclaimer.includes('آموزشی'));
  });
});
