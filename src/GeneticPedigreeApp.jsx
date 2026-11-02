import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { computePedigreeLayout } from "./pedigreeLayout.js";
import {
  calculateGeneticRisk,
  INHERITANCE_MODELS,
  RISK_STATUS,
  CLINICAL_DISCLAIMER_FA,
} from "./domain/geneticRisk.js";
import {
  validatePedigreeData,
  sanitizeAndRepairPedigree,
  CURRENT_SCHEMA_VERSION,
} from "./domain/pedigreeValidation.js";
import {
  saveCaseLocally,
  loadCaseLocally,
  listSavedCases,
  deleteCaseLocally,
} from "./services/storageService.js";
import {
  GitFork, UserPlus, Upload, Download, Undo2, Redo2, Trash2, Search,
  Plus, Minus, Maximize2, RotateCcw, Users, ChevronDown, Crosshair,
  Layers, Dna, Activity, FileText, CheckCircle2, Bookmark, AlertTriangle, X,
  Bug, Box, Sun, Moon, Sparkles, Star, ShieldCheck, HeartPulse
} from "lucide-react";
import CollapsibleClinicalLegend from "./components/CollapsibleClinicalLegend.jsx";

const uid = (p = "p") => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---- Presets & Sample Builders ----
function buildSample() {
  const tg = uid('tg');
  const a = { id: uid(), name: "پدربزرگ", sex: "male", deceased: true, deathAge: 78, spouseIds: [], childIds: [], twinType: "none" };
  const b = { id: uid(), name: "مادربزرگ", sex: "female", age: 74, spouseIds: [], childIds: [], twinType: "none" };
  const c = { id: uid(), name: "پدر", sex: "male", age: 48, spouseIds: [], childIds: [], motherId: b.id, fatherId: a.id, twinType: "none" };
  const d = { id: uid(), name: "مادر", sex: "female", age: 45, carrier: true, spouseIds: [], childIds: [], twinType: "none" };
  const e = { id: uid(), name: "فرزند ۱ (مبتلا)", sex: "female", age: 16, affected: true, hasMutation: true, isProband: true, spouseIds: [], childIds: [], motherId: d.id, fatherId: c.id, twinType: "none" };
  const f = { id: uid(), name: "قل الف (همسان MZ)", sex: "male", age: 12, spouseIds: [], childIds: [], motherId: d.id, fatherId: c.id, twinType: "identical", twinGroupId: tg };
  const g = { id: uid(), name: "قل ب (همسان MZ)", sex: "male", age: 12, carrier: true, spouseIds: [], childIds: [], motherId: d.id, fatherId: c.id, twinType: "identical", twinGroupId: tg };

  a.spouseIds.push(b.id); b.spouseIds.push(a.id);
  c.spouseIds.push(d.id); d.spouseIds.push(c.id);
  a.childIds.push(c.id); b.childIds.push(c.id);
  d.childIds.push(e.id, f.id, g.id); c.childIds.push(e.id, f.id, g.id);

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: { caseRef: 'GEN-8420', caseTitle: 'خانواده استاندارد بالینی', createdAt: new Date().toISOString() },
    people: { [a.id]: a, [b.id]: b, [c.id]: c, [d.id]: d, [e.id]: e, [f.id]: f, [g.id]: g },
  };
}

// Preset: 20-generation clinical pedigree with 5 children, multi-spouses, consanguinity, and twins
function build20GenPedigree() {
  const people = {};
  let currentParents = { father: "p0_m", mother: "p0_f" };
  people["p0_m"] = { id: "p0_m", name: "پدر بزرگ ریشه (نسل ۱)", sex: "male", spouseIds: ["p0_f"], childIds: [] };
  people["p0_f"] = { id: "p0_f", name: "مادر بزرگ ریشه (نسل ۱)", sex: "female", spouseIds: ["p0_m"], childIds: [] };

  const cousinPool = [];

  for (let g = 1; g < 20; g++) {
    const isMaleMain = g % 2 !== 0;
    const mainChildId = `p${g}_main`;
    const mainSpouseId = `p${g}_sp`;
    const isConsanguineous = (g === 7 || g === 14) && cousinPool.length > 0;
    const marriedSpouseId = isConsanguineous ? cousinPool.pop() : mainSpouseId;

    // Create 5 siblings for generation g
    const sibIds = [];
    for (let c = 1; c <= 5; c++) {
      const cid = c === 1 ? mainChildId : `p${g}_c${c}`;
      const isMale = (g + c) % 2 !== 0;
      people[cid] = {
        id: cid,
        name: c === 1 ? `پروباند نسل ${g + 1}` : `فرزند ${c} نسل ${g + 1}`,
        sex: isMale ? "male" : "female",
        fatherId: currentParents.father,
        motherId: currentParents.mother,
        spouseIds: c === 1 ? [marriedSpouseId] : [],
        childIds: [],
        twinType: "none",
        carrier: (g + c) % 3 === 0,
        affected: (g + c) % 7 === 0,
      };
      people[currentParents.father].childIds.push(cid);
      people[currentParents.mother].childIds.push(cid);
      sibIds.push(cid);

      if (c === 4 && (g === 5 || g === 12)) {
        cousinPool.push(cid);
      }
    }

    // Identical twins (MZ) at Generation 3 (siblings 2 & 3)
    if (g === 2) {
      const tg = "tg_g3_mz";
      people[sibIds[1]].twinType = "identical";
      people[sibIds[1]].twinGroupId = tg;
      people[sibIds[1]].name = "دوقلوی همسان الف (MZ)";
      people[sibIds[2]].twinType = "identical";
      people[sibIds[2]].twinGroupId = tg;
      people[sibIds[2]].sex = people[sibIds[1]].sex;
      people[sibIds[2]].name = "دوقلوی همسان ب (MZ)";
    }

    // Fraternal twins (DZ) at Generation 8 (siblings 3 & 4)
    if (g === 7) {
      const tg = "tg_g8_dz";
      people[sibIds[2]].twinType = "fraternal";
      people[sibIds[2]].twinGroupId = tg;
      people[sibIds[2]].name = "دوقلوی ناهمسان الف (DZ)";
      people[sibIds[3]].twinType = "fraternal";
      people[sibIds[3]].twinGroupId = tg;
      people[sibIds[3]].name = "دوقلوی ناهمسان ب (DZ)";
    }

    // Twins with unknown zygosity at Generation 12 (siblings 2 & 3)
    if (g === 11) {
      const tg = "tg_g12_unk";
      people[sibIds[1]].twinType = "unknown";
      people[sibIds[1]].twinGroupId = tg;
      people[sibIds[1]].name = "دوقلو الف (زیگوتی نامشخص)";
      people[sibIds[2]].twinType = "unknown";
      people[sibIds[2]].twinGroupId = tg;
      people[sibIds[2]].name = "دوقلو ب (زیگوتی نامشخص)";
    }

    // Create spouse if not consanguineous
    if (!isConsanguineous) {
      people[mainSpouseId] = {
        id: mainSpouseId,
        name: `همسر نسل ${g + 1}`,
        sex: isMaleMain ? "female" : "male",
        spouseIds: [mainChildId],
        childIds: [],
        twinType: "none",
      };
    } else {
      if (!people[marriedSpouseId].spouseIds.includes(mainChildId)) {
        people[marriedSpouseId].spouseIds.push(mainChildId);
      }
      people[marriedSpouseId].name += " (ازدواج خویشاوندی)";
    }

    // Multi-spouse remarriage at Gen 4 and Gen 10
    if (g === 4 || g === 10) {
      const secSpouseId = `p${g}_sec_sp`;
      const husbandId = isMaleMain ? mainChildId : mainSpouseId;
      people[secSpouseId] = {
        id: secSpouseId,
        name: `همسر دوم نسل ${g + 1}`,
        sex: "female",
        spouseIds: [husbandId],
        childIds: [],
        twinType: "none",
      };
      people[husbandId].spouseIds.push(secSpouseId);

      const secChildId = `p${g}_sec_c1`;
      people[secChildId] = {
        id: secChildId,
        name: `فرزند همسر دوم نسل ${g + 1}`,
        sex: "male",
        fatherId: husbandId,
        motherId: secSpouseId,
        spouseIds: [],
        childIds: [],
        twinType: "none",
      };
      people[husbandId].childIds.push(secChildId);
      people[secSpouseId].childIds.push(secChildId);
    }

    currentParents = {
      father: isMaleMain ? mainChildId : marriedSpouseId,
      mother: isMaleMain ? marriedSpouseId : mainChildId,
    };
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: { caseRef: 'GEN-20GEN', caseTitle: 'شجره‌نامه ۲۰ نسلی ۵ فرزندی', createdAt: new Date().toISOString() },
    people,
  };
}

// Preset: 5 children per family branching tree
function build5ChildTree(depth = 2) {
  const people = {};
  const rootM = "root_m", rootF = "root_f";
  people[rootM] = { id: rootM, name: "پدربزرگ کانون", sex: "male", spouseIds: [rootF], childIds: [] };
  people[rootF] = { id: rootF, name: "مادربزرگ کانون", sex: "female", spouseIds: [rootM], childIds: [] };

  let currentCouples = [{ father: rootM, mother: rootF, prefix: "r" }];

  for (let d = 1; d <= depth; d++) {
    const nextCouples = [];
    currentCouples.forEach((couple, cIdx) => {
      for (let i = 1; i <= 5; i++) {
        const cId = `g${d}_${couple.prefix}_c${i}`;
        const sId = `g${d}_${couple.prefix}_s${i}`;
        const isMale = (cIdx + i) % 2 !== 0;

        people[cId] = {
          id: cId,
          name: `فرزند نسل ${d} (${cIdx + 1}-${i})`,
          sex: isMale ? "male" : "female",
          fatherId: people[couple.father].sex === "male" ? couple.father : couple.mother,
          motherId: people[couple.father].sex === "female" ? couple.father : couple.mother,
          spouseIds: d < depth ? [sId] : [],
          childIds: [],
          carrier: (cIdx + i) % 3 === 0,
          affected: (cIdx + i) % 7 === 0,
        };
        people[couple.father].childIds.push(cId);
        people[couple.mother].childIds.push(cId);

        if (d < depth) {
          people[sId] = {
            id: sId,
            name: `همسر (${cIdx + 1}-${i})`,
            sex: isMale ? "female" : "male",
            spouseIds: [cId],
            childIds: [],
          };
          nextCouples.push({
            father: isMale ? cId : sId,
            mother: isMale ? sId : cId,
            prefix: `${couple.prefix}_${i}`,
          });
        }
      }
    });
    currentCouples = nextCouples;
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: { caseRef: 'GEN-5TREE', caseTitle: 'الگوی ۵ فرزند در هر خانواده', createdAt: new Date().toISOString() },
    people,
  };
}

// Preset: 50 generations deep
function buildLargeSample(genCount = 50) {
  const people = {};
  let prevFather = "p_0_m";
  let prevMother = "p_0_f";
  people[prevFather] = { id: prevFather, name: "پدر نسل ۱", sex: "male", spouseIds: [prevMother], childIds: [] };
  people[prevMother] = { id: prevMother, name: "مادر نسل ۱", sex: "female", spouseIds: [prevFather], childIds: [] };

  for (let g = 1; g < genCount; g++) {
    const childId = `p_${g}_c`;
    const spouseId = `p_${g}_s`;
    const siblingId = g % 4 === 0 ? `p_${g}_sib` : null;
    const isMale = g % 2 === 0;

    people[childId] = {
      id: childId,
      name: `فرزند نسل ${g + 1}`,
      sex: isMale ? "male" : "female",
      fatherId: people[prevFather].sex === "male" ? prevFather : prevMother,
      motherId: people[prevFather].sex === "female" ? prevFather : prevMother,
      spouseIds: [spouseId],
      childIds: [],
      carrier: g % 3 === 0,
      affected: g % 7 === 0,
    };
    people[prevFather].childIds.push(childId);
    people[prevMother].childIds.push(childId);

    people[spouseId] = {
      id: spouseId,
      name: `همسر نسل ${g + 1}`,
      sex: isMale ? "female" : "male",
      spouseIds: [childId],
      childIds: [],
    };

    if (siblingId) {
      people[siblingId] = {
        id: siblingId,
        name: `خواهر/برادر نسل ${g + 1}`,
        sex: isMale ? "female" : "male",
        fatherId: people[prevFather].sex === "male" ? prevFather : prevMother,
        motherId: people[prevFather].sex === "female" ? prevFather : prevMother,
        spouseIds: [],
        childIds: [],
      };
      people[prevFather].childIds.push(siblingId);
      people[prevMother].childIds.push(siblingId);
    }

    prevFather = isMale ? childId : spouseId;
    prevMother = isMale ? spouseId : childId;
  }
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: { caseRef: 'GEN-50GEN', caseTitle: 'شجره‌نامه طولی ۵۰ نسلی', createdAt: new Date().toISOString() },
    people,
  };
}

// ---- Reducer & State Management ----
function reducer(history, action) {
  const apply = (s, a) => {
    const data = clone(s.data);
    switch (a.type) {
      case "SET_MODEL": {
        return { ...s, inheritanceModel: a.model };
      }
      case "ADD_PERSON": {
        const id = uid();
        data.people[id] = { id, name: "کیس جدید", sex: "unknown", spouseIds: [], childIds: [], twinType: "none", adopted: false, ...(a.person || {}) };
        return { ...s, data, selectedId: id };
      }
      case "UPDATE": {
        const p = data.people[a.id];
        if (p) {
          const oldTg = p.twinGroupId;
          data.people[a.id] = { ...p, ...a.patch };

          if (a.patch.twinType === 'none' && oldTg) {
            data.people[a.id].twinGroupId = null;
            const rem = Object.values(data.people).filter((x) => x.twinGroupId === oldTg && x.id !== a.id);
            if (rem.length === 1) {
              rem[0].twinGroupId = null;
              rem[0].twinType = 'none';
            }
          } else if (a.patch.twinType && a.patch.twinType !== 'none' && (p.twinGroupId || oldTg)) {
            const tg = p.twinGroupId || oldTg;
            Object.values(data.people).forEach((o) => {
              if (o.twinGroupId === tg && o.id !== a.id) {
                o.twinType = a.patch.twinType;
              }
            });
          }
        }
        return { ...s, data };
      }
      case "ADD_TWIN": {
        const base = data.people[a.baseId]; if (!base) return s;
        const zygosity = a.zygosity || "identical";
        const id = uid("tw");
        const sex = a.sex || (zygosity === "identical" ? (base.sex === "unknown" ? "male" : base.sex) : (base.sex === "male" ? "female" : "male"));
        const twinGroupId = base.twinGroupId || uid("tg");

        base.twinGroupId = twinGroupId;
        if (!base.twinType || base.twinType === "none") {
          base.twinType = zygosity;
        }

        let mId = base.motherId;
        let fId = base.fatherId;
        if (!mId && !fId) {
          fId = uid("f");
          mId = uid("m");
          data.people[fId] = { id: fId, name: "پدر", sex: "male", spouseIds: [mId], childIds: [base.id, id], twinType: "none", adopted: false };
          data.people[mId] = { id: mId, name: "مادر", sex: "female", spouseIds: [fId], childIds: [base.id, id], twinType: "none", adopted: false };
          base.fatherId = fId;
          base.motherId = mId;
        } else {
          if (fId && data.people[fId] && !data.people[fId].childIds.includes(id)) data.people[fId].childIds.push(id);
          if (mId && data.people[mId] && !data.people[mId].childIds.includes(id)) data.people[mId].childIds.push(id);
        }

        data.people[id] = {
          id,
          name: `قل ${base.name || ''}`.trim(),
          sex,
          spouseIds: [],
          childIds: [],
          motherId: mId,
          fatherId: fId,
          twinType: zygosity,
          twinGroupId,
          adopted: false,
          carrier: !!base.carrier && zygosity === "identical",
          affected: !!base.affected && zygosity === "identical",
          hasMutation: !!base.hasMutation && zygosity === "identical",
        };
        return { ...s, data, selectedId: id };
      }
      case "LINK_TWINS": {
        const { id1, id2, zygosity } = a;
        const p1 = data.people[id1], p2 = data.people[id2];
        if (!p1 || !p2) return s;
        const tg = p1.twinGroupId || p2.twinGroupId || uid("tg");
        const z = zygosity || p1.twinType || p2.twinType || "identical";
        p1.twinGroupId = tg;
        p2.twinGroupId = tg;
        p1.twinType = z;
        p2.twinType = z;
        return { ...s, data };
      }
      case "UNLINK_TWIN": {
        const p = data.people[a.id];
        if (!p) return s;
        const tg = p.twinGroupId;
        p.twinGroupId = null;
        p.twinType = "none";
        if (tg) {
          const rem = Object.values(data.people).filter((x) => x.twinGroupId === tg);
          if (rem.length === 1) {
            rem[0].twinGroupId = null;
            rem[0].twinType = "none";
          }
        }
        return { ...s, data };
      }
      case "DELETE": {
        const id = a.id;
        Object.values(data.people).forEach((p) => {
          if (p.motherId === id) p.motherId = null;
          if (p.fatherId === id) p.fatherId = null;
          p.spouseIds = (p.spouseIds || []).filter((v) => v !== id);
          p.childIds = (p.childIds || []).filter((v) => v !== id);
        });
        delete data.people[id]; return { ...s, data, selectedId: null };
      }
      case "ADD_CHILD": {
        const id = uid();
        data.people[id] = { id, name: "فرزند", sex: "unknown", spouseIds: [], childIds: [], motherId: a.motherId ?? null, fatherId: a.fatherId ?? null, twinType: "none", adopted: false };
        if (a.motherId && data.people[a.motherId]) data.people[a.motherId].childIds.push(id);
        if (a.fatherId && data.people[a.fatherId]) data.people[a.fatherId].childIds.push(id);
        return { ...s, data, selectedId: id };
      }
      case "ADD_PARENT": {
        const child = data.people[a.childId]; if (!child) return s;
        const sex = a.sex || "unknown";
        const id = uid();
        const name = sex === 'male' ? 'پدر' : sex === 'female' ? 'مادر' : 'والد';
        data.people[id] = { id, name, sex, spouseIds: [], childIds: [a.childId], twinType: "none", adopted: false };
        if (sex === 'male') child.fatherId = id; else if (sex === 'female') child.motherId = id;
        const otherId = sex === 'female' ? child.fatherId : sex === 'male' ? child.motherId : null;
        if (otherId && data.people[otherId] && otherId !== id) {
          if (!data.people[id].spouseIds.includes(otherId)) data.people[id].spouseIds.push(otherId);
          data.people[otherId].spouseIds = data.people[otherId].spouseIds || [];
          if (!data.people[otherId].spouseIds.includes(id)) data.people[otherId].spouseIds.push(id);
        }
        return { ...s, data, selectedId: id };
      }
      case "ADD_SPOUSE": {
        const person = data.people[a.personId]; if (!person) return s;
        const sex = a.sex || (person.sex === 'male' ? 'female' : person.sex === 'female' ? 'male' : 'unknown');
        const id = uid();
        data.people[id] = { id, name: 'همسر', sex, spouseIds: [a.personId], childIds: [], twinType: "none", adopted: false };
        person.spouseIds = person.spouseIds || [];
        if (!person.spouseIds.includes(id)) person.spouseIds.push(id);
        (person.childIds || []).forEach((cid) => {
          const ch = data.people[cid]; if (!ch) return;
          if (sex === 'female' && !ch.motherId) { ch.motherId = id; data.people[id].childIds.push(cid); }
          else if (sex === 'male' && !ch.fatherId) { ch.fatherId = id; data.people[id].childIds.push(cid); }
        });
        return { ...s, data, selectedId: id };
      }
      case "LOAD": {
        if (!a.data || typeof a.data !== 'object' || !a.data.people || typeof a.data.people !== 'object') return s;
        return { ...s, data: clone(a.data), selectedId: null };
      }
      case "SELECT": return { ...s, selectedId: a.id };
      case "ZOOM": {
        const factor = a.factor ?? (a.delta > 0 ? 1.25 : 0.8);
        const newZoom = Math.max(0.005, Math.min(5, s.zoom * factor));
        if (a.center) {
          const { cx, cy } = a.center;
          const newOffset = {
            x: cx - (cx - s.offset.x) * (newZoom / s.zoom),
            y: cy - (cy - s.offset.y) * (newZoom / s.zoom),
          };
          return { ...s, zoom: newZoom, offset: newOffset };
        }
        return { ...s, zoom: newZoom };
      }
      case "PAN": return { ...s, offset: { x: s.offset.x + a.dx, y: s.offset.y + a.dy } };
      case "SET_VIEW": return { ...s, zoom: a.zoom, offset: a.offset };
      case "RESET": return { ...s, zoom: 1, offset: { x: 80, y: 80 } };
      default: return s;
    }
  };
  const { past, present, future } = history;
  if (action.type === "UNDO") {
    if (!past.length) return history;
    return { past: past.slice(0, -1), present: past[past.length - 1], future: [present, ...future] };
  }
  if (action.type === "REDO") {
    if (!future.length) return history;
    return { past: [...past, present], present: future[0], future: future.slice(1) };
  }
  if (["SELECT", "ZOOM", "PAN", "RESET", "SET_VIEW", "SET_MODEL"].includes(action.type)) {
    return { past, present: apply(present, action), future };
  }
  const newPresent = apply(present, action);
  return { past: [...past, present], present: newPresent, future: [] };
}

function useHistory(initial) {
  const [history, dispatch] = useReducer(reducer, { past: [], present: initial, future: [] });
  return { history, dispatch };
}

// ---- Clinical Pedigree Glyph Component (ACMG/NSGC Standard) ----
function PersonGlyph({ person, size = 50, isDark = false }) {
  const strokeColor = person.deceased
    ? (isDark ? "#94a3b8" : "#64748b")
    : (isDark ? "#f1f5f9" : "#1e293b");
  const strokeWidth = 2.2;
  const shape = person.sex === "male" ? "square" : person.sex === "female" ? "circle" : "diamond";
  const r = size / 2;

  // Base background fill (unaffected: crisp white or dark slate)
  const baseFill = isDark ? "#1e293b" : "#ffffff";
  const affectedFill = isDark ? "#f43f5e" : "#e11d48";
  const carrierFill = isDark ? "#f59e0b" : "#d97706";
  const mutationDotColor = isDark ? "#38bdf8" : "#0284c7";

  if (person.affected) {
    // Solid fill for affected individuals (ACMG standard)
    if (shape === "square") {
      return <rect x={-r} y={-r} width={size} height={size} rx={3} fill={affectedFill} stroke={strokeColor} strokeWidth={strokeWidth} />;
    }
    if (shape === "circle") {
      return <circle r={r} fill={affectedFill} stroke={strokeColor} strokeWidth={strokeWidth} />;
    }
    return <polygon points={`${-r},0 0,${-r} ${r},0 0,${r}`} fill={affectedFill} stroke={strokeColor} strokeWidth={strokeWidth} />;
  }

  if (person.carrier) {
    // Canonical ACMG half-shaded representation for heterozygous carriers
    // Right half filled with carrier color, left half unaffected base
    if (shape === "square") {
      return (
        <g>
          <rect x={-r} y={-r} width={size} height={size} rx={3} fill={baseFill} />
          <path d={`M 0,${-r} L ${r - 2},${-r} Q ${r},${-r} ${r},${-r + 2} L ${r},${r - 2} Q ${r},${r} ${r - 2},${r} L 0,${r} Z`} fill={carrierFill} />
          <line x1={0} y1={-r} x2={0} y2={r} stroke={strokeColor} strokeWidth={1.5} />
          <rect x={-r} y={-r} width={size} height={size} rx={3} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
          {person.hasMutation && <circle cx={-r / 2} cy={0} r={4.5} fill={mutationDotColor} />}
        </g>
      );
    }
    if (shape === "circle") {
      return (
        <g>
          <circle r={r} fill={baseFill} />
          <path d={`M 0,${-r} A ${r},${r} 0 0,1 0,${r} Z`} fill={carrierFill} />
          <line x1={0} y1={-r} x2={0} y2={r} stroke={strokeColor} strokeWidth={1.5} />
          <circle r={r} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
          {person.hasMutation && <circle cx={-r / 2} cy={0} r={4.5} fill={mutationDotColor} />}
        </g>
      );
    }
    return (
      <g>
        <polygon points={`${-r},0 0,${-r} ${r},0 0,${r}`} fill={baseFill} />
        <polygon points={`0,${-r} ${r},0 0,${r}`} fill={carrierFill} />
        <line x1={0} y1={-r} x2={0} y2={r} stroke={strokeColor} strokeWidth={1.5} />
        <polygon points={`${-r},0 0,${-r} ${r},0 0,${r}`} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
        {person.hasMutation && <circle cx={-r / 2} cy={0} r={4.5} fill={mutationDotColor} />}
      </g>
    );
  }

  // Normal / Unaffected (with optional confirmed mutation dot)
  return (
    <g>
      {shape === "square" && <rect x={-r} y={-r} width={size} height={size} rx={3} fill={baseFill} stroke={strokeColor} strokeWidth={strokeWidth} />}
      {shape === "circle" && <circle r={r} fill={baseFill} stroke={strokeColor} strokeWidth={strokeWidth} />}
      {shape === "diamond" && <polygon points={`${-r},0 0,${-r} ${r},0 0,${r}`} fill={baseFill} stroke={strokeColor} strokeWidth={strokeWidth} />}
      {person.hasMutation && <circle cx={0} cy={0} r={5} fill={mutationDotColor} />}
    </g>
  );
}

function MiniGlyph({ person, size = 20, isDark = false }) {
  const stroke = person.deceased ? (isDark ? '#94a3b8' : '#64748b') : (isDark ? '#e2e8f0' : '#1e293b');
  const baseFill = isDark ? '#1e293b' : '#ffffff';
  const aff = isDark ? '#f43f5e' : '#e11d48';
  const carr = isDark ? '#f59e0b' : '#d97706';
  const shape = person.sex === 'male' ? 'sq' : person.sex === 'female' ? 'ci' : 'di';

  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" className="shrink-0" aria-hidden="true">
      {person.affected ? (
        shape === 'sq' ? <rect x={-9} y={-9} width={18} height={18} rx={2} fill={aff} stroke={stroke} strokeWidth={1.8} /> :
        shape === 'ci' ? <circle r={9} fill={aff} stroke={stroke} strokeWidth={1.8} /> :
        <polygon points="-9,0 0,-9 9,0 0,9" fill={aff} stroke={stroke} strokeWidth={1.8} />
      ) : person.carrier ? (
        <g>
          {shape === 'sq' && <><rect x={-9} y={-9} width={18} height={18} rx={2} fill={baseFill} /><rect x={0} y={-9} width={9} height={18} fill={carr} /><line x1={0} y1={-9} x2={0} y2={9} stroke={stroke} strokeWidth={1.2} /><rect x={-9} y={-9} width={18} height={18} rx={2} fill="none" stroke={stroke} strokeWidth={1.8} /></>}
          {shape === 'ci' && <><circle r={9} fill={baseFill} /><path d="M 0,-9 A 9,9 0 0,1 0,9 Z" fill={carr} /><line x1={0} y1={-9} x2={0} y2={9} stroke={stroke} strokeWidth={1.2} /><circle r={9} fill="none" stroke={stroke} strokeWidth={1.8} /></>}
          {shape === 'di' && <><polygon points="-9,0 0,-9 9,0 0,9" fill={baseFill} /><polygon points="0,-9 9,0 0,9" fill={carr} /><line x1={0} y1={-9} x2={0} y2={9} stroke={stroke} strokeWidth={1.2} /><polygon points="-9,0 0,-9 9,0 0,9" fill="none" stroke={stroke} strokeWidth={1.8} /></>}
        </g>
      ) : (
        <g>
          {shape === 'sq' && <rect x={-9} y={-9} width={18} height={18} rx={2} fill={baseFill} stroke={stroke} strokeWidth={1.8} />}
          {shape === 'ci' && <circle r={9} fill={baseFill} stroke={stroke} strokeWidth={1.8} />}
          {shape === 'di' && <polygon points="-9,0 0,-9 9,0 0,9" fill={baseFill} stroke={stroke} strokeWidth={1.8} />}
          {person.hasMutation && <circle cx={0} cy={0} r={3} fill="#0284c7" />}
        </g>
      )}
      {person.deceased && <line x1={-9} y1={-9} x2={9} y2={9} stroke={stroke} strokeWidth={2} />}
    </svg>
  );
}

// ---- Clinical Connectors (Lines & Double Consanguinity & Junction Beads) ----
function FamilyConnectors({ connectors, isDark = false }) {
  const lineMating = isDark ? "#94a3b8" : "#334155";
  const lineDescent = isDark ? "#64748b" : "#64748b";
  const junctionFill = isDark ? "#cbd5e1" : "#1e293b";

  return (
    <>
      {/* Mating lines */}
      {connectors.mating.map((s, i) => (
        s.points ? (
          s.consanguineous ? (
            <g key={`mat-${i}`}>
              <polyline points={s.points.map(([px, py]) => `${px},${py - 3}`).join(' ')} fill="none" stroke={lineMating} strokeWidth={1.8} />
              <polyline points={s.points.map(([px, py]) => `${px},${py + 3}`).join(' ')} fill="none" stroke={lineMating} strokeWidth={1.8} />
            </g>
          ) : (
            <polyline key={`mat-${i}`} points={s.points.map(([px, py]) => `${px},${py}`).join(' ')} fill="none" stroke={lineMating} strokeWidth={2.2} />
          )
        ) : s.consanguineous ? (
          <g key={`mat-${i}`}>
            <line x1={s.x1} y1={s.y1 - 3} x2={s.x2} y2={s.y2 - 3} stroke={lineMating} strokeWidth={1.8} />
            <line x1={s.x1} y1={s.y1 + 3} x2={s.x2} y2={s.y2 + 3} stroke={lineMating} strokeWidth={1.8} />
          </g>
        ) : (
          <line key={`mat-${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={lineMating} strokeWidth={2.2} />
        )
      ))}

      {/* Vertical Descent lines from marriages with publication-quality junction pips */}
      {connectors.drop.map((s, i) => (
        <g key={`drp-${i}`}>
          <circle cx={s.x} cy={s.y1} r={2.8} fill={junctionFill} />
          <line x1={s.x} y1={s.y1} x2={s.x} y2={s.y2} stroke={lineDescent} strokeWidth={2} strokeLinecap="round" />
        </g>
      ))}

      {/* Sibship horizontal bars */}
      {connectors.sibship.map((s, i) => (
        <line key={`sib-${i}`} x1={s.x1} y1={s.y} x2={s.x2} y2={s.y} stroke={lineDescent} strokeWidth={2} strokeLinecap="round" />
      ))}

      {/* Child link drops */}
      {connectors.childLink.map((s, i) => (
        <line key={`cl-${i}`} x1={s.x1 ?? s.x} y1={s.y1} x2={s.x2 ?? s.x} y2={s.y2} stroke={lineDescent} strokeWidth={2} strokeLinecap="round" />
      ))}

      {/* Twin horizontal bars for MZ */}
      {(connectors.twinBars || []).map((s, i) => (
        <line key={`tb-${i}`} x1={s.x1} y1={s.y} x2={s.x2} y2={s.y} stroke={lineDescent} strokeWidth={2.2} strokeLinecap="round" />
      ))}

      {/* Twin zygosity unknown marks */}
      {(connectors.twinMarks || []).map((m, i) => (
        <g key={`tm-${i}`} transform={`translate(${m.x},${m.y})`}>
          <circle r={6.5} fill={isDark ? "#1e293b" : "#ffffff"} stroke={lineDescent} strokeWidth={1.2} />
          <text y={3} textAnchor="middle" fill={isDark ? "#f1f5f9" : "#334155"} className="text-[9px] font-bold font-mono select-none">
            {m.label || '?'}
          </text>
        </g>
      ))}

      {/* Long edge polylines */}
      {connectors.longEdge.map((e, i) => (
        <polyline key={`le-${i}`} points={e.points.map((pt) => pt.join(',')).join(' ')} fill="none" stroke={lineDescent} strokeWidth={2} strokeDasharray="5 3" />
      ))}
    </>
  );
}

function PersonNode({ person, pos, selected, riskAssessment, onSelect, onContextMenu, isDark = false }) {
  const isHighRisk = riskAssessment && (
    riskAssessment.status === RISK_STATUS.AFFECTED ||
    riskAssessment.status === RISK_STATUS.OBLIGATE_CARRIER ||
    (riskAssessment.probability && riskAssessment.probability >= 0.5)
  );

  const isProband = !!person.isProband;

  // Subtitle metadata string
  const subLabel = person.deceased
    ? (person.deathAge ? `فوت: ${person.deathAge} سال` : 'متوفی')
    : person.age
    ? `${person.age} سال`
    : `کد: ${person.id.slice(0, 6)}`;

  return (
    <g
      transform={`translate(${pos.x},${pos.y})`}
      data-node
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className="cursor-pointer group focus:outline-hidden"
      tabIndex={0}
      role="button"
      aria-label={`پرونده ${person.name || person.id}`}>

      {/* High precision selection focus ring & reticle */}
      {selected && (
        <g className="animate-clinical-pulse">
          <circle r={35} fill={isDark ? "rgba(14, 165, 233, 0.15)" : "rgba(2, 132, 199, 0.12)"} stroke="#0284c7" strokeWidth={2.2} strokeDasharray="5 3" />
          <path d="M -30 -22 L -30 -30 L -22 -30" fill="none" stroke="#0ea5e9" strokeWidth={2} strokeLinecap="round" />
          <path d="M 30 -22 L 30 -30 L 22 -30" fill="none" stroke="#0ea5e9" strokeWidth={2} strokeLinecap="round" />
          <path d="M -30 22 L -30 30 L -22 30" fill="none" stroke="#0ea5e9" strokeWidth={2} strokeLinecap="round" />
          <path d="M 30 22 L 30 30 L 22 30" fill="none" stroke="#0ea5e9" strokeWidth={2} strokeLinecap="round" />
        </g>
      )}

      {/* Hover ring */}
      <circle
        r={33}
        fill="none"
        stroke={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.08)"}
        strokeWidth={1}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      />

      {/* Click hit area */}
      <rect x={-34} y={-34} width={68} height={92} fill="transparent" />

      {/* ACMG Clinical Glyph */}
      <PersonGlyph person={person} isDark={isDark} />

      {/* Deceased diagonal slash across symbol */}
      {person.deceased && (
        <line
          x1={-26}
          y1={-26}
          x2={26}
          y2={26}
          stroke={isDark ? "#cbd5e1" : "#1e293b"}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      )}

      {/* ACMG Proband Arrow (Index Case - pointing to lower-left of symbol) */}
      {isProband && (
        <g transform="translate(-25, 25)">
          <line x1={-18} y1={18} x2={-2} y2={2} stroke="#2563eb" strokeWidth={2.2} strokeLinecap="round" />
          <polygon points="-1,1 -7,2 -2,7" fill="#2563eb" />
          <circle cx={-24} cy={24} r={6.5} fill="#2563eb" />
          <text x={-24} y={27} textAnchor="middle" fill="#ffffff" className="text-[8.5px] font-bold font-mono">P</text>
        </g>
      )}

      {/* Labels below node: Name + structured clinical metadata */}
      <text
        y={40}
        textAnchor="middle"
        className={`select-none text-[11px] font-bold tracking-tight ${
          isDark ? "fill-slate-100" : "fill-slate-900"
        }`}>
        {person.name || person.id}
      </text>

      <text
        y={53}
        textAnchor="middle"
        className={`select-none text-[9.5px] font-medium font-mono ${
          isDark ? "fill-slate-400" : "fill-slate-500"
        }`}>
        {subLabel}
      </text>

      {/* High-risk Bayesian Carrier Alert Badge */}
      {isHighRisk && !person.affected && (
        <g transform="translate(26,-26)">
          <circle r={8.5} fill="#fef3c7" stroke="#d97706" strokeWidth={1.5} />
          <path d="M0 -3.5 L0 0.5 M0 2.5 L0 3.5" stroke="#d97706" strokeWidth={1.6} strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

// ---- Scientific Debug Bounding Boxes Overlay (Collision & Spacing Logic) ----
function DebugBoundingBoxesOverlay({ debugBoxes, showClearance = true }) {
  if (!debugBoxes) return null;
  const { nodes = [], connectors = [] } = debugBoxes;

  return (
    <g className="debug-bounding-boxes-overlay select-none pointer-events-none">
      {/* 1. Clearance Corridor Envelopes around Nodes */}
      {showClearance && nodes.map((box) => (
        <g key={`dbg-clr-${box.id}`}>
          <rect
            x={box.clearanceBox.x}
            y={box.clearanceBox.y}
            width={box.clearanceBox.width}
            height={box.clearanceBox.height}
            fill="rgba(245, 158, 11, 0.05)"
            stroke="#f59e0b"
            strokeWidth={1}
            strokeDasharray="3 3"
            rx={4}
          />
          <text
            x={box.clearanceBox.x + 4}
            y={box.clearanceBox.y + 9}
            fill="#d97706"
            className="text-[7.5px] font-mono font-medium">
            حریم {box.clearanceBox.width}px
          </text>
        </g>
      ))}

      {/* 2. Connector Lines Bounding Boxes */}
      {connectors.map((c) => {
        const color = {
          mating: { stroke: '#818cf8', fill: 'rgba(99, 102, 241, 0.08)', text: '#4f46e5' },
          sibship: { stroke: '#34d399', fill: 'rgba(16, 185, 129, 0.08)', text: '#059669' },
          drop: { stroke: '#94a3b8', fill: 'rgba(148, 163, 184, 0.12)', text: '#475569' },
          childLink: { stroke: '#2dd4bf', fill: 'rgba(20, 184, 166, 0.07)', text: '#0d9488' },
          twinBar: { stroke: '#fbbf24', fill: 'rgba(245, 158, 11, 0.14)', text: '#b45309' },
        }[c.type] || { stroke: '#94a3b8', fill: 'rgba(148, 163, 184, 0.08)', text: '#64748b' };

        return (
          <g key={`dbg-conn-${c.id}`}>
            <rect
              x={c.x}
              y={c.y}
              width={Math.max(c.width, 4)}
              height={Math.max(c.height, 4)}
              fill={color.fill}
              stroke={color.stroke}
              strokeWidth={1.3}
              strokeDasharray="4 2"
              rx={2}
            />
            {c.width > 24 && (
              <text
                x={c.x + c.width / 2}
                y={c.y - 3}
                textAnchor="middle"
                fill={color.text}
                className="text-[8px] font-mono font-bold">
                {c.label} ({c.width}px)
              </text>
            )}
          </g>
        );
      })}

      {/* 3. Tight Physical Bounding Envelopes around Nodes */}
      {nodes.map((box) => (
        <g key={`dbg-node-${box.id}`}>
          {/* Node physical envelope */}
          <rect
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            fill="rgba(14, 165, 233, 0.09)"
            stroke="#0284c7"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            rx={3}
          />
          {/* Header pill showing dimensions and coordinates */}
          <g transform={`translate(${box.x}, ${box.y - 12})`}>
            <rect width={box.width} height={12} fill="#0284c7" rx={2} />
            <text
              x={box.width / 2}
              y={9}
              textAnchor="middle"
              fill="#ffffff"
              className="text-[7.5px] font-mono font-bold tracking-tight">
              {box.width}×{box.height}
            </text>
          </g>
          {/* Center marker crosshair */}
          <line x1={box.centerX - 4} y1={box.centerY} x2={box.centerX + 4} y2={box.centerY} stroke="#0284c7" strokeWidth={1} />
          <line x1={box.centerX} y1={box.centerY - 4} x2={box.centerX} y2={box.centerY + 4} stroke="#0284c7" strokeWidth={1} />
        </g>
      ))}
    </g>
  );
}

// ---- Scientific Legend HUD ----
function ClinicalLegend({ isDark = false, defaultExpanded = false }) {
  return <CollapsibleClinicalLegend isDark={isDark} defaultExpanded={defaultExpanded} />;
}

// ---- Scientific UI Button & Input Primitives ----
function LabBtn({ children, onClick, variant = 'default', className = '', title, disabled, ariaLabel, isDark = false }) {
  const styles = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white border-blue-600 shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500",
    danger: isDark
      ? "bg-rose-950/60 text-rose-300 border-rose-800 hover:bg-rose-900/60 focus-visible:ring-2 focus-visible:ring-rose-500"
      : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 focus-visible:ring-2 focus-visible:ring-rose-500",
    default: isDark
      ? "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700/80 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-500"
      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-400",
    success: isDark
      ? "bg-emerald-950/60 text-emerald-300 border-emerald-800 hover:bg-emerald-900/60 focus-visible:ring-2 focus-visible:ring-emerald-500"
      : "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-500",
  }[variant] || "";

  return (
    <button title={title} aria-label={ariaLabel || title} disabled={disabled} onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 outline-hidden ${styles} ${className}`}>
      {children}
    </button>
  );
}

function LabIconBtn({ children, onClick, title, disabled, className = '', ariaLabel, isDark = false }) {
  return (
    <button title={title} aria-label={ariaLabel || title} disabled={disabled} onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-lg border shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 outline-hidden ${
        isDark
          ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      } ${className}`}>
      {children}
    </button>
  );
}

function LabStat({ label, value, unit, color = "blue", isDark = false }) {
  const colorMap = {
    blue: isDark ? "text-sky-400" : "text-blue-600",
    emerald: isDark ? "text-emerald-400" : "text-emerald-600",
    rose: isDark ? "text-rose-400" : "text-rose-600",
    amber: isDark ? "text-amber-400" : "text-amber-600",
    slate: isDark ? "text-slate-100" : "text-slate-800",
  }[color] || (isDark ? "text-slate-100" : "text-slate-800");

  return (
    <div className={`rounded-xl border p-2.5 shadow-xs transition ${
      isDark ? "border-slate-800 bg-slate-900/90" : "border-slate-200 bg-white"
    }`}>
      <div className={`text-[10px] font-medium tracking-wider uppercase ${isDark ? "text-slate-400" : "text-slate-400"}`}>{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={`text-xl font-bold font-mono tabular-nums ${colorMap}`}>{value}</span>
        {unit && <span className={`text-[10px] font-mono ${isDark ? "text-slate-400" : "text-slate-400"}`}>{unit}</span>}
      </div>
    </div>
  );
}

function Segmented({ value, onChange, options, isDark = false }) {
  return (
    <div className={`flex gap-1 rounded-lg border p-1 ${
      isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-100"
    }`}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md py-1.5 text-xs font-medium transition outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 ${
            value === o.value
              ? isDark ? 'bg-slate-800 text-white shadow-sm' : 'bg-white text-slate-900 shadow-sm'
              : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LabToggle({ checked, onChange, label, isDark = false }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 ${
        isDark
          ? "border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-200"
          : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
      }`}>
      <span>{label}</span>
      <span className={`relative inline-block h-4 w-8 rounded-full transition ${checked ? 'bg-blue-600' : isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
        <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all" style={{ left: checked ? 18 : 2 }} />
      </span>
    </button>
  );
}

// ---------------- Main Clinical Genetics Pedigree Application ----------------
export default function GeneticPedigreeApp() {
  const initial = {
    data: buildSample(),
    selectedId: null,
    inheritanceModel: INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE,
    zoom: 1,
    offset: { x: 80, y: 80 },
  };
  const { history, dispatch } = useHistory(initial);
  const state = history.present;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const [menu, setMenu] = useState({ x: 0, y: 0, id: null });
  const [query, setQuery] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [savedCases, setSavedCases] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [debugMode, setDebugMode] = useState(false);
  const [showClearance, setShowClearance] = useState(true);
  const [isDark, setIsDark] = useState(false);

  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const dragging = useRef(null);
  const didFit = useRef(false);

  // Layout computation
  const layout = useMemo(() => {
    return computePedigreeLayout(state.data);
  }, [state.data]);

  const nodes = layout.nodes;
  const selected = state.selectedId ? state.data.people[state.selectedId] : null;
  const people = Object.values(state.data.people);
  const filtered = people.filter((p) => !query || String(p.name || '').toLowerCase().includes(query.toLowerCase()));

  const stats = useMemo(() => {
    const gens = Object.values(layout.generations || {});
    const maxGen = gens.length ? gens.reduce((m, g) => (g > m ? g : m), 0) + 1 : 0;
    return {
      total: people.length,
      affected: people.filter((p) => p.affected).length,
      carriers: people.filter((p) => p.carrier).length,
      mutations: people.filter((p) => p.hasMutation).length,
      generations: maxGen,
    };
  }, [people, layout]);

  // Evaluated risk for selected person
  const selectedRisk = useMemo(() => {
    if (!selected) return null;
    return calculateGeneticRisk(selected, state.data, state.inheritanceModel);
  }, [selected, state.data, state.inheritanceModel]);

  // Pan & Zoom controls
  const onMouseDown = (e) => {
    if (e.target.closest('[data-node]') || e.target.closest('[data-ui]')) return;
    dragging.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragging.current.x, dy = e.clientY - dragging.current.y;
    dragging.current = { x: e.clientX, y: e.clientY };
    dispatch({ type: 'PAN', dx, dy });
  };
  const onMouseUp = () => { dragging.current = null; };
  const onWheel = (e) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    const cx = e.clientX - (rect?.left || 0);
    const cy = e.clientY - (rect?.top || 0);
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    dispatch({ type: 'ZOOM', factor, center: { cx, cy } });
  };
  const openMenu = (e, id) => {
    e.preventDefault();
    const r = wrapRef.current?.getBoundingClientRect();
    setMenu({ x: e.clientX - (r?.left || 0), y: e.clientY - (r?.top || 0), id });
  };

  const addRelative = (kind, baseId) => {
    const base = state.data.people[baseId]; if (!base) return;
    if (kind === 'mother') dispatch({ type: 'ADD_PARENT', childId: baseId, sex: 'female' });
    else if (kind === 'father') dispatch({ type: 'ADD_PARENT', childId: baseId, sex: 'male' });
    else if (kind === 'spouse') dispatch({ type: 'ADD_SPOUSE', personId: baseId });
    else if (kind === 'child') dispatch({ type: 'ADD_CHILD', motherId: base.sex === 'female' ? baseId : base.spouseIds?.[0], fatherId: base.sex === 'male' ? baseId : base.spouseIds?.[0] });
    else if (kind === 'twin_identical') dispatch({ type: 'ADD_TWIN', baseId, zygosity: 'identical' });
    else if (kind === 'twin_fraternal') dispatch({ type: 'ADD_TWIN', baseId, zygosity: 'fraternal' });
  };

  const fitView = () => {
    const b = layout.bounds; if (!b || !b.width || !b.height) return;
    const vw = wrapRef.current?.clientWidth || 1200;
    const vh = wrapRef.current?.clientHeight || 700;
    const pad = 48;
    const z = Math.max(0.005, Math.min(2.5, Math.min((vw - 2 * pad) / b.width, (vh - 2 * pad) / b.height)));
    dispatch({ type: 'SET_VIEW', zoom: z, offset: { x: (vw - b.width * z) / 2, y: (vh - b.height * z) / 2 } });
  };

  const focusPerson = (id) => {
    const pos = nodes[id];
    dispatch({ type: 'SELECT', id });
    if (!pos || !wrapRef.current) return;
    const vw = wrapRef.current.clientWidth || 1200;
    const vh = wrapRef.current.clientHeight || 700;
    const z = Math.max(state.zoom, 0.7);
    dispatch({
      type: 'SET_VIEW',
      zoom: z,
      offset: { x: vw / 2 - pos.x * z, y: vh / 2 - pos.y * z },
    });
  };

  // Local Persistence Operations
  const handleSaveLocal = () => {
    const caseId = state.data.metadata?.caseRef || `CASE-${Date.now().toString(36).toUpperCase()}`;
    const title = state.data.metadata?.caseTitle || `پرونده شجره‌نامه (${people.length} نفر)`;
    const res = saveCaseLocally(caseId, state.data, title);
    if (res.success) {
      setSuccessMsg(`پرونده "${title}" با موفقیت در حافظه مرورگر ذخیره شد.`);
      setSavedCases(listSavedCases());
      setTimeout(() => setSuccessMsg(''), 4000);
    } else {
      setErrorMsg(res.error || 'خطا در ذخیره‌سازی محلی.');
      setTimeout(() => setErrorMsg(''), 4000);
    }
  };

  const handleOpenStorageModal = () => {
    setSavedCases(listSavedCases());
    setStorageOpen(true);
  };

  const handleLoadCase = (id) => {
    const res = loadCaseLocally(id);
    if (res.success && res.data) {
      dispatch({ type: 'LOAD', data: res.data });
      setStorageOpen(false);
      setSuccessMsg('پرونده با موفقیت بازخوانی شد.');
      setTimeout(() => setSuccessMsg(''), 3000);
      setTimeout(fitView, 50);
    } else {
      setErrorMsg(res.error || 'خطا در بارگذاری پرونده.');
    }
  };

  const handleDeleteCase = (id) => {
    deleteCaseLocally(id);
    setSavedCases(listSavedCases());
  };

  // Clinical Exports
  const downloadBlob = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    const payload = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      metadata: {
        ...(state.data.metadata || {}),
        exportedAt: new Date().toISOString(),
        inheritanceModel: state.inheritanceModel,
      },
      people: state.data.people,
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "pedigree_case_clinical.json");
  };

  const exportCSV = () => {
    const rows = [
      ["SAMPLE_ID", "CASE_NAME", "SEX", "AFFECTED", "CARRIER", "DECEASED", "MUTATION", "IS_PROBAND", "AGE", "ONSET_AGE", "DEATH_AGE", "ZYGOSITY", "MOTHER_ID", "FATHER_ID", "SPOUSES", "CHILDREN"],
      ...people.map((p) => [
        p.id, p.name, p.sex, !!p.affected, !!p.carrier, !!p.deceased, !!p.hasMutation, !!p.isProband,
        p.age ?? "", p.diseaseOnsetAge ?? "", p.deathAge ?? "", p.twinType || "none",
        p.motherId || "", p.fatherId || "", (p.spouseIds || []).join(";"), (p.childIds || []).join(";")
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    downloadBlob(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), "pedigree_clinical_report.csv");
  };

  const exportSVG = () => {
    if (!svgRef.current) return;
    const svg = svgRef.current.cloneNode(true);
    svg.querySelectorAll('[data-ui]').forEach((n) => n.parentElement?.removeChild(n));
    downloadBlob(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }), "pedigree_clinical.svg");
  };

  const exportPNG = () => {
    if (!svgRef.current) return;
    const svg = svgRef.current.cloneNode(true);
    svg.querySelectorAll('[data-ui]').forEach((n) => n.parentElement?.removeChild(n));
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
    img.onload = () => {
      const b = layout.bounds;
      const w = Math.max(1400, b.width || 1400);
      const h = Math.max(800, b.height || 800);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = isDark ? '#090d16' : '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((png) => { if (png) downloadBlob(png, 'pedigree_clinical.png'); URL.revokeObjectURL(url); });
    };
    img.src = url;
  };

  // Safe Centralized Import Validation
  const importJSON = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result));
        const validation = validatePedigreeData(raw);

        if (!validation.isValid) {
          setErrorMsg(`فایل نامعتبر است: ${validation.errors.join(' | ')}`);
          setTimeout(() => setErrorMsg(''), 6000);
          return;
        }

        const { sanitizedData, repairLog } = sanitizeAndRepairPedigree(raw);
        dispatch({ type: 'LOAD', data: sanitizedData });
        didFit.current = false;
        setTimeout(fitView, 50);

        if (repairLog.length > 0) {
          setSuccessMsg(`فایل بارگذاری شد (${repairLog.length} تصحیح خودکار روابط انجام شد).`);
        } else {
          setSuccessMsg('فایل شجره‌نامه با موفقیت بارگذاری شد.');
        }
        setTimeout(() => setSuccessMsg(''), 4000);
      } catch {
        setErrorMsg('ساختار فایل JSON معتبر نیست.');
        setTimeout(() => setErrorMsg(''), 4000);
      }
    };
    reader.readAsText(file); e.target.value = '';
  };

  useEffect(() => {
    if (didFit.current) return;
    didFit.current = true;
    fitView();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard navigation & accessibility
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === 'Escape') {
        setMenu({ x: 0, y: 0, id: null });
        setPresetsOpen(false);
        setExportOpen(false);
        setStorageOpen(false);
        setDeleteConfirmId(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
        e.preventDefault();
        setDeleteConfirmId(state.selectedId);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.selectedId, dispatch]);

  return (
    <div dir="rtl" className={`flex h-screen w-full flex-col transition-colors duration-200 ${
      isDark ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
    }`}>
      {/* Alert toast */}
      {errorMsg && (
        <div role="alert" className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl border border-rose-500 bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl">
          <AlertTriangle size={16} />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="mr-2 rounded p-0.5 hover:bg-rose-700"><X size={14} /></button>
        </div>
      )}

      {/* Success toast */}
      {successMsg && (
        <div role="status" className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl border border-emerald-500 bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl">
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="mr-2 rounded p-0.5 hover:bg-emerald-700"><X size={14} /></button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className={`w-full max-w-sm rounded-2xl border p-5 shadow-2xl space-y-4 ${
            isDark ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
          }`}>
            <div className="flex items-center gap-3 text-rose-500">
              <div className={`grid h-10 w-10 place-items-center rounded-xl border ${
                isDark ? 'bg-rose-950/40 border-rose-800' : 'bg-rose-50 border-rose-200'
              }`}>
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold">تایید حذف فرد از شجره‌نامه</h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>آیا از حذف این پرونده اطمینان دارید؟</p>
              </div>
            </div>
            <p className={`text-xs leading-relaxed p-3 rounded-xl border ${
              isDark ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              با حذف این فرد، تمام اتصالات والدینی، همسری و فرزندی وابسته به وی قطع خواهد شد. این عملیات با کلید Undo قابل بازگشت است.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <LabBtn isDark={isDark} onClick={() => setDeleteConfirmId(null)}>انصراف</LabBtn>
              <LabBtn variant="danger" isDark={isDark} onClick={() => {
                dispatch({ type: 'DELETE', id: deleteConfirmId });
                setDeleteConfirmId(null);
              }}>
                حذف فرد
              </LabBtn>
            </div>
          </div>
        </div>
      )}

      {/* Saved Cases Modal */}
      {storageOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl space-y-4 ${
            isDark ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
              <div className="flex items-center gap-2">
                <Bookmark size={18} className="text-blue-500" />
                <h3 className="text-sm font-bold">پرونده‌های ذخیره‌شده محلی (Local Cases)</h3>
              </div>
              <button onClick={() => setStorageOpen(false)} className={`rounded-lg p-1 transition ${
                isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
              }`}>
                <X size={16} />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-2 scroll-lab">
              {savedCases.length === 0 ? (
                <div className={`py-8 text-center text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>هیچ پرونده‌ای در حافظه مرورگر ذخیره نشده است.</div>
              ) : (
                savedCases.map((c) => (
                  <div key={c.id} className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition ${
                    isDark ? 'border-slate-800 bg-slate-950/50 hover:bg-slate-800/60' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}>
                    <div className="min-w-0">
                      <div className={`text-xs font-bold truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{c.title || c.id}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {c.personCount} عضو · بروزرسانی: {new Date(c.updatedAt).toLocaleDateString('fa-IR')}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <LabBtn isDark={isDark} onClick={() => handleLoadCase(c.id)}>بازخوانی</LabBtn>
                      <LabIconBtn isDark={isDark} title="حذف" onClick={() => handleDeleteCase(c.id)} className="text-rose-500 hover:bg-rose-500/10">
                        <Trash2 size={12} />
                      </LabIconBtn>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className={`flex justify-end pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
              <LabBtn isDark={isDark} onClick={() => setStorageOpen(false)}>بستن پنجره</LabBtn>
            </div>
          </div>
        </div>
      )}

      {/* Top Laboratory Console Ribbon */}
      <header className={`flex h-14 shrink-0 items-center justify-between border-b px-4 transition-colors ${
        isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white'
      } shadow-xs`}>
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xs">
            <Dna size={19} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={`text-sm font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                کنسول آنالیز شجره‌نامه ژنتیک بالینی
              </h1>
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-mono font-medium border ${
                isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'
              }`}>
                CASE-REF: #GEN-8420
              </span>
            </div>
            <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              استاندارد جهانی رسم شجره‌نامه ACMG/NSGC · موتور سلسله‌مراتبی فاقد تداخل
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Inheritance Model Selector */}
          <div className={`flex items-center gap-1.5 border rounded-xl px-2.5 py-1 ${
            isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200'
          }`}>
            <span className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>الگوی وراثت:</span>
            <select
              value={state.inheritanceModel}
              onChange={(e) => dispatch({ type: 'SET_MODEL', model: e.target.value })}
              className={`bg-transparent text-xs font-semibold outline-hidden cursor-pointer ${
                isDark ? 'text-sky-400' : 'text-blue-700'
              }`}>
              <option value={INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE}>اتوزوم مغلوب (AR)</option>
              <option value={INHERITANCE_MODELS.AUTOSOMAL_DOMINANT}>اتوزوم غالب (AD)</option>
              <option value={INHERITANCE_MODELS.X_LINKED_RECESSIVE}>وابسته به X مغلوب (XR)</option>
            </select>
          </div>

          <div className={`h-4 w-px ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />

          <LabBtn variant="primary" isDark={isDark} onClick={() => dispatch({ type: 'ADD_PERSON' })}>
            <UserPlus size={14} /> ثبت فرد جدید
          </LabBtn>

          {/* Presets dropdown */}
          <div className="relative">
            <LabBtn isDark={isDark} onClick={() => setPresetsOpen((o) => !o)}>
              <Layers size={14} /> الگوهای آزمایشی <ChevronDown size={12} />
            </LabBtn>
            {presetsOpen && (
              <div className={`absolute left-0 top-full z-40 mt-1 w-72 rounded-xl border p-1.5 shadow-xl ${
                isDark ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-800'
              }`}>
                <button onClick={() => { dispatch({ type: 'LOAD', data: build20GenPedigree() }); setPresetsOpen(false); setTimeout(fitView, 50); }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs transition ${
                    isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-50'
                  }`}>
                  <GitFork size={14} className="text-emerald-500" />
                  <div>
                    <div className="font-semibold">شجره‌نامه ۲۰ نسلی ۵ فرزندی</div>
                    <div className="text-[10px] text-slate-400">شامل دوقلوها (MZ/DZ)، چندهمسری و خویشاوندی</div>
                  </div>
                </button>
                <button onClick={() => { dispatch({ type: 'LOAD', data: buildSample() }); setPresetsOpen(false); setTimeout(fitView, 50); }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs transition ${
                    isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-50'
                  }`}>
                  <Activity size={14} className="text-blue-500" />
                  <div>
                    <div className="font-semibold">خانواده استاندارد بالینی</div>
                    <div className="text-[10px] text-slate-400">۳ نسل، دوقلو، پروباند و موارد بالینی</div>
                  </div>
                </button>
                <button onClick={() => { dispatch({ type: 'LOAD', data: build5ChildTree(2) }); setPresetsOpen(false); setTimeout(fitView, 50); }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs transition ${
                    isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-50'
                  }`}>
                  <GitFork size={14} className="text-cyan-500" />
                  <div>
                    <div className="font-semibold">الگوی ۵ فرزند در هر خانواده</div>
                    <div className="text-[10px] text-slate-400">هر فرزند یک همسر و ۵ فرزند (چندشاخه)</div>
                  </div>
                </button>
                <button onClick={() => { dispatch({ type: 'LOAD', data: buildLargeSample(50) }); setPresetsOpen(false); setTimeout(fitView, 50); }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs transition ${
                    isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-50'
                  }`}>
                  <Layers size={14} className="text-indigo-400" />
                  <div>
                    <div className="font-semibold">شجره‌نامه ۵۰ نسلی (طولی)</div>
                    <div className="text-[10px] text-slate-400">عمق فوق‌العاده بالا، بدون افت کارایی</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          <div className={`h-4 w-px ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
          <LabIconBtn isDark={isDark} title="بازگردانی (Ctrl+Z)" disabled={!canUndo} onClick={() => dispatch({ type: 'UNDO' })}><Undo2 size={14} /></LabIconBtn>
          <LabIconBtn isDark={isDark} title="تکرار (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => dispatch({ type: 'REDO' })}><Redo2 size={14} /></LabIconBtn>

          <div className={`h-4 w-px ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />

          {/* Local Persistence Buttons */}
          <LabBtn isDark={isDark} onClick={handleSaveLocal} title="ذخیره شجره‌نامه در حافظه مرورگر">
            <Bookmark size={14} /> ذخیره در مرورگر
          </LabBtn>
          <LabBtn isDark={isDark} onClick={handleOpenStorageModal} title="مشاهده پرونده‌های ذخیره‌شده">
            <FileText size={14} /> پرونده‌ها
          </LabBtn>

          <div className={`h-4 w-px ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />

          <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-xs transition ${
            isDark ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}>
            <Upload size={14} /> ورود داده
            <input type="file" accept="application/json" className="hidden" onChange={importJSON} />
          </label>

          <div className="relative">
            <LabBtn isDark={isDark} onClick={() => setExportOpen((o) => !o)}>
              <Download size={14} /> گزارش آزمایشگاهی <ChevronDown size={12} />
            </LabBtn>
            {exportOpen && (
              <div className={`absolute left-0 top-full z-40 mt-1 w-48 rounded-xl border p-1 shadow-lg ${
                isDark ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-800'
              }`}>
                {[
                  ['فرمت داده JSON', exportJSON],
                  ['جدول اطلاعاتی CSV (اکسل)', exportCSV],
                  ['وکتور کیفیت بالا SVG', exportSVG],
                  ['تصویر رندرشده PNG', exportPNG],
                ].map(([label, fn]) => (
                  <button key={label} onClick={() => { fn(); setExportOpen(false); }}
                    className={`block w-full rounded-lg px-3 py-2 text-right text-xs transition ${
                      isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-50'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={`h-4 w-px ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />

          {/* Clinical Theme Toggle Button */}
          <LabIconBtn
            isDark={isDark}
            title={isDark ? "تغییر به تم روشن بالینی (Light Lab)" : "تغییر به تم تاریک آزمایشگاهی (Dark Lab)"}
            ariaLabel="تغییر تم"
            onClick={() => setIsDark((v) => !v)}>
            {isDark ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} className="text-slate-600" />}
          </LabIconBtn>
        </div>
      </header>

      {/* Main Workspace (Asymmetric Clinical Layout) */}
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {/* Left Clinical Sidebar: Samples & Registry */}
        <aside className="flex w-72 shrink-0 flex-col gap-3">
          <div className={`flex min-h-0 flex-1 flex-col rounded-2xl border shadow-xs transition ${
            isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white'
          }`}>
            <div className={`flex items-center justify-between border-b p-3 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
              <div className="flex items-center gap-2">
                <Users size={16} className="text-blue-500" />
                <h2 className="text-xs font-bold">پرونده‌ها و نمونه‌ها</h2>
              </div>
              <span className={`font-mono text-[11px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {filtered.length} / {people.length}
              </span>
            </div>

            <div className={`p-2 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute right-2.5 top-2.5 text-slate-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجو بر اساس نام یا کد..."
                  className={`w-full rounded-xl border py-1.5 pr-8 pl-2 text-xs outline-none transition ${
                    isDark
                      ? 'border-slate-700 bg-slate-950 text-slate-100 focus:border-blue-500'
                      : 'border-slate-200 bg-slate-50 text-slate-800 focus:border-blue-500 focus:bg-white'
                  }`} />
              </div>
            </div>

            <div className="scroll-lab flex-1 overflow-y-auto p-1.5 space-y-1">
              {filtered.length === 0 && (
                <div className={`py-8 text-center text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>هیچ نمونه‌ای یافت نشد</div>
              )}
              {filtered.map((p) => {
                const isSel = state.selectedId === p.id;
                return (
                  <div key={p.id}
                    onClick={() => focusPerson(p.id)}
                    className={`flex items-center justify-between gap-2 rounded-xl p-2 cursor-pointer transition text-xs border ${
                      isSel
                        ? (isDark ? 'border-sky-500 bg-sky-950/40 text-white font-semibold' : 'border-blue-500 bg-blue-50/70 text-blue-900 font-semibold')
                        : (isDark ? 'border-transparent hover:bg-slate-800/60 text-slate-300' : 'border-transparent hover:bg-slate-50 text-slate-700')
                    }`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <MiniGlyph person={p} isDark={isDark} />
                      <div className="truncate">
                        <div className="truncate text-xs flex items-center gap-1.5">
                          <span>{p.name || 'بی‌نام'}</span>
                          {p.isProband && (
                            <span className="font-mono text-[9px] font-bold text-blue-500">[P]</span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {p.deceased ? `فوت${p.deathAge ? ` (${p.deathAge})` : ''}` : p.age ? `${p.age} سال` : p.id.slice(0, 7)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {p.affected && (
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                          isDark ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-rose-100 text-rose-700'
                        }`}>
                          مبتلا
                        </span>
                      )}
                      {p.carrier && (
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                          isDark ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-amber-100 text-amber-700'
                        }`}>
                          ناقل
                        </span>
                      )}
                      <Crosshair size={13} className="text-slate-400 hover:text-blue-500 transition" title="پرش به موقعیت فرد در بوم" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Clinical Telemetry Grid */}
          <div className="grid grid-cols-2 gap-2 shrink-0">
            <LabStat isDark={isDark} label="کل نمونه‌ها" value={stats.total} unit="نفر" color="slate" />
            <LabStat isDark={isDark} label="عمق نسلی" value={stats.generations} unit="نسل" color="blue" />
            <LabStat isDark={isDark} label="موارد فنوتیپ مثبت" value={stats.affected} unit="کیس" color="rose" />
            <LabStat isDark={isDark} label="ناقلین هتروزیگوت" value={stats.carriers} unit="نفر" color="amber" />
          </div>
        </aside>

        {/* Center Stage: Millimeter Grid Canvas */}
        <main className={`flex min-w-0 flex-1 flex-col rounded-2xl border shadow-xs overflow-hidden transition-colors ${
          isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
        }`}>
          <div ref={wrapRef} className={`relative flex-1 overflow-hidden ${
            isDark ? 'bg-slate-950' : 'bg-slate-50'
          }`}>
            {/* Technical HUD Controls */}
            <div data-ui className="absolute left-3 top-3 z-10 flex gap-1">
              <LabIconBtn isDark={isDark} title="بزرگ‌نمایی" onClick={() => dispatch({ type: 'ZOOM', factor: 1.25 })}><Plus size={14} /></LabIconBtn>
              <LabIconBtn isDark={isDark} title="کوچک‌نمایی" onClick={() => dispatch({ type: 'ZOOM', factor: 0.8 })}><Minus size={14} /></LabIconBtn>
              <LabIconBtn isDark={isDark} title="کادربندی کامل (Fit View)" onClick={fitView}><Maximize2 size={14} /></LabIconBtn>
              <LabIconBtn isDark={isDark} title="ریست نما به مختصات اولیه" onClick={() => dispatch({ type: 'RESET' })}><RotateCcw size={14} /></LabIconBtn>
              <LabIconBtn
                isDark={isDark}
                title={debugMode ? "غیرفعال‌سازی حالت عیب‌یابی کادرها" : "فعال‌سازی حالت عیب‌یابی کادرها و فواصل (Debug Mode)"}
                ariaLabel="حالت عیب‌یابی کادرها و فواصل"
                className={debugMode ? '!bg-amber-500 !border-amber-600 text-white shadow-sm' : ''}
                onClick={() => setDebugMode((v) => !v)}>
                <Bug size={14} />
              </LabIconBtn>
              <div className={`flex items-center rounded-lg border px-2.5 text-[11px] font-mono shadow-xs ${
                isDark ? 'border-slate-700 bg-slate-800/90 text-slate-300' : 'border-slate-300 bg-white text-slate-600'
              }`}>
                ZOOM: {Math.round(state.zoom * 100)}%
              </div>
            </div>

            {/* Debug Mode Diagnostic HUD Panel */}
            {debugMode && (
              <div
                data-ui
                dir="rtl"
                className={`absolute bottom-16 left-3 z-20 w-80 rounded-2xl border p-3.5 shadow-xl backdrop-blur-md text-xs animate-in fade-in slide-in-from-bottom-2 ${
                  isDark ? 'border-amber-500/40 bg-slate-900/95 text-slate-200' : 'border-amber-300 bg-white/95 text-slate-800'
                }`}>
                <div className={`flex items-center justify-between pb-2 border-b mb-2.5 ${isDark ? 'border-amber-900/40' : 'border-amber-100'}`}>
                  <div className="flex items-center gap-1.5 font-bold text-amber-500">
                    <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    حالت عیب‌یابی کادرها و تداخلات
                  </div>
                  <button
                    onClick={() => setDebugMode(false)}
                    className="text-slate-400 hover:text-slate-200 rounded p-0.5 transition cursor-pointer"
                    title="بستن پنل عیب‌یابی">
                    <X size={13} />
                  </button>
                </div>

                <div className="space-y-2 text-[11px]">
                  <div className="flex justify-between items-center gap-2">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>کادرهای افراد (Nodes):</span>
                    <span className="font-mono font-bold text-sky-400 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-800 text-[10px] whitespace-nowrap">
                      {layout.debugBoxes?.nodes?.length ?? 0} کادر
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>راهروهای اتصالات:</span>
                    <span className="font-mono font-bold text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800 text-[10px] whitespace-nowrap">
                      {layout.debugBoxes?.connectors?.length ?? 0} مسیر
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>وضعیت تداخلات (Collisions):</span>
                    <span className="font-mono font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800 text-[10px] whitespace-nowrap">
                      {layout.collisions?.finalCollisions === 0 ? '۰ تداخل (فاقد همپوشانی ✓)' : `${layout.collisions?.finalCollisions} تداخل`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>گام‌های تراز دینامیک:</span>
                    <span className="font-mono text-[10px]">{layout.collisions?.iterations ?? 1} گام</span>
                  </div>
                </div>

                <div className={`mt-2.5 pt-2 border-t flex items-center justify-between ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                  <label className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showClearance}
                      onChange={(e) => setShowClearance(e.target.checked)}
                      className="rounded border-slate-600 text-amber-500 focus:ring-amber-500"
                    />
                    نمایش حریم حداقل فاصله (Clearance)
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">104 / 80 / 82 px</span>
                </div>
              </div>
            )}

            {/* Standard Pedigree ACMG Nomenclature Collapsible Legend */}
            <div data-ui className="absolute bottom-3 left-3 z-20">
              <CollapsibleClinicalLegend isDark={isDark} defaultExpanded={false} />
            </div>

            {/* SVG Canvas with Millimeter Grid */}
            <svg ref={svgRef} className="canvas-svg h-full w-full"
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
              onWheel={onWheel} onContextMenu={(e) => openMenu(e, null)}>
              <defs>
                <pattern id="smallGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke={isDark ? "#172033" : "#e2e8f0"} strokeWidth="0.8" />
                </pattern>
                <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
                  <rect width="100" height="100" fill="url(#smallGrid)" />
                  <path d="M 100 0 L 0 0 0 100" fill="none" stroke={isDark ? "#1e293b" : "#cbd5e1"} strokeWidth="1.2" />
                </pattern>
              </defs>

              <rect width="100%" height="100%" fill="url(#grid)" />

              <g transform={`translate(${state.offset.x},${state.offset.y}) scale(${state.zoom})`}>
                {/* Generation Rulers on the left */}
                {Array.from({ length: stats.generations }).map((_, gIdx) => {
                  const y = (layout.bounds.minY || 0) + gIdx * 155;
                  const romanNumerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];
                  const roman = romanNumerals[gIdx] || `G${gIdx + 1}`;
                  return (
                    <g key={`gen-${gIdx}`} opacity={0.85} className="select-none pointer-events-none">
                      <rect x={12} y={y - 12} width={70} height={24} rx={6}
                        fill={isDark ? "#1e293b" : "#f1f5f9"}
                        stroke={isDark ? "#334155" : "#cbd5e1"}
                        strokeWidth={1} />
                      <text x={47} y={y + 4} textAnchor="middle"
                        fill={isDark ? "#94a3b8" : "#334155"}
                        className="text-[10px] font-mono font-bold">
                        {roman} ({gIdx + 1})
                      </text>
                    </g>
                  );
                })}

                <FamilyConnectors connectors={layout.connectors} isDark={isDark} />

                {/* Debug Mode Bounding Boxes & Clearance Envelopes */}
                {debugMode && (
                  <DebugBoundingBoxesOverlay debugBoxes={layout.debugBoxes} showClearance={showClearance} />
                )}

                {people.map((p) => {
                  const pos = nodes[p.id]; if (!pos) return null;
                  const riskAssessment = calculateGeneticRisk(p, state.data, state.inheritanceModel);
                  return (
                    <PersonNode key={p.id} person={p} pos={pos} riskAssessment={riskAssessment}
                      selected={state.selectedId === p.id}
                      isDark={isDark}
                      onSelect={() => dispatch({ type: 'SELECT', id: p.id })}
                      onContextMenu={(e) => openMenu(e, p.id)} />
                  );
                })}
              </g>
            </svg>

            {/* Context Menu */}
            {menu.id !== null && (
              <div className={`absolute z-50 rounded-xl border p-1.5 shadow-2xl text-xs w-52 ${
                isDark ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-800'
              }`}
                style={{ left: menu.x, top: menu.y }} onMouseLeave={() => setMenu({ x: 0, y: 0, id: null })}>
                <div className={`border-b px-2.5 py-1 text-[10px] font-mono font-bold ${isDark ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-400'}`}>
                  عملیات خویشاوندی
                </div>
                <div className="py-1 space-y-0.5">
                  <button className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-right hover:bg-indigo-500/10 text-indigo-400 font-medium" onClick={() => { addRelative('twin_identical', menu.id); setMenu({ x: 0, y: 0, id: null }); }}>
                    افزودن قل همسان (MZ) <Plus size={12} className="text-indigo-400" />
                  </button>
                  <button className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-right hover:bg-sky-500/10 text-sky-400 font-medium" onClick={() => { addRelative('twin_fraternal', menu.id); setMenu({ x: 0, y: 0, id: null }); }}>
                    افزودن قل ناهمسان (DZ) <Plus size={12} className="text-sky-400" />
                  </button>
                  <div className={`my-1 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`} />
                  <button className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-right transition ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`} onClick={() => { addRelative('mother', menu.id); setMenu({ x: 0, y: 0, id: null }); }}>
                    افزودن مادر (والد مونث) <Plus size={12} className="text-slate-400" />
                  </button>
                  <button className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-right transition ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`} onClick={() => { addRelative('father', menu.id); setMenu({ x: 0, y: 0, id: null }); }}>
                    افزودن پدر (والد مذکر) <Plus size={12} className="text-slate-400" />
                  </button>
                  <button className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-right transition ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`} onClick={() => { addRelative('spouse', menu.id); setMenu({ x: 0, y: 0, id: null }); }}>
                    افزودن همسر <Plus size={12} className="text-slate-400" />
                  </button>
                  <button className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-right transition ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`} onClick={() => { addRelative('child', menu.id); setMenu({ x: 0, y: 0, id: null }); }}>
                    افزودن فرزند <Plus size={12} className="text-slate-400" />
                  </button>
                  <div className={`my-1 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`} />
                  <button className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-right text-rose-500 hover:bg-rose-500/10" onClick={() => { setDeleteConfirmId(menu.id); setMenu({ x: 0, y: 0, id: null }); }}>
                    حذف این پرونده <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Right Clinical Sidebar: Diagnostic Inspector */}
        <aside className="flex w-80 shrink-0 flex-col gap-3">
          <div className={`scroll-lab flex min-h-0 flex-1 flex-col overflow-y-auto rounded-2xl border p-4 shadow-xs transition ${
            isDark ? 'border-slate-800 bg-slate-900/90 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
          }`}>
            {selected ? (
              <div className="space-y-4">
                {/* Header Profile */}
                <div className={`flex items-center justify-between border-b pb-3 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                  <div className="flex items-center gap-2.5">
                    <MiniGlyph person={selected} size={26} isDark={isDark} />
                    <div>
                      <h2 className="text-sm font-bold truncate flex items-center gap-1.5">
                        <span>{selected.name || 'بی‌نام'}</span>
                        {selected.isProband && (
                          <span className="rounded bg-blue-500/20 text-blue-400 text-[10px] px-1.5 py-0.2 font-mono">PROBAND</span>
                        )}
                      </h2>
                      <div className="text-[10px] font-mono text-slate-400">ID: {selected.id}</div>
                    </div>
                  </div>
                  <LabIconBtn isDark={isDark} title="حذف پرونده" className="text-rose-500 hover:bg-rose-500/10" onClick={() => setDeleteConfirmId(selected.id)}>
                    <Trash2 size={14} />
                  </LabIconBtn>
                </div>

                {/* Case Name Input */}
                <div>
                  <label className={`mb-1 block text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>نام یا کد بیمار / پروباند</label>
                  <input value={selected.name || ''} onChange={(e) => dispatch({ type: 'UPDATE', id: selected.id, patch: { name: e.target.value } })}
                    className={`w-full rounded-xl border px-3 py-1.5 text-xs outline-none transition ${
                      isDark
                        ? 'border-slate-700 bg-slate-950 text-slate-100 focus:border-blue-500'
                        : 'border-slate-200 bg-slate-50 text-slate-800 focus:border-blue-500 focus:bg-white'
                    }`} />
                </div>

                {/* Biological Sex */}
                <div>
                  <label className={`mb-1 block text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>جنسیت بیولوژیک</label>
                  <Segmented isDark={isDark} value={selected.sex} onChange={(v) => dispatch({ type: 'UPDATE', id: selected.id, patch: { sex: v } })}
                    options={[{ value: 'male', label: 'مرد (XY)' }, { value: 'female', label: 'زن (XX)' }, { value: 'unknown', label: 'نامشخص' }]} />
                </div>

                {/* Clinical Phenotype Status & Proband designation */}
                <div>
                  <label className={`mb-1.5 block text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>وضعیت بالینی و تشخیصی</label>
                  <div className="grid grid-cols-2 gap-2">
                    <LabToggle isDark={isDark} label="مبتلا به بیماری" checked={!!selected.affected} onChange={(v) => dispatch({ type: 'UPDATE', id: selected.id, patch: { affected: v } })} />
                    <LabToggle isDark={isDark} label="ناقل جهش ژنی" checked={!!selected.carrier} onChange={(v) => dispatch({ type: 'UPDATE', id: selected.id, patch: { carrier: v } })} />
                    <LabToggle isDark={isDark} label="جهش تاییدشده" checked={!!selected.hasMutation} onChange={(v) => dispatch({ type: 'UPDATE', id: selected.id, patch: { hasMutation: v } })} />
                    <LabToggle isDark={isDark} label="پروباند (P ↗)" checked={!!selected.isProband} onChange={(v) => dispatch({ type: 'UPDATE', id: selected.id, patch: { isProband: v } })} />
                    <LabToggle isDark={isDark} label="متوفی" checked={!!selected.deceased} onChange={(v) => dispatch({ type: 'UPDATE', id: selected.id, patch: { deceased: v } })} />
                  </div>
                </div>

                {/* Clinical Ages */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={`mb-1 block text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>سن فعلی</label>
                    <input type="number" value={selected.age ?? ''} onChange={(e) => dispatch({ type: 'UPDATE', id: selected.id, patch: { age: e.target.value ? Number(e.target.value) : null } })}
                      className={`w-full rounded-xl border px-2.5 py-1.5 text-xs outline-none transition font-mono ${
                        isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-800'
                      }`} />
                  </div>
                  <div>
                    <label className={`mb-1 block text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>سن شروع</label>
                    <input type="number" value={selected.diseaseOnsetAge ?? ''} onChange={(e) => dispatch({ type: 'UPDATE', id: selected.id, patch: { diseaseOnsetAge: e.target.value ? Number(e.target.value) : null } })}
                      className={`w-full rounded-xl border px-2.5 py-1.5 text-xs outline-none transition font-mono ${
                        isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-800'
                      }`} />
                  </div>
                  <div>
                    <label className={`mb-1 block text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>سن فوت</label>
                    <input type="number" value={selected.deathAge ?? ''} onChange={(e) => dispatch({ type: 'UPDATE', id: selected.id, patch: { deathAge: e.target.value ? Number(e.target.value) : null } })}
                      className={`w-full rounded-xl border px-2.5 py-1.5 text-xs outline-none transition font-mono ${
                        isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-800'
                      }`} />
                  </div>
                </div>

                {/* Twin Zygosity */}
                <div>
                  <label className={`mb-1 block text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>نوع تولد / دوقلو (Zygosity)</label>
                  <Segmented isDark={isDark} value={selected.twinType || 'none'} onChange={(v) => dispatch({ type: 'UPDATE', id: selected.id, patch: { twinType: v } })}
                    options={[{ value: 'none', label: 'تک‌تولد' }, { value: 'identical', label: 'همسان (MZ)' }, { value: 'fraternal', label: 'ناهمسان (DZ)' }, { value: 'unknown', label: 'نامشخص' }]} />

                  {/* Twin partner indicator & unlink */}
                  {selected.twinGroupId && (
                    <div className={`mt-2 flex items-center justify-between rounded-xl border p-2 text-xs ${
                      isDark ? 'border-indigo-800/60 bg-indigo-950/40 text-indigo-300' : 'border-indigo-200 bg-indigo-50/70 text-indigo-900'
                    }`}>
                      <div className="flex items-center gap-1.5 font-medium min-w-0">
                        <GitFork size={13} className="text-indigo-400 shrink-0" />
                        <span className="truncate">
                          قل متناظر: <strong>{people.filter((p) => p.twinGroupId === selected.twinGroupId && p.id !== selected.id).map((p) => p.name).join('، ') || 'یافت نشد'}</strong>
                        </span>
                      </div>
                      <button type="button" onClick={() => dispatch({ type: 'UNLINK_TWIN', id: selected.id })} className="shrink-0 text-[10px] text-rose-500 hover:underline">
                        انفصال
                      </button>
                    </div>
                  )}

                  {/* Link with existing sibling */}
                  {!selected.twinGroupId && (() => {
                    const sibCandidates = people.filter((p) => p.id !== selected.id && ((p.motherId && p.motherId === selected.motherId) || (p.fatherId && p.fatherId === selected.fatherId)) && !p.twinGroupId);
                    if (!sibCandidates.length) return null;
                    return (
                      <div className="mt-2 space-y-1">
                        <div className="text-[10px] text-slate-400">پیوند با خواهر/برادر به عنوان دوقلو:</div>
                        <div className="flex gap-1.5">
                          <select id="linkSibSelect" className={`flex-1 rounded-lg border px-2 py-1 text-xs ${
                            isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-800'
                          }`}>
                            <option value="">انتخاب خواهر یا برادر...</option>
                            {sibCandidates.map((s) => (<option key={s.id} value={s.id}>{s.name} ({s.sex === 'male' ? 'برادر' : 'خواهر'})</option>))}
                          </select>
                          <LabBtn isDark={isDark} onClick={() => {
                            const sel = document.getElementById('linkSibSelect');
                            if (sel?.value) {
                              dispatch({ type: 'LINK_TWINS', id1: selected.id, id2: sel.value, zygosity: selected.twinType !== 'none' ? selected.twinType : 'identical' });
                              sel.value = '';
                            }
                          }}>
                            پیوند
                          </LabBtn>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Upgraded Mendelian Educational Risk Panel */}
                {selectedRisk && (
                  <div className={`rounded-xl border p-3.5 space-y-2.5 ${
                    isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
                  }`}>
                    <div className={`flex items-center justify-between border-b pb-2 ${isDark ? 'border-slate-800' : 'border-slate-200/60'}`}>
                      <div className="flex items-center gap-1.5">
                        <Dna size={14} className="text-blue-500" />
                        <span className="text-[11px] font-bold">ارزیابی ژنتیک مندلی (آموزشی)</span>
                      </div>
                      <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-mono font-bold ${
                        isDark ? 'bg-blue-950 text-blue-300 border border-blue-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {selectedRisk.model === INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE ? 'اتوزوم مغلوب' : selectedRisk.model === INHERITANCE_MODELS.AUTOSOMAL_DOMINANT ? 'اتوزوم غالب' : 'وابسته به X'}
                      </span>
                    </div>

                    <div className={`flex items-center justify-between rounded-lg p-2.5 border ${
                      isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/80'
                    }`}>
                      <span className={`text-[11px] font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>برآورد احتمال ناقل بودن:</span>
                      <span className={`text-xs font-bold font-mono ${
                        selectedRisk.status === RISK_STATUS.AFFECTED
                          ? 'text-rose-500'
                          : selectedRisk.status === RISK_STATUS.OBLIGATE_CARRIER
                          ? 'text-emerald-500'
                          : selectedRisk.status === RISK_STATUS.CONDITIONAL_CARRIER
                          ? 'text-blue-500'
                          : 'text-slate-400'
                      }`}>
                        {selectedRisk.probabilityDisplay}
                      </span>
                    </div>

                    <p className={`text-[10px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {selectedRisk.reason}
                    </p>

                    {/* Educational assumptions */}
                    {selectedRisk.assumptions.length > 0 && (
                      <div className={`pt-1.5 border-t ${isDark ? 'border-slate-800' : 'border-slate-200/50'}`}>
                        <div className="text-[9px] font-bold text-slate-400 mb-1">فرضیات محاسباتی:</div>
                        <ul className="text-[9px] text-slate-400 list-disc list-inside space-y-0.5">
                          {selectedRisk.assumptions.slice(0, 2).map((asm, idx) => (
                            <li key={idx} className="truncate">{asm}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Mandatory Non-Diagnostic Disclaimer */}
                    <div className={`rounded-lg border p-2 text-[9px] leading-normal ${
                      isDark ? 'bg-amber-950/30 border-amber-900/40 text-amber-300' : 'bg-amber-50 border-amber-200/70 text-amber-800'
                    }`}>
                      ⚠️ <strong>سلب مسئولیت آموزشی:</strong> {CLINICAL_DISCLAIMER_FA}
                    </div>
                  </div>
                )}

                {/* Kinship Operations */}
                <div>
                  <label className={`mb-1.5 block text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>افزودن بستگان و اتصالات ژنتیکی</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <LabBtn isDark={isDark} onClick={() => addRelative('mother', selected.id)}><Plus size={12} /> والد مونث</LabBtn>
                    <LabBtn isDark={isDark} onClick={() => addRelative('father', selected.id)}><Plus size={12} /> والد مذکر</LabBtn>
                    <LabBtn isDark={isDark} onClick={() => addRelative('spouse', selected.id)}><Plus size={12} /> همسر</LabBtn>
                    <LabBtn isDark={isDark} onClick={() => addRelative('child', selected.id)}><Plus size={12} /> فرزند</LabBtn>
                    <LabBtn isDark={isDark} onClick={() => addRelative('twin_identical', selected.id)} className={isDark ? 'bg-indigo-950/40 border-indigo-800 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}><Plus size={12} /> قل همسان (MZ)</LabBtn>
                    <LabBtn isDark={isDark} onClick={() => addRelative('twin_fraternal', selected.id)} className={isDark ? 'bg-sky-950/40 border-sky-800 text-sky-300' : 'bg-sky-50 border-sky-200 text-sky-700'}><Plus size={12} /> قل ناهمسان (DZ)</LabBtn>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center p-4">
                <div className={`grid h-12 w-12 place-items-center rounded-2xl ${
                  isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-400'
                }`}>
                  <Activity size={24} />
                </div>
                <div>
                  <h3 className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>هیچ نمونه‌ای انتخاب نشده است</h3>
                  <p className={`mt-1 text-[11px] leading-relaxed ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    روی هر فرد در نمودار یا فهرست نمونه‌ها کلیک کنید تا پرونده و مشخصات ژنتیکی وی نمایش داده شود.
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
