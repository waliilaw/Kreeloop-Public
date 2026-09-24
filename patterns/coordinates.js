const MAX_ANCESTOR_DEPTH = 64;
const POSITION_TOLERANCE = 0.5;
const LINEAR_TOLERANCE = 1e-6;

export const ARTBOARD_TYPE = "ab:Artboard";

export const COORDINATE_REFUSAL = Object.freeze({
  MISSING_NODE: "missingNode",
  MISSING_SPACE: "missingSpace",
  UNKNOWN_VISUAL_ROOT: "unknownVisualRoot",
  DIFFERENT_VISUAL_ROOT: "differentVisualRoot",
  UNREADABLE_SELECTION: "unreadableSelection",
  EMPTY_SELECTION: "emptySelection",
  UNMEASURABLE_MEMBER: "unmeasurableMember",
  MIXED_PARENTS: "mixedParents",
  ORPHAN_NODE: "orphanNode",
  VISUAL_ONLY: "visualOnly",
  SIZED_ONLY: "sizedOnly",
  NOT_POSITIONABLE: "notPositionable",
  NO_FIXED_CONTAINER: "noFixedContainer",
  INVALID_PARENT_POINT: "invalidParentPoint",
  INVALID_REGISTRATION_POINT: "invalidRegistrationPoint",
  UNREADABLE_POSITION: "unreadablePosition",
  WRITE_REJECTED: "writeRejected",
  WRITE_IGNORED: "writeIgnored",
  NO_ARTBOARD_ANCESTOR: "noArtboardAncestor",
  UNREACHABLE_CONTEXT: "unreachableContext",
  SELECTION_OFF_ARTBOARD: "selectionOffArtboard",
  NO_ARTBOARD: "noArtboard"
});

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

const isPositive = (value) => isNumber(value) && value > 0;

const isPoint = (value) => !!value && isNumber(value.x) && isNumber(value.y);

const isRect = (value) => isPoint(value) && isNumber(value.width) && isNumber(value.height);

const toPoint = (point) => ({ x: point.x, y: point.y });

const toRect = (rect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });

const refuse = (reason, extra) => ({ ok: false, reason, ...extra });

const read = (subject, key) => {
  if (subject === null || subject === undefined) return undefined;
  try {
    return subject[key];
  } catch {
    return undefined;
  }
};

const write = (subject, key, value) => {
  try {
    subject[key] = value;
    return true;
  } catch {
    return false;
  }
};

const invoke = (subject, key, ...args) => {
  const method = read(subject, key);
  if (typeof method !== "function") return undefined;
  try {
    return method.apply(subject, args);
  } catch {
    return undefined;
  }
};

const toArray = (value) => {
  if (Array.isArray(value)) return value.slice();
  if (!value) return null;
  try {
    return Array.from(value);
  } catch {
    return null;
  }
};

const firstOf = (list) => {
  if (!list) return null;
  if (Array.isArray(list)) return list.length > 0 ? list[0] : null;
  const first = read(list, "first");
  if (first) return first;
  try {
    for (const item of list) {
      if (item) return item;
    }
  } catch {
    return null;
  }
  return null;
};

const isUnrotated = (degrees) => {
  if (!isNumber(degrees)) return false;
  const normalized = ((degrees % 360) + 360) % 360;
  return normalized <= LINEAR_TOLERANCE || 360 - normalized <= LINEAR_TOLERANCE;
};

const isAxisAligned = (node) => {
  const matrix = read(node, "transformMatrix");
  if (matrix && isNumber(matrix[0]) && isNumber(matrix[1]) && isNumber(matrix[2]) && isNumber(matrix[3])) {
    return (
      Math.abs(matrix[0] - 1) <= LINEAR_TOLERANCE &&
      Math.abs(matrix[1]) <= LINEAR_TOLERANCE &&
      Math.abs(matrix[2]) <= LINEAR_TOLERANCE &&
      Math.abs(matrix[3] - 1) <= LINEAR_TOLERANCE
    );
  }
  return isUnrotated(read(node, "rotation"));
};

const isVisualSpace = (space) => !!read(space, "visualRoot") || isRect(read(space, "boundsLocal"));

const unionOf = (boxes) =>
  boxes.reduce((carried, box) => {
    const x = Math.min(carried.x, box.x);
    const y = Math.min(carried.y, box.y);
    const width = Math.max(carried.x + carried.width, box.x + box.width) - x;
    const height = Math.max(carried.y + carried.height, box.y + box.height) - y;
    return { x, y, width, height };
  });

export function parentOf(node) {
  return read(node, "parent") || null;
}

export function ancestorsOf(node) {
  const chain = [];
  const seen = new Set();
  let current = parentOf(node);
  while (current && chain.length < MAX_ANCESTOR_DEPTH && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = parentOf(current);
  }
  return chain;
}

export function sharesVisualSpace(node, other) {
  if (!node || !other) return refuse(COORDINATE_REFUSAL.MISSING_NODE);
  const here = read(node, "visualRoot");
  const there = read(other, "visualRoot");
  if (!here || !there) return refuse(COORDINATE_REFUSAL.UNKNOWN_VISUAL_ROOT);
  if (here !== there) return refuse(COORDINATE_REFUSAL.DIFFERENT_VISUAL_ROOT);
  return { ok: true, visualRoot: here };
}

export function boundsIn(node, space) {
  if (!node || !isVisualSpace(space)) return null;
  if (node === space) {
    const own = read(node, "boundsLocal");
    return isRect(own) ? toRect(own) : null;
  }
  if (sharesVisualSpace(node, space).reason === COORDINATE_REFUSAL.DIFFERENT_VISUAL_ROOT) return null;

  const converted = invoke(node, "boundsInNode", space);
  if (isRect(converted)) return toRect(converted);

  if (space !== parentOf(node)) return null;

  const inParent = read(node, "boundsInParent");
  if (isRect(inParent)) return toRect(inParent);

  const local = read(node, "boundsLocal");
  const translation = read(node, "translation");
  if (!isRect(local) || !isPoint(translation) || !isAxisAligned(node)) return null;
  return {
    x: local.x + translation.x,
    y: local.y + translation.y,
    width: local.width,
    height: local.height
  };
}

export function boundsOfAllIn(nodes, space) {
  if (!space) return refuse(COORDINATE_REFUSAL.MISSING_SPACE);
  const list = toArray(nodes);
  if (!list) return refuse(COORDINATE_REFUSAL.UNREADABLE_SELECTION);
  if (list.length === 0) return refuse(COORDINATE_REFUSAL.EMPTY_SELECTION);

  const boxes = [];
  for (let index = 0; index < list.length; index += 1) {
    const box = boundsIn(list[index], space);
    if (!box) return refuse(COORDINATE_REFUSAL.UNMEASURABLE_MEMBER, { index });
    boxes.push(box);
  }
  return { ok: true, boxes, union: unionOf(boxes) };
}

export function comparableByTranslation(nodes) {
  const list = toArray(nodes);
  if (!list) return refuse(COORDINATE_REFUSAL.UNREADABLE_SELECTION);
  if (list.length === 0) return refuse(COORDINATE_REFUSAL.EMPTY_SELECTION);

  const space = parentOf(list[0]);
  if (!space) return refuse(COORDINATE_REFUSAL.ORPHAN_NODE);
  for (const node of list) {
    if (parentOf(node) !== space) return refuse(COORDINATE_REFUSAL.MIXED_PARENTS);
  }
  return { ok: true, space };
}

export function containerBox(container) {
  if (!container) return null;
  const local = read(container, "boundsLocal");
  if (isRect(local) && isPositive(local.width) && isPositive(local.height)) return toRect(local);

  const width = read(container, "width");
  const height = read(container, "height");
  if (isPositive(width) && isPositive(height)) return { x: 0, y: 0, width, height };

  return null;
}

export function movability(node) {
  const immovable = (reason) => ({ ok: false, movable: false, reason });
  const movable = (via) => ({ ok: true, movable: true, via });
  if (!node) return immovable(COORDINATE_REFUSAL.MISSING_NODE);
  if (typeof read(node, "setPositionInParent") === "function") return movable("setPositionInParent");
  if (isPoint(read(node, "translation"))) return movable("translation");
  if (isRect(read(node, "boundsLocal"))) return immovable(COORDINATE_REFUSAL.VISUAL_ONLY);
  if (isNumber(read(node, "width")) && isNumber(read(node, "height"))) {
    return immovable(COORDINATE_REFUSAL.SIZED_ONLY);
  }
  return immovable(COORDINATE_REFUSAL.NOT_POSITIONABLE);
}

export function outermostMovableAncestor(node) {
  const own = movability(node);
  if (!own.movable) return refuse(own.reason);

  let target = node;
  for (const ancestor of ancestorsOf(node)) {
    if (!movability(ancestor).movable) return { ok: true, target, container: ancestor };
    target = ancestor;
  }
  return refuse(COORDINATE_REFUSAL.NO_FIXED_CONTAINER);
}

function registrationPointIn(node, localPoint, space) {
  const converted = invoke(node, "localPointInNode", localPoint, space);
  if (isPoint(converted)) return toPoint(converted);

  const translation = read(node, "translation");
  if (!isPoint(translation) || !isAxisAligned(node)) return null;
  return { x: translation.x + localPoint.x, y: translation.y + localPoint.y };
}

export function positionInParent(node, parentPoint, localRegistrationPoint = { x: 0, y: 0 }) {
  if (!isPoint(parentPoint)) return refuse(COORDINATE_REFUSAL.INVALID_PARENT_POINT);
  if (!isPoint(localRegistrationPoint)) return refuse(COORDINATE_REFUSAL.INVALID_REGISTRATION_POINT);

  const state = movability(node);
  if (!state.movable) return refuse(state.reason);

  const parent = parentOf(node);
  if (!parent) return refuse(COORDINATE_REFUSAL.ORPHAN_NODE);

  const current = registrationPointIn(node, localRegistrationPoint, parent);
  const translation = read(node, "translation");
  if (!current || !isPoint(translation)) return refuse(COORDINATE_REFUSAL.UNREADABLE_POSITION);

  const delta = { x: parentPoint.x - current.x, y: parentPoint.y - current.y };
  const landed = () => {
    const now = registrationPointIn(node, localRegistrationPoint, parent);
    return (
      !!now &&
      Math.abs(now.x - parentPoint.x) <= POSITION_TOLERANCE &&
      Math.abs(now.y - parentPoint.y) <= POSITION_TOLERANCE
    );
  };

  if (landed()) return { ok: true, moved: false, via: "none", delta: { x: 0, y: 0 } };

  if (state.via === "setPositionInParent") {
    invoke(node, "setPositionInParent", toPoint(parentPoint), toPoint(localRegistrationPoint));
    if (landed()) return { ok: true, moved: true, via: "setPositionInParent", delta };
  }

  const shifted = { x: translation.x + delta.x, y: translation.y + delta.y };
  if (!write(node, "translation", shifted)) return refuse(COORDINATE_REFUSAL.WRITE_REJECTED);
  if (!landed()) return refuse(COORDINATE_REFUSAL.WRITE_IGNORED);
  return { ok: true, moved: true, via: "translation", delta };
}

export function artboardOf(node) {
  if (!node) return refuse(COORDINATE_REFUSAL.MISSING_NODE);
  if (read(node, "type") === ARTBOARD_TYPE) return { ok: true, artboard: node, via: "self" };

  for (const ancestor of ancestorsOf(node)) {
    if (read(ancestor, "type") === ARTBOARD_TYPE) {
      return { ok: true, artboard: ancestor, via: "ancestor" };
    }
  }

  const visualRoot = read(node, "visualRoot");
  if (visualRoot && read(visualRoot, "type") === ARTBOARD_TYPE) {
    return { ok: true, artboard: visualRoot, via: "visualRoot" };
  }
  return refuse(COORDINATE_REFUSAL.NO_ARTBOARD_ANCESTOR);
}

export function artboardForSelection(editor) {
  const context = read(editor, "context");
  if (!context) return refuse(COORDINATE_REFUSAL.UNREACHABLE_CONTEXT);

  const selected = firstOf(read(context, "selection"));
  if (selected) {
    const fromSelection = artboardOf(selected);
    if (!fromSelection.ok) return refuse(COORDINATE_REFUSAL.SELECTION_OFF_ARTBOARD);
    return { ok: true, artboard: fromSelection.artboard, via: "selection" };
  }

  const fromInsertion = artboardOf(read(context, "insertionParent"));
  if (fromInsertion.ok) return { ok: true, artboard: fromInsertion.artboard, via: "insertionParent" };

  const fromPage = firstOf(read(read(context, "currentPage"), "artboards"));
  if (fromPage) return { ok: true, artboard: fromPage, via: "currentPage" };

  return refuse(COORDINATE_REFUSAL.NO_ARTBOARD);
}
