/**
 * @file pedigreeReducer.js
 * @description Pure reducer, action handlers, and history management for Pedigree State
 */

import { wouldCreateCycle } from '../domain/pedigreeValidation.js';
import { INHERITANCE_MODELS } from '../domain/geneticRisk.js';

export const uid = (p = 'p') => `${p}_${Math.random().toString(36).slice(2, 9)}`;

export const clone = (obj) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
};

export const INITIAL_STATE = {
  data: {
    schemaVersion: 2,
    metadata: {
      caseRef: 'CASE-GEN-8420',
      caseTitle: 'کنسول ژنتیک بالینی',
      createdAt: new Date().toISOString(),
      inheritanceModel: INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE,
    },
    people: {},
  },
  selectedId: null,
  inheritanceModel: INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE,
  zoom: 1,
  offset: { x: 80, y: 80 },
  lastError: null,
};

export function pedigreeReducer(state, action) {
  const data = clone(state.data);

  switch (action.type) {
    case 'SET_INHERITANCE_MODEL': {
      return {
        ...state,
        inheritanceModel: action.model || INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE,
      };
    }

    case 'ADD_PERSON': {
      const id = action.id || uid();
      data.people[id] = {
        id,
        name: action.name || 'کیس جدید',
        sex: action.sex || 'unknown',
        spouseIds: [],
        childIds: [],
        twinType: 'none',
        adopted: false,
        affected: false,
        carrier: false,
        hasMutation: false,
        ...(action.person || {}),
      };
      return { ...state, data, selectedId: id, lastError: null };
    }

    case 'UPDATE': {
      const p = data.people[action.id];
      if (!p) return state;

      const oldTg = p.twinGroupId;
      const patch = action.patch || {};
      data.people[action.id] = { ...p, ...patch };

      // Twin detachment / synchronization
      if (patch.twinType === 'none' && oldTg) {
        data.people[action.id].twinGroupId = null;
        const rem = Object.values(data.people).filter((x) => x.twinGroupId === oldTg && x.id !== action.id);
        if (rem.length === 1) {
          rem[0].twinGroupId = null;
          rem[0].twinType = 'none';
        }
      } else if (patch.twinType && patch.twinType !== 'none' && (p.twinGroupId || oldTg)) {
        const tg = p.twinGroupId || oldTg;
        Object.values(data.people).forEach((o) => {
          if (o.twinGroupId === tg && o.id !== action.id) {
            o.twinType = patch.twinType;
          }
        });
      }

      return { ...state, data, lastError: null };
    }

    case 'ADD_PARENT': {
      const child = data.people[action.childId];
      if (!child) return state;

      const sex = action.sex || 'unknown';
      const id = action.id || uid();
      const name = sex === 'male' ? 'پدر' : sex === 'female' ? 'مادر' : 'والد';

      // Check if making this person a parent creates a cycle
      if (wouldCreateCycle(id, action.childId, data.people)) {
        return {
          ...state,
          lastError: 'امکان افزودن والد وجود ندارد زیرا چرخه اجدادی (Cycle) نامعتبر ایجاد می‌شود.',
        };
      }

      data.people[id] = {
        id,
        name,
        sex,
        spouseIds: [],
        childIds: [action.childId],
        twinType: 'none',
        adopted: false,
        affected: false,
        carrier: false,
        hasMutation: false,
      };

      if (sex === 'male') child.fatherId = id;
      else if (sex === 'female') child.motherId = id;

      // Link to other parent as spouse if exists
      const otherId = sex === 'female' ? child.fatherId : sex === 'male' ? child.motherId : null;
      if (otherId && data.people[otherId] && otherId !== id) {
        if (!data.people[id].spouseIds.includes(otherId)) data.people[id].spouseIds.push(otherId);
        data.people[otherId].spouseIds = data.people[otherId].spouseIds || [];
        if (!data.people[otherId].spouseIds.includes(id)) data.people[otherId].spouseIds.push(id);
      }

      return { ...state, data, selectedId: id, lastError: null };
    }

    case 'ADD_SPOUSE': {
      const person = data.people[action.personId];
      if (!person) return state;

      const sex = action.sex || (person.sex === 'male' ? 'female' : person.sex === 'female' ? 'male' : 'unknown');
      const id = action.id || uid();

      data.people[id] = {
        id,
        name: 'همسر',
        sex,
        spouseIds: [action.personId],
        childIds: [],
        twinType: 'none',
        adopted: false,
        affected: false,
        carrier: false,
        hasMutation: false,
      };

      person.spouseIds = person.spouseIds || [];
      if (!person.spouseIds.includes(id)) person.spouseIds.push(id);

      // Assign existing children without that parent gender
      (person.childIds || []).forEach((cid) => {
        const ch = data.people[cid];
        if (!ch) return;
        if (sex === 'female' && !ch.motherId) {
          ch.motherId = id;
          data.people[id].childIds.push(cid);
        } else if (sex === 'male' && !ch.fatherId) {
          ch.fatherId = id;
          data.people[id].childIds.push(cid);
        }
      });

      return { ...state, data, selectedId: id, lastError: null };
    }

    case 'ADD_CHILD': {
      const { motherId, fatherId } = action;
      if (motherId && wouldCreateCycle(motherId, uid(), data.people)) {
        return state;
      }

      const id = action.id || uid();
      data.people[id] = {
        id,
        name: 'فرزند',
        sex: action.sex || 'unknown',
        spouseIds: [],
        childIds: [],
        motherId: motherId ?? null,
        fatherId: fatherId ?? null,
        twinType: 'none',
        adopted: false,
        affected: false,
        carrier: false,
        hasMutation: false,
      };

      if (motherId && data.people[motherId]) {
        data.people[motherId].childIds = data.people[motherId].childIds || [];
        if (!data.people[motherId].childIds.includes(id)) data.people[motherId].childIds.push(id);
      }
      if (fatherId && data.people[fatherId]) {
        data.people[fatherId].childIds = data.people[fatherId].childIds || [];
        if (!data.people[fatherId].childIds.includes(id)) data.people[fatherId].childIds.push(id);
      }

      return { ...state, data, selectedId: id, lastError: null };
    }

    case 'ADD_TWIN': {
      const base = data.people[action.baseId];
      if (!base) return state;

      const zygosity = action.zygosity || 'identical';
      const id = action.id || uid('tw');
      const sex = action.sex || (zygosity === 'identical' ? (base.sex === 'unknown' ? 'male' : base.sex) : (base.sex === 'male' ? 'female' : 'male'));
      const twinGroupId = base.twinGroupId || uid('tg');

      base.twinGroupId = twinGroupId;
      if (!base.twinType || base.twinType === 'none') {
        base.twinType = zygosity;
      }

      let mId = base.motherId;
      let fId = base.fatherId;

      if (!mId && !fId) {
        fId = uid('f');
        mId = uid('m');
        data.people[fId] = { id: fId, name: 'پدر', sex: 'male', spouseIds: [mId], childIds: [base.id, id], twinType: 'none', adopted: false };
        data.people[mId] = { id: mId, name: 'مادر', sex: 'female', spouseIds: [fId], childIds: [base.id, id], twinType: 'none', adopted: false };
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
        carrier: !!base.carrier && zygosity === 'identical',
        affected: !!base.affected && zygosity === 'identical',
        hasMutation: !!base.hasMutation && zygosity === 'identical',
      };

      return { ...state, data, selectedId: id, lastError: null };
    }

    case 'LINK_TWINS': {
      const { id1, id2, zygosity } = action;
      const p1 = data.people[id1], p2 = data.people[id2];
      if (!p1 || !p2) return state;

      const tg = p1.twinGroupId || p2.twinGroupId || uid('tg');
      const z = zygosity || p1.twinType || p2.twinType || 'identical';
      p1.twinGroupId = tg;
      p2.twinGroupId = tg;
      p1.twinType = z;
      p2.twinType = z;

      return { ...state, data, lastError: null };
    }

    case 'UNLINK_TWIN': {
      const p = data.people[action.id];
      if (!p) return state;

      const tg = p.twinGroupId;
      p.twinGroupId = null;
      p.twinType = 'none';

      if (tg) {
        const rem = Object.values(data.people).filter((x) => x.twinGroupId === tg);
        if (rem.length === 1) {
          rem[0].twinGroupId = null;
          rem[0].twinType = 'none';
        }
      }

      return { ...state, data, lastError: null };
    }

    case 'DELETE': {
      const id = action.id;
      if (!data.people[id]) return state;

      const deletedPerson = data.people[id];
      const tg = deletedPerson.twinGroupId;

      Object.values(data.people).forEach((p) => {
        if (p.motherId === id) p.motherId = null;
        if (p.fatherId === id) p.fatherId = null;
        p.spouseIds = (p.spouseIds || []).filter((v) => v !== id);
        p.childIds = (p.childIds || []).filter((v) => v !== id);
      });

      delete data.people[id];

      // Clean up remaining twin if alone
      if (tg) {
        const remaining = Object.values(data.people).filter((p) => p.twinGroupId === tg);
        if (remaining.length === 1) {
          remaining[0].twinGroupId = null;
          remaining[0].twinType = 'none';
        }
      }

      return { ...state, data, selectedId: null, lastError: null };
    }

    case 'LOAD': {
      if (!action.data || typeof action.data !== 'object' || !action.data.people) {
        return {
          ...state,
          lastError: 'فرمت فایل بارگذاری شده نامعتبر است و تغییری در شجره‌نامه جاری داده نشد.',
        };
      }
      return {
        ...state,
        data: clone(action.data),
        selectedId: null,
        lastError: null,
      };
    }

    case 'SELECT':
      return { ...state, selectedId: action.id };

    case 'ZOOM': {
      const factor = action.factor ?? (action.delta > 0 ? 1.25 : 0.8);
      const newZoom = Math.max(0.005, Math.min(5, state.zoom * factor));
      if (action.center) {
        const { cx, cy } = action.center;
        const newOffset = {
          x: cx - (cx - state.offset.x) * (newZoom / state.zoom),
          y: cy - (cy - state.offset.y) * (newZoom / state.zoom),
        };
        return { ...state, zoom: newZoom, offset: newOffset };
      }
      return { ...state, zoom: newZoom };
    }

    case 'PAN':
      return { ...state, offset: { x: state.offset.x + action.dx, y: state.offset.y + action.dy } };

    case 'SET_VIEW':
      return { ...state, zoom: action.zoom, offset: action.offset };

    case 'RESET_VIEW':
      return { ...state, zoom: 1, offset: { x: 80, y: 80 } };

    case 'CLEAR_ERROR':
      return { ...state, lastError: null };

    default:
      return state;
  }
}

/**
 * Undo / Redo History Wrapper
 */
export function historyReducer(history, action) {
  const { past, present, future } = history;

  if (action.type === 'UNDO') {
    if (!past.length) return history;
    const previous = past[past.length - 1];
    return {
      past: past.slice(0, -1),
      present: previous,
      future: [present, ...future],
    };
  }

  if (action.type === 'REDO') {
    if (!future.length) return history;
    const next = future[0];
    return {
      past: [...past, present],
      present: next,
      future: future.slice(1),
    };
  }

  // Non-history actions: View navigation and error clearing
  if (['SELECT', 'ZOOM', 'PAN', 'RESET_VIEW', 'SET_VIEW', 'CLEAR_ERROR'].includes(action.type)) {
    return {
      past,
      present: pedigreeReducer(present, action),
      future,
    };
  }

  const newPresent = pedigreeReducer(present, action);
  // Cap history at 50 to avoid unbounded memory growth
  const maxHistory = 50;
  const newPast = [...past, present].slice(-maxHistory);

  return {
    past: newPast,
    present: newPresent,
    future: [],
  };
}
