// pedigreeLayout.js - High-Performance Scalable Genetic Pedigree Layout Engine
// Tested up to 50+ generations and 1000+ nodes.
// Features: Memoized ancestor tracking, collision-free interval scheduling for sibships,
// multi-spouse remarriages, consanguinity double lines, twins support, and call-stack-safe math.

const DEFAULTS = {
  nodeGap: 104,
  coupleGap: 80,
  twinGap: 82,
  layerGap: 155,
  nodeRadius: 28,
  margin: 80,
  busYFactor: 0.52,
};

const EMPTY_LAYOUT = {
  nodes: {},
  connectors: { mating: [], drop: [], sibship: [], childLink: [], longEdge: [], twinBars: [], twinMarks: [] },
  generations: {},
  bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
};

// ---------------- Call-Stack Safe Min/Max Helpers ----------------
function safeMin(arr, defaultVal = 0) {
  if (!arr || !arr.length) return defaultVal;
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < m) m = arr[i];
  }
  return m;
}

function safeMax(arr, defaultVal = 0) {
  if (!arr || !arr.length) return defaultVal;
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > m) m = arr[i];
  }
  return m;
}

// ---------------- Stage 1: Ancestors & Consanguinity (Memoized) ----------------
function buildAncestorCache(people) {
  const cache = new Map();

  function getAncestors(id) {
    if (!id || !people[id]) return new Set();
    if (cache.has(id)) return cache.get(id);

    const set = new Set();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || !people[cur] || set.has(cur)) continue;
      set.add(cur);
      const p = people[cur];
      if (p.motherId && people[p.motherId]) stack.push(p.motherId);
      if (p.fatherId && people[p.fatherId]) stack.push(p.fatherId);
    }
    cache.set(id, set);
    return set;
  }

  return getAncestors;
}

function checkConsanguinity(id1, id2, getAncestors) {
  if (!id1 || !id2) return false;
  const anc1 = getAncestors(id1);
  const anc2 = getAncestors(id2);
  if (anc1.has(id2) || anc2.has(id1)) return true;

  for (const a of anc1) {
    if (a !== id1 && a !== id2 && anc2.has(a)) return true;
  }
  return false;
}

// ---------------- Stage 2: Build Family Units ----------------
function buildFamilies(people, ids, getAncestors) {
  const families = new Map();

  const getFamKey = (pids) => pids.filter(Boolean).sort().join('+');
  const getOrCreateFamily = (parentIds) => {
    const valid = [...new Set(parentIds.filter((pid) => pid && people[pid]))];
    const key = getFamKey(valid);
    if (!key) return null;
    if (!families.has(key)) {
      const isConsanguineous = valid.length === 2 && checkConsanguinity(valid[0], valid[1], getAncestors);
      families.set(key, {
        id: 'F:' + key,
        parents: valid,
        children: [],
        consanguineous: isConsanguineous,
      });
    }
    return families.get(key);
  };

  // Reconcile single-parent children with married spouse if unambiguous
  ids.forEach((id) => {
    const p = people[id];
    let m = p.motherId && people[p.motherId] ? p.motherId : null;
    let f = p.fatherId && people[p.fatherId] ? p.fatherId : null;
    if (m && !f && people[m].spouseIds?.length === 1) {
      const sp = people[m].spouseIds[0];
      if (people[sp]?.childIds?.includes(id)) f = sp;
    } else if (f && !m && people[f].spouseIds?.length === 1) {
      const sp = people[f].spouseIds[0];
      if (people[sp]?.childIds?.includes(id)) m = sp;
    }
    const fam = getOrCreateFamily([m, f]);
    if (fam && !fam.children.includes(id)) {
      fam.children.push(id);
    }
  });

  // Ensure spouses without children also get a family unit
  ids.forEach((id) => {
    (people[id].spouseIds || []).forEach((sid) => {
      if (people[sid]) getOrCreateFamily([id, sid]);
    });
  });

  const familyOfOrigin = {};
  const familiesAsParent = {};
  families.forEach((fam) => {
    fam.children.forEach((cid) => {
      if (!familyOfOrigin[cid]) familyOfOrigin[cid] = fam;
    });
    fam.parents.forEach((pid) => {
      familiesAsParent[pid] = familiesAsParent[pid] || [];
      familiesAsParent[pid].push(fam);
    });
  });

  return { families, familyOfOrigin, familiesAsParent };
}

// ---------------- Stage 3: Cycle-Safe Generation Layering (up to 50+ gens) ----------------
function assignGenerations(ids, people, families, getAncestors) {
  // Spouse equivalence groups - only merge spouses if they are not in an ancestor-descendant relation
  const parentDSU = new Map();
  const find = (x) => {
    if (!parentDSU.has(x)) parentDSU.set(x, x);
    let r = x;
    while (parentDSU.get(r) !== r) r = parentDSU.get(r);
    while (parentDSU.get(x) !== r) {
      const n = parentDSU.get(x);
      parentDSU.set(x, r);
      x = n;
    }
    return r;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parentDSU.set(ra, rb);
  };

  families.forEach((fam) => {
    if (fam.parents.length === 2) {
      const [p1, p2] = fam.parents;
      const anc1 = getAncestors(p1);
      const anc2 = getAncestors(p2);
      if (!anc1.has(p2) && !anc2.has(p1)) {
        union(p1, p2);
      }
    }
  });

  // Build DAG over spouse groups
  const groupEdges = new Map();
  ids.forEach((id) => {
    const g = find(id);
    if (!groupEdges.has(g)) groupEdges.set(g, new Set());
  });

  families.forEach((fam) => {
    fam.parents.forEach((pid) => {
      const gp = find(pid);
      fam.children.forEach((cid) => {
        const gc = find(cid);
        if (gp !== gc) {
          groupEdges.get(gp)?.add(gc);
        }
      });
    });
  });

  // Longest path layering with cycle safety (bounded at max 65 iterations for deep trees)
  const allGroups = [...groupEdges.keys()];
  const groupLayer = new Map();
  allGroups.forEach((g) => groupLayer.set(g, 0));

  const maxIters = Math.min(allGroups.length + 2, 65);
  for (let it = 0; it < maxIters; it++) {
    let changed = false;
    for (const [gp, children] of groupEdges) {
      const lp = groupLayer.get(gp) || 0;
      for (const gc of children) {
        if ((groupLayer.get(gc) || 0) < lp + 1) {
          groupLayer.set(gc, lp + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const layerOf = {};
  ids.forEach((id) => {
    layerOf[id] = groupLayer.get(find(id)) || 0;
  });

  return layerOf;
}

// ---------------- Stage 4: Multi-Spouse & Twin Clusters ----------------
function buildLayerClusters(people, ids, families, layerOf, familyOfOrigin) {
  const layerMap = {};
  ids.forEach((id) => {
    const L = layerOf[id];
    layerMap[L] = layerMap[L] || [];
    layerMap[L].push(id);
  });

  const layerBlocks = {};
  const blockOf = {};

  Object.entries(layerMap).forEach(([LStr, layerIds]) => {
    const L = Number(LStr);
    const visited = new Set();
    const blocks = [];

    // Find connected spouse & twin components in this layer
    layerIds.forEach((id) => {
      if (visited.has(id)) return;
      const comp = [];
      const queue = [id];
      visited.add(id);

      while (queue.length) {
        const cur = queue.shift();
        comp.push(cur);

        // Traverse spouses in this layer
        (people[cur].spouseIds || []).forEach((sid) => {
          if (layerIds.includes(sid) && !visited.has(sid)) {
            visited.add(sid);
            queue.push(sid);
          }
        });

        // Traverse twin siblings in this layer from same family
        const pCur = people[cur];
        if (pCur.twinType && pCur.twinType !== 'none') {
          layerIds.forEach((sid) => {
            if (sid === cur || visited.has(sid)) return;
            const pOther = people[sid];
            if (!pOther?.twinType || pOther.twinType === 'none') return;
            const sameFam = familyOfOrigin && familyOfOrigin[cur] && familyOfOrigin[cur] === familyOfOrigin[sid];
            const matchGroup = pCur.twinGroupId && pOther.twinGroupId && pCur.twinGroupId === pOther.twinGroupId;
            const matchDirect = (pCur.twinWithId && pCur.twinWithId === sid) || (pOther.twinWithId && pOther.twinWithId === cur);
            const matchFallback = sameFam && (!pCur.twinGroupId || !pOther.twinGroupId);

            if (sameFam && (matchGroup || matchDirect || matchFallback)) {
              visited.add(sid);
              queue.push(sid);
            }
          });
        }
      }

      // Order cluster:
      // If 1 person: [id]
      // If 2 people: male left, female right (or twins side-by-side)
      // If 1 person with multiple spouses: put shared person IN THE MIDDLE: [spouse1, person, spouse2]
      let ordered = comp;
      if (comp.length === 2) {
        const [a, b] = comp;
        const sa = people[a]?.sex, sb = people[b]?.sex;
        if (sa === 'female' && sb === 'male') ordered = [b, a];
        else ordered = [a, b];
      } else if (comp.length >= 3) {
        let hub = comp[0];
        let maxSpouses = -1;
        comp.forEach((c) => {
          const spCount = (people[c].spouseIds || []).filter((s) => comp.includes(s)).length;
          if (spCount > maxSpouses) {
            maxSpouses = spCount;
            hub = c;
          }
        });
        if (maxSpouses > 1) {
          const others = comp.filter((c) => c !== hub);
          const mid = Math.floor(others.length / 2);
          ordered = [...others.slice(0, mid), hub, ...others.slice(mid)];
        }
      }

      const blockKey = 'BLK:' + ordered.join('+');
      ordered.forEach((pid) => {
        blockOf[pid] = blockKey;
      });
      blocks.push({ id: blockKey, members: ordered });
    });

    layerBlocks[L] = blocks;
  });

  return { layerBlocks, blockOf };
}

// ---------------- Stage 5: Layer Ordering with Barycenter ----------------
function orderLayers(people, ids, families, layerOf, { layerBlocks }) {
  const layerNums = Object.keys(layerBlocks).map(Number).sort((a, b) => a - b);
  const orderedLayers = {};

  const childOf = {};
  const parentsOf = {};
  ids.forEach((id) => {
    childOf[id] = [];
    parentsOf[id] = [];
  });
  families.forEach((fam) => {
    fam.parents.forEach((pid) => {
      fam.children.forEach((cid) => {
        childOf[pid]?.push(cid);
        parentsOf[cid]?.push(pid);
      });
    });
  });

  // Initial order from blocks
  layerNums.forEach((L) => {
    const list = [];
    layerBlocks[L].forEach((b) => {
      b.members.forEach((m) => list.push(m));
    });
    orderedLayers[L] = list;
  });

  // Barycenter sweeps
  const posMap = {};
  const updatePosMap = () => {
    layerNums.forEach((L) => {
      orderedLayers[L].forEach((id, idx) => {
        posMap[id] = idx;
      });
    });
  };
  updatePosMap();

  const sweepsCount = Math.min(6, Math.max(3, Math.floor(50 / Math.max(layerNums.length, 1))));
  for (let sweep = 0; sweep < sweepsCount; sweep++) {
    const useDown = sweep % 2 === 0;
    const seq = useDown ? layerNums : [...layerNums].reverse();

    seq.forEach((L) => {
      const blocks = layerBlocks[L];
      const blockScores = blocks.map((b) => {
        let sum = 0, count = 0;
        b.members.forEach((m) => {
          const neighbors = useDown ? parentsOf[m] : childOf[m];
          neighbors.forEach((nb) => {
            if (posMap[nb] !== undefined) {
              sum += posMap[nb];
              count++;
            }
          });
        });
        const bary = count > 0 ? sum / count : (posMap[b.members[0]] ?? 0);
        return { block: b, bary };
      });

      blockScores.sort((a, b) => a.bary - b.bary);
      const nextList = [];
      blockScores.forEach((bs) => {
        bs.block.members.forEach((m) => nextList.push(m));
      });
      orderedLayers[L] = nextList;
    });

    updatePosMap();
  }

  return { orderedLayers, layerNums };
}

// ---------------- Stage 6: Coordinate Assignment with Hierarchical Centering ----------------
function computeSubtreeWidths(ids, people, opt) {
  const widthOf = {};
  function getW(id, visited = new Set()) {
    if (!id || !people[id] || visited.has(id)) return opt.nodeGap;
    if (widthOf[id]) return widthOf[id];
    visited.add(id);
    const p = people[id];
    const cIds = p.childIds || [];
    if (!cIds.length) {
      widthOf[id] = opt.nodeGap;
      return opt.nodeGap;
    }
    let totalCWidth = 0;
    cIds.forEach((cid) => {
      totalCWidth += getW(cid, visited);
    });
    const hasSpouse = (p.spouseIds || []).length > 0;
    const minW = hasSpouse ? opt.nodeGap + opt.coupleGap : opt.nodeGap;
    widthOf[id] = Math.max(minW, totalCWidth);
    return widthOf[id];
  }
  ids.forEach((id) => getW(id));
  return widthOf;
}

function assignCoordinates(people, families, familyOfOrigin, { orderedLayers, layerNums }, opt) {
  const x = {};
  const allIds = Object.keys(people);
  const widthOf = computeSubtreeWidths(allIds, people, opt);

  const getSpacing = (p1, p2) => {
    if (!p1 || !p2) return opt.nodeGap;
    if (people[p1].spouseIds?.includes(p2)) return opt.coupleGap;
    const fam1 = familyOfOrigin[p1];
    const fam2 = familyOfOrigin[p2];
    if (fam1 && fam2 && fam1 === fam2) {
      const t1 = people[p1].twinType, t2 = people[p2].twinType;
      if (t1 && t1 !== 'none' && t2 && t2 !== 'none' && t1 === t2) {
        return opt.twinGap;
      }
      const w1 = widthOf[p1] || opt.nodeGap;
      const w2 = widthOf[p2] || opt.nodeGap;
      return Math.max(opt.nodeGap, (w1 + w2) / 2);
    }
    const w1 = widthOf[p1] || opt.nodeGap;
    const w2 = widthOf[p2] || opt.nodeGap;
    return Math.max(opt.nodeGap * 1.25, (w1 + w2) / 2 + 16);
  };

  // Initial horizontal placement per layer
  layerNums.forEach((L) => {
    let curX = 0;
    const list = orderedLayers[L];
    list.forEach((id, i) => {
      if (i > 0) curX += getSpacing(list[i - 1], id);
      x[id] = curX;
    });
  });

  const resolveLayer = (L) => {
    const list = orderedLayers[L];
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      const minX = x[prev] + getSpacing(prev, cur);
      if (x[cur] < minX) x[cur] = minX;
    }
  };

  // Bottom-up alignment pass: center parents over children
  const revLayers = [...layerNums].reverse();
  revLayers.forEach((L) => {
    const list = orderedLayers[L];
    list.forEach((id) => {
      const p = people[id];
      const cXs = (p.childIds || []).map((cid) => x[cid]).filter((v) => v !== undefined);
      if (cXs.length > 0) {
        const cMin = safeMin(cXs, 0);
        const cMax = safeMax(cXs, 0);
        const cCenter = (cMin + cMax) / 2;
        const isMale = p.sex === 'male';
        const hasSpouse = (p.spouseIds || []).some((sid) => orderedLayers[L].includes(sid));
        if (hasSpouse) {
          x[id] = cCenter + (isMale ? -opt.coupleGap : opt.coupleGap) / 2;
        } else {
          x[id] = cCenter;
        }
      }
    });
    resolveLayer(L);
  });

  // Top-down alignment pass: center children under parents
  layerNums.forEach((L) => {
    const list = orderedLayers[L];
    list.forEach((id) => {
      const famOrig = familyOfOrigin[id];
      if (famOrig && famOrig.parents.length > 0) {
        const pXs = famOrig.parents.map((pid) => x[pid]).filter((v) => v !== undefined);
        if (pXs.length > 0) {
          const pCenter = pXs.reduce((a, b) => a + b, 0) / pXs.length;
          const sibs = famOrig.children;
          const sIdx = sibs.indexOf(id);
          const totalSibs = sibs.length;
          const sibOffset = (sIdx - (totalSibs - 1) / 2) * Math.max(opt.nodeGap, (widthOf[id] || opt.nodeGap));
          x[id] = pCenter + sibOffset;
        }
      }
    });
    resolveLayer(L);
  });

  // Iterative damped relaxation for convergence
  const passes = Math.min(30, Math.max(12, Math.floor(400 / Math.max(layerNums.length, 1))));
  for (let pass = 0; pass < passes; pass++) {
    const isUp = pass % 2 === 0;
    const seq = isUp ? [...layerNums].reverse() : layerNums;

    seq.forEach((L) => {
      const list = orderedLayers[L];
      list.forEach((id) => {
        const p = people[id];
        let sum = 0, count = 0;

        // Pull towards parents
        const famOrig = familyOfOrigin[id];
        if (famOrig && famOrig.parents.length > 0) {
          const pXs = famOrig.parents.map((pid) => x[pid]).filter((v) => v !== undefined);
          if (pXs.length) {
            const pCenter = pXs.reduce((a, b) => a + b, 0) / pXs.length;
            const sibs = famOrig.children;
            const sIdx = sibs.indexOf(id);
            const totalSibs = sibs.length;
            const sibOffset = (sIdx - (totalSibs - 1) / 2) * opt.nodeGap;
            sum += (pCenter + sibOffset) * 2.0;
            count += 2.0;
          }
        }

        // Pull towards children midpoint
        const cXs = (p.childIds || []).map((cid) => x[cid]).filter((v) => v !== undefined);
        if (cXs.length > 0) {
          const cCenter = (safeMin(cXs, 0) + safeMax(cXs, 0)) / 2;
          const isMale = p.sex === 'male';
          const hasSpouse = (p.spouseIds || []).some((sid) => orderedLayers[L].includes(sid));
          const desired = hasSpouse ? cCenter + (isMale ? -opt.coupleGap : opt.coupleGap) / 2 : cCenter;
          sum += desired * 2.0;
          count += 2.0;
        }

        // Keep spouses adjacent
        (p.spouseIds || []).forEach((sid) => {
          if (x[sid] !== undefined && orderedLayers[L].includes(sid)) {
            const desiredOffset = (people[id].sex === 'male' ? -opt.coupleGap : opt.coupleGap) / 2;
            sum += (x[sid] + desiredOffset) * 0.8;
            count += 0.8;
          }
        });

        if (count > 0) {
          const target = sum / count;
          x[id] = x[id] * 0.5 + target * 0.5;
        }
      });

      resolveLayer(L);
    });
  }

  // Final resolution pass to ensure strict minimum spacing
  layerNums.forEach((L) => resolveLayer(L));

  return x;
}

// ---------------- Stage 7: Family Connectors with Interval Scheduling ----------------
function buildConnectors(families, people, layerOf, nodeXY, opt) {
  const yOf = (L) => L * opt.layerGap;
  const r = opt.nodeRadius;
  const connectors = {
    mating: [],
    drop: [],
    sibship: [],
    childLink: [],
    longEdge: [],
    twinBars: [],
  };

  const familiesList = [...families.values()].filter((f) => f.parents.length > 0);

  // Group families by parent generation layer and assign non-overlapping sibship bus lanes
  const byLayer = new Map();
  familiesList.forEach((fam) => {
    const parentLayer = Math.max(...fam.parents.map((p) => layerOf[p]));
    if (!byLayer.has(parentLayer)) byLayer.set(parentLayer, []);
    byLayer.get(parentLayer).push(fam);
  });

  const busYMap = new Map();
  byLayer.forEach((fams, pLayer) => {
    const baseBusY = yOf(pLayer) + opt.layerGap * opt.busYFactor;
    // Calculate horizontal spans for each family
    const spans = fams.map((fam) => {
      const pXs = fam.parents.map((p) => nodeXY[p]?.x ?? 0);
      const cXs = fam.children.map((c) => nodeXY[c]?.x ?? 0);
      const all = [...pXs, ...cXs];
      return {
        fam,
        min: safeMin(all, 0),
        max: safeMax(all, 0),
      };
    });
    // Interval scheduling to assign bus height lanes
    spans.sort((a, b) => a.min - b.min);
    const lanes = [];
    spans.forEach(({ fam, min, max }) => {
      let lane = -1;
      for (let l = 0; l < lanes.length; l++) {
        if (lanes[l] < min - 8) {
          lane = l;
          lanes[l] = max;
          break;
        }
      }
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(max);
      }
      busYMap.set(fam.id, baseBusY + lane * 10);
    });
  });

  familiesList.forEach((fam) => {
    const { parents, children, consanguineous } = fam;
    const parentLayer = Math.max(...parents.map((p) => layerOf[p]));
    const parentY = yOf(parentLayer);
    const busY = busYMap.get(fam.id) || (parentY + opt.layerGap * opt.busYFactor);

    let junctionX = 0;
    let dropStartY = parentY;

    if (parents.length === 2) {
      const [p1, p2] = parents;
      const x1 = nodeXY[p1]?.x ?? 0;
      const x2 = nodeXY[p2]?.x ?? 0;
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);

      const lineX1 = minX + r;
      const lineX2 = Math.max(lineX1, maxX - r);

      connectors.mating.push({
        x1: lineX1,
        y1: parentY,
        x2: lineX2,
        y2: parentY,
        consanguineous,
        parents: [p1, p2],
      });

      junctionX = (x1 + x2) / 2;
      dropStartY = parentY;
    } else if (parents.length === 1) {
      junctionX = nodeXY[parents[0]]?.x ?? 0;
      dropStartY = parentY + r;
    }

    if (!children.length) return;

    const near = children.filter((c) => layerOf[c] === parentLayer + 1);
    const far = children.filter((c) => layerOf[c] > parentLayer + 1);

    if (near.length > 0) {
      // 1. Group near children into twin sets and singletons
      const twinSets = [];
      const handled = new Set();

      near.forEach((cid) => {
        if (handled.has(cid)) return;
        const child = people[cid];
        const tt = child?.twinType;
        if (!tt || tt === 'none') return;

        // Collect all twin siblings in near matching this child
        const members = [cid];
        near.forEach((oid) => {
          if (oid === cid || handled.has(oid)) return;
          const other = people[oid];
          if (!other?.twinType || other.twinType === 'none') return;

          const matchGroup = child.twinGroupId && other.twinGroupId && child.twinGroupId === other.twinGroupId;
          const matchDirect = (child.twinWithId && child.twinWithId === oid) || (other.twinWithId && other.twinWithId === cid);
          const matchType = !child.twinGroupId && !other.twinGroupId && !child.twinWithId && !other.twinWithId;

          if (matchGroup || matchDirect || matchType) {
            members.push(oid);
          }
        });

        if (members.length >= 2) {
          members.forEach((m) => handled.add(m));
          const xs = members.map((m) => nodeXY[m]?.x ?? junctionX);
          const minTwinX = Math.min(...xs);
          const maxTwinX = Math.max(...xs);
          const apexX = (minTwinX + maxTwinX) / 2;
          twinSets.push({
            members: [...members].sort((a, b) => (nodeXY[a]?.x ?? 0) - (nodeXY[b]?.x ?? 0)),
            twinType: tt,
            apexX,
          });
        }
      });

      // 2. Determine attachment points on the sibship bus
      const attachmentXs = [junctionX];
      twinSets.forEach((ts) => attachmentXs.push(ts.apexX));
      near.forEach((cid) => {
        if (!handled.has(cid)) {
          attachmentXs.push(nodeXY[cid]?.x ?? junctionX);
        }
      });

      const busMinX = Math.min(...attachmentXs);
      const busMaxX = Math.max(...attachmentXs);

      // Parent vertical descent drop
      connectors.drop.push({
        x: junctionX,
        y1: dropStartY,
        y2: busY,
      });

      // Horizontal sibship bus line (drawn only between distinct attachment points)
      if (busMinX !== busMaxX) {
        connectors.sibship.push({
          x1: busMinX,
          x2: busMaxX,
          y: busY,
        });
      }

      const childY = yOf(parentLayer + 1);

      // 3. Draw twin connectors (inverted V-fork, horizontal bar for MZ, '?' for unknown)
      twinSets.forEach(({ members, twinType, apexX }) => {
        // Angled arms from apex point on bus down to each twin
        members.forEach((mid) => {
          const mx = nodeXY[mid]?.x ?? apexX;
          connectors.childLink.push({
            x1: apexX,
            y1: busY,
            x2: mx,
            y2: childY - r,
          });
        });

        // Monozygotic (MZ) identical twins: horizontal connecting bar midway
        if (twinType === 'identical' || twinType === 'monozygotic') {
          const midY = busY + (childY - r - busY) * 0.45;
          for (let i = 0; i < members.length - 1; i++) {
            const m1 = members[i], m2 = members[i + 1];
            const x1 = nodeXY[m1]?.x ?? apexX;
            const x2 = nodeXY[m2]?.x ?? apexX;
            const barX1 = apexX + (x1 - apexX) * 0.45;
            const barX2 = apexX + (x2 - apexX) * 0.45;
            connectors.twinBars.push({
              x1: Math.min(barX1, barX2),
              x2: Math.max(barX1, barX2),
              y: midY,
            });
          }
        }

        // Unknown zygosity twins: ACMG '?' notation midway
        if (twinType === 'unknown' || twinType === 'unknown_zygosity') {
          const midY = busY + (childY - r - busY) * 0.45;
          connectors.twinMarks = connectors.twinMarks || [];
          connectors.twinMarks.push({
            x: apexX,
            y: midY,
            label: '?',
          });
        }
      });

      // 4. Draw vertical descent lines for singleton children
      near.forEach((cid) => {
        if (handled.has(cid)) return;
        const cx = nodeXY[cid]?.x ?? junctionX;
        const cy = yOf(layerOf[cid]);
        connectors.childLink.push({
          x1: cx,
          y1: busY,
          x2: cx,
          y2: cy - r,
          x: cx,
        });
      });
    }

    far.forEach((cid) => {
      const cx = nodeXY[cid]?.x ?? junctionX;
      const cy = yOf(layerOf[cid]);
      const midY = busY;
      connectors.longEdge.push({
        points: [
          [junctionX, dropStartY],
          [junctionX, midY],
          [cx, midY],
          [cx, cy - r],
        ],
      });
    });
  });

  return connectors;
}

// ---------------- Stage 8: Safe Bounds Normalization ----------------
function normalizeBounds(ids, nodes, connectors, opt) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  ids.forEach((id) => {
    const n = nodes[id];
    if (n) {
      if (n.x - opt.nodeRadius < minX) minX = n.x - opt.nodeRadius;
      if (n.x + opt.nodeRadius > maxX) maxX = n.x + opt.nodeRadius;
      if (n.y - opt.nodeRadius < minY) minY = n.y - opt.nodeRadius;
      if (n.y + opt.nodeRadius + 24 > maxY) maxY = n.y + opt.nodeRadius + 24;
    }
  });

  connectors.mating.forEach((s) => {
    minX = Math.min(minX, s.x1, s.x2);
    maxX = Math.max(maxX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxY = Math.max(maxY, s.y1, s.y2);
  });

  connectors.sibship.forEach((s) => {
    minX = Math.min(minX, s.x1, s.x2);
    maxX = Math.max(maxX, s.x1, s.x2);
    minY = Math.min(minY, s.y);
    maxY = Math.max(maxY, s.y);
  });

  if (!isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 140, maxY: 140, width: 140, height: 140 };
  }

  const margin = opt.margin;
  const dx = margin - minX;
  const dy = margin - minY;

  ids.forEach((id) => {
    if (nodes[id]) {
      nodes[id].x += dx;
      nodes[id].y += dy;
    }
  });

  connectors.mating.forEach((s) => {
    s.x1 += dx; s.x2 += dx; s.y1 += dy; s.y2 += dy;
  });
  connectors.drop.forEach((s) => {
    s.x += dx; s.y1 += dy; s.y2 += dy;
  });
  connectors.sibship.forEach((s) => {
    s.x1 += dx; s.x2 += dx; s.y += dy;
  });
  connectors.childLink.forEach((s) => {
    if (s.x1 !== undefined) {
      s.x1 += dx; s.x2 += dx; s.y1 += dy; s.y2 += dy;
      s.x = s.x1;
    } else {
      s.x += dx; s.y1 += dy; s.y2 += dy;
      s.x1 = s.x; s.x2 = s.x;
    }
  });
  (connectors.twinBars || []).forEach((s) => {
    s.x1 += dx; s.x2 += dx; s.y += dy;
  });
  (connectors.twinMarks || []).forEach((m) => {
    m.x += dx; m.y += dy;
  });
  connectors.longEdge.forEach((e) => {
    e.points = e.points.map(([px, py]) => [px + dx, py + dy]);
  });

  const width = Math.ceil(maxX - minX + margin * 2);
  const height = Math.ceil(maxY - minY + margin * 2);

  return { minX: 0, minY: 0, maxX: width, maxY: height, width, height };
}

// ---------------- Public Layout API ----------------
export function computePedigreeLayout(data, options = {}) {
  const opt = { ...DEFAULTS, ...options };
  const people = (data && data.people) ? data.people : {};
  const ids = Object.keys(people);
  if (ids.length === 0) return EMPTY_LAYOUT;

  const getAncestors = buildAncestorCache(people);
  const { families, familyOfOrigin } = buildFamilies(people, ids, getAncestors);
  const layerOf = assignGenerations(ids, people, families, getAncestors);
  const clusters = buildLayerClusters(people, ids, families, layerOf, familyOfOrigin);
  const ordering = orderLayers(people, ids, families, layerOf, clusters, opt);
  const x = assignCoordinates(people, families, familyOfOrigin, ordering, opt);

  const nodes = {};
  ids.forEach((id) => {
    nodes[id] = {
      x: x[id] ?? 0,
      y: (layerOf[id] ?? 0) * opt.layerGap,
    };
  });

  const connectors = buildConnectors(families, people, layerOf, nodes, opt);
  const bounds = normalizeBounds(ids, nodes, connectors, opt);

  const generations = {};
  ids.forEach((id) => {
    generations[id] = layerOf[id] ?? 0;
  });

  return { nodes, connectors, generations, bounds };
}

export default computePedigreeLayout;
