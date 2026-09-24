import {
  ArtboardNode,
  GridCellNode,
  GridLayoutNode,
  GroupNode,
  ImageRectangleNode,
  MediaContainerNode,
  PageNode,
  RectangleNode,
  TextNode,
  constants,
  makeColor,
  makeDocument,
  makeEditor
} from "./stub.js";

import * as coordinates from "../patterns/coordinates.js";
import * as nodeTypes from "../patterns/node-types.js";
import * as undoHistory from "../patterns/undo.js";
import * as bridge from "../patterns/bridge.js";
import * as renditions from "../patterns/renditions.js";
import * as contrast from "../patterns/contrast.js";

let passed = 0;
let failed = 0;

function ok(label, condition) {
  if (condition === true) {
    passed += 1;
    console.log(`  pass  ${label}`);
    return;
  }
  failed += 1;
  console.log(`  FAIL  ${label}`);
}

function section(title) {
  console.log(`\n${title}`);
}

function summary() {
  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0 ? 0 : 1;
}

const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

const near = (actual, expected, tolerance = 1e-6) =>
  typeof actual === "number" && Math.abs(actual - expected) <= tolerance;

const centerOf = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

function coordinateAssertions() {
  section("coordinates");

  const document = makeDocument();
  const group = new GroupNode({ translation: { x: 100, y: 100 } });
  const photo = new RectangleNode({ boundsLocal: { x: 0, y: 0, width: 200, height: 100 }, translation: { x: 50, y: 60 } });
  const sibling = new RectangleNode({ boundsLocal: { x: 0, y: 0, width: 80, height: 80 }, translation: { x: 400, y: 400 } });
  document.artboard.children.append(group);
  group.children.append(photo);
  group.children.append(sibling);

  ok(
    "a node inside a group measures in artboard coordinates, not group coordinates",
    same(coordinates.boundsIn(photo, document.artboard), { x: 150, y: 160, width: 200, height: 100 })
  );
  ok(
    "the same node measures differently inside its own group",
    same(coordinates.boundsIn(photo, group), { x: 50, y: 60, width: 200, height: 100 })
  );
  ok(
    "a group's box is the union of its children",
    same(group.boundsLocal, { x: 50, y: 60, width: 430, height: 420 })
  );

  const soloGroup = new GroupNode({ translation: { x: 0, y: 0 } });
  const onlyChild = new RectangleNode({ boundsLocal: { x: 0, y: 0, width: 300, height: 200 }, translation: { x: 30, y: 40 } });
  document.artboard.children.append(soloGroup);
  soloGroup.children.append(onlyChild);

  ok(
    "a group holding one node has exactly that node's box",
    same(soloGroup.boundsLocal, onlyChild.boundsInParent)
  );
  const insideOwnGroup = coordinates.positionInParent(onlyChild, centerOf(soloGroup.boundsLocal), onlyChild.centerPointLocal);
  ok(
    "centring a node inside its own group moves it zero pixels",
    insideOwnGroup.ok === true && insideOwnGroup.moved === false
  );

  const againstArtboard = coordinates.positionInParent(soloGroup, centerOf(document.artboard.boundsLocal), centerOf(soloGroup.boundsLocal));
  ok(
    "centring the group against the artboard reports the move it made",
    againstArtboard.ok === true && againstArtboard.moved === true && same(againstArtboard.delta, { x: 360, y: 400 })
  );
  ok(
    "and the group's final box is centred on the artboard",
    same(centerOf(coordinates.boundsIn(soloGroup, document.artboard)), { x: 540, y: 540 })
  );

  ok(
    "an artboard has width and height but is not movable",
    document.artboard.width === 1080 &&
      coordinates.movability(document.artboard).movable === false &&
      coordinates.movability(document.artboard).reason === coordinates.COORDINATE_REFUSAL.VISUAL_ONLY
  );
  ok(
    "moving an artboard is refused by name rather than throwing",
    same(coordinates.positionInParent(document.artboard, { x: 0, y: 0 }), {
      ok: false,
      reason: coordinates.COORDINATE_REFUSAL.VISUAL_ONLY
    })
  );
  ok(
    "a page is not movable either, and it refuses as a sized-only node rather than a visual one",
    coordinates.movability(document.page).movable === false &&
      coordinates.movability(document.page).reason === coordinates.COORDINATE_REFUSAL.SIZED_ONLY
  );
  ok(
    "a page has no bounds to measure, the way a BaseNode has none",
    coordinates.boundsIn(document.page, document.page) === null
  );
  ok(
    "every movability answer carries the ok field the rest of the module returns",
    coordinates.movability(document.artboard).ok === false &&
      coordinates.movability(new RectangleNode({})).ok === true
  );
  ok(
    "the artboard still answers containerBox, so it can frame a move",
    same(coordinates.containerBox(document.artboard), { x: 0, y: 0, width: 1080, height: 1080 })
  );

  const walk = coordinates.outermostMovableAncestor(photo);
  ok(
    "the walk up stops at the outermost movable ancestor",
    walk.ok === true && walk.target === group && walk.container === document.artboard
  );
  const soloWalk = coordinates.outermostMovableAncestor(onlyChild);
  ok(
    "a top level node is its own move target",
    soloWalk.ok === true && soloWalk.target === soloGroup
  );

  const media = new MediaContainerNode({ translation: { x: 10, y: 20 } });
  document.artboard.children.append(media);
  ok(
    "a media rectangle finds the artboard through its container",
    coordinates.artboardOf(media.mediaRectangle).artboard === document.artboard
  );

  const twoPages = makeDocument({ pages: 2 });
  const strayNode = new RectangleNode({});
  twoPages.pages[1].artboards.first.children.append(strayNode);
  const editor = makeEditor({ insertionParent: twoPages.artboard });
  editor.context.selection = [strayNode];

  ok(
    "two artboards on different pages are different visual roots",
    coordinates.boundsIn(strayNode, twoPages.artboard) === null &&
      coordinates.sharesVisualSpace(strayNode, twoPages.artboard).reason ===
        coordinates.COORDINATE_REFUSAL.DIFFERENT_VISUAL_ROOT
  );
  const derived = coordinates.artboardForSelection(editor);
  ok(
    "the artboard comes from the selection, not from insertionParent",
    derived.ok === true && derived.via === "selection" && derived.artboard === twoPages.pages[1].artboards.first
  );
  editor.context.selection = [];
  ok(
    "with nothing selected it falls back to insertionParent",
    coordinates.artboardForSelection(editor).artboard === twoPages.artboard
  );

  ok(
    "a mixed parent selection is refused before any arithmetic",
    coordinates.comparableByTranslation([photo, onlyChild]).reason === coordinates.COORDINATE_REFUSAL.MIXED_PARENTS
  );
  const union = coordinates.boundsOfAllIn([photo, sibling], document.artboard);
  ok(
    "a multi node selection measures as one union box",
    union.ok === true && same(union.union, { x: 150, y: 160, width: 430, height: 420 })
  );

  ok(
    "the ancestor chain reaches the page, one link at a time",
    same(coordinates.ancestorsOf(photo).map((node) => node.type), ["Group", "ab:Artboard", "Page"]) &&
      coordinates.parentOf(photo) === group
  );
  ok(
    "the artboard type string is the one the SDK uses, in every module that names it",
    coordinates.ARTBOARD_TYPE === "ab:Artboard" && coordinates.ARTBOARD_TYPE === document.artboard.type
  );

  const rotated = new RectangleNode({ boundsLocal: { x: 0, y: 0, width: 200, height: 100 }, translation: { x: 50, y: 60 } });
  document.artboard.children.append(rotated);
  rotated.setRotationInParent(90, rotated.centerPointLocal);
  const rotatedBox = coordinates.boundsIn(rotated, document.artboard);
  ok(
    "a rotated node reports the axis aligned box of its rotated shape",
    near(rotatedBox.width, 100) && near(rotatedBox.height, 200) && near(rotatedBox.x, 100) && near(rotatedBox.y, 10)
  );
}

function selectionAssertions() {
  section("selection targets");

  const document = makeDocument();
  const frame = new MediaContainerNode({ translation: { x: 40, y: 50 } });
  document.artboard.children.append(frame);

  const refusalFrom = (attempt) => {
    try {
      attempt();
    } catch (error) {
      return error.message;
    }
    return null;
  };

  ok(
    "cloning the image inside a frame is refused by the declared never override",
    refusalFrom(() => frame.mediaRectangle.cloneInPlace()) === "ImageRectangleNode.cloneInPlace always throws; clone the container instead"
  );

  const clonedFrame = frame.cloneInPlace();
  ok(
    "retargeting the clone to the frame succeeds and lands it as a sibling",
    clonedFrame instanceof MediaContainerNode && document.artboard.children.indexOf(clonedFrame) === document.artboard.children.indexOf(frame) + 1
  );
  ok(
    "the frame has no children list, so z-order code must not assume one",
    frame.children === undefined && frame.allChildren.length === 2
  );

  const cell = new GridCellNode({});
  const grid = new GridLayoutNode({ cells: [cell], translation: { x: 0, y: 0 } });
  document.artboard.children.append(grid);

  ok(
    "cloning one grid cell is refused by the declared never override",
    refusalFrom(() => cell.cloneInPlace()) === "GridCellNode.cloneInPlace always throws; clone the grid instead"
  );
  ok(
    "the grid itself clones, so the refusal is a decision rather than a dead end",
    refusalFrom(() => grid.cloneInPlace()) === null && document.artboard.children.length === 4
  );
  ok(
    "a grid exposes allChildren but no children list",
    grid.children === undefined && grid.allChildren[0] === cell && cell.parent === grid
  );
  ok(
    "a grid cell is movable in isolation, which is why a refusal has to be a decision",
    coordinates.movability(cell).movable === true && coordinates.outermostMovableAncestor(cell).target === grid
  );

  const editor = makeEditor({ insertionParent: document.artboard });
  const locked = new RectangleNode({ locked: true });
  document.artboard.children.append(locked);
  editor.context.selection = [frame, locked];
  ok(
    "a locked node is kept out of selection but visible to the non editable view",
    editor.context.selection.length === 1 && editor.context.selectionIncludingNonEditable.length === 2
  );

  const wrapper = new GroupNode({});
  const child = new RectangleNode({});
  document.artboard.children.append(wrapper);
  wrapper.children.append(child);
  editor.context.selection = [wrapper, child];
  ok(
    "a descendant of a selected node is filtered out of the selection",
    editor.context.selection.length === 1 && editor.context.selection[0] === wrapper
  );

  const { Operation, SelectionFailure, NodeType, Capability, Support } = nodeTypes;

  const toFrame = nodeTypes.retargetNode(frame.mediaRectangle, Operation.transform);
  ok(
    "clicking a photo selects the image, and a move retargets to the frame that holds it",
    toFrame.ok === true && toFrame.node === frame && toFrame.selectedType === NodeType.imageRectangle && toFrame.retargeted === true
  );
  const cloneTarget = nodeTypes.retargetNode(frame.mediaRectangle, Operation.clone);
  ok(
    "duplicating a photo duplicates the frame, which is what the SDK tells you to clone",
    cloneTarget.ok === true && cloneTarget.node === frame
  );
  const roundTarget = nodeTypes.retargetNode(frame, Operation.cornerRadius);
  ok(
    "rounding a photo's corners retargets to the frame's mask, not the frame",
    roundTarget.ok === true && roundTarget.node === frame.maskShape && roundTarget.type === NodeType.rectangle
  );
  const reorderTarget = nodeTypes.retargetNode(frame.mediaRectangle, Operation.reorder);
  ok(
    "reordering climbs to the nearest ancestor that actually has a sibling list",
    reorderTarget.ok === true && reorderTarget.node === frame
  );
  const both = nodeTypes.retargetSelection([frame, frame.mediaRectangle], Operation.transform);
  ok(
    "a frame and its own image collapse to one target, so the move is not applied twice",
    both.ok === true && both.targets.length === 1 && both.targets[0].node === frame
  );

  const cellMove = nodeTypes.retargetNode(cell, Operation.transform);
  ok(
    "moving one grid cell is refused by name rather than dragging the whole collage",
    cellMove.ok === false && cellMove.reason === SelectionFailure.gridCellIsolated && cellMove.type === NodeType.gridCell
  );
  ok(
    "the refusal renders a sentence naming the element it refused",
    nodeTypes.describeFailure(cellMove) ===
      "This is one cell of a photo grid, and a grid moves, reorders and duplicates as one piece. Select the whole grid instead."
  );
  ok(
    "rounding a grid cell is refused differently, because its mask belongs to the grid",
    nodeTypes.retargetNode(cell, Operation.cornerRadius).reason === SelectionFailure.gridMaskReadOnly
  );
  ok(
    "the image inside a grid cell is refused too, instead of climbing to the grid",
    nodeTypes.retargetNode(cell.mediaRectangle, Operation.clone).reason === SelectionFailure.gridCellIsolated
  );
  ok(
    "the grid itself moves, so the cell refusal is a boundary and not a blanket ban",
    nodeTypes.retargetNode(grid, Operation.transform).ok === true
  );

  ok(
    "an artboard is refused as page structure, not as an unknown element",
    nodeTypes.retargetNode(document.artboard, Operation.transform).reason === SelectionFailure.pageStructureFixed
  );
  ok(
    "filling a text box is refused with the reason that colour lives on the characters",
    nodeTypes.retargetNode(new TextNode({ text: "a" }), Operation.fill).reason === SelectionFailure.textColorPerRange
  );
  ok(
    "an artboard does take a fill, so the refusal above is about text and not about containers",
    nodeTypes.retargetNode(document.artboard, Operation.fill).ok === true
  );
  ok(
    "an orphaned node is refused before anything reads its geometry",
    nodeTypes.retargetNode(new ImageRectangleNode({}), Operation.transform).reason === SelectionFailure.nodeOrphaned
  );
  ok(
    "a scene type with no declared class is undeclared rather than unsupported",
    nodeTypes.supportFor(nodeTypes.SCENE_TYPES_WITHOUT_DECLARED_CLASS[0], Capability.fill) === Support.undeclared &&
      nodeTypes.supportFor(NodeType.artboard, Capability.movable) === Support.absent &&
      nodeTypes.supportFor(NodeType.rectangle, Capability.fill) === Support.declared
  );
  ok(
    "every refusal the module can return has its own sentence",
    Object.values(SelectionFailure).every((reason) => typeof nodeTypes.FAILURE_SENTENCES[reason] === "string")
  );
  ok(
    "every type with a capability row also has a name a sentence can use",
    Object.keys(nodeTypes.NODE_CAPABILITIES).every((type) => typeof nodeTypes.ELEMENT_NAMES[type] === "string") &&
      Object.keys(nodeTypes.NODE_CAPABILITIES).every((type) => Object.values(NodeType).includes(type))
  );
  ok(
    "an unmapped reason says so instead of borrowing another sentence",
    nodeTypes.describeFailure("not-a-real-reason").startsWith("No sentence is mapped")
  );
  ok(
    "a type the table does not cover is refused as unknown rather than assumed to behave like a shape",
    nodeTypes.capabilitiesOf("artgr:Polygon") === null &&
      nodeTypes.retargetNode({ type: "artgr:Polygon", parent: document.artboard }, Operation.fill).reason ===
        SelectionFailure.typeUnknown
  );
  ok(
    "nothing selected is its own refusal, separate from an unreadable node",
    nodeTypes.retargetNode(undefined, Operation.fill).reason === SelectionFailure.nothingSelected &&
      nodeTypes.retargetNode({}, Operation.fill).reason === SelectionFailure.nodeUnreadable
  );
  ok(
    "an operation the module does not define changes nothing",
    nodeTypes.retargetNode(document.artboard, "levitate").reason === SelectionFailure.operationUnknown
  );
}

function textAssertions() {
  section("text");

  const document = makeDocument();
  const heading = new TextNode({ text: "Two sizes", fontSize: 40 });
  document.artboard.children.append(heading);

  ok(
    "TextLayout is numeric, so a string comparison would silently never match",
    constants.TextLayout.autoWidth === 3 && heading.layout.type === constants.TextLayout.autoWidth
  );
  ok(
    "TextAlignment centre is 3, not 2",
    constants.TextAlignment.center === 3 && constants.TextAlignment.right === 2
  );
  ok(
    "a text node's top left is not its origin",
    heading.topLeftLocal.y < 0 && heading.boundsLocal.x === 0
  );

  heading.fullContent.applyCharacterStyles({ fontSize: 96 }, { start: 0, length: 3 });
  const ranges = heading.fullContent.characterStyleRanges;
  ok(
    "applyCharacterStyles honours its range and splits the run",
    ranges.length === 2 && ranges[0].length === 3 && ranges[0].fontSize === 96 && ranges[1].fontSize === 40
  );

  heading.fullContent.applyCharacterStyles({ color: makeColor(1, 0, 0) });
  const painted = heading.fullContent.characterStyleRanges;
  ok(
    "applyCharacterStyles with no range paints every run, which is what destroys mixed colour text",
    painted.every((run) => run.color.red === 1) && painted.length === 2
  );
  ok(
    "the ranges carry length only, so a start offset has to be accumulated",
    painted.every((run) => run.start === undefined)
  );

  const colour = makeColor(0.2, 0.4, 0.6, 1);
  ok(
    "a colour handed out by the host does not survive a spread",
    Object.keys({ ...colour }).length === 0 && colour.red === 0.2
  );

  ok(
    "a layout is identified by looking the number up in the enum, never by comparing to a string",
    nodeTypes.textLayoutName(heading, constants).name === "autoWidth" &&
      nodeTypes.textLayoutIs(heading, constants, "autoWidth") === true &&
      nodeTypes.textLayoutIs(heading, constants, "area") === false
  );
  ok(
    "a hardcoded number would have read centre as right",
    nodeTypes.matchesEnumMember(constants, "TextAlignment", "center", 3) === true &&
      nodeTypes.matchesEnumMember(constants, "TextAlignment", "center", 2) === false
  );
  ok(
    "the alignment a node reports is named back from the enum",
    nodeTypes.textAlignmentName(heading, constants).name === "left"
  );
  ok(
    "a value the enum does not contain is refused rather than guessed",
    nodeTypes.enumNameOf(constants, "TextLayout", 99).reason === nodeTypes.SelectionFailure.enumValueUnrecognized
  );
  ok(
    "an enum this host does not expose at all is a different, named refusal",
    nodeTypes.enumValueOf({}, "TextLayout", "autoWidth").reason === nodeTypes.SelectionFailure.enumUnavailable
  );
  ok(
    "asking a rectangle for its text layout is refused, not answered with a default",
    nodeTypes.textLayoutName(new RectangleNode({}), constants).reason === nodeTypes.SelectionFailure.notTextNode
  );
  ok(
    "every member the SDK declares is present in both enums",
    nodeTypes.TEXT_LAYOUT_MEMBERS.every((member) => typeof constants.TextLayout[member] === "number") &&
      nodeTypes.TEXT_ALIGNMENT_MEMBERS.every((member) => typeof constants.TextAlignment[member] === "number")
  );
}

function undoAssertions() {
  section("undo");

  const document = makeDocument();
  const moved = new RectangleNode({ translation: { x: 0, y: 0 } });
  document.artboard.children.append(moved);

  const history = undoHistory.createEditHistory({ documentRoot: document.page, limit: 3 });
  ok("an empty history refuses by name", history.undoLast().reason === undoHistory.UNDO_REFUSAL.EMPTY);

  const before = moved.translation;
  moved.translation = { x: 300, y: 200 };
  const recorded = history.record({
    label: "move",
    nodes: [moved],
    revert: () => {
      moved.translation = before;
    }
  });
  ok("recording returns a sequence number and the depth", recorded.seq === 1 && recorded.depth === 1 && recorded.reversible === true);

  const undone = history.undoLast();
  ok(
    "undo restores the state it snapshotted and empties the stack",
    undone.ok === true && undone.label === "move" && same(moved.translation, { x: 0, y: 0 }) && history.depth === 0
  );

  const doomed = new RectangleNode({});
  document.artboard.children.append(doomed);
  let revertRan = false;
  history.record({
    label: "recolor",
    nodes: [doomed],
    revert: () => {
      revertRan = true;
    }
  });
  doomed.removeFromParent();
  const stale = history.undoLast();
  ok(
    "an entry whose node left the document is reported stale and its revert never runs",
    stale.ok === false && stale.reason === undoHistory.UNDO_REFUSAL.STALE && stale.discarded === true && revertRan === false
  );
  ok("the stale entry is gone from the stack", history.depth === 0);

  history.record({ label: "resize", nodes: [moved] });
  ok(
    "an edit that could not snapshot its prior state is refused, not silently kept",
    history.undoLast().reason === undoHistory.UNDO_REFUSAL.IRREVERSIBLE
  );

  const first = history.record({ label: "one", nodes: [moved], revert: () => {} });
  history.record({ label: "two", nodes: [moved], revert: () => {} });
  ok(
    "undoing by sequence refuses anything that is no longer the newest edit",
    history.undoIfNewest(first.seq).reason === undoHistory.UNDO_REFUSAL.NOT_NEWEST && history.depth === 2
  );
  ok("the newest edit can still be undone by its sequence", history.undoIfNewest(history.newestSeq).ok === true);

  history.clear();
  history.record({ label: "a", nodes: [moved], revert: () => {} });
  history.record({ label: "b", nodes: [moved], revert: () => {} });
  history.record({ label: "c", nodes: [moved], revert: () => {} });
  history.record({ label: "d", nodes: [moved], revert: () => {} });
  ok(
    "the stack is bounded and drops the oldest entry",
    history.depth === 3 && history.peek().label === "d"
  );

  ok("the stack reports the bound it was built with", history.limit === 3);

  const purged = undoHistory.createEditHistory({ documentRoot: document.page });
  const painted = new RectangleNode({});
  const resized = new RectangleNode({});
  document.artboard.children.append(painted);
  document.artboard.children.append(resized);
  purged.record({ label: "a", nodes: [painted], revert: () => {} });
  purged.record({ label: "b", nodes: [resized], revert: () => {} });
  purged.record({ label: "c", nodes: [painted, resized], revert: () => {} });
  ok(
    "entries are purged by node id when content is deleted, not left to fail later",
    purged.forget([painted.id]) === 2 && purged.depth === 1 && purged.peek().label === "b"
  );

  const rootless = undoHistory.createEditHistory();
  const detached = new RectangleNode({});
  document.artboard.children.append(detached);
  rootless.record({ label: "d", nodes: [detached], revert: () => {} });
  detached.removeFromParent();
  ok(
    "with no document root supplied, liveness falls back to having a parent at all",
    undoHistory.hasParent(moved) === true &&
      undoHistory.hasParent(detached) === false &&
      rootless.undoLast().reason === undoHistory.UNDO_REFUSAL.STALE
  );

  ok(
    "attachment is measured against the document root, not the current artboard",
    undoHistory.isAttachedTo(moved, document.page) === true && undoHistory.isAttachedTo(doomed, document.page) === false
  );
}

function bridgeAssertions() {
  section("bridge");

  const document = makeDocument();
  const node = new RectangleNode({ translation: { x: 12, y: 34 } });
  document.artboard.children.append(node);

  const leak = bridge.findUntransferable({ id: node.id, moved: node });
  ok(
    "a live node is refused with the path that holds it",
    leak !== null && leak.path === "value.moved" && leak.reason === bridge.TRANSFER_REFUSAL.CLASS_INSTANCE
  );

  let thrown = null;
  try {
    bridge.assertTransferable({ moved: node }, "result");
  } catch (error) {
    thrown = error;
  }
  ok(
    "assertTransferable throws a message naming the offending path",
    thrown instanceof TypeError && thrown.message.includes("result.moved")
  );

  const colour = makeColor(0.1, 0.2, 0.3);
  ok(
    "an SDK colour is a class instance and cannot cross either",
    bridge.findUntransferable({ colour }).reason === bridge.TRANSFER_REFUSAL.CLASS_INSTANCE
  );
  ok(
    "its plain reading does cross",
    bridge.findUntransferable({ colour: colour.toJSON() }) === null
  );

  const plain = { id: node.id, box: node.boundsInParent, applied: true, tags: ["move", "undo"] };
  ok("plain data survives the copy unchanged", same(bridge.toTransferable(plain), plain));
  ok(
    "a function is dropped rather than carried across",
    same(bridge.toTransferable({ id: "a", revert: () => {} }), { id: "a" })
  );

  const circular = { id: "a" };
  circular.self = circular;
  ok(
    "a cycle is named rather than hanging the copy",
    bridge.findUntransferable(circular).reason === bridge.TRANSFER_REFUSAL.CIRCULAR
  );

  const failures = [];
  const guarded = bridge.guardApi(
    {
      describe: () => ({ id: node.id, box: node.boundsInParent }),
      leak: () => ({ moved: node }),
      explode: () => {
        throw new Error("sandbox threw");
      },
      explodeLater: async () => {
        throw new Error("sandbox rejected");
      },
      version: "2.0.0"
    },
    { onFailure: (name) => failures.push(name) }
  );

  const withFallback = bridge.guardMethod(
    () => {
      throw new Error("sandbox is gone");
    },
    { name: "applyEdit", fallback: () => ({ ok: false, reason: "sandboxUnavailable" }) }
  );
  ok(
    "a guarded method can answer a caller supplied fallback instead of the generic failure",
    same(withFallback(), { ok: false, reason: "sandboxUnavailable" })
  );

  ok("a clean method passes its plain result through", same(guarded.describe(), { id: node.id, box: node.boundsInParent }));
  ok("a method that leaks a live node has the leak stripped", same(guarded.leak(), {}));
  ok(
    "a throwing method answers a named failure instead of rejecting across the bridge",
    same(guarded.explode(), { ok: false, reason: bridge.GUARD_FAILURE_REASON, method: "explode" })
  );
  ok("non function members are carried over untouched", guarded.version === "2.0.0");

  return guarded.explodeLater().then((result) => {
    ok(
      "a rejected async method answers the same named failure",
      same(result, { ok: false, reason: bridge.GUARD_FAILURE_REASON, method: "explodeLater" })
    );
    ok("every failure was reported to the caller's listener", same(failures, ["explode", "explodeLater"]));
  });
}

function renditionSdk(documentApi) {
  return {
    constants: {
      RenditionFormat: { png: "image/png", jpg: "image/jpeg", pdf: "application/pdf" },
      Range: { currentPage: "currentPage", entireDocument: "entireDocument", specificPages: "specificPages" },
      RenditionIntent: { export: "export", preview: "preview", print: "print" }
    },
    app: { document: documentApi }
  };
}

const intents = { export: "export", preview: "preview", print: "print" };

async function renditionAssertions() {
  section("renditions");

  ok(
    "export leads when the document allows it",
    same(renditions.orderedIntents(intents, { exportAllowed: true }), ["export", "preview"])
  );
  ok(
    "preview leads when export is not allowed, so no approval dialog opens over the user's work",
    same(renditions.orderedIntents(intents, { exportAllowed: false }), ["preview", "export"])
  );
  ok(
    "export still trails as a last resort rather than being dropped",
    renditions.orderedIntents(intents, { exportAllowed: false })[1] === "export"
  );
  ok(
    "a host with no preview intent falls back to the single intent it has",
    same(renditions.orderedIntents({ export: "export" }, { exportAllowed: false }), ["export"])
  );

  const built = renditions.pageRenditionOptions(renditions.renditionConstants(renditionSdk({})), { pageWidth: 3000, maxWidth: 1600 });
  ok(
    "a page wider than the cap asks for a smaller rendition",
    built.ok === true && same(built.options, { range: "currentPage", format: "image/png", requestedSize: { width: 1600 } })
  );
  ok(
    "a page within the cap asks for no size at all",
    renditions.pageRenditionOptions(renditions.renditionConstants(renditionSdk({})), { pageWidth: 1080 }).options.requestedSize === undefined
  );
  ok(
    "the size cap is inclusive, so a page exactly at the cap is sent untouched",
    renditions.requestedSizeFor(renditions.DEFAULT_MAX_RENDITION_WIDTH) === null &&
      same(renditions.requestedSizeFor(renditions.DEFAULT_MAX_RENDITION_WIDTH + 1), {
        width: renditions.DEFAULT_MAX_RENDITION_WIDTH
      })
  );
  ok(
    "an unreadable page width asks for no resize rather than for NaN pixels",
    renditions.requestedSizeFor(undefined) === null && renditions.requestedSizeFor(Number.NaN) === null
  );
  ok(
    "an unknown format is refused by name before any host call",
    renditions.pageRenditionOptions(renditions.renditionConstants(renditionSdk({})), { format: "tiff" }).reason ===
      renditions.CaptureFailure.formatUnsupported
  );

  const tried = [];
  const gatedDocument = {
    exportAllowed: async () => false,
    createRenditions: async (options, intent) => {
      tried.push(intent);
      if (intent !== "preview") throw new Error("export refused");
      return [{ blob: "png-bytes" }];
    }
  };
  const gated = await renditions.capturePageRendition({ addOnUISdk: renditionSdk(gatedDocument), pageWidth: 1080 });
  ok(
    "a document awaiting approval is captured with preview on the first attempt",
    gated.ok === true && gated.intent === "preview" && same(tried, ["preview"])
  );

  const sizeCalls = [];
  const fussyDocument = {
    createRenditions: async (options) => {
      sizeCalls.push(options);
      if (options.requestedSize) throw new Error("requestedSize unsupported");
      return [{ blob: "png-bytes" }];
    }
  };
  const fussy = await renditions.capturePageRendition({ addOnUISdk: renditionSdk(fussyDocument), pageWidth: 3000 });
  ok(
    "a host that rejects the size hint is retried without it rather than failing the run",
    fussy.ok === true && sizeCalls.length === 2 && sizeCalls[1].requestedSize === undefined
  );

  const paidDocument = {
    createRenditions: async () => {
      throw Object.assign(new Error("Rendition failed"), { code: "USER_NOT_ENTITLED_TO_PREMIUM_CONTENT" });
    }
  };
  const paid = await renditions.capturePageRendition({ addOnUISdk: renditionSdk(paidDocument), pageWidth: 1080 });
  ok(
    "paid template content is named, not reported as a generic failure the user could retry forever",
    paid.ok === false && paid.reason === renditions.CaptureFailure.paidTemplateContent
  );

  const emptyDocument = { createRenditions: async () => [] };
  const empty = await renditions.capturePageRendition({ addOnUISdk: renditionSdk(emptyDocument), pageWidth: 1080 });
  ok(
    "an empty rendition array is a named refusal, not a TypeError at the user",
    empty.ok === false && empty.reason === renditions.CaptureFailure.renditionEmpty
  );

  const readerDocument = { createRenditions: async () => [{ blob: "png-bytes" }] };
  const decoded = await renditions.capturePageAsBase64({
    addOnUISdk: renditionSdk(readerDocument),
    pageWidth: 1080,
    createFileReader: () => ({
      readAsDataURL() {
        this.result = "data:image/png;base64,QUJD";
        this.onload();
      }
    })
  });
  ok("the blob is decoded to bare base64 with the data url prefix removed", decoded.ok === true && decoded.base64 === "QUJD");

  const brokenReader = await renditions.readBlobAsBase64("png-bytes", () => ({
    readAsDataURL() {
      this.onerror();
    }
  }));
  ok("a reader error is a named refusal", brokenReader.ok === false && brokenReader.reason === renditions.CaptureFailure.blobUnreadable);

  ok(
    "a host too old to answer exportAllowed is treated as allowing export",
    (await renditions.exportIsAllowed({})) === true &&
      (await renditions.exportIsAllowed({
        exportAllowed: async () => {
          throw new Error("unsupported");
        }
      })) === true &&
      (await renditions.exportIsAllowed({ exportAllowed: async () => false })) === false
  );
  ok(
    "the preview intent is only available to a manifest that declares it",
    same(renditions.PREVIEW_MANIFEST_REQUIREMENT, { renditionPreview: true })
  );
  ok(
    "the entitlement error is recognised from the code even when the message says nothing",
    renditions.isPaidContentError({ code: "USER_NOT_ENTITLED_TO_PREMIUM_CONTENT" }) === true &&
      renditions.isPaidContentError(new Error("network down")) === false
  );
}

function contrastAssertions() {
  section("contrast");

  const panel = { id: "panel", type: "Rectangle", box: { x: 0, y: 0, width: 800, height: 400 }, color: makeColor(1, 1, 1) };
  const heading = {
    id: "heading",
    type: "Text",
    box: { x: 40, y: 40, width: 400, height: 60 },
    color: makeColor(0, 0, 0),
    fontSize: 48
  };
  const faint = {
    id: "faint",
    type: "Text",
    box: { x: 40, y: 200, width: 400, height: 20 },
    color: makeColor(0.6, 0.6, 0.6),
    fontSize: 16
  };
  const photo = { id: "photo", type: "MediaContainer", box: { x: 0, y: 500, width: 800, height: 400 } };
  const caption = {
    id: "caption",
    type: "Text",
    box: { x: 40, y: 540, width: 400, height: 30 },
    color: makeColor(1, 1, 1),
    fontSize: 18
  };

  const stack = [panel, heading, faint, photo, caption];

  const measured = contrast.measureTextLegibility(heading, stack);
  ok(
    "black on white over a covering panel measures 21 to 1 and passes",
    measured.ok === true && near(measured.ratio, 21, 1e-9) && measured.passes === true && measured.backdropSource === "panel"
  );
  ok(
    "48pt text is large text, so its floor is 3 rather than 4.5",
    measured.largeText === true && measured.threshold === contrast.AA_LARGE_TEXT
  );

  const failing = contrast.measureTextLegibility(faint, stack);
  ok(
    "mid grey on white is measurable and fails the normal text floor",
    failing.ok === true && near(failing.ratio, 2.8484, 1e-3) && failing.passes === false && failing.threshold === contrast.AA_NORMAL_TEXT
  );

  const unmeasurable = contrast.measureTextLegibility(caption, stack);
  ok(
    "text over a photo is refused as unmeasurable and names what blocked it",
    unmeasurable.ok === false && unmeasurable.reason === "unmeasurable" && unmeasurable.blockedBy === "photo"
  );
  ok(
    "the refusal carries the sentence explaining why no number is offered",
    unmeasurable.explanation === contrast.MEASUREMENT_REASONS.unmeasurable
  );

  const page = contrast.measurePageLegibility(stack);
  ok(
    "the unmeasurable element is dropped from the results entirely, not filed as a pass",
    page.measured.length === 2 && page.unmeasurable.length === 1 && page.measured.every((result) => result.id !== "caption")
  );
  ok(
    "and the summary refuses to vouch for the page it could not fully measure",
    page.complete === false && page.claim.includes("neither a pass nor a failure")
  );

  const clean = contrast.measurePageLegibility([panel, heading]);
  ok("a fully measured page says so", clean.complete === true && clean.failing.length === 0);

  ok(
    "bold text reaches the large text floor at a smaller size than regular text",
    contrast.legibilityThreshold({ fontSize: contrast.LARGE_BOLD_TEXT_PX, bold: true }).threshold === contrast.AA_LARGE_TEXT &&
      contrast.legibilityThreshold({ fontSize: contrast.LARGE_BOLD_TEXT_PX }).threshold === contrast.AA_NORMAL_TEXT
  );
  ok(
    "the large text boundary is inclusive, and one pixel under it is not large",
    contrast.legibilityThreshold({ fontSize: contrast.LARGE_TEXT_PX }).largeText === true &&
      contrast.legibilityThreshold({ fontSize: contrast.LARGE_TEXT_PX - 1 }).largeText === false
  );
  ok(
    "a translucent surface is composited with what lies beneath before it is measured",
    near(
      contrast.contrastRatio(
        makeColor(0, 0, 0),
        contrast.compositeOver(makeColor(0, 0, 0, 0.5), makeColor(1, 1, 1))
      ),
      contrast.contrastRatio(makeColor(0, 0, 0), makeColor(0.5, 0.5, 0.5)),
      1e-9
    )
  );
  const onBarePage = { id: "stray", type: "Text", box: { x: 0, y: 0, width: 100, height: 20 }, color: makeColor(0, 0, 0) };
  ok(
    "text with nothing beneath it falls through to the page colour the caller supplied",
    contrast.resolveBackdrop(onBarePage, [onBarePage], { pageColor: makeColor(1, 1, 1) }).source === contrast.PAGE_SOURCE
  );
  ok(
    "and without a page colour there is simply no second colour to measure against",
    contrast.resolveBackdrop(onBarePage, [onBarePage]).reason === "no-backdrop"
  );
  ok(
    "white is luminance 1 and black is luminance 0",
    near(contrast.relativeLuminance(makeColor(1, 1, 1)), 1) && near(contrast.relativeLuminance(makeColor(0, 0, 0)), 0)
  );
  ok(
    "channels outside 0 to 1 are clamped rather than producing a nonsense ratio",
    same(contrast.toColor({ red: 2, green: -1, blue: 0.5 }), { red: 1, green: 0, blue: 0.5, alpha: 1 })
  );

  ok(
    "text that is nowhere in the stack it was measured against is refused",
    contrast.measureTextLegibility({ id: "ghost", type: "Text", box: { x: 0, y: 0, width: 10, height: 10 }, color: makeColor(0, 0, 0) }, stack)
      .reason === "not-in-stack"
  );
}

function enumShapeAssertions() {
  ok(
    "a numeric key from the enum's own reverse mapping is not mistaken for a member name",
    nodeTypes.enumNameOf(constants, "TextLayout", "autoWidth").ok === false &&
      nodeTypes.enumNameOf(constants, "TextLayout", 3).name === "autoWidth"
  );
}

function wcagNumberAssertions() {
  ok(
    "the AA floors are the WCAG numbers, not whatever the module happens to export",
    contrast.AA_NORMAL_TEXT === 4.5 &&
      contrast.AA_LARGE_TEXT === 3 &&
      contrast.LARGE_TEXT_PX === 24 &&
      contrast.LARGE_BOLD_TEXT_PX === 18.66
  );
  ok(
    "black on white is the full 21:1 the specification defines",
    near(contrast.contrastRatio(makeColor(0, 0, 0), makeColor(1, 1, 1)), 21, 1e-9)
  );
  ok(
    "very dark channels take the linear leg of the sRGB curve, not the gamma leg",
    near(contrast.relativeLuminance(makeColor(0.03, 0.03, 0.03)), 0.03 / 12.92, 1e-9)
  );

  const page = { id: "page", type: "Rectangle", box: { x: 0, y: 0, width: 800, height: 600 }, color: makeColor(1, 1, 1) };
  const ghost = { id: "ghost", type: "Rectangle", box: { x: 200, y: 0, width: 800, height: 600 }, color: makeColor(0, 0, 0, 0) };
  const text = { id: "text", type: "Text", box: { x: 100, y: 100, width: 300, height: 40 }, color: makeColor(0, 0, 0), fontSize: 16 };
  const measured = contrast.measureTextLegibility(text, [page, ghost, text]);
  ok(
    "an invisible element straddling the text does not make it unmeasurable",
    measured.ok === true && near(measured.ratio, 21, 1e-9)
  );
}

function structureAssertions() {
  section("stub fidelity");

  const page = new PageNode({});
  const artboard = new ArtboardNode({});
  page.artboards.append(artboard);

  ok(
    "a page exposes artboards and no children list",
    page.children === undefined && page.artboards.first === artboard && artboard.parent === page
  );
  ok(
    "neither a page nor an artboard has the Node movement surface",
    artboard.translation === undefined &&
      artboard.setPositionInParent === undefined &&
      artboard.boundsInNode === undefined &&
      page.boundsInParent === undefined
  );
  ok(
    "an artboard is its own visual root",
    artboard.visualRoot === artboard
  );

  const text = new TextNode({ text: "x" });
  ok("a text node has no width or height property", text.width === undefined && text.height === undefined);

  const image = new ImageRectangleNode({});
  ok("a media rectangle does have width and height", image.width === 100 && image.height === 40);

  const frame = new MediaContainerNode({});
  let removal = null;
  try {
    frame.mediaRectangle.removeFromParent();
  } catch (error) {
    removal = error;
  }
  ok("a node in a fixed slot refuses to be removed from its parent", removal instanceof TypeError);
}

async function main() {
  coordinateAssertions();
  selectionAssertions();
  textAssertions();
  undoAssertions();
  await bridgeAssertions();
  await renditionAssertions();
  contrastAssertions();
  enumShapeAssertions();
  wcagNumberAssertions();
  structureAssertions();
  process.exitCode = summary();
}

main();
