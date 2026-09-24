const ELEMENT_SLOT = "{element}";
const DEFAULT_ELEMENT_NAME = "that element";
const UNMAPPED_REASON_PREFIX = "No sentence is mapped for the refusal code ";
const MAX_ANCESTOR_DEPTH = 32;
const REVERSE_MAPPED_ENUM_KEY = /^\d+$/;

export const NodeType = Object.freeze({
  line: "Line",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  path: "Path",
  complexShape: "ComplexShape",
  strokeShape: "StrokeShape",
  solidColorShape: "SolidColorShape",
  group: "Group",
  artboard: "ab:Artboard",
  page: "Page",
  artworkRoot: "ArtworkRoot",
  mediaContainer: "MediaContainer",
  imageRectangle: "ImageRectangle",
  unknownMediaRectangle: "UnknownMediaRectangle",
  gridCell: "GridCell",
  gridLayout: "GridLayout",
  text: "Text"
});

export const SCENE_TYPES_WITHOUT_DECLARED_CLASS = Object.freeze(["artgr:Polygon", "LinkedAsset"]);

export const Capability = Object.freeze({
  fill: "fill",
  fillRequired: "fillRequired",
  color: "color",
  stroke: "stroke",
  children: "children",
  cornerRadius: "cornerRadius",
  movable: "movable",
  clonable: "clonable",
  mediaFrame: "mediaFrame",
  mediaContent: "mediaContent",
  text: "text"
});

export const Support = Object.freeze({
  declared: "declared",
  absent: "absent",
  undeclared: "undeclared"
});

export const Operation = Object.freeze({
  fill: "fill",
  stroke: "stroke",
  cornerRadius: "cornerRadius",
  transform: "transform",
  reorder: "reorder",
  clone: "clone"
});

export const SelectionFailure = Object.freeze({
  nothingSelected: "nothing-selected",
  nodeUnreadable: "node-unreadable",
  typeUnknown: "type-unknown",
  operationUnknown: "operation-unknown",
  noFill: "no-fill",
  colorNotFill: "color-not-fill",
  textColorPerRange: "text-color-per-range",
  mediaNotPaintable: "media-not-paintable",
  noStroke: "no-stroke",
  noCornerRadius: "no-corner-radius",
  gridCellIsolated: "grid-cell-isolated",
  gridMaskReadOnly: "grid-mask-read-only",
  notClonable: "not-clonable",
  pageStructureFixed: "page-structure-fixed",
  nodeOrphaned: "node-orphaned",
  noSiblings: "no-siblings",
  enumUnavailable: "enum-unavailable",
  enumValueUnrecognized: "enum-value-unrecognized",
  notTextNode: "not-text-node"
});

export const ELEMENT_NAMES = Object.freeze({
  [NodeType.line]: "a line",
  [NodeType.rectangle]: "a rectangle",
  [NodeType.ellipse]: "an ellipse",
  [NodeType.path]: "a path",
  [NodeType.complexShape]: "a shape",
  [NodeType.strokeShape]: "an outline shape",
  [NodeType.solidColorShape]: "a solid-color shape",
  [NodeType.group]: "a group",
  [NodeType.artboard]: "the page background",
  [NodeType.page]: "a page",
  [NodeType.artworkRoot]: "the document",
  [NodeType.mediaContainer]: "a photo",
  [NodeType.imageRectangle]: "a photo",
  [NodeType.unknownMediaRectangle]: "a video or other media item",
  [NodeType.gridCell]: "one cell of a photo grid",
  [NodeType.gridLayout]: "a photo grid",
  [NodeType.text]: "a text box"
});

export const FAILURE_SENTENCES = Object.freeze({
  [SelectionFailure.nothingSelected]: "Select an element on the page first, then try again.",
  [SelectionFailure.nodeUnreadable]:
    "Adobe Express could not read that element. Click it again, or pick a different one.",
  [SelectionFailure.typeUnknown]:
    "This add-on does not recognize that kind of element yet, so it left it untouched.",
  [SelectionFailure.operationUnknown]:
    "This add-on asked for an action it does not define, so nothing was changed.",
  [SelectionFailure.noFill]:
    "This is {element}, which has no fill color. Try a rectangle, ellipse or path instead.",
  [SelectionFailure.colorNotFill]:
    "This is {element}, which carries one flat color rather than a fill. Change its color instead.",
  [SelectionFailure.textColorPerRange]:
    "Text color lives on the letters, not on the text box. Select the characters you want to recolor.",
  [SelectionFailure.mediaNotPaintable]:
    "This is {element}, so there is no fill color behind it. Replace the image instead.",
  [SelectionFailure.noStroke]:
    "This is {element}, which cannot take a border. Rectangles, ellipses, paths and lines can.",
  [SelectionFailure.noCornerRadius]:
    "This is {element}, and rounded corners only exist on rectangles.",
  [SelectionFailure.gridCellIsolated]:
    "This is {element}, and a grid moves, reorders and duplicates as one piece. Select the whole grid instead.",
  [SelectionFailure.gridMaskReadOnly]:
    "The frame around {element} is fixed by the grid, so its shape and border cannot be changed here.",
  [SelectionFailure.notClonable]:
    "This is {element}, which cannot be duplicated on its own. Duplicate the frame or page around it.",
  [SelectionFailure.pageStructureFixed]:
    "This is {element}, which is part of the page itself and cannot be moved or reordered.",
  [SelectionFailure.nodeOrphaned]: "That element is no longer on the page. Select it again and retry.",
  [SelectionFailure.noSiblings]:
    "There is nothing around {element} to move it in front of or behind.",
  [SelectionFailure.enumUnavailable]:
    "This version of Adobe Express does not expose the setting this add-on needs.",
  [SelectionFailure.enumValueUnrecognized]:
    "Adobe Express reported a setting this add-on does not recognize yet, so it made no change.",
  [SelectionFailure.notTextNode]: "Select a text box first, then try again."
});

export const TEXT_LAYOUT_MEMBERS = Object.freeze(["area", "autoHeight", "autoWidth", "circular", "magicFit"]);

export const TEXT_ALIGNMENT_MEMBERS = Object.freeze(["left", "right", "center", "justifyLeft"]);

function declaredCapabilities(overrides) {
  return Object.freeze({
    fill: false,
    fillRequired: false,
    color: false,
    stroke: false,
    children: false,
    cornerRadius: false,
    movable: false,
    clonable: false,
    mediaFrame: false,
    mediaContent: false,
    text: false,
    ...overrides
  });
}

export const NODE_CAPABILITIES = Object.freeze({
  [NodeType.rectangle]: declaredCapabilities({ fill: true, stroke: true, cornerRadius: true, movable: true, clonable: true }),
  [NodeType.ellipse]: declaredCapabilities({ fill: true, stroke: true, movable: true, clonable: true }),
  [NodeType.path]: declaredCapabilities({ fill: true, stroke: true, movable: true, clonable: true }),
  [NodeType.complexShape]: declaredCapabilities({ fill: true, stroke: true, movable: true, clonable: true }),
  [NodeType.line]: declaredCapabilities({ stroke: true, movable: true, clonable: true }),
  [NodeType.strokeShape]: declaredCapabilities({ stroke: true, movable: true, clonable: true }),
  [NodeType.solidColorShape]: declaredCapabilities({ color: true, movable: true, clonable: true }),
  [NodeType.text]: declaredCapabilities({ text: true, movable: true, clonable: true }),
  [NodeType.group]: declaredCapabilities({ children: true, movable: true, clonable: true }),
  [NodeType.artboard]: declaredCapabilities({ fill: true, fillRequired: true, children: true }),
  [NodeType.page]: declaredCapabilities({ clonable: true }),
  [NodeType.artworkRoot]: declaredCapabilities({}),
  [NodeType.mediaContainer]: declaredCapabilities({ mediaFrame: true, movable: true, clonable: true }),
  [NodeType.imageRectangle]: declaredCapabilities({ mediaContent: true, movable: true }),
  [NodeType.unknownMediaRectangle]: declaredCapabilities({ mediaContent: true, movable: true }),
  [NodeType.gridCell]: declaredCapabilities({ mediaFrame: true, movable: true }),
  [NodeType.gridLayout]: declaredCapabilities({ fill: true, fillRequired: true, movable: true, clonable: true })
});

const OPERATION_RULES = Object.freeze({
  [Operation.fill]: Object.freeze({ retarget: "self", capability: Capability.fill, requiresMovable: false }),
  [Operation.stroke]: Object.freeze({ retarget: "mask", capability: Capability.stroke, requiresMovable: false }),
  [Operation.cornerRadius]: Object.freeze({ retarget: "mask", capability: Capability.cornerRadius, requiresMovable: false }),
  [Operation.transform]: Object.freeze({ retarget: "frame", capability: Capability.movable, requiresMovable: true }),
  [Operation.reorder]: Object.freeze({ retarget: "siblings", capability: Capability.movable, requiresMovable: true }),
  [Operation.clone]: Object.freeze({ retarget: "frame", capability: Capability.clonable, requiresMovable: false })
});

const GRID_CELL_FAILURES = Object.freeze({
  [Operation.fill]: SelectionFailure.mediaNotPaintable,
  [Operation.stroke]: SelectionFailure.gridMaskReadOnly,
  [Operation.cornerRadius]: SelectionFailure.gridMaskReadOnly,
  [Operation.transform]: SelectionFailure.gridCellIsolated,
  [Operation.reorder]: SelectionFailure.gridCellIsolated,
  [Operation.clone]: SelectionFailure.gridCellIsolated
});

const CAPABILITY_FAILURES = Object.freeze({
  [Capability.stroke]: SelectionFailure.noStroke,
  [Capability.cornerRadius]: SelectionFailure.noCornerRadius,
  [Capability.clonable]: SelectionFailure.notClonable,
  [Capability.movable]: SelectionFailure.pageStructureFixed
});

function read(source, key) {
  if (source === null || source === undefined) return undefined;
  try {
    return source[key];
  } catch {
    return undefined;
  }
}

function failure(reason, type = null) {
  return { ok: false, reason, type };
}

export function capabilitiesOf(type) {
  return NODE_CAPABILITIES[type] ?? null;
}

export function supportFor(type, capability) {
  const entry = capabilitiesOf(type);
  if (!entry) return Support.undeclared;
  if (!(capability in entry)) return Support.undeclared;
  return entry[capability] ? Support.declared : Support.absent;
}

export function describeFailure(result) {
  const reason = typeof result === "string" ? result : read(result, "reason");
  const template = FAILURE_SENTENCES[reason];
  if (!template) return `${UNMAPPED_REASON_PREFIX}${String(reason)}.`;
  const element = ELEMENT_NAMES[read(result, "type")] ?? DEFAULT_ELEMENT_NAME;
  return template.replaceAll(ELEMENT_SLOT, element);
}

function resolveNode(node) {
  if (node === null || node === undefined) return failure(SelectionFailure.nothingSelected);
  const type = read(node, "type");
  if (typeof type !== "string") return failure(SelectionFailure.nodeUnreadable);
  const capabilities = capabilitiesOf(type);
  if (!capabilities) return failure(SelectionFailure.typeUnknown, type);
  return { ok: true, node, type, capabilities };
}

function resolveParent(node) {
  const parent = read(node, "parent");
  if (parent === null || parent === undefined) return failure(SelectionFailure.nodeOrphaned);
  return resolveNode(parent);
}

function resolveMask(frame) {
  const mask = read(frame, "maskShape");
  if (mask === null || mask === undefined) return failure(SelectionFailure.nodeUnreadable);
  return resolveNode(mask);
}

function selfTarget(selected) {
  return selected;
}

function maskTarget(selected) {
  if (selected.capabilities.mediaFrame) return resolveMask(selected.node);
  if (!selected.capabilities.mediaContent) return selected;
  const parent = resolveParent(selected.node);
  if (!parent.ok) return parent;
  if (parent.type === NodeType.gridCell) return failure(SelectionFailure.gridMaskReadOnly, selected.type);
  if (!parent.capabilities.mediaFrame) return selected;
  return resolveMask(parent.node);
}

function frameTarget(selected) {
  if (!selected.capabilities.mediaContent) return selected;
  const parent = resolveParent(selected.node);
  if (!parent.ok) return parent;
  if (parent.type === NodeType.gridCell) return failure(SelectionFailure.gridCellIsolated, selected.type);
  if (!parent.capabilities.mediaFrame) return selected;
  return parent;
}

function siblingTarget(selected) {
  let current = selected;
  for (let depth = 0; depth < MAX_ANCESTOR_DEPTH; depth += 1) {
    const parent = resolveParent(current.node);
    if (!parent.ok) return parent;
    if (parent.type === NodeType.gridLayout) return failure(SelectionFailure.gridCellIsolated, selected.type);
    if (parent.capabilities.children) return current;
    current = parent;
  }
  return failure(SelectionFailure.noSiblings, selected.type);
}

const RETARGETS = Object.freeze({
  self: selfTarget,
  mask: maskTarget,
  frame: frameTarget,
  siblings: siblingTarget
});

function fillFailure(capabilities) {
  if (capabilities.color) return SelectionFailure.colorNotFill;
  if (capabilities.text) return SelectionFailure.textColorPerRange;
  if (capabilities.mediaFrame || capabilities.mediaContent) return SelectionFailure.mediaNotPaintable;
  return SelectionFailure.noFill;
}

function capabilityFailure(capabilities, capability) {
  if (capabilities[capability]) return null;
  if (capability === Capability.fill) return fillFailure(capabilities);
  return CAPABILITY_FAILURES[capability];
}

function attributeTo(result, type) {
  if (result.ok || result.type) return result;
  return { ...result, type };
}

export function retargetNode(node, operation) {
  const selected = resolveNode(node);
  if (!selected.ok) return selected;
  const rule = OPERATION_RULES[operation];
  if (!rule) return failure(SelectionFailure.operationUnknown, selected.type);
  if (selected.type === NodeType.gridCell) return failure(GRID_CELL_FAILURES[operation], selected.type);
  if (rule.requiresMovable && !selected.capabilities.movable) {
    return failure(SelectionFailure.pageStructureFixed, selected.type);
  }
  const target = attributeTo(RETARGETS[rule.retarget](selected), selected.type);
  if (!target.ok) return target;
  const denied = capabilityFailure(target.capabilities, rule.capability);
  if (denied) return failure(denied, selected.type);
  return {
    ok: true,
    node: target.node,
    type: target.type,
    selectedType: selected.type,
    retargeted: target.node !== selected.node
  };
}

export function retargetSelection(selection, operation) {
  const nodes = Array.isArray(selection) ? selection : [selection];
  if (nodes.length === 0) {
    return { ok: false, targets: [], refusals: [failure(SelectionFailure.nothingSelected)] };
  }
  const targets = [];
  const refusals = [];
  const claimed = new Set();
  for (const node of nodes) {
    const result = retargetNode(node, operation);
    if (!result.ok) {
      refusals.push(result);
      continue;
    }
    if (claimed.has(result.node)) continue;
    claimed.add(result.node);
    targets.push(result);
  }
  return { ok: targets.length > 0, targets, refusals };
}

function enumObject(constants, enumName) {
  const source = read(constants, enumName);
  if (!source || typeof source !== "object") return null;
  return source;
}

export function enumValueOf(constants, enumName, memberName) {
  const source = enumObject(constants, enumName);
  if (!source) return failure(SelectionFailure.enumUnavailable);
  const value = read(source, memberName);
  if (value === undefined) return failure(SelectionFailure.enumUnavailable);
  return { ok: true, value };
}

export function enumNameOf(constants, enumName, value) {
  const source = enumObject(constants, enumName);
  if (!source) return failure(SelectionFailure.enumUnavailable);
  const match = Object.keys(source).find(
    (key) => !REVERSE_MAPPED_ENUM_KEY.test(key) && source[key] === value
  );
  if (match === undefined) return failure(SelectionFailure.enumValueUnrecognized);
  return { ok: true, name: match };
}

export function matchesEnumMember(constants, enumName, memberName, value) {
  const member = enumValueOf(constants, enumName, memberName);
  return member.ok && member.value === value;
}

function textProperty(node, key) {
  const type = read(node, "type");
  if (type !== NodeType.text) return failure(SelectionFailure.notTextNode, typeof type === "string" ? type : null);
  const value = read(node, key);
  if (value === undefined) return failure(SelectionFailure.nodeUnreadable, NodeType.text);
  return { ok: true, value };
}

export function textLayoutName(node, constants) {
  const layout = textProperty(node, "layout");
  if (!layout.ok) return layout;
  const layoutType = read(layout.value, "type");
  if (layoutType === undefined) return failure(SelectionFailure.nodeUnreadable, NodeType.text);
  return enumNameOf(constants, "TextLayout", layoutType);
}

export function textAlignmentName(node, constants) {
  const alignment = textProperty(node, "textAlignment");
  if (!alignment.ok) return alignment;
  return enumNameOf(constants, "TextAlignment", alignment.value);
}

export function textLayoutIs(node, constants, memberName) {
  const resolved = textLayoutName(node, constants);
  return resolved.ok && resolved.name === memberName;
}
