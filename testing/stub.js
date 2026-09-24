const enumOf = (members) =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(members).flatMap(([name, value]) => [
        [name, value],
        [String(value), name]
      ])
    )
  );

const TextLayout = enumOf({ area: 1, autoHeight: 2, autoWidth: 3, circular: 4, magicFit: 5 });
const TextAlignment = enumOf({ left: 1, right: 2, center: 3, justifyLeft: 4 });

export const constants = Object.freeze({ TextLayout, TextAlignment });

let sequence = 0;

function nextId(type) {
  sequence += 1;
  return `${type.toLowerCase()}-${sequence}`;
}

class Color {
  constructor(red, green, blue, alpha) {
    Object.defineProperty(this, "channels", { value: Object.freeze([red, green, blue, alpha]) });
  }

  get red() {
    return this.channels[0];
  }

  get green() {
    return this.channels[1];
  }

  get blue() {
    return this.channels[2];
  }

  get alpha() {
    return this.channels[3];
  }

  toJSON() {
    return { red: this.red, green: this.green, blue: this.blue, alpha: this.alpha };
  }
}

export function makeColor(red, green, blue, alpha = 1) {
  return new Color(Number(red), Number(green), Number(blue), Number(alpha));
}

class ItemList {
  constructor(owner) {
    this.owner = owner;
    this.items = [];
  }

  get length() {
    return this.items.length;
  }

  get first() {
    return this.items[0];
  }

  get last() {
    return this.items[this.items.length - 1];
  }

  item(index) {
    return this.items[index];
  }

  indexOf(node) {
    return this.items.indexOf(node);
  }

  toArray() {
    return this.items.slice();
  }

  *[Symbol.iterator]() {
    yield* this.items;
  }

  append(node) {
    this.detach(node);
    node.parent = this.owner;
    this.items.push(node);
  }

  insertBefore(node, target) {
    this.detach(node);
    node.parent = this.owner;
    const at = this.items.indexOf(target);
    this.items.splice(at < 0 ? 0 : at, 0, node);
  }

  insertAfter(node, target) {
    this.detach(node);
    node.parent = this.owner;
    const at = this.items.indexOf(target);
    this.items.splice(at < 0 ? this.items.length : at + 1, 0, node);
  }

  moveBefore(node, target) {
    this.insertBefore(node, target);
  }

  moveAfter(node, target) {
    this.insertAfter(node, target);
  }

  remove(node) {
    const at = this.items.indexOf(node);
    if (at < 0) return;
    this.items.splice(at, 1);
    node.parent = null;
  }

  detach(node) {
    if (node.parent === this.owner) {
      const at = this.items.indexOf(node);
      if (at >= 0) this.items.splice(at, 1);
      return;
    }
    const list = node.parent && node.parent.children;
    if (list) list.remove(node);
  }
}

const IDENTITY = [1, 0, 0, 1, 0, 0];

function composeMatrix(outer, inner) {
  return [
    outer[0] * inner[0] + outer[2] * inner[1],
    outer[1] * inner[0] + outer[3] * inner[1],
    outer[0] * inner[2] + outer[2] * inner[3],
    outer[1] * inner[2] + outer[3] * inner[3],
    outer[0] * inner[4] + outer[2] * inner[5] + outer[4],
    outer[1] * inner[4] + outer[3] * inner[5] + outer[5]
  ];
}

function invertMatrix(matrix) {
  const [a, b, c, d, tx, ty] = matrix;
  const determinant = a * d - b * c;
  if (!determinant) throw new Error("matrix is not invertible");
  return [
    d / determinant,
    -b / determinant,
    -c / determinant,
    a / determinant,
    (c * ty - d * tx) / determinant,
    (b * tx - a * ty) / determinant
  ];
}

function applyMatrix(matrix, point) {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5]
  };
}

function matrixToDocument(node) {
  let matrix = IDENTITY;
  let cursor = node;
  while (cursor && Array.isArray(cursor.transformMatrix)) {
    matrix = composeMatrix(cursor.transformMatrix, matrix);
    cursor = cursor.parent;
  }
  return matrix;
}

function boundingBoxOf(box, matrix) {
  const corners = [
    applyMatrix(matrix, { x: box.x, y: box.y }),
    applyMatrix(matrix, { x: box.x + box.width, y: box.y }),
    applyMatrix(matrix, { x: box.x + box.width, y: box.y + box.height }),
    applyMatrix(matrix, { x: box.x, y: box.y + box.height })
  ];
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

export class VisualOnlyNode {
  constructor(options = {}) {
    this.type = options.type || "VisualOnly";
    this.id = options.id || nextId(this.type);
    this.parent = options.parent || null;
    this.localBounds = { x: 0, y: 0, width: 100, height: 40, ...options.boundsLocal };
  }

  get boundsLocal() {
    return { ...this.localBounds };
  }

  get centerPointLocal() {
    const box = this.boundsLocal;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  get topLeftLocal() {
    const box = this.boundsLocal;
    return { x: box.x, y: box.y };
  }

  get visualRoot() {
    let cursor = this;
    while (cursor.parent && cursor.parent.type !== "Page") cursor = cursor.parent;
    return cursor;
  }

  get allChildren() {
    return [];
  }

  localPointInNode(localPoint, targetNode) {
    if (targetNode.visualRoot !== this.visualRoot) {
      throw new Error("localPointInNode requires both nodes to share one visualRoot");
    }
    const toTarget = composeMatrix(invertMatrix(matrixToDocument(targetNode)), matrixToDocument(this));
    return applyMatrix(toTarget, localPoint);
  }

  hasDescendant(node) {
    for (const child of this.allChildren) {
      if (child === node || child.hasDescendant(node)) return true;
    }
    return false;
  }

  removeFromParent() {
    if (!this.parent) return;
    const list = this.parent.children;
    if (!list || list.indexOf(this) < 0) {
      throw new TypeError(`${this.type} sits in a slot that does not permit removal`);
    }
    list.remove(this);
  }
}

export class MovableNode extends VisualOnlyNode {
  constructor(options = {}) {
    super({ type: "Movable", ...options });
    this.position = { x: 0, y: 0, ...options.translation };
    this.angle = Number(options.rotation) || 0;
    this.alpha = options.opacity === undefined ? 1 : Number(options.opacity);
    this.locked = Boolean(options.locked);
  }

  get translation() {
    return { ...this.position };
  }

  set translation(point) {
    this.position = { x: Number(point.x), y: Number(point.y) };
  }

  get transformMatrix() {
    const radians = (this.angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return [cos, sin, -sin, cos, this.position.x, this.position.y];
  }

  setPositionInParent(parentPoint, localRegistrationPoint) {
    const current = applyMatrix(this.transformMatrix, localRegistrationPoint);
    this.position = {
      x: this.position.x + Number(parentPoint.x) - current.x,
      y: this.position.y + Number(parentPoint.y) - current.y
    };
  }

  get boundsInParent() {
    return boundingBoxOf(this.boundsLocal, this.transformMatrix);
  }

  boundsInNode(target) {
    if (target.visualRoot !== this.visualRoot) {
      throw new Error("boundsInNode requires both nodes to share one visualRoot");
    }
    const toTarget = composeMatrix(invertMatrix(matrixToDocument(target)), matrixToDocument(this));
    return boundingBoxOf(this.boundsLocal, toTarget);
  }

  get rotation() {
    return this.angle;
  }

  get rotationInScreen() {
    let total = 0;
    let cursor = this;
    while (cursor && typeof cursor.rotation === "number") {
      total += cursor.rotation;
      cursor = cursor.parent;
    }
    return ((total % 360) + 360) % 360;
  }

  setRotationInParent(degrees, localRotationPoint = { x: 0, y: 0 }) {
    const anchor = applyMatrix(this.transformMatrix, localRotationPoint);
    this.angle = Number(degrees) || 0;
    const moved = applyMatrix(this.transformMatrix, localRotationPoint);
    this.position = { x: this.position.x + anchor.x - moved.x, y: this.position.y + anchor.y - moved.y };
  }

  get opacity() {
    return this.alpha;
  }

  set opacity(value) {
    this.alpha = Number(value);
  }

  cloneInPlace() {
    const list = this.parent && this.parent.children;
    if (!list) throw new Error(`${this.type} is not attached to a list that accepts a sibling`);
    const copy = new this.constructor({ boundsLocal: this.boundsLocal, translation: this.translation });
    list.insertAfter(copy, this);
    return copy;
  }
}

const withRectangularSize = (Base) =>
  class extends Base {
    get width() {
      return this.localBounds.width;
    }

    set width(value) {
      this.localBounds = { ...this.localBounds, width: Number(value) };
    }

    get height() {
      return this.localBounds.height;
    }

    set height(value) {
      this.localBounds = { ...this.localBounds, height: Number(value) };
    }
  };

export class BaseOnlyNode {
  constructor(options = {}) {
    this.type = options.type || "Base";
    this.id = options.id || nextId(this.type);
    this.parent = options.parent || null;
  }

  get allChildren() {
    return [];
  }

  removeFromParent() {
    this.parent = null;
  }
}

export class PageNode extends BaseOnlyNode {
  constructor(options = {}) {
    super({ ...options, type: "Page" });
    this.artboardList = new ItemList(this);
    this.name = options.name;
    this.pageWidth = options.width === undefined ? 1080 : Number(options.width);
    this.pageHeight = options.height === undefined ? 1080 : Number(options.height);
  }

  get width() {
    return this.pageWidth;
  }

  set width(value) {
    this.pageWidth = Number(value);
  }

  get height() {
    return this.pageHeight;
  }

  set height(value) {
    this.pageHeight = Number(value);
  }

  get artboards() {
    return this.artboardList;
  }

  get allChildren() {
    return this.artboardList.toArray();
  }
}

export class ArtboardNode extends withRectangularSize(VisualOnlyNode) {
  constructor(options = {}) {
    super({ boundsLocal: { x: 0, y: 0, width: 1080, height: 1080 }, ...options, type: "ab:Artboard" });
    this.childList = new ItemList(this);
    this.fill = options.fill || { type: "Color", color: makeColor(1, 1, 1) };
  }

  get children() {
    return this.childList;
  }

  get allChildren() {
    return this.childList.toArray();
  }
}

export class GroupNode extends MovableNode {
  constructor(options = {}) {
    super({ ...options, type: "Group" });
    this.childList = new ItemList(this);
    this.maskShape = options.maskShape;
    for (const child of options.children || []) this.childList.append(child);
  }

  get children() {
    return this.childList;
  }

  get allChildren() {
    return this.childList.toArray();
  }

  get boundsLocal() {
    if (this.maskShape) return this.maskShape.boundsInParent;
    const boxes = this.childList.toArray().map((child) => child.boundsInParent);
    if (!boxes.length) return { ...this.localBounds };
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }
}

export class RectangleNode extends withRectangularSize(MovableNode) {
  constructor(options = {}) {
    super({ ...options, type: "Rectangle" });
    this.fill = options.fill || { type: "Color", color: makeColor(0.5, 0.5, 0.5) };
  }
}

export class ImageRectangleNode extends withRectangularSize(MovableNode) {
  constructor(options = {}) {
    super({ ...options, type: "ImageRectangle" });
  }

  cloneInPlace() {
    throw new Error("ImageRectangleNode.cloneInPlace always throws; clone the container instead");
  }
}

class MediaFrame extends MovableNode {
  constructor(options) {
    super(options);
    const box = { x: 0, y: 0, width: this.localBounds.width, height: this.localBounds.height };
    this.media = options.mediaRectangle || new ImageRectangleNode({ boundsLocal: box, id: `${this.id}-media` });
    this.mask = options.maskShape || new RectangleNode({ boundsLocal: box, id: `${this.id}-mask` });
    this.media.parent = this;
    this.mask.parent = this;
  }

  get mediaRectangle() {
    return this.media;
  }

  get maskShape() {
    return this.mask;
  }

  replaceMedia(bitmap) {
    this.media.bitmap = bitmap;
  }

  get allChildren() {
    return [this.media, this.mask];
  }
}

export class MediaContainerNode extends MediaFrame {
  constructor(options = {}) {
    super({ boundsLocal: { x: 0, y: 0, width: 400, height: 300 }, ...options, type: "MediaContainer" });
  }
}

export class GridCellNode extends MediaFrame {
  constructor(options = {}) {
    super({ boundsLocal: { x: 0, y: 0, width: 300, height: 300 }, ...options, type: "GridCell" });
  }

  cloneInPlace() {
    throw new Error("GridCellNode.cloneInPlace always throws; clone the grid instead");
  }
}

export class GridLayoutNode extends withRectangularSize(MovableNode) {
  constructor(options = {}) {
    super({ boundsLocal: { x: 0, y: 0, width: 900, height: 600 }, ...options, type: "GridLayout" });
    this.cells = options.cells || [];
    for (const cell of this.cells) cell.parent = this;
    this.fill = options.fill || { type: "Color", color: makeColor(1, 1, 1) };
  }

  get allChildren() {
    return this.cells.slice();
  }
}

function splitStyleRunAt(runs, offset) {
  let cursor = 0;
  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index];
    if (offset > cursor && offset < cursor + run.length) {
      const head = { ...run, length: offset - cursor };
      const tail = { ...run, length: cursor + run.length - offset };
      runs.splice(index, 1, head, tail);
      return;
    }
    cursor += run.length;
  }
}

function coversRange(runStart, runLength, range) {
  return runStart >= range.start && runStart + runLength <= range.start + range.length;
}

class TextContentModel {
  constructor(owner, text, runs) {
    this.owner = owner;
    this.id = `${owner.id}-content`;
    this.text = text;
    this.runs = runs;
    this.paragraphRuns = [{ length: text.length, lineSpacing: 1, spaceBefore: 0, spaceAfter: 0 }];
    this.calls = [];
  }

  get characterStyleRanges() {
    return this.runs.map((run) => ({ ...run }));
  }

  set characterStyleRanges(runs) {
    this.runs = runs.map((run) => ({ ...run }));
    this.owner.reflow();
  }

  get paragraphStyleRanges() {
    return this.paragraphRuns.map((run) => ({ ...run }));
  }

  applyCharacterStyles(styles, range) {
    this.calls.push({ styles, range });
    if (!range) {
      for (const run of this.runs) Object.assign(run, styles);
      this.owner.reflow();
      return;
    }
    splitStyleRunAt(this.runs, range.start);
    splitStyleRunAt(this.runs, range.start + range.length);
    let cursor = 0;
    for (const run of this.runs) {
      if (coversRange(cursor, run.length, range)) Object.assign(run, styles);
      cursor += run.length;
    }
    this.owner.reflow();
  }

  applyParagraphStyles(styles, range) {
    this.calls.push({ styles, range, paragraph: true });
    for (const run of this.paragraphRuns) Object.assign(run, styles);
  }

  hasUnavailableFonts() {
    return this.runs.some((run) => run.font && run.font.availableForEditing === false);
  }
}

export class TextNode extends MovableNode {
  constructor(options = {}) {
    const text = options.text === undefined ? "Headline" : options.text;
    const fontSize = options.fontSize || 48;
    super({
      boundsLocal: { x: 0, y: -fontSize * 0.8, width: text.length * fontSize * 0.55, height: fontSize * 1.2 },
      ...options,
      type: "Text"
    });
    const runs = options.characterStyleRanges || [
      { length: text.length, fontSize, color: makeColor(0.1, 0.1, 0.1), letterSpacing: 0, underline: false }
    ];
    this.content = new TextContentModel(this, text, runs.map((run) => ({ ...run })));
    this.layout = options.layout || { type: TextLayout.autoWidth };
    this.textAlignment = options.textAlignment || TextAlignment.left;
  }

  get fullContent() {
    return this.content;
  }

  get nextTextNode() {
    return undefined;
  }

  isStandaloneText() {
    return true;
  }

  isThreadedText() {
    return false;
  }

  reflow() {
    const runs = this.content.runs;
    const characters = runs.reduce((total, run) => total + run.length, 0) || 1;
    const weighted = runs.reduce((total, run) => total + (run.fontSize || 48) * run.length, 0) / characters;
    const tallest = Math.max(...runs.map((run) => run.fontSize || 48));
    if (this.layout.type === TextLayout.autoWidth) {
      this.localBounds = {
        x: 0,
        y: -tallest * 0.8,
        width: characters * weighted * 0.55,
        height: tallest * 1.2
      };
      return;
    }
    const lines = Math.ceil((characters * weighted * 0.55) / this.localBounds.width) || 1;
    this.localBounds = { ...this.localBounds, y: -tallest * 0.8, height: lines * tallest * 1.2 };
  }
}

function selectableNodes(value) {
  if (value === undefined || value === null) return [];
  const requested = Array.isArray(value) ? value.slice() : [value];
  return requested.filter((node) => !requested.some((other) => other !== node && other.hasDescendant(node)));
}

export function makeEditor(options = {}) {
  let selected = [];
  const context = {
    insertionParent: options.insertionParent || null,
    get selection() {
      return selected.filter((node) => !node.locked);
    },
    set selection(value) {
      selected = selectableNodes(value);
    },
    get selectionIncludingNonEditable() {
      return selected.slice();
    },
    get hasSelection() {
      return selected.some((node) => !node.locked);
    }
  };
  return {
    context,
    makeColorFill: (color) => ({ type: "Color", color }),
    createText: (text) => new TextNode({ text }),
    createRectangle: () => new RectangleNode({})
  };
}

export function makeDocument(options = {}) {
  const width = options.width || 1080;
  const height = options.height || 1080;
  const pageCount = options.pages || 1;
  const pages = [];
  for (let index = 0; index < pageCount; index += 1) {
    const page = new PageNode({ boundsLocal: { x: 0, y: 0, width, height }, name: `Page ${index + 1}` });
    page.artboards.append(new ArtboardNode({ boundsLocal: { x: 0, y: 0, width, height } }));
    pages.push(page);
  }
  const artboard = pages[0].artboards.first;
  return { pages, page: pages[0], artboard, editor: makeEditor({ insertionParent: artboard }) };
}
