/**
 * @file pedigreeValidation.js
 * @description Centralized Validation, Integrity Checker, and Schema Migration for Pedigree Datasets
 */

export const CURRENT_SCHEMA_VERSION = 2;

/**
 * Checks if adding an ancestor-child link would create a directed cycle in the pedigree.
 * Uses Depth-First Search (DFS) traversal up the parent hierarchy.
 * 
 * @param {string} parentId
 * @param {string} childId
 * @param {Object} people
 * @returns {boolean} True if cycle detected (invalid), false if acyclic (valid)
 */
export function wouldCreateCycle(parentId, childId, people) {
  if (!parentId || !childId) return false;
  if (parentId === childId) return true;

  const visited = new Set();
  const stack = [parentId];

  while (stack.length > 0) {
    const curr = stack.pop();
    if (curr === childId) return true;
    if (visited.has(curr)) continue;
    visited.add(curr);

    const node = people[curr];
    if (node) {
      if (node.fatherId) stack.push(node.fatherId);
      if (node.motherId) stack.push(node.motherId);
    }
  }

  return false;
}

/**
 * Traverses the whole graph to check for any existing cycles in ancestry.
 * 
 * @param {Object} people
 * @returns {string[]} List of IDs involved in cycles or error messages
 */
export function detectAncestryCycles(people) {
  const errors = [];
  const visitedGlobal = new Set();

  for (const personId of Object.keys(people)) {
    if (visitedGlobal.has(personId)) continue;

    const recursionStack = new Set();
    const dfs = (id) => {
      if (recursionStack.has(id)) {
        errors.push(`حلقه شجره‌نامه‌ای غیرممکن (Cycle): فرد ${id} در سلسله اجداد خود قرار دارد.`);
        return;
      }
      if (visitedGlobal.has(id)) return;

      recursionStack.add(id);
      visitedGlobal.add(id);

      const p = people[id];
      if (p) {
        if (p.fatherId && people[p.fatherId]) dfs(p.fatherId);
        if (p.motherId && people[p.motherId]) dfs(p.motherId);
      }

      recursionStack.delete(id);
    };

    dfs(personId);
  }

  return errors;
}

/**
 * Validates a pedigree data structure and returns errors, warnings, and clean status.
 * 
 * @param {any} rawData
 * @returns {{ isValid: boolean, errors: string[], warnings: string[], schemaVersion: number }}
 */
export function validatePedigreeData(rawData) {
  const errors = [];
  const warnings = [];

  if (!rawData || typeof rawData !== 'object') {
    return {
      isValid: false,
      errors: ['داده‌های شجره‌نامه باید یک شیء معتبر JSON باشند.'],
      warnings: [],
      schemaVersion: 0,
    };
  }

  const people = rawData.people;
  if (!people || typeof people !== 'object' || Array.isArray(people)) {
    return {
      isValid: false,
      errors: ['ساختار داده فاقد بخش الزامی people است.'],
      warnings: [],
      schemaVersion: rawData.schemaVersion || 1,
    };
  }

  const personIds = Object.keys(people);
  if (personIds.length === 0) {
    warnings.push('شجره‌نامه هیچ عضوی ندارد (Empty pedigree).');
    return { isValid: true, errors: [], warnings, schemaVersion: rawData.schemaVersion || 2 };
  }

  // 1. Check ID consistency
  for (const [key, p] of Object.entries(people)) {
    if (!p || typeof p !== 'object') {
      errors.push(`عضو با کلید "${key}" یک شیء معتبر نیست.`);
      continue;
    }
    if (!p.id || String(p.id).trim() === '') {
      errors.push(`عضو با کلید "${key}" فاقد شناسه منحصر‌به‌فرد (id) است.`);
    } else if (p.id !== key) {
      warnings.push(`عدم انطباق کلید دیکشنری "${key}" با فیلد شناسه "${p.id}".`);
    }

    // Self references
    if (p.fatherId === p.id) {
      errors.push(`فرد "${p.name || p.id}" نمی‌تواند پدر خودش باشد.`);
    }
    if (p.motherId === p.id) {
      errors.push(`فرد "${p.name || p.id}" نمی‌تواند مادر خودش باشد.`);
    }
    if (Array.isArray(p.spouseIds) && p.spouseIds.includes(p.id)) {
      errors.push(`فرد "${p.name || p.id}" نمی‌تواند همسر خودش باشد.`);
    }
    if (Array.isArray(p.childIds) && p.childIds.includes(p.id)) {
      errors.push(`فرد "${p.name || p.id}" نمی‌تواند فرزند خودش باشد.`);
    }

    // Orphaned reference checks
    if (p.fatherId && !people[p.fatherId]) {
      warnings.push(`شناسه پدر "${p.fatherId}" برای فرد "${p.id}" در لیست اعضا یافت نشد (Orphan reference).`);
    }
    if (p.motherId && !people[p.motherId]) {
      warnings.push(`شناسه مادر "${p.motherId}" برای فرد "${p.id}" در لیست اعضا یافت نشد (Orphan reference).`);
    }
    if (Array.isArray(p.spouseIds)) {
      for (const spId of p.spouseIds) {
        if (!people[spId]) {
          warnings.push(`شناسه همسر "${spId}" برای فرد "${p.id}" در لیست اعضا یافت نشد.`);
        }
      }
    }
    if (Array.isArray(p.childIds)) {
      for (const chId of p.childIds) {
        if (!people[chId]) {
          warnings.push(`شناسه فرزند "${chId}" برای فرد "${p.id}" در لیست اعضا یافت نشد.`);
        }
      }
    }
  }

  // 2. Check Twin Group consistency
  const twinGroups = {};
  for (const p of Object.values(people)) {
    if (p && p.twinGroupId) {
      if (!twinGroups[p.twinGroupId]) twinGroups[p.twinGroupId] = [];
      twinGroups[p.twinGroupId].push(p);
    }
  }

  for (const [tgId, members] of Object.entries(twinGroups)) {
    if (members.length < 2) {
      warnings.push(`گروه دوقلو "${tgId}" فقط دارای یک عضو است.`);
    }
    // Check zygosity for identical twins: must share biological sex
    const isIdentical = members.some((m) => m.twinType === 'identical');
    if (isIdentical) {
      const sexes = new Set(members.map((m) => m.sex).filter((s) => s === 'male' || s === 'female'));
      if (sexes.size > 1) {
        errors.push(`دوقلوهای تک‌تخمی همسان (Identical MZ) در گروه "${tgId}" نمی‌توانند جنسیت بیولوژیک متفاوت داشته باشند.`);
      }
    }

    // Check shared parents
    const fIds = new Set(members.map((m) => m.fatherId || 'none'));
    const mIds = new Set(members.map((m) => m.motherId || 'none'));
    if (fIds.size > 1 || mIds.size > 1) {
      warnings.push(`اعضای گروه دوقلو "${tgId}" دارای والدین بیولوژیک ناهماهنگ هستند.`);
    }
  }

  // 3. Cycle detection
  const cycleErrors = detectAncestryCycles(people);
  errors.push(...cycleErrors);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    schemaVersion: rawData.schemaVersion || 1,
  };
}

/**
 * Sanitizes and repairs minor relationship inconsistencies (reciprocity, orphan references, duplicates)
 * without corrupting valid complex features like multi-spouses, consanguinity, or twins.
 * 
 * @param {Object} rawData
 * @returns {{ sanitizedData: Object, repairedCount: number, repairLog: string[] }}
 */
export function sanitizeAndRepairPedigree(rawData) {
  if (!rawData || !rawData.people) {
    return {
      sanitizedData: { schemaVersion: CURRENT_SCHEMA_VERSION, people: {} },
      repairedCount: 0,
      repairLog: ['داده ورودی خالی یا نامعتبر بود؛ شجره‌نامه خام اولیه تولید شد.'],
    };
  }

  const people = JSON.parse(JSON.stringify(rawData.people));
  let repairedCount = 0;
  const repairLog = [];

  // Remove self-references and clean up arrays
  for (const p of Object.values(people)) {
    if (!p || typeof p !== 'object') continue;
    p.spouseIds = Array.isArray(p.spouseIds) ? [...new Set(p.spouseIds)] : [];
    p.childIds = Array.isArray(p.childIds) ? [...new Set(p.childIds)] : [];

    // Filter out self
    if (p.spouseIds.includes(p.id)) {
      p.spouseIds = p.spouseIds.filter((id) => id !== p.id);
      repairedCount++;
      repairLog.push(`ارجاع خود به عنوان همسر از فرد "${p.id}" حذف شد.`);
    }
    if (p.childIds.includes(p.id)) {
      p.childIds = p.childIds.filter((id) => id !== p.id);
      repairedCount++;
      repairLog.push(`ارجاع خود به عنوان فرزند از فرد "${p.id}" حذف شد.`);
    }
    if (p.fatherId === p.id) {
      p.fatherId = null;
      repairedCount++;
      repairLog.push(`ارجاع خود به عنوان پدر از فرد "${p.id}" حذف شد.`);
    }
    if (p.motherId === p.id) {
      p.motherId = null;
      repairedCount++;
      repairLog.push(`ارجاع خود به عنوان مادر از فرد "${p.id}" حذف شد.`);
    }

    // Clean orphaned references
    p.spouseIds = p.spouseIds.filter((id) => {
      if (!people[id]) {
        repairedCount++;
        repairLog.push(`ارجاع مفقود همسر "${id}" از فرد "${p.id}" پاکسازی شد.`);
        return false;
      }
      return true;
    });

    p.childIds = p.childIds.filter((id) => {
      if (!people[id]) {
        repairedCount++;
        repairLog.push(`ارجاع مفقود فرزند "${id}" از فرد "${p.id}" پاکسازی شد.`);
        return false;
      }
      return true;
    });

    if (p.fatherId && !people[p.fatherId]) {
      repairedCount++;
      repairLog.push(`ارجاع مفقود پدر "${p.fatherId}" از فرد "${p.id}" پاکسازی شد.`);
      p.fatherId = null;
    }
    if (p.motherId && !people[p.motherId]) {
      repairedCount++;
      repairLog.push(`ارجاع مفقود مادر "${p.motherId}" از فرد "${p.id}" پاکسازی شد.`);
      p.motherId = null;
    }
  }

  // Enforce reciprocal consistency:
  // 1. Spouses reciprocity
  for (const p of Object.values(people)) {
    for (const spId of p.spouseIds) {
      const sp = people[spId];
      if (sp && !sp.spouseIds.includes(p.id)) {
        sp.spouseIds.push(p.id);
        repairedCount++;
        repairLog.push(`همگام‌سازی دوسویه همسری بین "${p.id}" و "${sp.id}".`);
      }
    }
  }

  // 2. Parent-child reciprocity
  for (const p of Object.values(people)) {
    if (p.fatherId && people[p.fatherId]) {
      const father = people[p.fatherId];
      if (!father.childIds.includes(p.id)) {
        father.childIds.push(p.id);
        repairedCount++;
        repairLog.push(`ثبت شناسه فرزند "${p.id}" در لیست فرزندان پدر "${father.id}".`);
      }
    }
    if (p.motherId && people[p.motherId]) {
      const mother = people[p.motherId];
      if (!mother.childIds.includes(p.id)) {
        mother.childIds.push(p.id);
        repairedCount++;
        repairLog.push(`ثبت شناسه فرزند "${p.id}" در لیست فرزندان مادر "${mother.id}".`);
      }
    }
  }

  // 3. Child back-pointers to parents
  for (const p of Object.values(people)) {
    for (const chId of p.childIds) {
      const ch = people[chId];
      if (ch) {
        if (p.sex === 'male' && !ch.fatherId) {
          ch.fatherId = p.id;
          repairedCount++;
          repairLog.push(`تنظیم والد مذکر "${p.id}" برای فرزند "${ch.id}".`);
        } else if (p.sex === 'female' && !ch.motherId) {
          ch.motherId = p.id;
          repairedCount++;
          repairLog.push(`تنظیم والد مونث "${p.id}" برای فرزند "${ch.id}".`);
        }
      }
    }
  }

  return {
    sanitizedData: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      people,
      metadata: rawData.metadata || {
        caseRef: rawData.caseRef || 'GEN-CASE',
        createdAt: rawData.createdAt || new Date().toISOString(),
      },
    },
    repairedCount,
    repairLog,
  };
}
