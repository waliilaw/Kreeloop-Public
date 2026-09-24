export const AA_NORMAL_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
export const LARGE_TEXT_PX = 24;
export const LARGE_BOLD_TEXT_PX = 18.66;
export const PAGE_SOURCE = "page-background";

const SRGB_LINEAR_CUTOFF = 0.03928;
const SRGB_LINEAR_DIVISOR = 12.92;
const SRGB_GAMMA_OFFSET = 0.055;
const SRGB_GAMMA_SCALE = 1.055;
const SRGB_GAMMA_EXPONENT = 2.4;
const RED_WEIGHT = 0.2126;
const GREEN_WEIGHT = 0.7152;
const BLUE_WEIGHT = 0.0722;
const CONTRAST_OFFSET = 0.05;
const GEOMETRY_EPSILON = 1e-6;

export const MEASUREMENT_REASONS = {
  unmeasurable:
    "The nearest element covering this text has no resolvable solid colour, so the pair of colours a ratio would describe does not exist. Measuring against the page instead would compare the ink to a surface the reader never sees and would return a confident, precise, wrong number.",
  "split-backdrop":
    "This text crosses the edge of the element covering it, so it sits on two different surfaces. One ratio cannot describe both, and the worse of the two is the one that matters.",
  "no-backdrop":
    "Nothing covers this text and no page colour was supplied, so there is no second colour to measure against.",
  "no-text-color":
    "This text element carries no resolvable colour, so there is no ink to measure.",
  "invisible-text":
    "This text is fully transparent, so its contrast against any backdrop describes nothing a reader can see.",
  "no-geometry":
    "This element has no finite, positive box, so what lies behind it cannot be determined.",
  "not-text":
    "WCAG contrast thresholds describe text legibility, and this element is not text.",
  "not-in-stack":
    "This element is absent from the z-ordered stack it was measured against, so its depth is unknown."
};

const read = (source, key) => {
  if (source === null || source === undefined) return undefined;
  try {
    return source[key];
  } catch {
    return undefined;
  }
};

const finiteNumber = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const unitInterval = (value) => {
  const number = finiteNumber(value);
  if (number === null) return null;
  return Math.min(1, Math.max(0, number));
};

const identify = (element) => {
  const id = read(element, "id");
  return typeof id === "string" && id.length > 0 ? id : null;
};

const typeOf = (element) => {
  const type = read(element, "type");
  return typeof type === "string" ? type.toLowerCase() : null;
};

const isTextElement = (element) => typeOf(element) === "text";

const failure = (reason, details) => ({
  ok: false,
  reason,
  explanation: MEASUREMENT_REASONS[reason],
  ...details
});

export function toColor(candidate) {
  const red = unitInterval(read(candidate, "red"));
  const green = unitInterval(read(candidate, "green"));
  const blue = unitInterval(read(candidate, "blue"));
  if (red === null || green === null || blue === null) return null;
  const alpha = unitInterval(read(candidate, "alpha"));
  return { red, green, blue, alpha: alpha === null ? 1 : alpha };
}

const opaque = (color) => ({ red: color.red, green: color.green, blue: color.blue, alpha: 1 });

const withAlpha = (color, alpha) => ({ red: color.red, green: color.green, blue: color.blue, alpha });

const linearize = (channel) =>
  channel <= SRGB_LINEAR_CUTOFF
    ? channel / SRGB_LINEAR_DIVISOR
    : ((channel + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_SCALE) ** SRGB_GAMMA_EXPONENT;

export function relativeLuminance(candidate) {
  const color = toColor(candidate);
  if (!color) return null;
  return (
    RED_WEIGHT * linearize(color.red) +
    GREEN_WEIGHT * linearize(color.green) +
    BLUE_WEIGHT * linearize(color.blue)
  );
}

export function contrastRatio(foreground, backdrop) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(backdrop);
  if (a === null || b === null) return null;
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + CONTRAST_OFFSET) / (darker + CONTRAST_OFFSET);
}

export function compositeOver(source, backdrop) {
  const top = toColor(source);
  const base = toColor(backdrop);
  if (!top || !base) return null;
  const blend = (channel) => top[channel] * top.alpha + base[channel] * (1 - top.alpha);
  return { red: blend("red"), green: blend("green"), blue: blend("blue"), alpha: 1 };
}

export function legibilityThreshold(text) {
  const fontSize = finiteNumber(read(text, "fontSize"));
  const bold = read(text, "bold") === true;
  const largeFrom = bold ? LARGE_BOLD_TEXT_PX : LARGE_TEXT_PX;
  const largeText = fontSize !== null && fontSize >= largeFrom;
  return {
    fontSize,
    bold,
    largeText,
    largeFrom,
    threshold: largeText ? AA_LARGE_TEXT : AA_NORMAL_TEXT
  };
}

const toBox = (candidate) => {
  const x = finiteNumber(read(candidate, "x"));
  const y = finiteNumber(read(candidate, "y"));
  const width = finiteNumber(read(candidate, "width"));
  const height = finiteNumber(read(candidate, "height"));
  if (x === null || y === null || width === null || height === null) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
};

const overlaps = (a, b) =>
  a.x < b.x + b.width - GEOMETRY_EPSILON &&
  b.x < a.x + a.width - GEOMETRY_EPSILON &&
  a.y < b.y + b.height - GEOMETRY_EPSILON &&
  b.y < a.y + a.height - GEOMETRY_EPSILON;

const contains = (outer, inner) =>
  outer.x <= inner.x + GEOMETRY_EPSILON &&
  outer.y <= inner.y + GEOMETRY_EPSILON &&
  outer.x + outer.width >= inner.x + inner.width - GEOMETRY_EPSILON &&
  outer.y + outer.height >= inner.y + inner.height - GEOMETRY_EPSILON;

const opacityOf = (element) => {
  const opacity = unitInterval(read(element, "opacity"));
  return opacity === null ? 1 : opacity;
};

const blockerDetails = (element, index) => ({
  blockedBy: identify(element),
  blockedByIndex: index,
  blockedByType: typeOf(element)
});

function resolveBackdropBelow(index, box, stack, pageColor) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = stack[i];
    if (isTextElement(candidate)) continue;
    const candidateBox = toBox(read(candidate, "box"));
    if (!candidateBox) continue;
    if (!overlaps(candidateBox, box)) continue;
    const opacity = opacityOf(candidate);
    if (opacity === 0) continue;
    const color = toColor(read(candidate, "color"));
    const coverage = color ? color.alpha * opacity : null;
    if (coverage === 0) continue;
    if (!contains(candidateBox, box)) return failure("split-backdrop", blockerDetails(candidate, i));
    if (!color) return failure("unmeasurable", blockerDetails(candidate, i));
    const source = identify(candidate);
    if (coverage >= 1) return { ok: true, color: opaque(color), source, layers: [source] };
    const below = resolveBackdropBelow(i, box, stack, pageColor);
    if (!below.ok) return below;
    return {
      ok: true,
      color: compositeOver(withAlpha(color, coverage), below.color),
      source,
      layers: [source, ...below.layers]
    };
  }
  const page = toColor(pageColor);
  if (!page) return failure("no-backdrop", {});
  return { ok: true, color: opaque(page), source: PAGE_SOURCE, layers: [PAGE_SOURCE] };
}

const indexInStack = (element, stack) => {
  const direct = stack.indexOf(element);
  if (direct >= 0) return direct;
  const id = identify(element);
  if (id === null) return -1;
  return stack.findIndex((candidate) => identify(candidate) === id);
};

export function resolveBackdrop(element, elements, options = {}) {
  const stack = Array.isArray(elements) ? elements : [];
  const id = identify(element);
  const index = indexInStack(element, stack);
  if (index < 0) return failure("not-in-stack", { id });
  const box = toBox(read(element, "box"));
  if (!box) return failure("no-geometry", { id });
  const resolved = resolveBackdropBelow(index, box, stack, read(options, "pageColor"));
  return resolved.ok ? resolved : { ...resolved, id };
}

export function measureTextLegibility(element, elements, options = {}) {
  const id = identify(element);
  if (!isTextElement(element)) return failure("not-text", { id });
  const inkColor = toColor(read(element, "color"));
  if (!inkColor) return failure("no-text-color", { id });
  const inkAlpha = inkColor.alpha * opacityOf(element);
  if (inkAlpha === 0) return failure("invisible-text", { id });
  const backdrop = resolveBackdrop(element, elements, options);
  if (!backdrop.ok) return backdrop;
  const foreground =
    inkAlpha >= 1 ? opaque(inkColor) : compositeOver(withAlpha(inkColor, inkAlpha), backdrop.color);
  const ratio = contrastRatio(foreground, backdrop.color);
  if (ratio === null) return failure("no-text-color", { id });
  const { threshold, largeText, largeFrom, fontSize, bold } = legibilityThreshold(element);
  return {
    ok: true,
    id,
    ratio,
    threshold,
    passes: ratio >= threshold,
    largeText,
    largeFrom,
    fontSize,
    bold,
    foreground,
    backdrop: backdrop.color,
    backdropSource: backdrop.source,
    backdropLayers: backdrop.layers
  };
}

export function measurePageLegibility(elements, options = {}) {
  const stack = Array.isArray(elements) ? elements : [];
  const results = stack
    .filter(isTextElement)
    .map((element) => measureTextLegibility(element, stack, options));
  const measured = results.filter((result) => result.ok);
  const failing = measured.filter((result) => !result.passes);
  const unmeasurable = results.filter((result) => !result.ok);
  const complete = unmeasurable.length === 0;
  return {
    measured,
    failing,
    unmeasurable,
    complete,
    claim: complete
      ? `Measured every one of the ${results.length} text elements on this page.`
      : `Measured ${measured.length} of ${results.length} text elements. The other ${unmeasurable.length} are excluded from this result entirely, so neither a pass nor a failure here describes them.`
  };
}
