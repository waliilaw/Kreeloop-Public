const DEFAULT_LIMIT = 24;
const MAX_ANCESTOR_WALK = 64;
const UNLABELLED = "edit";

export const UNDO_REFUSAL = Object.freeze({
  EMPTY: "empty",
  IRREVERSIBLE: "irreversible",
  STALE: "stale",
  NOT_NEWEST: "notNewest",
  REVERT_THREW: "revertThrew"
});

function parentOf(node) {
  try {
    return node.parent;
  } catch {
    return undefined;
  }
}

function idOf(node) {
  try {
    return typeof node.id === "string" ? node.id : null;
  } catch {
    return null;
  }
}

export function isAttachedTo(node, documentRoot) {
  if (!node || !documentRoot) return false;
  let current = node;
  for (let steps = 0; steps <= MAX_ANCESTOR_WALK; steps += 1) {
    if (current === documentRoot) return true;
    current = parentOf(current);
    if (!current) return false;
  }
  return false;
}

export function hasParent(node) {
  return Boolean(node) && Boolean(parentOf(node));
}

function livenessTest(documentRoot) {
  if (!documentRoot) return hasParent;
  return (node) => isAttachedTo(node, documentRoot);
}

export function createEditHistory(options = {}) {
  const settings = options ?? {};
  const limit = Number.isInteger(settings.limit) && settings.limit > 0 ? settings.limit : DEFAULT_LIMIT;
  const isNodeLive =
    typeof settings.isNodeLive === "function" ? settings.isNodeLive : livenessTest(settings.documentRoot);

  const entries = [];
  let nextSeq = 1;

  const refuse = (reason, discarded) => {
    const result = { ok: false, reason, depth: entries.length };
    if (!discarded) return result;
    result.seq = discarded.seq;
    result.label = discarded.label;
    result.discarded = true;
    return result;
  };

  const isStale = (entry) => entry.nodes.some((node) => !isNodeLive(node));

  function record(edit) {
    const source = edit ?? {};
    const nodes = Array.isArray(source.nodes) ? source.nodes.filter(Boolean) : [];
    const entry = {
      seq: nextSeq,
      label: typeof source.label === "string" && source.label.length > 0 ? source.label : UNLABELLED,
      revert: typeof source.revert === "function" ? source.revert : null,
      nodes,
      ids: nodes.map(idOf).filter((id) => id !== null)
    };

    nextSeq += 1;
    entries.push(entry);
    while (entries.length > limit) entries.shift();

    return { seq: entry.seq, depth: entries.length, reversible: entry.revert !== null };
  }

  function undoLast() {
    const entry = entries[entries.length - 1];
    if (!entry) return refuse(UNDO_REFUSAL.EMPTY);

    entries.pop();
    if (!entry.revert) return refuse(UNDO_REFUSAL.IRREVERSIBLE, entry);
    if (isStale(entry)) return refuse(UNDO_REFUSAL.STALE, entry);

    try {
      entry.revert();
    } catch {
      return refuse(UNDO_REFUSAL.REVERT_THREW, entry);
    }

    return { ok: true, label: entry.label, seq: entry.seq, depth: entries.length };
  }

  function undoIfNewest(seq) {
    const newest = entries[entries.length - 1];
    if (!newest) return refuse(UNDO_REFUSAL.EMPTY);
    if (newest.seq !== seq) return refuse(UNDO_REFUSAL.NOT_NEWEST);
    return undoLast();
  }

  function forget(ids) {
    const gone = new Set(Array.isArray(ids) ? ids : [ids]);
    const before = entries.length;
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      if (entries[i].ids.some((id) => gone.has(id))) entries.splice(i, 1);
    }
    return before - entries.length;
  }

  function peek() {
    const newest = entries[entries.length - 1];
    if (!newest) return null;
    return {
      seq: newest.seq,
      label: newest.label,
      ids: [...newest.ids],
      reversible: newest.revert !== null
    };
  }

  function clear() {
    const dropped = entries.length;
    entries.length = 0;
    return dropped;
  }

  return {
    record,
    undoLast,
    undoIfNewest,
    forget,
    peek,
    clear,
    get depth() {
      return entries.length;
    },
    get limit() {
      return limit;
    },
    get newestSeq() {
      return entries.length > 0 ? entries[entries.length - 1].seq : null;
    }
  };
}
