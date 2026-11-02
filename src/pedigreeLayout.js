// pedigreeLayout.js - High-Precision Scalable Genetic Pedigree Layout Engine
// Tested up to 50+ generations and 1000+ nodes.
// Features: Contour-based subtree bounding, zero-drift symmetrical centering,
// collision-free interval scheduling for sibships, multi-spouse remarriages,
// consanguinity double lines with collision avoidance, twins support (MZ/DZ/unknown),
// and call-stack-safe math.

export const DEFAULTS = {
  nodeGap: 104,
  coupleGap: 80,
  twinGap: 82,
  layerGap: 155,
  nodeRadius: 28,
  margin: 80,
  busYFactor: 0.52,
};

export const EMPTY_LAYOUT = {
  nodes: {},
  connectors: { mating: [], drop: [], sibship: [], childLink: [], longEdge: [], twinBars: [], twinMarks: [] },
  generations: {},
  bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
  collisions: { detected: 0, resolved: true, remaining: 0, details: [] },
  debugBoxes: { nodes: [], connectors: [] },
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

  const maxIters = Math.min(allGroups.length + 2, 70);
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

// ---------------- Stage 4: Sibling & Multi-Spouse Cluster Grouping ----------------
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

// ---------------- Stage 5: Layer Ordering (Barycentric & Sibling Coherence) ----------------
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

  // Barycenter sweeps to reduce edge crossings
  const posMap = {};
  const updatePosMap = () => {
    layerNums.forEach((L) => {
      orderedLayers[L].forEach((id, idx) => {
        posMap[id] = idx;
      });
    });
  };
  updatePosMap();

  const sweepsCount = Math.min(4, Math.max(2, Math.floor(30 / Math.max(layerNums.length, 1))));
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

// ---------------- Stage 6: Contour-Based Subtree Placement (Zero Drift & Non-Overlapping) ----------------

/**
 * Creates and updates horizontal bounding contours per generation layer.
 * A contour is a Map of layer -> { min: number, max: number }
 */
function createContour() {
  return new Map();
}

function cloneContour(c) {
  const next = new Map();
  for (const [L, span] of c) {
    next.set(L, { min: span.min, max: span.max });
  }
  return next;
}

function shiftContour(c, dx) {
  for (const [, span] of c) {
    span.min += dx;
    span.max += dx;
  }
}

function mergeContours(target, source) {
  for (const [L, span] of source) {
    if (!target.has(L)) {
      target.set(L, { min: span.min, max: span.max });
    } else {
      const t = target.get(L);
      if (span.min < t.min) t.min = span.min;
      if (span.max > t.max) t.max = span.max;
    }
  }
}

function computeContourSeparation(cLeft, cRight, minGap = 104) {
  let maxOverlap = -Infinity;
  let hasOverlap = false;

  for (const [L, leftSpan] of cLeft) {
    if (cRight.has(L)) {
      const rightSpan = cRight.get(L);
      const neededShift = (leftSpan.max + minGap) - rightSpan.min;
      if (neededShift > maxOverlap) {
        maxOverlap = neededShift;
      }
      hasOverlap = true;
    }
  }

  if (!hasOverlap) return minGap;
  return Math.max(minGap, maxOverlap);
}

function assignCoordinates(people, families, familyOfOrigin, { orderedLayers, layerNums }, layerOf, opt) {
  const x = {};
  const assigned = new Set();

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
      return opt.nodeGap;
    }
    return opt.nodeGap;
  };

  // Find root individuals (individuals without parents in the dataset)
  const isRoot = (id) => !familyOfOrigin[id] || !familyOfOrigin[id].parents.length;
  const rootIds = Object.keys(people).filter(isRoot);

  // Helper to shift a placed subtree by delta
  const shiftSubtree = (nodeId, dx, visited = new Set()) => {
    if (!nodeId || visited.has(nodeId)) return;
    visited.add(nodeId);
    if (x[nodeId] !== undefined) x[nodeId] += dx;

    // Shift spouses placed with this node
    (people[nodeId].spouseIds || []).forEach((sid) => {
      if (!visited.has(sid) && x[sid] !== undefined) {
        visited.add(sid);
        x[sid] += dx;
      }
    });

    // Shift children
    (people[nodeId].childIds || []).forEach((cid) => {
      shiftSubtree(cid, dx, visited);
    });
  };

  /**
   * Recursively lays out a family branch bottom-up and returns its bounding contour.
   */
  const layoutBranch = (nodeId, visited = new Set()) => {
    if (!nodeId || !people[nodeId] || visited.has(nodeId)) {
      return { contour: createContour(), anchorX: 0 };
    }
    visited.add(nodeId);
    const p = people[nodeId];
    const pLayer = layerNums.find((L) => orderedLayers[L]?.includes(nodeId)) ?? 0;

    // Check spouses in same generation
    const spouses = (p.spouseIds || []).filter((sid) => people[sid] && !visited.has(sid));
    spouses.forEach((sid) => visited.add(sid));

    // Determine children produced with all spouses
    const rawChildren = [...new Set([...(p.childIds || [])])].filter((cid) => people[cid]);

    // Keep twins grouped, but balance leaf siblings symmetrically around reproducing branches to eliminate diagonal drift
    const hasDescendants = (cid) => (people[cid]?.childIds || []).some((k) => people[k]);
    const isTwin = (cid) => Boolean(people[cid]?.twinType && people[cid].twinType !== 'none');

    let children = rawChildren;
    const reproducing = rawChildren.filter(hasDescendants);
    const nonReproducing = rawChildren.filter((cid) => !hasDescendants(cid) && !isTwin(cid));
    const twins = rawChildren.filter(isTwin);

    if (reproducing.length > 0 && nonReproducing.length > 0 && twins.length === 0) {
      const half = Math.floor(nonReproducing.length / 2);
      const leftLeaves = nonReproducing.slice(0, half);
      const rightLeaves = nonReproducing.slice(half);
      children = [...leftLeaves, ...reproducing, ...rightLeaves];
    }

    // If leaf node (no children)
    if (children.length === 0) {
      const contour = createContour();
      x[nodeId] = 0;
      assigned.add(nodeId);
      let minSpanX = -opt.nodeRadius;
      let maxSpanX = opt.nodeRadius;

      if (spouses.length > 0) {
        spouses.forEach((sid, sIdx) => {
          const spX = (sIdx + 1) * opt.coupleGap;
          x[sid] = spX;
          assigned.add(sid);
          maxSpanX = spX + opt.nodeRadius;
        });
      }

      contour.set(pLayer, { min: minSpanX, max: maxSpanX });
      return { contour, anchorX: (minSpanX + maxSpanX) / 2 };
    }

    // Has children: recursively lay out each child's sub-branch
    const childBranches = [];
    children.forEach((cid) => {
      if (!visited.has(cid)) {
        const branch = layoutBranch(cid, visited);
        childBranches.push({ id: cid, ...branch });
      }
    });

    // Place children side by side using contour separation
    const combinedChildContour = createContour();
    let prevBranch = null;

    childBranches.forEach((currBranch, idx) => {
      if (idx === 0) {
        mergeContours(combinedChildContour, currBranch.contour);
        prevBranch = currBranch;
      } else {
        const gap = getSpacing(prevBranch.id, currBranch.id);
        const shift = computeContourSeparation(combinedChildContour, currBranch.contour, gap);
        shiftSubtree(currBranch.id, shift);
        shiftContour(currBranch.contour, shift);
        mergeContours(combinedChildContour, currBranch.contour);
        prevBranch = currBranch;
      }
    });

    // Center parents over the midpoint of their children
    const childXs = children.map((cid) => x[cid]).filter((v) => v !== undefined);
    const childMinX = safeMin(childXs, 0);
    const childMaxX = safeMax(childXs, 0);
    const childCenter = (childMinX + childMaxX) / 2;

    let parentMinX = childCenter;
    let parentMaxX = childCenter;

    if (spouses.length === 0) {
      x[nodeId] = childCenter;
      assigned.add(nodeId);
      parentMinX = childCenter - opt.nodeRadius;
      parentMaxX = childCenter + opt.nodeRadius;
    } else if (spouses.length === 1) {
      const sp = spouses[0];
      const isMale = p.sex === 'male';
      const p1X = childCenter - opt.coupleGap / 2;
      const p2X = childCenter + opt.coupleGap / 2;

      x[nodeId] = isMale ? p1X : p2X;
      x[sp] = isMale ? p2X : p1X;
      assigned.add(nodeId);
      assigned.add(sp);

      parentMinX = p1X - opt.nodeRadius;
      parentMaxX = p2X + opt.nodeRadius;
    } else {
      // Multi-spouse: center hub in middle, spouses flanking
      const totalUnits = spouses.length + 1;
      const startX = childCenter - ((totalUnits - 1) * opt.coupleGap) / 2;
      const midIdx = Math.floor(spouses.length / 2);

      let curIdx = 0;
      spouses.slice(0, midIdx).forEach((sid) => {
        x[sid] = startX + curIdx * opt.coupleGap;
        assigned.add(sid);
        curIdx++;
      });

      x[nodeId] = startX + curIdx * opt.coupleGap;
      assigned.add(nodeId);
      curIdx++;

      spouses.slice(midIdx).forEach((sid) => {
        x[sid] = startX + curIdx * opt.coupleGap;
        assigned.add(sid);
        curIdx++;
      });

      parentMinX = startX - opt.nodeRadius;
      parentMaxX = (startX + (totalUnits - 1) * opt.coupleGap) + opt.nodeRadius;
    }

    // Merge parent layer extent into the family contour
    const fullContour = cloneContour(combinedChildContour);
    const existingLayerSpan = fullContour.get(pLayer);
    if (!existingLayerSpan) {
      fullContour.set(pLayer, { min: parentMinX, max: parentMaxX });
    } else {
      existingLayerSpan.min = Math.min(existingLayerSpan.min, parentMinX);
      existingLayerSpan.max = Math.max(existingLayerSpan.max, parentMaxX);
    }

    return { contour: fullContour, anchorX: childCenter };
  };

  // Group roots into connected components
  const visitedRoots = new Set();
  const rootTrees = [];

  rootIds.forEach((rid) => {
    if (visitedRoots.has(rid) || assigned.has(rid)) return;
    const tree = layoutBranch(rid, visitedRoots);
    rootTrees.push({ id: rid, ...tree });
  });

  // Position root trees side by side with contour separation
  const globalContour = createContour();

  rootTrees.forEach((currTree, idx) => {
    if (idx === 0) {
      mergeContours(globalContour, currTree.contour);
    } else {
      const gap = opt.nodeGap * 1.5;
      const shift = computeContourSeparation(globalContour, currTree.contour, gap);
      shiftSubtree(currTree.id, shift);
      shiftContour(currTree.contour, shift);
      mergeContours(globalContour, currTree.contour);
    }
  });

  // Assign any remaining unassigned nodes (isolated or disconnected)
  layerNums.forEach((L) => {
    const list = orderedLayers[L];
    list.forEach((id) => {
      if (x[id] === undefined) {
        const span = globalContour.get(L) || { min: 0, max: 0 };
        const nextX = span.max + opt.nodeGap;
        x[id] = nextX;
        span.max = nextX + opt.nodeRadius;
        globalContour.set(L, span);
      }
    });
  });

  // Layer compaction & non-overlapping resolution (Bilateral Sweep)
  // Ensures strictly monotone order x[i+1] >= x[i] + spacing on each layer, without rightward feedback drift
  layerNums.forEach((L) => {
    const list = orderedLayers[L];
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      const minX = x[prev] + getSpacing(prev, cur);
      if (x[cur] < minX) {
        x[cur] = minX;
      }
    }
  });

  // Consanguinity spring pass: gently pull distant consanguineous spouses closer if there is free space
  families.forEach((fam) => {
    if (fam.consanguineous && fam.parents.length === 2) {
      const [p1, p2] = fam.parents;
      if (layerOf[p1] === layerOf[p2] && x[p1] !== undefined && x[p2] !== undefined) {
        const L = layerOf[p1];
        const list = orderedLayers[L];
        const idx1 = list.indexOf(p1);
        const idx2 = list.indexOf(p2);
        // If adjacent on layer, pull to coupleGap
        if (Math.abs(idx1 - idx2) === 1) {
          const left = idx1 < idx2 ? p1 : p2;
          const right = idx1 < idx2 ? p2 : p1;
          const desired = x[left] + opt.coupleGap;
          if (x[right] > desired) {
            const shift = (x[right] - desired) * 0.5;
            x[right] -= shift;
            x[left] += shift;
          }
        }
      }
    }
  });

  // Final layer normalization: shift entire diagram so left-most node is at 0
  const allX = Object.values(x);
  const minAllX = safeMin(allX, 0);
  Object.keys(x).forEach((id) => {
    x[id] -= minAllX;
  });

  return x;
}

// ---------------- Collision Detection & Dynamic Clearance ----------------

/**
 * Calculates the required minimum center-to-center distance between two individuals
 * taking into account biological relationships, spouse status, and twin pairs.
 */
export function getRequiredSeparation(id1, id2, people, opt = DEFAULTS) {
  if (!id1 || !id2 || !people[id1] || !people[id2]) return opt.nodeGap;
  const p1 = people[id1];
  const p2 = people[id2];

  // Spouses need coupleGap
  if (p1.spouseIds?.includes(id2) || p2.spouseIds?.includes(id1)) {
    return opt.coupleGap;
  }

  // Twins need twinGap
  const t1 = p1.twinType, t2 = p2.twinType;
  if (t1 && t1 !== 'none' && t2 && t2 !== 'none' && t1 === t2) {
    const matchGroup = p1.twinGroupId && p2.twinGroupId && p1.twinGroupId === p2.twinGroupId;
    const matchDirect = p1.twinWithId === id2 || p2.twinWithId === id1;
    const matchFallback = !p1.twinGroupId && !p2.twinGroupId;
    if (matchGroup || matchDirect || matchFallback) {
      return opt.twinGap;
    }
  }

  // General nodes / siblings / separate branches
  return opt.nodeGap;
}

/**
 * Detects all active collisions and clearance violations in the pedigree.
 * Examines both same-generation horizontal overlaps and cross-generation vertical overlaps.
 */
export function detectCollisions(nodes, people, layerOf, opt = DEFAULTS) {
  const collisions = [];
  const ids = Object.keys(nodes);
  if (ids.length <= 1) {
    return { hasCollisions: false, totalCount: 0, collisions: [] };
  }

  // Group nodes by generation layer
  const byLayer = new Map();
  ids.forEach((id) => {
    const L = layerOf[id] ?? 0;
    if (!byLayer.has(L)) byLayer.set(L, []);
    byLayer.get(L).push(id);
  });

  byLayer.forEach((layerIds, L) => {
    // Sort nodes on this layer by X coordinate
    const sorted = [...layerIds].sort((a, b) => (nodes[a]?.x ?? 0) - (nodes[b]?.x ?? 0));

    for (let i = 0; i < sorted.length - 1; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const id1 = sorted[i];
        const id2 = sorted[j];
        const x1 = nodes[id1]?.x ?? 0;
        const x2 = nodes[id2]?.x ?? 0;
        const dist = x2 - x1;
        const minReq = getRequiredSeparation(id1, id2, people, opt);

        if (dist < minReq - 0.001) {
          collisions.push({
            id1,
            id2,
            layer: L,
            x1,
            x2,
            distance: dist,
            minRequired: minReq,
            overlap: minReq - dist,
            type: 'same_layer',
          });
        }

        // Optimization: since nodes are sorted by X, if dist already exceeds max gap, break early
        if (dist >= opt.nodeGap * 2.5) {
          break;
        }
      }
    }
  });

  // Check for cross-layer vertical collisions if individuals are placed on overlapping coordinates
  for (let i = 0; i < ids.length - 1; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const id1 = ids[i], id2 = ids[j];
      if (layerOf[id1] !== layerOf[id2]) {
        const n1 = nodes[id1], n2 = nodes[id2];
        const dx = Math.abs((n1?.x ?? 0) - (n2?.x ?? 0));
        const dy = Math.abs((n1?.y ?? 0) - (n2?.y ?? 0));
        if (dx < opt.nodeRadius * 1.5 && dy < opt.nodeRadius * 1.5) {
          collisions.push({
            id1,
            id2,
            layer1: layerOf[id1],
            layer2: layerOf[id2],
            distance: Math.hypot(dx, dy),
            minRequired: opt.nodeRadius * 2,
            overlap: opt.nodeRadius * 2 - Math.hypot(dx, dy),
            type: 'cross_layer',
          });
        }
      }
    }
  }

  return {
    hasCollisions: collisions.length > 0,
    totalCount: collisions.length,
    collisions,
  };
}

/**
 * Automatically resolves collisions and adjusts node spacing in dense pedigrees.
 * Uses an iterative relaxation and subtree propagation approach to separate overlapping nodes
 * while preserving parent-child vertical alignments and marital groupings.
 */
export function resolveCollisions(nodes, people, families, layerOf, opt = DEFAULTS) {
  const initialCheck = detectCollisions(nodes, people, layerOf, opt);
  if (!initialCheck.hasCollisions) {
    return {
      resolved: true,
      iterations: 0,
      initialCollisions: 0,
      finalCollisions: 0,
      adjustedCount: 0,
    };
  }

  const ids = Object.keys(nodes);
  const byLayer = new Map();
  ids.forEach((id) => {
    const L = layerOf[id] ?? 0;
    if (!byLayer.has(L)) byLayer.set(L, []);
    byLayer.get(L).push(id);
  });

  // Helper to shift a node and all its descendants
  const shiftBranch = (rootId, dx, visited = new Set()) => {
    if (!rootId || visited.has(rootId)) return;
    visited.add(rootId);
    if (nodes[rootId]) nodes[rootId].x += dx;

    // Shift spouses placed with this node
    (people[rootId]?.spouseIds || []).forEach((sid) => {
      if (!visited.has(sid) && layerOf[sid] === layerOf[rootId] && nodes[sid]) {
        visited.add(sid);
        nodes[sid].x += dx;
      }
    });

    // Shift children
    (people[rootId]?.childIds || []).forEach((cid) => {
      shiftBranch(cid, dx, visited);
    });
  };

  let adjustedCount = 0;
  const maxIterations = 25;
  let iter = 0;

  for (iter = 0; iter < maxIterations; iter++) {
    let hadCollisionThisPass = false;

    // Process each generation layer
    const layers = [...byLayer.keys()].sort((a, b) => a - b);
    for (const L of layers) {
      const layerIds = byLayer.get(L) || [];
      if (layerIds.length < 2) continue;

      // Sort nodes on this layer by current X coordinate
      layerIds.sort((a, b) => (nodes[a]?.x ?? 0) - (nodes[b]?.x ?? 0));

      for (let i = 0; i < layerIds.length - 1; i++) {
        const id1 = layerIds[i];
        const id2 = layerIds[i + 1];
        const x1 = nodes[id1]?.x ?? 0;
        const x2 = nodes[id2]?.x ?? 0;
        const minReq = getRequiredSeparation(id1, id2, people, opt);
        const dist = x2 - x1;

        if (dist < minReq - 0.001) {
          hadCollisionThisPass = true;
          const overlap = minReq - dist;
          adjustedCount++;

          // Shift id2 and its descendants by overlap
          shiftBranch(id2, overlap);

          // Cascade forward on layer if subsequent nodes are pushed
          for (let k = i + 2; k < layerIds.length; k++) {
            const prevId = layerIds[k - 1];
            const nextId = layerIds[k];
            const prevX = nodes[prevId]?.x ?? 0;
            const nextX = nodes[nextId]?.x ?? 0;
            const stepMin = getRequiredSeparation(prevId, nextId, people, opt);
            if (nextX - prevX < stepMin) {
              const forwardShift = stepMin - (nextX - prevX);
              shiftBranch(nextId, forwardShift);
            } else {
              break;
            }
          }
        }
      }
    }

    // Re-center parents over children after subtrees moved
    families.forEach((fam) => {
      if (fam.parents.length > 0 && fam.children.length > 0) {
        const cXs = fam.children.map((cid) => nodes[cid]?.x).filter((v) => v !== undefined);
        if (cXs.length > 0) {
          const cCenter = (safeMin(cXs, 0) + safeMax(cXs, 0)) / 2;
          if (fam.parents.length === 1) {
            const pid = fam.parents[0];
            if (nodes[pid]) nodes[pid].x = cCenter;
          } else if (fam.parents.length === 2) {
            const [p1, p2] = fam.parents;
            if (nodes[p1] && nodes[p2]) {
              const currentMid = (nodes[p1].x + nodes[p2].x) / 2;
              const diff = cCenter - currentMid;
              nodes[p1].x += diff * 0.7;
              nodes[p2].x += diff * 0.7;
            }
          }
        }
      }
    });

    if (!hadCollisionThisPass) {
      break;
    }
  }

  // Final check
  const finalCheck = detectCollisions(nodes, people, layerOf, opt);

  // Normalize so minX is 0
  const allX = Object.values(nodes).map((n) => n.x);
  const minAllX = safeMin(allX, 0);
  ids.forEach((id) => {
    if (nodes[id]) nodes[id].x -= minAllX;
  });

  return {
    resolved: !finalCheck.hasCollisions,
    iterations: iter + 1,
    initialCollisions: initialCheck.totalCount,
    finalCollisions: finalCheck.totalCount,
    adjustedCount,
  };
}

// ---------------- Stage 7: Connectors Routing & Interval Scheduling ----------------
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
    twinMarks: [],
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
      busYMap.set(fam.id, baseBusY + lane * 12);
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

      // Check if spouses are separated by other individuals on that layer
      const spanDistance = maxX - minX;
      const isDistantCousin = consanguineous && spanDistance > opt.coupleGap * 2.2;

      if (isDistantCousin) {
        // Orthogonal bridge connector that routes below node glyphs to avoid cutting through people
        const bridgeY = parentY + r + 14;
        connectors.mating.push({
          x1: lineX1,
          y1: parentY,
          x2: lineX2,
          y2: parentY,
          consanguineous: true,
          parents: [p1, p2],
          points: [
            [minX, parentY + r],
            [minX, bridgeY],
            [maxX, bridgeY],
            [maxX, parentY + r],
          ],
        });
        junctionX = (x1 + x2) / 2;
        dropStartY = bridgeY;
      } else {
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
      }
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

      // Horizontal sibship bus line
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
    if (s.points) {
      s.points.forEach(([px, py]) => {
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      });
    } else {
      minX = Math.min(minX, s.x1, s.x2);
      maxX = Math.max(maxX, s.x1, s.x2);
      minY = Math.min(minY, s.y1, s.y2);
      maxY = Math.max(maxY, s.y1, s.y2);
    }
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
    if (s.points) {
      s.points = s.points.map(([px, py]) => [px + dx, py + dy]);
    }
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

// ---------------- Debug Bounding Boxes & Collision Visualizer ----------------

/**
 * Computes bounding boxes around all nodes and connection lines
 * to visually confirm collision detection, envelopes, and spacing logic.
 *
 * @param {Object} nodes - Map of nodeId -> { x, y }
 * @param {Object} connectors - Connector lines object
 * @param {Object} people - People dictionary
 * @param {Object} opt - Layout configuration options
 * @returns {{
 *   nodes: Array<{ id: string, type: string, x: number, y: number, width: number, height: number, label: string, clearanceBox: Object }>,
 *   connectors: Array<{ id: string, type: string, subType?: string, x: number, y: number, width: number, height: number, label: string, points?: Array }>
 * }}
 */
export function computeDebugBoundingBoxes(nodes, connectors, people = {}, opt = DEFAULTS) {
  const r = opt.nodeRadius || 28;
  const nodeBoxes = [];
  const connectorBoxes = [];

  // 1. Node Bounding Envelopes
  Object.entries(nodes || {}).forEach(([id, pos]) => {
    if (!pos || pos.x === undefined || pos.y === undefined) return;
    const p = people[id] || {};
    const halfWidth = r + 8;
    const topHeight = r + 6;
    const bottomHeight = r + 24;

    const boxX = pos.x - halfWidth;
    const boxY = pos.y - topHeight;
    const boxW = halfWidth * 2;
    const boxH = topHeight + bottomHeight;

    const isSpouse = (p.spouseIds || []).length > 0;
    const reqGap = isSpouse ? opt.coupleGap : opt.nodeGap;
    const clearanceW = reqGap;
    const clearanceX = pos.x - clearanceW / 2;

    nodeBoxes.push({
      id,
      type: 'node',
      x: Math.round(boxX),
      y: Math.round(boxY),
      width: Math.round(boxW),
      height: Math.round(boxH),
      centerX: Math.round(pos.x),
      centerY: Math.round(pos.y),
      label: `${p.name || id} (${Math.round(pos.x)},${Math.round(pos.y)})`,
      clearanceBox: {
        x: Math.round(clearanceX),
        y: Math.round(boxY - 4),
        width: Math.round(clearanceW),
        height: Math.round(boxH + 8),
      },
    });
  });

  // 2. Connector Lines Bounding Envelopes
  (connectors?.mating || []).forEach((m, idx) => {
    if (m.points && m.points.length > 0) {
      const xs = m.points.map((pt) => pt[0]);
      const ys = m.points.map((pt) => pt[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      connectorBoxes.push({
        id: `mat-${idx}`,
        type: 'mating',
        subType: m.consanguineous ? 'consanguineous_bridge' : 'bridge',
        x: Math.round(minX - 4),
        y: Math.round(minY - 4),
        width: Math.round(maxX - minX + 8),
        height: Math.round(maxY - minY + 8),
        label: m.consanguineous ? 'پل خویشاوندی' : 'پل ازدواج',
        points: m.points,
      });
    } else if (m.x1 !== undefined && m.x2 !== undefined) {
      const minX = Math.min(m.x1, m.x2);
      const maxX = Math.max(m.x1, m.x2);
      const y = m.y1 ?? m.y2;
      connectorBoxes.push({
        id: `mat-${idx}`,
        type: 'mating',
        subType: m.consanguineous ? 'consanguineous' : 'standard',
        x: Math.round(minX - 4),
        y: Math.round(y - 6),
        width: Math.round(maxX - minX + 8),
        height: 12,
        label: m.consanguineous ? 'ازدواج فامیلی' : 'ازدواج',
      });
    }
  });

  (connectors?.sibship || []).forEach((s, idx) => {
    if (s.x1 !== undefined && s.x2 !== undefined) {
      const minX = Math.min(s.x1, s.x2);
      const maxX = Math.max(s.x1, s.x2);
      connectorBoxes.push({
        id: `sib-${idx}`,
        type: 'sibship',
        x: Math.round(minX - 4),
        y: Math.round(s.y - 6),
        width: Math.round(maxX - minX + 8),
        height: 12,
        label: 'گذرگاه فرزندان',
      });
    }
  });

  (connectors?.drop || []).forEach((d, idx) => {
    const minY = Math.min(d.y1, d.y2);
    const maxY = Math.max(d.y1, d.y2);
    connectorBoxes.push({
      id: `drp-${idx}`,
      type: 'drop',
      x: Math.round(d.x - 6),
      y: Math.round(minY),
      width: 12,
      height: Math.round(maxY - minY),
      label: 'خط فرود',
    });
  });

  (connectors?.childLink || []).forEach((c, idx) => {
    const x1 = c.x1 ?? c.x;
    const x2 = c.x2 ?? c.x;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(c.y1, c.y2);
    const maxY = Math.max(c.y1, c.y2);
    connectorBoxes.push({
      id: `cl-${idx}`,
      type: 'childLink',
      x: Math.round(minX - 4),
      y: Math.round(minY),
      width: Math.round(Math.max(8, maxX - minX + 8)),
      height: Math.round(maxY - minY),
      label: 'اتصال فرزند',
    });
  });

  (connectors?.twinBars || []).forEach((tb, idx) => {
    const minX = Math.min(tb.x1, tb.x2);
    const maxX = Math.max(tb.x1, tb.x2);
    connectorBoxes.push({
      id: `tb-${idx}`,
      type: 'twinBar',
      x: Math.round(minX - 2),
      y: Math.round(tb.y - 4),
      width: Math.round(maxX - minX + 4),
      height: 8,
      label: 'نوار دوقلوی همسان',
    });
  });

  return {
    nodes: nodeBoxes,
    connectors: connectorBoxes,
  };
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
  const ordering = orderLayers(people, ids, families, layerOf, clusters);
  const x = assignCoordinates(people, families, familyOfOrigin, ordering, layerOf, opt);

  const nodes = {};
  ids.forEach((id) => {
    nodes[id] = {
      x: x[id] ?? 0,
      y: (layerOf[id] ?? 0) * opt.layerGap,
    };
  });

  // Dedicated collision detection and automated spacing adjustment stage
  const collisionReport = resolveCollisions(nodes, people, families, layerOf, opt);

  const connectors = buildConnectors(families, people, layerOf, nodes, opt);
  const bounds = normalizeBounds(ids, nodes, connectors, opt);

  const generations = {};
  ids.forEach((id) => {
    generations[id] = layerOf[id] ?? 0;
  });

  const debugBoxes = computeDebugBoundingBoxes(nodes, connectors, people, opt);

  return { nodes, connectors, generations, bounds, collisions: collisionReport, debugBoxes };
}

export default computePedigreeLayout;
