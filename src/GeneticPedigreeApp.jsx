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
  Layers, Dna, Activity, FileText, CheckCircle2, Bookmark, AlertTriangle, X
} from "lucide-react";

const uid = (p = "p") => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---- Presets & Sample Builders ----
function buildSample() {
  const tg = uid('tg');
  const a = { id: uid(), name: "پدربزرگ", sex: "male", deceased: true, deathAge: 78, spouseIds: [], childIds: [], twinType: "none" };
  const b = { id: uid(), name: "مادربزرگ", sex: "female", spouseIds: [], childIds: [], twinType: "none" };
  const c = { id: uid(), name: "پدر", sex: "male", spouseIds: [], childIds: [], motherId: b.id, fatherId: a.id, twinType: "none" };
  const d = { id: uid(), name: "مادر", sex: "female", carrier: true, spouseIds: [], childIds: [], twinType: "none" };
  const e = { id: uid(), name: "فرزند ۱ (مبتلا)", sex: "female", affected: true, hasMutation: true, spouseIds: [], childIds: [], motherId: d.id, fatherId: c.id, twinType: "none" };
  const f = { id: uid(), name: "قل الف (همسان MZ)", sex: "male", spouseIds: [], childIds: [], motherId: d.id, fatherId: c.id, twinType: "identical", twinGroupId: tg };
  const g = { id: uid(), name: "قل ب (همسان MZ)", sex: "male", carrier: true, spouseIds: [], childIds: [], motherId: d.id, fatherId: c.id, twinType: "identical", twinGroupId: tg };

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
function PersonGlyph({ person, size = 50 }) {
  const stroke = person.deceased ? "stroke-[2.5px] stroke-slate-400" : "stroke-[2px] stroke-slate-800";
  const fill = person.affected
    ? "fill-rose-500"
    : person.carrier
    ? "fill-amber-400"
    : person.hasMutation
    ? "fill-sky-400"
    : "fill-white";
  const shape = person.sex === "male" ? "square" : person.sex === "female" ? "circle" : "diamond";
  const base = `${fill} ${stroke}`;

  if (shape === 'square') {
    return <rect x={-size / 2} y={-size / 2} width={size} height={size} rx={4} className={base} />;
  }
  if (shape === 'circle') {
    return <circle r={size / 2} className={base} />;
  }
  return <polygon points={`${-size / 2},0 0,${-size / 2} ${size / 2},0 0,${size / 2}`} className={base} />;
}

function MiniGlyph({ person, size = 18 }) {
  const fill = person.affected ? '#e11d48' : person.carrier ? '#d97706' : person.hasMutation ? '#0284c7' : '#ffffff';
  const stroke = person.deceased ? '#94a3b8' : '#334155';
  const shape = person.sex === 'male' ? 'sq' : person.sex === 'female' ? 'ci' : 'di';
  return (
    <svg width={size} height={size} viewBox="-14 -14 28 28" className="shrink-0" aria-hidden="true">
      {shape === 'sq' && <rect x={-10} y={-10} width={20} height={20} rx={2} fill={fill} stroke={stroke} strokeWidth={2} />}
      {shape === 'ci' && <circle r={10} fill={fill} stroke={stroke} strokeWidth={2} />}
      {shape === 'di' && <polygon points="-10,0 0,-10 10,0 0,10" fill={fill} stroke={stroke} strokeWidth={2} />}
      {person.deceased && <line x1={-10} y1={-10} x2={10} y2={10} stroke={stroke} strokeWidth={2} />}
    </svg>
  );
}

// ---- Clinical Connectors (Lines & Double Consanguinity) ----
const LINE = { mating: "#334155", descent: "#64748b" };

function FamilyConnectors({ connectors }) {
  return (
    <>
      {connectors.mating.map((s, i) => (
        s.consanguineous ? (
          <g key={`mat-${i}`}>
            <line x1={s.x1} y1={s.y1 - 2.5} x2={s.x2} y2={s.y2 - 2.5} stroke={LINE.mating} strokeWidth={1.8} />
            <line x1={s.x1} y1={s.y1 + 2.5} x2={s.x2} y2={s.y2 + 2.5} stroke={LINE.mating} strokeWidth={1.8} />
          </g>
        ) : (
          <line key={`mat-${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={LINE.mating} strokeWidth={2} />
        )
      ))}
      {connectors.drop.map((s, i) => (<line key={`drp-${i}`} x1={s.x} y1={s.y1} x2={s.x} y2={s.y2} stroke={LINE.descent} strokeWidth={1.8} />))}
      {connectors.sibship.map((s, i) => (<line key={`sib-${i}`} x1={s.x1} y1={s.y} x2={s.x2} y2={s.y} stroke={LINE.descent} strokeWidth={1.8} />))}
      {connectors.childLink.map((s, i) => (
        <line key={`cl-${i}`} x1={s.x1 ?? s.x} y1={s.y1} x2={s.x2 ?? s.x} y2={s.y2} stroke={LINE.descent} strokeWidth={1.8} />
      ))}
      {(connectors.twinBars || []).map((s, i) => (
        <line key={`tb-${i}`} x1={s.x1} y1={s.y} x2={s.x2} y2={s.y} stroke={LINE.descent} strokeWidth={2} />
      ))}
      {(connectors.twinMarks || []).map((m, i) => (
        <g key={`tm-${i}`} transform={`translate(${m.x},${m.y})`}>
          <circle r={6.5} fill="#ffffff" stroke="#64748b" strokeWidth={1} />
          <text y={3} textAnchor="middle" fill="#334155" className="text-[9px] font-bold font-mono select-none">
            {m.label || '?'}
          </text>
        </g>
      ))}
      {connectors.longEdge.map((e, i) => (<polyline key={`le-${i}`} points={e.points.map((pt) => pt.join(',')).join(' ')} fill="none" stroke={LINE.descent} strokeWidth={1.8} strokeDasharray="5 3" />))}
    </>
  );
}

function PersonNode({ person, pos, selected, riskAssessment, onSelect, onContextMenu }) {
  const isHighRisk = riskAssessment && (riskAssessment.status === RISK_STATUS.AFFECTED || riskAssessment.status === RISK_STATUS.OBLIGATE_CARRIER || (riskAssessment.probability && riskAssessment.probability >= 0.5));

  return (
    <g transform={`translate(${pos.x},${pos.y})`} data-node onClick={onSelect} onContextMenu={onContextMenu} className="cursor-pointer focus:outline-hidden" tabIndex={0} role="button" aria-label={`پرونده ${person.name || person.id}`}>
      {selected && <circle r={38} fill="none" stroke="#2563eb" strokeWidth={2.5} strokeDasharray="4 3" />}
      <PersonGlyph person={person} />
      <text y={40} textAnchor="middle" className="select-none fill-slate-800 text-[11px] font-semibold tracking-tight">{person.name}</text>
      {person.deceased && <line x1={-26} y1={-26} x2={26} y2={26} stroke={LINE.mating} strokeWidth={2} />}
      {isHighRisk && !person.affected && (
        <g transform="translate(26,-26)">
          <circle r={8.5} fill="#fef3c7" stroke="#d97706" strokeWidth={1.5} />
          <path d="M0 -3.5 L0 0.5 M0 2.5 L0 3.5" stroke="#d97706" strokeWidth={1.6} strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

// ---- Scientific Legend HUD ----
function ClinicalLegend() {
  const items = [
    { t: 'sq', label: 'مذکر (XY)' },
    { t: 'ci', label: 'مونث (XX)' },
    { t: 'di', label: 'نامشخص' },
    { t: 'dot', c: '#e11d48', label: 'مبتلا (فنوتیپ مثبت)' },
    { t: 'dot', c: '#d97706', label: 'ناقل هتروزیگوت' },
    { t: 'dot', c: '#0284c7', label: 'واریانت تاییدشده' },
    { t: 'slash', label: 'متوفی' },
    { t: 'consang', label: 'خویشاوندی (Double Line)' },
    { t: 'twin_mz', label: 'دوقلوی همسان (MZ)' },
    { t: 'twin_dz', label: 'دوقلوی ناهمسان (DZ)' },
  ];
  const renderItem = (it) => {
    if (it.t === 'sq') return <rect x={-5} y={-5} width={10} height={10} fill="#fff" stroke="#334155" strokeWidth={1.5} rx={1} />;
    if (it.t === 'ci') return <circle r={5} fill="#fff" stroke="#334155" strokeWidth={1.5} />;
    if (it.t === 'di') return <polygon points="-5,0 0,-5 5,0 0,5" fill="#fff" stroke="#334155" strokeWidth={1.5} />;
    if (it.t === 'dot') return <circle r={5} fill={it.c} />;
    if (it.t === 'consang') return <g><line x1={-6} y1={-2} x2={6} y2={-2} stroke="#334155" strokeWidth={1.5} /><line x1={-6} y1={2} x2={6} y2={2} stroke="#334155" strokeWidth={1.5} /></g>;
    if (it.t === 'twin_mz') return <g><path d="M-6,5 L0,-3 L6,5" fill="none" stroke="#64748b" strokeWidth={1.5} /><line x1={-3} y1={1.5} x2={3} y2={1.5} stroke="#64748b" strokeWidth={1.5} /></g>;
    if (it.t === 'twin_dz') return <path d="M-6,5 L0,-3 L6,5" fill="none" stroke="#64748b" strokeWidth={1.5} />;
    return <line x1={-5} y1={-5} x2={5} y2={5} stroke="#334155" strokeWidth={1.5} />;
  };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-700">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="-8 -8 16 16" aria-hidden="true">{renderItem(it)}</svg>
          <span className="font-medium">{it.label}</span>
        </span>
      ))}
    </div>
  );
}

// ---- Scientific UI Button & Input Primitives ----
function LabBtn({ children, onClick, variant = 'default', className = '', title, disabled, ariaLabel }) {
  const styles = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white border-blue-600 shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500",
    danger: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 focus-visible:ring-2 focus-visible:ring-rose-500",
    default: "bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-400",
    success: "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-500",
  }[variant] || "bg-white text-slate-700 border-slate-300 hover:bg-slate-50";

  return (
    <button title={title} aria-label={ariaLabel || title} disabled={disabled} onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 outline-hidden ${styles} ${className}`}>
      {children}
    </button>
  );
}

function LabIconBtn({ children, onClick, title, disabled, className = '', ariaLabel }) {
  return (
    <button title={title} aria-label={ariaLabel || title} disabled={disabled} onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40 outline-hidden ${className}`}>
      {children}
    </button>
  );
}

function LabStat({ label, value, unit, color = "blue" }) {
  const colorMap = {
    blue: "text-blue-600",
    emerald: "text-emerald-600",
    rose: "text-rose-600",
    amber: "text-amber-600",
    slate: "text-slate-800",
  }[color] || "text-slate-800";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="text-[10px] font-medium tracking-wider uppercase text-slate-400">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={`text-xl font-bold font-mono tabular-nums ${colorMap}`}>{value}</span>
        {unit && <span className="text-[10px] font-mono text-slate-400">{unit}</span>}
      </div>
    </div>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md py-1.5 text-xs font-medium transition outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 ${value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LabToggle({ checked, onChange, label }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium transition hover:bg-slate-50 outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500">
      <span className="text-slate-700">{label}</span>
      <span className={`relative inline-block h-4 w-8 rounded-full transition ${checked ? 'bg-blue-600' : 'bg-slate-200'}`}>
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
      ["SAMPLE_ID", "CASE_NAME", "SEX", "AFFECTED", "CARRIER", "DECEASED", "MUTATION", "ONSET_AGE", "DEATH_AGE", "ZYGOSITY", "MOTHER_ID", "FATHER_ID", "SPOUSES", "CHILDREN"],
      ...people.map((p) => [
        p.id, p.name, p.sex, !!p.affected, !!p.carrier, !!p.deceased, !!p.hasMutation,
        p.diseaseOnsetAge ?? "", p.deathAge ?? "", p.twinType || "none",
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
      ctx.fillStyle = '#ffffff';
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
    <div dir="rtl" className="flex h-screen w-full flex-col bg-slate-100 text-slate-800">
      {/* Alert toast */}
      {errorMsg && (
        <div role="alert" className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-xl">
          <AlertTriangle size={16} />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="mr-2 rounded p-0.5 hover:bg-rose-700"><X size={14} /></button>
        </div>
      )}

      {/* Success toast */}
      {successMsg && (
        <div role="status" className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xl">
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="mr-2 rounded p-0.5 hover:bg-emerald-700"><X size={14} /></button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-rose-50 border border-rose-200">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">تایید حذف پرونده فرد</h3>
                <p className="text-xs text-slate-500">آیا از حذف این فرد اطمینان دارید؟</p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
              با حذف این فرد، تمام اتصالات والدینی، همسری و فرزندی وابسته به وی قطع خواهد شد. این عملیات با کلید Undo قابل بازگشت است.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <LabBtn onClick={() => setDeleteConfirmId(null)}>انصراف</LabBtn>
              <LabBtn variant="danger" onClick={() => {
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Bookmark size={18} className="text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">پرونده‌های ذخیره‌شده محلی (Local Cases)</h3>
              </div>
              <button onClick={() => setStorageOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-2">
              {savedCases.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">هیچ پرونده‌ای در حافظه مرورگر ذخیره نشده است.</div>
              ) : (
                savedCases.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 transition">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">{c.title || c.id}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {c.personCount} عضو · بروزرسانی: {new Date(c.updatedAt).toLocaleDateString('fa-IR')}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <LabBtn onClick={() => handleLoadCase(c.id)}>بازخوانی</LabBtn>
                      <LabIconBtn title="حذف" onClick={() => handleDeleteCase(c.id)} className="text-rose-600 border-rose-200 hover:bg-rose-50">
                        <Trash2 size={12} />
                      </LabIconBtn>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <LabBtn onClick={() => setStorageOpen(false)}>بستن پنجره</LabBtn>
            </div>
          </div>
        </div>
      )}

      {/* Top Laboratory Console Ribbon */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-white shadow-xs">
            <Dna size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-900">کنسول آنالیز شجره‌نامه ژنتیک بالینی</h1>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-medium text-slate-600 border border-slate-200">
                CASE-REF: #GEN-8420
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              استاندارد جهانی رسم شجره‌نامه ACMG/NSGC · موتور سلسله‌مراتبی فاقد تداخل
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Inheritance Model Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
            <span className="text-[10px] font-bold text-slate-500">الگوی وراثت:</span>
            <select
              value={state.inheritanceModel}
              onChange={(e) => dispatch({ type: 'SET_MODEL', model: e.target.value })}
              className="bg-transparent text-xs font-semibold text-blue-700 outline-hidden cursor-pointer">
              <option value={INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE}>اتوزوم مغلوب (AR)</option>
              <option value={INHERITANCE_MODELS.AUTOSOMAL_DOMINANT}>اتوزوم غالب (AD)</option>
              <option value={INHERITANCE_MODELS.X_LINKED_RECESSIVE}>وابسته به X مغلوب (XR)</option>
            </select>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          <LabBtn variant="primary" onClick={() => dispatch({ type: 'ADD_PERSON' })}>
            <UserPlus size={14} /> ثبت فرد جدید
          </LabBtn>

          {/* Presets dropdown */}
          <div className="relative">
            <LabBtn onClick={() => setPresetsOpen((o) => !o)}>
              <Layers size={14} /> الگوهای آزمایشی <ChevronDown size={12} />
            </LabBtn>
            {presetsOpen && (
              <div className="absolute left-0 top-full z-40 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                <button onClick={() => { dispatch({ type: 'LOAD', data: build20GenPedigree() }); setPresetsOpen(false); setTimeout(fitView, 50); }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-right text-xs hover:bg-slate-50">
                  <GitFork size={14} className="text-emerald-600" />
                  <div>
                    <div className="font-semibold text-slate-800">شجره‌نامه ۲۰ نسلی ۵ فرزندی</div>
                    <div className="text-[10px] text-slate-400">شامل دوقلوها (MZ/DZ)، چندهمسری و خویشاوندی</div>
                  </div>
                </button>
                <button onClick={() => { dispatch({ type: 'LOAD', data: buildSample() }); setPresetsOpen(false); setTimeout(fitView, 50); }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-right text-xs hover:bg-slate-50">
                  <Activity size={14} className="text-blue-600" />
                  <div>
                    <div className="font-semibold text-slate-800">خانواده استاندارد بالینی</div>
                    <div className="text-[10px] text-slate-400">۳ نسل، دوقلو و موارد بالینی</div>
                  </div>
                </button>
                <button onClick={() => { dispatch({ type: 'LOAD', data: build5ChildTree(2) }); setPresetsOpen(false); setTimeout(fitView, 50); }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-right text-xs hover:bg-slate-50">
                  <GitFork size={14} className="text-cyan-600" />
                  <div>
                    <div className="font-semibold text-slate-800">الگوی ۵ فرزند در هر خانواده</div>
                    <div className="text-[10px] text-slate-400">هر فرزند یک همسر و ۵ فرزند (چندشاخه)</div>
                  </div>
                </button>
                <button onClick={() => { dispatch({ type: 'LOAD', data: buildLargeSample(50) }); setPresetsOpen(false); setTimeout(fitView, 50); }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-right text-xs hover:bg-slate-50">
                  <Layers size={14} className="text-indigo-600" />
                  <div>
                    <div className="font-semibold text-slate-800">شجره‌نامه ۵۰ نسلی (طولی)</div>
                    <div className="text-[10px] text-slate-400">عمق فوق‌العاده بالا، بدون افت کارایی</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-slate-200" />
          <LabIconBtn title="بازگردانی (Ctrl+Z)" disabled={!canUndo} onClick={() => dispatch({ type: 'UNDO' })}><Undo2 size={14} /></LabIconBtn>
          <LabIconBtn title="تکرار (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => dispatch({ type: 'REDO' })}><Redo2 size={14} /></LabIconBtn>

          <div className="h-4 w-px bg-slate-200" />

          {/* Local Persistence Buttons */}
          <LabBtn onClick={handleSaveLocal} title="ذخیره شجره‌نامه در حافظه مرورگر">
            <Bookmark size={14} /> ذخیره در مرورگر
          </LabBtn>
          <LabBtn onClick={handleOpenStorageModal} title="مشاهده پرونده‌های ذخیره‌شده">
            <FileText size={14} /> پرونده‌ها
          </LabBtn>

          <div className="h-4 w-px bg-slate-200" />

          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition">
            <Upload size={14} /> ورود داده
            <input type="file" accept="application/json" className="hidden" onChange={importJSON} />
          </label>

          <div className="relative">
            <LabBtn onClick={() => setExportOpen((o) => !o)}>
              <Download size={14} /> گزارش آزمایشگاهی <ChevronDown size={12} />
            </LabBtn>
            {exportOpen && (
              <div className="absolute left-0 top-full z-40 mt-1 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                {[
                  ['فرمت داده JSON', exportJSON],
                  ['جدول اطلاعاتی CSV (اکسل)', exportCSV],
                  ['وکتور کیفیت بالا SVG', exportSVG],
                  ['تصویر رندرشده PNG', exportPNG],
                ].map(([label, fn]) => (
                  <button key={label} onClick={() => { fn(); setExportOpen(false); }}
                    className="block w-full rounded-md px-3 py-2 text-right text-xs text-slate-700 hover:bg-slate-50">
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace (Asymmetric Clinical Layout) */}
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {/* Left Clinical Sidebar: Samples & Registry */}
        <aside className="flex w-72 shrink-0 flex-col gap-3">
          <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 p-3">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-blue-600" />
                <h2 className="text-xs font-bold text-slate-800">پرونده‌ها و نمونه‌ها</h2>
              </div>
              <span className="font-mono text-[11px] font-semibold text-slate-500">
                {filtered.length} / {people.length}
              </span>
            </div>

            <div className="p-2 border-b border-slate-100">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute right-2.5 top-2.5 text-slate-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجو بر اساس نام یا کد..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pr-8 pl-2 text-xs outline-none focus:border-blue-500 focus:bg-white transition" />
              </div>
            </div>

            <div className="scroll-lab flex-1 overflow-y-auto p-1 space-y-1">
              {filtered.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400">هیچ نمونه‌ای یافت نشد</div>
              )}
              {filtered.map((p) => {
                const isSel = state.selectedId === p.id;
                return (
                  <div key={p.id}
                    onClick={() => focusPerson(p.id)}
                    className={`flex items-center justify-between gap-2 rounded-lg p-2 cursor-pointer transition text-xs border ${
                      isSel ? 'border-blue-500 bg-blue-50/60 text-blue-900 font-semibold' : 'border-transparent hover:bg-slate-50 text-slate-700'
                    }`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <MiniGlyph person={p} />
                      <div className="truncate">
                        <div className="truncate text-xs">{p.name || 'بی‌نام'}</div>
                        <div className="text-[10px] font-mono text-slate-400">{p.id.slice(0, 8)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {p.affected && <span className="rounded bg-rose-100 px-1 py-0.5 text-[9px] font-bold text-rose-700">مبتلا</span>}
                      {p.carrier && <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-700">ناقل</span>}
                      <Crosshair size={13} className="text-slate-300 hover:text-blue-600 transition" title="پرش به موقعیت فرد در بوم" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Clinical Telemetry Grid */}
          <div className="grid grid-cols-2 gap-2 shrink-0">
            <LabStat label="کل نمونه‌ها" value={stats.total} unit="نفر" color="slate" />
            <LabStat label="عمق نسلی" value={stats.generations} unit="نسل" color="blue" />
            <LabStat label="موارد فنوتیپ مثبت" value={stats.affected} unit="کیس" color="rose" />
            <LabStat label="ناقلین هتروزیگوت" value={stats.carriers} unit="نفر" color="amber" />
          </div>
        </aside>

        {/* Center Stage: Millimeter Grid Canvas */}
        <main className="flex min-w-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div ref={wrapRef} className="relative flex-1 overflow-hidden bg-slate-50">
            {/* Technical HUD Controls */}
            <div data-ui className="absolute left-3 top-3 z-10 flex gap-1">
              <LabIconBtn title="بزرگ‌نمایی" onClick={() => dispatch({ type: 'ZOOM', factor: 1.25 })}><Plus size={14} /></LabIconBtn>
              <LabIconBtn title="کوچک‌نمایی" onClick={() => dispatch({ type: 'ZOOM', factor: 0.8 })}><Minus size={14} /></LabIconBtn>
              <LabIconBtn title="کادربندی کامل (Fit View)" onClick={fitView}><Maximize2 size={14} /></LabIconBtn>
              <LabIconBtn title="ریست نما به مختصات اولیه" onClick={() => dispatch({ type: 'RESET' })}><RotateCcw size={14} /></LabIconBtn>
              <div className="flex items-center rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-mono text-slate-600 shadow-sm">
                ZOOM: {Math.round(state.zoom * 100)}%
              </div>
            </div>

            {/* Clinical Nomenclature Legend */}
            <div data-ui className="absolute bottom-3 left-3 z-10 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-xs">
              <ClinicalLegend />
            </div>

            {/* SVG Canvas with Millimeter Grid */}
            <svg ref={svgRef} className="canvas-svg h-full w-full"
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
              onWheel={onWheel} onContextMenu={(e) => openMenu(e, null)}>
              <defs>
                <pattern id="smallGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.8" />
                </pattern>
                <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
                  <rect width="100" height="100" fill="url(#smallGrid)" />
                  <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#cbd5e1" strokeWidth="1.2" />
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
                    <g key={`gen-${gIdx}`} opacity={0.8} className="select-none pointer-events-none">
                      <rect x={12} y={y - 12} width={68} height={24} rx={4} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={1} />
                      <text x={46} y={y + 4} textAnchor="middle" fill="#334155" className="text-[10px] font-mono font-bold">
                        {roman} ({gIdx + 1})
                      </text>
                    </g>
                  );
                })}

                <FamilyConnectors connectors={layout.connectors} />

                {people.map((p) => {
                  const pos = nodes[p.id]; if (!pos) return null;
                  const riskAssessment = calculateGeneticRisk(p, state.data, state.inheritanceModel);
                  return (
                    <PersonNode key={p.id} person={p} pos={pos} riskAssessment={riskAssessment}
                      selected={state.selectedId === p.id}
                      onSelect={() => dispatch({ type: 'SELECT', id: p.id })}
                      onContextMenu={(e) => openMenu(e, p.id)} />
                  );
                })}
              </g>
            </svg>

            {/* Context Menu */}
            {menu.id !== null && (
              <div className="absolute z-50 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl text-xs w-48"
                style={{ left: menu.x, top: menu.y }} onMouseLeave={() => setMenu({ x: 0, y: 0, id: null })}>
                <div className="border-b border-slate-100 px-2 py-1 text-[10px] font-mono font-bold text-slate-400">
                  عملیات خویشاوندی
                </div>
                <div className="py-1 space-y-0.5">
                  <button className="flex w-full items-center justify-between rounded px-2 py-1.5 text-right hover:bg-slate-50 text-indigo-700 font-medium" onClick={() => { addRelative('twin_identical', menu.id); setMenu({ x: 0, y: 0, id: null }); }}>افزودن قل همسان (MZ) <Plus size={12} className="text-indigo-600" /></button>
                  <button className="flex w-full items-center justify-between rounded px-2 py-1.5 text-right hover:bg-slate-50 text-sky-700 font-medium" onClick={() => { addRelative('twin_fraternal', menu.id); setMenu({ x: 0, y: 0, id: null }); }}>افزودن قل ناهمسان (DZ) <Plus size={12} className="text-sky-600" /></button>
                  <div className="my-1 border-t border-slate-100" />
                  <button className="flex w-full items-center justify-between rounded px-2 py-1.5 text-right hover:bg-slate-50" onClick={() => { addRelative('mother', menu.id); setMenu({ x: 0, y: 0, id: null }); }}>افزودن مادر (والد مونث) <Plus size={12} className="text-slate-400" /></button>
                  <button className="flex w-full items-center justify-between rounded px-2 py-1.5 text-right hover:bg-slate-50" onClick={() => { addRelative('father', menu.id); setMenu({ x: 0, y: 0, id: null }); }}>افزودن پدر (والد مذکر) <Plus size={12} className="text-slate-400" /></button>
                  <button className="flex w-full items-center justify-between rounded px-2 py-1.5 text-right hover:bg-slate-50" onClick={() => { addRelative('spouse', menu.id); setMenu({ x: 0, y: 0, id: null }); }}>افزودن همسر <Plus size={12} className="text-slate-400" /></button>
                  <button className="flex w-full items-center justify-between rounded px-2 py-1.5 text-right hover:bg-slate-50" onClick={() => { addRelative('child', menu.id); setMenu({ x: 0, y: 0, id: null }); }}>افزودن فرزند <Plus size={12} className="text-slate-400" /></button>
                  <div className="my-1 border-t border-slate-100" />
                  <button className="flex w-full items-center justify-between rounded px-2 py-1.5 text-right text-rose-600 hover:bg-rose-50" onClick={() => { setDeleteConfirmId(menu.id); setMenu({ x: 0, y: 0, id: null }); }}>حذف این پرونده <Trash2 size={12} /></button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Right Clinical Sidebar: Diagnostic Inspector */}
        <aside className="flex w-80 shrink-0 flex-col gap-3">
          <div className="scroll-lab flex min-h-0 flex-1 flex-col overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            {selected ? (
              <div className="space-y-4">
                {/* Header Profile */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <MiniGlyph person={selected} size={24} />
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 truncate">{selected.name || 'بی‌نام'}</h2>
                      <div className="text-[10px] font-mono text-slate-400">ID: {selected.id}</div>
                    </div>
                  </div>
                  <LabIconBtn title="حذف پرونده" className="text-rose-600 hover:bg-rose-50 border-rose-200" onClick={() => setDeleteConfirmId(selected.id)}>
                    <Trash2 size={14} />
                  </LabIconBtn>
                </div>

                {/* Case Name Input */}
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-500">نام یا کد بیمار / پروباند</label>
                  <input value={selected.name || ''} onChange={(e) => dispatch({ type: 'UPDATE', id: selected.id, patch: { name: e.target.value } })}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-blue-500 focus:bg-white transition" />
                </div>

                {/* Biological Sex */}
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-500">جنسیت بیولوژیک</label>
                  <Segmented value={selected.sex} onChange={(v) => dispatch({ type: 'UPDATE', id: selected.id, patch: { sex: v } })}
                    options={[{ value: 'male', label: 'مرد (XY)' }, { value: 'female', label: 'زن (XX)' }, { value: 'unknown', label: 'نامشخص' }]} />
                </div>

                {/* Clinical Phenotype Status */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-slate-500">وضعیت بالینی و ژنتیکی</label>
                  <div className="grid grid-cols-2 gap-2">
                    <LabToggle label="مبتلا به بیماری" checked={!!selected.affected} onChange={(v) => dispatch({ type: 'UPDATE', id: selected.id, patch: { affected: v } })} />
                    <LabToggle label="ناقل جهش ژنی" checked={!!selected.carrier} onChange={(v) => dispatch({ type: 'UPDATE', id: selected.id, patch: { carrier: v } })} />
                    <LabToggle label="جهش تاییدشده" checked={!!selected.hasMutation} onChange={(v) => dispatch({ type: 'UPDATE', id: selected.id, patch: { hasMutation: v } })} />
                    <LabToggle label="متوفی" checked={!!selected.deceased} onChange={(v) => dispatch({ type: 'UPDATE', id: selected.id, patch: { deceased: v } })} />
                  </div>
                </div>

                {/* Clinical Ages */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-500">سن شروع بیماری</label>
                    <input type="number" value={selected.diseaseOnsetAge ?? ''} onChange={(e) => dispatch({ type: 'UPDATE', id: selected.id, patch: { diseaseOnsetAge: e.target.value ? Number(e.target.value) : null } })}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 focus:bg-white transition font-mono" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-500">سن فوت</label>
                    <input type="number" value={selected.deathAge ?? ''} onChange={(e) => dispatch({ type: 'UPDATE', id: selected.id, patch: { deathAge: e.target.value ? Number(e.target.value) : null } })}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 focus:bg-white transition font-mono" />
                  </div>
                </div>

                {/* Twin Zygosity */}
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-500">نوع تولد / دوقلو (Zygosity)</label>
                  <Segmented value={selected.twinType || 'none'} onChange={(v) => dispatch({ type: 'UPDATE', id: selected.id, patch: { twinType: v } })}
                    options={[{ value: 'none', label: 'تک‌تولد' }, { value: 'identical', label: 'همسان (MZ)' }, { value: 'fraternal', label: 'ناهمسان (DZ)' }, { value: 'unknown', label: 'نامشخص (?)' }]} />

                  {/* Twin partner indicator & unlink */}
                  {selected.twinGroupId && (
                    <div className="mt-2 flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50/70 p-2 text-xs">
                      <div className="flex items-center gap-1.5 text-indigo-900 font-medium min-w-0">
                        <GitFork size={13} className="text-indigo-600 shrink-0" />
                        <span className="truncate">
                          قل متناظر: <strong>{people.filter((p) => p.twinGroupId === selected.twinGroupId && p.id !== selected.id).map((p) => p.name).join('، ') || 'یافت نشد'}</strong>
                        </span>
                      </div>
                      <button type="button" onClick={() => dispatch({ type: 'UNLINK_TWIN', id: selected.id })} className="shrink-0 text-[10px] text-rose-600 hover:underline">
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
                        <div className="text-[10px] text-slate-500">پیوند با خواهر/برادر به عنوان دوقلو:</div>
                        <div className="flex gap-1.5">
                          <select id="linkSibSelect" className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
                            <option value="">انتخاب خواهر یا برادر...</option>
                            {sibCandidates.map((s) => (<option key={s.id} value={s.id}>{s.name} ({s.sex === 'male' ? 'برادر' : 'خواهر'})</option>))}
                          </select>
                          <LabBtn onClick={() => {
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
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Dna size={14} className="text-blue-600" />
                        <span className="text-[11px] font-bold text-slate-700">ارزیابی ژنتیک مندلی (آموزشی)</span>
                      </div>
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-mono font-bold text-blue-800">
                        {selectedRisk.model === INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE ? 'اتوزوم مغلوب' : selectedRisk.model === INHERITANCE_MODELS.AUTOSOMAL_DOMINANT ? 'اتوزوم غالب' : 'وابسته به X'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between bg-white rounded-md p-2 border border-slate-200/80">
                      <span className="text-[11px] font-medium text-slate-600">برآورد احتمال ناقل بودن:</span>
                      <span className={`text-xs font-bold font-mono ${
                        selectedRisk.status === RISK_STATUS.AFFECTED
                          ? 'text-rose-600'
                          : selectedRisk.status === RISK_STATUS.OBLIGATE_CARRIER
                          ? 'text-emerald-700'
                          : selectedRisk.status === RISK_STATUS.CONDITIONAL_CARRIER
                          ? 'text-blue-700'
                          : 'text-slate-500'
                      }`}>
                        {selectedRisk.probabilityDisplay}
                      </span>
                    </div>

                    <p className="text-[10px] leading-relaxed text-slate-600">
                      {selectedRisk.reason}
                    </p>

                    {/* Educational assumptions */}
                    {selectedRisk.assumptions.length > 0 && (
                      <div className="pt-1 border-t border-slate-200/50">
                        <div className="text-[9px] font-bold text-slate-400 mb-1">فرضیات محاسباتی:</div>
                        <ul className="text-[9px] text-slate-500 list-disc list-inside space-y-0.5">
                          {selectedRisk.assumptions.slice(0, 2).map((asm, idx) => (
                            <li key={idx} className="truncate">{asm}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Mandatory Non-Diagnostic Disclaimer */}
                    <div className="rounded bg-amber-50 border border-amber-200/70 p-2 text-[9px] text-amber-800 leading-normal">
                      ⚠️ <strong>سلب مسئولیت آموزشی:</strong> {CLINICAL_DISCLAIMER_FA}
                    </div>
                  </div>
                )}

                {/* Kinship Operations */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-slate-500">افزودن بستگان و اتصالات ژنتیکی</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <LabBtn onClick={() => addRelative('mother', selected.id)}><Plus size={12} /> والد مونث</LabBtn>
                    <LabBtn onClick={() => addRelative('father', selected.id)}><Plus size={12} /> والد مذکر</LabBtn>
                    <LabBtn onClick={() => addRelative('spouse', selected.id)}><Plus size={12} /> همسر</LabBtn>
                    <LabBtn onClick={() => addRelative('child', selected.id)}><Plus size={12} /> فرزند</LabBtn>
                    <LabBtn onClick={() => addRelative('twin_identical', selected.id)} className="bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100"><Plus size={12} /> قل همسان (MZ)</LabBtn>
                    <LabBtn onClick={() => addRelative('twin_fraternal', selected.id)} className="bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100"><Plus size={12} /> قل ناهمسان (DZ)</LabBtn>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center p-4">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-400">
                  <Activity size={24} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-700">هیچ نمونه‌ای انتخاب نشده است</h3>
                  <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
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
