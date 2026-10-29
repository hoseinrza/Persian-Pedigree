/**
 * @file geneticRisk.js
 * @description Educational Mendelian Genetic Risk Calculation Engine
 * 
 * IMPORTANT SCIENTIFIC DISCLAIMER:
 * This calculation module is strictly for educational and illustrative purposes
 * based on idealized Mendelian genetics assumptions. It is NOT clinically validated,
 * NOT diagnostic, and must never replace certified clinical genetic counseling or
 * molecular diagnostic testing.
 */

export const INHERITANCE_MODELS = {
  AUTOSOMAL_RECESSIVE: 'AUTOSOMAL_RECESSIVE',
  AUTOSOMAL_DOMINANT: 'AUTOSOMAL_DOMINANT',
  X_LINKED_RECESSIVE: 'X_LINKED_RECESSIVE',
};

export const RISK_STATUS = {
  AFFECTED: 'affected',
  OBLIGATE_CARRIER: 'obligate_carrier',
  CONDITIONAL_CARRIER: 'conditional_carrier',
  INSUFFICIENT_DATA: 'insufficient_data',
  NON_CARRIER: 'non_carrier',
};

export const CLINICAL_DISCLAIMER_FA = 
  'این محاسبات صرفاً جنبه آموزشی و مدل‌سازی ریاضی داشته و نباید به عنوان تشخیص پزشکی، غربالگری یا جایگزین مشاوره ژنتیک بالینی مورد استفاده قرار گیرد.';

export const CLINICAL_DISCLAIMER_EN = 
  'These calculations are for educational and mathematical modeling purposes only and must not be used as medical diagnosis or as a substitute for professional clinical genetic counseling.';

/**
 * Evaluates carrier and recurrence risk for an individual within a pedigree
 * under an explicit inheritance model (default: Autosomal Recessive).
 * 
 * @param {Object} person The individual to evaluate
 * @param {Object} pedigreeData The full pedigree data containing { people }
 * @param {string} model Inheritance model from INHERITANCE_MODELS
 * @returns {Object} Structured scientific risk assessment
 */
export function calculateGeneticRisk(person, pedigreeData, model = INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE) {
  if (!person || !pedigreeData || !pedigreeData.people) {
    return {
      model,
      status: RISK_STATUS.INSUFFICIENT_DATA,
      probability: null,
      probabilityDisplay: 'اطلاعات ناکافی',
      probabilityDisplayEn: 'Insufficient data',
      reason: 'داده‌های شجره‌نامه یا فرد مورد نظر ارائه نشده است.',
      reasonEn: 'Pedigree or individual data not provided.',
      assumptions: [],
      isClinical: false,
      disclaimer: CLINICAL_DISCLAIMER_FA,
    };
  }

  const people = pedigreeData.people;

  switch (model) {
    case INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE:
      return calcAutosomalRecessiveRisk(person, people);
    case INHERITANCE_MODELS.AUTOSOMAL_DOMINANT:
      return calcAutosomalDominantRisk(person, people);
    case INHERITANCE_MODELS.X_LINKED_RECESSIVE:
      return calcXLinkedRecessiveRisk(person, people);
    default:
      return calcAutosomalRecessiveRisk(person, people);
  }
}

/**
 * Autosomal Recessive (AR) Carrier Probability
 * Under AR, an affected individual has genotype aa (homozygous or compound heterozygous).
 * A healthy carrier has genotype Aa.
 * A healthy non-carrier has genotype AA.
 */
function calcAutosomalRecessiveRisk(person, people) {
  const assumptions = [
    'وراثت اتوزوم مغلوب تک‌ژنی (Monogenic Autosomal Recessive)',
    'نفوذ کامل فنوتیپی (100% Penetrance) در افراد هموزیگوت جهش‌یافته (aa)',
    'عدم وجود هتروژنیتی ژنتیکی لوکوس‌های دیگر',
    'فرض فراوانی پایین آلل بیماری در جمعیت عمومی (عدم فرض ناقل بودن افراد بیرونی بدون سابقه)',
  ];

  // 1. If person is phenotypically affected:
  // In AR, an affected individual is homozygous / compound heterozygote (aa), NOT an asymptomatic carrier (Aa).
  if (person.affected) {
    return {
      model: INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE,
      status: RISK_STATUS.AFFECTED,
      probability: 0.0,
      probabilityDisplay: 'مبتلا (aa) - نه ناقل بدون علامت',
      probabilityDisplayEn: 'Affected (aa) - Not an asymptomatic carrier',
      isAffected: true,
      reason: 'فرد دارای فنوتیپ بالینی بیماری است؛ در الگوی اتوزوم مغلوب، فرد مبتلا ژنوتیپ aa داشته و ناقل خاموش (Aa) محسوب نمی‌شود.',
      reasonEn: 'Individual is clinically affected (aa). In autosomal recessive inheritance, affected individuals are homozygotes, not silent carriers.',
      assumptions,
      isClinical: false,
      disclaimer: CLINICAL_DISCLAIMER_FA,
    };
  }

  // 2. If molecular testing confirmed carrier status:
  if (person.hasMutation && person.carrier) {
    return {
      model: INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE,
      status: RISK_STATUS.OBLIGATE_CARRIER,
      probability: 1.0,
      probabilityDisplay: '۱۰۰٪ (ناقل قطعی تاییدشده با آزمایش)',
      probabilityDisplayEn: '100% (Confirmed carrier via testing)',
      reason: 'حضور واریانت بیماری‌زا به صورت هتروزیگوت در آزمایش ژنتیک مولکولی تایید شده است.',
      reasonEn: 'Pathogenic variant confirmed heterozygous by molecular genetic testing.',
      assumptions: ['تست ژنتیکی بدون خطای تکنیکال'],
      isClinical: false,
      disclaimer: CLINICAL_DISCLAIMER_FA,
    };
  }

  const mother = person.motherId ? people[person.motherId] : null;
  const father = person.fatherId ? people[person.fatherId] : null;

  // Check if person has affected child -> obligate carrier
  const children = (person.childIds || []).map((cid) => people[cid]).filter(Boolean);
  const hasAffectedChild = children.some((c) => c.affected);
  if (hasAffectedChild) {
    return {
      model: INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE,
      status: RISK_STATUS.OBLIGATE_CARRIER,
      probability: 1.0,
      probabilityDisplay: '۱۰۰٪ (ناقل اجباری - Obligate Carrier)',
      probabilityDisplayEn: '100% (Obligate carrier - parent of affected child)',
      reason: 'به دلیل داشتن فرزند مبتلا به بیماری اتوزوم مغلوب، فرد الزاماً یک آلل بیماری‌زا به فرزند انتقال داده و ناقل اجباری است.',
      reasonEn: 'Having an affected child with AR disease requires passing one mutant allele, establishing obligate carrier status.',
      assumptions: [...assumptions, 'عدم وقوع جهش جدید غیرمنتظره (De novo mutation) یا دیزومی تک‌والدی (UPD)'],
      isClinical: false,
      disclaimer: CLINICAL_DISCLAIMER_FA,
    };
  }

  // Check if either parent is affected:
  // If one parent is affected (aa), and this person is unaffected, this person MUST inherit 'a'.
  // Therefore, this person is an obligate carrier (probability = 1.0).
  if ((mother && mother.affected) || (father && father.affected)) {
    return {
      model: INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE,
      status: RISK_STATUS.OBLIGATE_CARRIER,
      probability: 1.0,
      probabilityDisplay: '۱۰۰٪ (ناقل اجباری - والد مبتلا)',
      probabilityDisplayEn: '100% (Obligate carrier - parent affected)',
      reason: 'یکی از والدین مبتلا به بیماری اتوزوم مغلوب (aa) است؛ فرزند سالم الزاماً یک آلل جهش‌یافته از این والد به ارث می‌برد.',
      reasonEn: 'One parent is affected (aa); an unaffected offspring necessarily inherits a mutant allele, making them an obligate carrier.',
      assumptions,
      isClinical: false,
      disclaimer: CLINICAL_DISCLAIMER_FA,
    };
  }

  // Check siblings for affected individuals:
  // If a full sibling is affected, both mother and father are obligate carriers (Aa x Aa).
  let hasAffectedFullSibling = false;
  if (mother && father) {
    const sibIds = (mother.childIds || []).filter((cid) => (father.childIds || []).includes(cid) && cid !== person.id);
    hasAffectedFullSibling = sibIds.some((sid) => people[sid]?.affected);
  }

  // Both parents are confirmed carriers (or obligate carriers due to an affected child):
  const motherIsCarrier = mother && (mother.carrier || mother.hasMutation);
  const fatherIsCarrier = father && (father.carrier || father.hasMutation);

  if (hasAffectedFullSibling || (motherIsCarrier && fatherIsCarrier)) {
    // Punnett square for Aa x Aa: AA (1/4), Aa (2/4), aa (1/4).
    // Given the person is UNAFFECTED (not aa), sample space is AA (1/3) + Aa (2/3).
    // Bayesian posterior probability of being a carrier = 2/3 = 66.7%.
    return {
      model: INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE,
      status: RISK_STATUS.CONDITIONAL_CARRIER,
      probability: 2 / 3,
      probabilityDisplay: '۶۶.۷٪ (احتمال شرطی ۲/۳)',
      probabilityDisplayEn: '66.7% (Conditional 2/3 probability)',
      reason: 'والدین هر دو ناقل قطعی هستند (یا دارای فرزند دیگر مبتلا هستند)؛ در نتیجه هر فرزند سالم دارای احتمال ۲ از ۳ برای ناقل بودن است.',
      reasonEn: 'Both parents are confirmed carriers. An unaffected child has a 2/3 Bayesian conditional probability of being a carrier.',
      assumptions: [...assumptions, 'فرد بررسی‌شده سالم است و احتمال ژنوتیپ aa منتفی شده است'],
      isClinical: false,
      disclaimer: CLINICAL_DISCLAIMER_FA,
    };
  }

  // One parent is a confirmed carrier, other parent is unknown/general population:
  if (motherIsCarrier || fatherIsCarrier) {
    return {
      model: INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE,
      status: RISK_STATUS.CONDITIONAL_CARRIER,
      probability: 0.5,
      probabilityDisplay: '۵۰٪ (با فرض عدم ناقل بودن والد دیگر)',
      probabilityDisplayEn: '50% (Assuming other parent is non-carrier)',
      reason: 'یکی از والدین ناقل تاییدشده است؛ با فرض عدم ناقل بودن والد دیگر، احتمال انتقال آلل ۵۰٪ است.',
      reasonEn: 'One parent is a confirmed carrier; assuming the other parent is a non-carrier, the prior inheritance probability is 50%.',
      assumptions: [...assumptions, 'فرض عدم ناقل بودن والد دیگر به دلیل فقدان سابقه خانوادگی'],
      isClinical: false,
      disclaimer: CLINICAL_DISCLAIMER_FA,
    };
  }

  // If person has carrier status explicitly marked in manual data:
  if (person.carrier) {
    return {
      model: INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE,
      status: RISK_STATUS.OBLIGATE_CARRIER,
      probability: 1.0,
      probabilityDisplay: '۱۰۰٪ (ثبت‌شده به عنوان ناقل)',
      probabilityDisplayEn: '100% (Flagged as carrier)',
      reason: 'فرد در سوابق به عنوان ناقل مشخص شده است.',
      reasonEn: 'Individual is recorded as a carrier.',
      assumptions: ['صحت سوابق ارائه‌شده'],
      isClinical: false,
      disclaimer: CLINICAL_DISCLAIMER_FA,
    };
  }

  // If no parents or relatives with positive findings exist:
  return {
    model: INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE,
    status: RISK_STATUS.INSUFFICIENT_DATA,
    probability: null,
    probabilityDisplay: 'اطلاعات ناکافی برای محاسبه',
    probabilityDisplayEn: 'Insufficient information for calculation',
    reason: 'اطلاعات شجره‌نامه‌ای یا آزمایشگاهی کافی برای برآورد احتمال ناقل بودن در این فرد وجود ندارد. عدم وجود ریسک محاسبه‌شده به منزله ریسک صفر نیست.',
    reasonEn: 'Insufficient pedigree or laboratory data to justify a carrier probability. Absence of calculated risk does not mean zero risk.',
    assumptions,
    isClinical: false,
    disclaimer: CLINICAL_DISCLAIMER_FA,
  };
}

/**
 * Autosomal Dominant (AD) Evaluation
 * In AD, one mutant allele (A) causes the disease phenotype (Aa).
 */
function calcAutosomalDominantRisk(person, people) {
  const assumptions = [
    'وراثت اتوزوم غالب (Autosomal Dominant)',
    'نفوذ بالینی متغیر یا وابسته به سن ممکن است وجود داشته باشد',
  ];

  if (person.affected) {
    return {
      model: INHERITANCE_MODELS.AUTOSOMAL_DOMINANT,
      status: RISK_STATUS.AFFECTED,
      probability: 1.0,
      probabilityDisplay: 'مبتلا (فنوتیپ مثبت)',
      probabilityDisplayEn: 'Affected (Phenotype positive)',
      reason: 'فرد علائم بیماری اتوزوم غالب را نشان می‌دهد.',
      reasonEn: 'Individual manifests autosomal dominant disease phenotype.',
      assumptions,
      isClinical: false,
      disclaimer: CLINICAL_DISCLAIMER_FA,
    };
  }

  const mother = person.motherId ? people[person.motherId] : null;
  const father = person.fatherId ? people[person.fatherId] : null;

  if ((mother && mother.affected) || (father && father.affected)) {
    return {
      model: INHERITANCE_MODELS.AUTOSOMAL_DOMINANT,
      status: RISK_STATUS.CONDITIONAL_CARRIER,
      probability: 0.5,
      probabilityDisplay: '۵۰٪ ریسک انتقال (پیش از بررسی نفوذ سنی)',
      probabilityDisplayEn: '50% transmission risk (prior to age penetrance)',
      reason: 'یکی از والدین مبتلا به بیماری اتوزوم غالب است؛ احتمال انتقال آلل بیماری‌زا ۵۰٪ است.',
      reasonEn: 'One parent is affected by AD disease; transmission probability is 50%.',
      assumptions,
      isClinical: false,
      disclaimer: CLINICAL_DISCLAIMER_FA,
    };
  }

  return {
    model: INHERITANCE_MODELS.AUTOSOMAL_DOMINANT,
    status: RISK_STATUS.INSUFFICIENT_DATA,
    probability: null,
    probabilityDisplay: 'اطلاعات ناکافی',
    probabilityDisplayEn: 'Insufficient data',
    reason: 'والدین فرد مبتلا نیستند و شواهدی از وراثت غالب در خانواده ثبت نشده است.',
    reasonEn: 'Parents are unaffected and no AD pattern is documented.',
    assumptions,
    isClinical: false,
    disclaimer: CLINICAL_DISCLAIMER_FA,
  };
}

/**
 * X-Linked Recessive Evaluation
 */
function calcXLinkedRecessiveRisk(person, people) {
  const assumptions = [
    'وراثت وابسته به کروموزوم X مغلوب (X-Linked Recessive)',
    'الگوی عدم انتقال از پدر به پسر (No male-to-male transmission)',
  ];

  if (person.sex === 'male') {
    if (person.affected) {
      return {
        model: INHERITANCE_MODELS.X_LINKED_RECESSIVE,
        status: RISK_STATUS.AFFECTED,
        probability: 1.0,
        probabilityDisplay: 'مبتلا (همی‌زیگوت)',
        probabilityDisplayEn: 'Affected (Hemizygous)',
        reason: 'مردان با داشتن یک کروموزوم X جهش‌یافته مبتلا هستند.',
        reasonEn: 'Males with one mutant X chromosome express the disease.',
        assumptions,
        isClinical: false,
        disclaimer: CLINICAL_DISCLAIMER_FA,
      };
    }
  }

  const mother = person.motherId ? people[person.motherId] : null;
  const father = person.fatherId ? people[person.fatherId] : null;

  if (person.sex === 'female') {
    if (father && father.affected) {
      return {
        model: INHERITANCE_MODELS.X_LINKED_RECESSIVE,
        status: RISK_STATUS.OBLIGATE_CARRIER,
        probability: 1.0,
        probabilityDisplay: '۱۰۰٪ (ناقل اجباری - پدر مبتلا)',
        probabilityDisplayEn: '100% (Obligate carrier - affected father)',
        reason: 'تمام دختران یک مرد مبتلا به بیماری وابسته به X مغلوب، ناقل اجباری هستند زیرا کروموزوم X جهش‌یافته پدر را به ارث می‌برند.',
        reasonEn: 'All daughters of an affected male inherit his mutant X chromosome, making them obligate carriers.',
        assumptions,
        isClinical: false,
        disclaimer: CLINICAL_DISCLAIMER_FA,
      };
    }
    if (mother && (mother.carrier || mother.hasMutation)) {
      return {
        model: INHERITANCE_MODELS.X_LINKED_RECESSIVE,
        status: RISK_STATUS.CONDITIONAL_CARRIER,
        probability: 0.5,
        probabilityDisplay: '۵۰٪ (مادر ناقل)',
        probabilityDisplayEn: '50% (Mother is carrier)',
        reason: 'مادر ناقل دارای دو کروموزوم X است و احتمال انتقال کروموزوم حاوی واریانت به هر دختر ۵۰٪ است.',
        reasonEn: 'Carrier mother has 50% chance of transmitting the mutant X chromosome to a daughter.',
        assumptions,
        isClinical: false,
        disclaimer: CLINICAL_DISCLAIMER_FA,
      };
    }
  }

  return {
    model: INHERITANCE_MODELS.X_LINKED_RECESSIVE,
    status: RISK_STATUS.INSUFFICIENT_DATA,
    probability: null,
    probabilityDisplay: 'اطلاعات ناکافی',
    probabilityDisplayEn: 'Insufficient data',
    reason: 'اطلاعات کافی برای محاسبه احتمال ریسک در الگوی وابسته به X وجود ندارد.',
    reasonEn: 'Insufficient data to compute X-linked risk.',
    assumptions,
    isClinical: false,
    disclaimer: CLINICAL_DISCLAIMER_FA,
  };
}
