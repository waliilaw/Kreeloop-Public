const PAID_CONTENT_ERROR_CODE = "USER_NOT_ENTITLED_TO_PREMIUM_CONTENT";
const DATA_URL_SEPARATOR = ",";
const GATED_INTENT_NAMES = ["export", "print"];
const SIZE_AWARE_FORMATS = ["png", "jpg"];

export const DEFAULT_MAX_RENDITION_WIDTH = 1600;

export const PREVIEW_MANIFEST_REQUIREMENT = Object.freeze({ renditionPreview: true });

export const CaptureFailure = Object.freeze({
  documentUnavailable: "document-unavailable",
  constantsUnavailable: "constants-unavailable",
  formatUnsupported: "format-unsupported",
  rangeUnsupported: "range-unsupported",
  noIntentAvailable: "no-intent-available",
  paidTemplateContent: "paid-template-content",
  renditionEmpty: "rendition-empty",
  renditionFailed: "rendition-failed",
  readerUnavailable: "reader-unavailable",
  blobUnreadable: "blob-unreadable"
});

function read(source, key) {
  if (source === null || source === undefined) return undefined;
  try {
    return source[key];
  } catch {
    return undefined;
  }
}

function failure(reason) {
  return { ok: false, reason };
}

function errorText(error) {
  const described = [read(error, "message"), read(error, "code"), read(error, "name")].filter(
    (part) => typeof part === "string"
  );
  if (described.length) return described.join(" ");
  try {
    return String(error);
  } catch {
    return "";
  }
}

export function isPaidContentError(error) {
  return errorText(error).toUpperCase().includes(PAID_CONTENT_ERROR_CODE);
}

export function renditionConstants(addOnUISdk) {
  const constants = read(addOnUISdk, "constants");
  const format = read(constants, "RenditionFormat");
  const range = read(constants, "Range");
  if (!format || !range) return null;
  return { format, range, intent: read(constants, "RenditionIntent") ?? {} };
}

export async function exportIsAllowed(addOnDocument) {
  if (typeof read(addOnDocument, "exportAllowed") !== "function") return true;
  try {
    return (await addOnDocument.exportAllowed()) !== false;
  } catch {
    return true;
  }
}

export function orderedIntents(intentEnum, { exportAllowed = false, preferred = "export" } = {}) {
  const gatedName = GATED_INTENT_NAMES.includes(preferred) ? preferred : "export";
  const gated = read(intentEnum, gatedName);
  const preview = read(intentEnum, "preview");
  const order = exportAllowed ? [gated, preview] : [preview, gated];
  return order.filter((intent, index) => typeof intent === "string" && order.indexOf(intent) === index);
}

export function requestedSizeFor(pageWidth, maxWidth = DEFAULT_MAX_RENDITION_WIDTH) {
  if (!Number.isFinite(pageWidth) || !Number.isFinite(maxWidth)) return null;
  if (maxWidth <= 0 || pageWidth <= maxWidth) return null;
  return { width: Math.round(maxWidth) };
}

export function pageRenditionOptions(
  constants,
  { format = "png", range = "currentPage", pageIds, pageWidth, maxWidth = DEFAULT_MAX_RENDITION_WIDTH } = {}
) {
  const formatValue = read(read(constants, "format"), format);
  if (typeof formatValue !== "string") return failure(CaptureFailure.formatUnsupported);

  const rangeValue = read(read(constants, "range"), range);
  if (typeof rangeValue !== "string") return failure(CaptureFailure.rangeUnsupported);

  const options = { range: rangeValue, format: formatValue };
  if (range === "specificPages") {
    if (!Array.isArray(pageIds) || !pageIds.length) return failure(CaptureFailure.rangeUnsupported);
    options.pageIds = [...pageIds];
  }
  if (!SIZE_AWARE_FORMATS.includes(format)) return { ok: true, options };

  const requestedSize = requestedSizeFor(pageWidth, maxWidth);
  if (requestedSize) options.requestedSize = requestedSize;
  return { ok: true, options };
}

function withoutRequestedSize(options) {
  const relaxed = { ...options };
  delete relaxed.requestedSize;
  return relaxed;
}

async function firstRenditionBlob(addOnDocument, options, intent) {
  let renditions;
  try {
    renditions = await addOnDocument.createRenditions(options, intent);
  } catch (error) {
    return failure(isPaidContentError(error) ? CaptureFailure.paidTemplateContent : CaptureFailure.renditionFailed);
  }
  const blob = read(Array.isArray(renditions) ? renditions[0] : undefined, "blob");
  if (!blob) return failure(CaptureFailure.renditionEmpty);
  return { ok: true, blob };
}

async function renditionForIntent(addOnDocument, options, intent) {
  const sized = await firstRenditionBlob(addOnDocument, options, intent);
  if (sized.ok) return sized;
  if (!options.requestedSize) return sized;
  if (sized.reason === CaptureFailure.paidTemplateContent) return sized;
  return firstRenditionBlob(addOnDocument, withoutRequestedSize(options), intent);
}

export async function capturePageRendition({
  addOnUISdk,
  format = "png",
  range = "currentPage",
  pageIds,
  pageWidth,
  maxWidth = DEFAULT_MAX_RENDITION_WIDTH,
  preferredIntent = "export"
} = {}) {
  const addOnDocument = read(read(addOnUISdk, "app"), "document");
  if (typeof read(addOnDocument, "createRenditions") !== "function") {
    return failure(CaptureFailure.documentUnavailable);
  }

  const constants = renditionConstants(addOnUISdk);
  if (!constants) return failure(CaptureFailure.constantsUnavailable);

  const built = pageRenditionOptions(constants, { format, range, pageIds, pageWidth, maxWidth });
  if (!built.ok) return built;

  const intents = orderedIntents(constants.intent, {
    exportAllowed: await exportIsAllowed(addOnDocument),
    preferred: preferredIntent
  });
  if (!intents.length) return failure(CaptureFailure.noIntentAvailable);

  let blockedByPaidContent = false;
  let lastReason = CaptureFailure.renditionFailed;

  for (const intent of intents) {
    const attempt = await renditionForIntent(addOnDocument, built.options, intent);
    if (attempt.ok) {
      return { ok: true, blob: attempt.blob, intent, format: built.options.format };
    }
    blockedByPaidContent = blockedByPaidContent || attempt.reason === CaptureFailure.paidTemplateContent;
    lastReason = attempt.reason;
  }

  return failure(blockedByPaidContent ? CaptureFailure.paidTemplateContent : lastReason);
}

function defaultFileReader() {
  return new globalThis.FileReader();
}

function base64FromDataUrl(result) {
  if (typeof result !== "string") return failure(CaptureFailure.blobUnreadable);
  const separator = result.indexOf(DATA_URL_SEPARATOR);
  if (separator === -1) return failure(CaptureFailure.blobUnreadable);
  const base64 = result.slice(separator + 1);
  if (!base64) return failure(CaptureFailure.blobUnreadable);
  return { ok: true, base64 };
}

export function readBlobAsBase64(blob, createFileReader = defaultFileReader) {
  return new Promise((resolve) => {
    if (!blob) return resolve(failure(CaptureFailure.blobUnreadable));

    let reader;
    try {
      reader = createFileReader();
    } catch {
      return resolve(failure(CaptureFailure.readerUnavailable));
    }
    if (typeof read(reader, "readAsDataURL") !== "function") {
      return resolve(failure(CaptureFailure.readerUnavailable));
    }

    reader.onload = () => resolve(base64FromDataUrl(read(reader, "result")));
    reader.onerror = () => resolve(failure(CaptureFailure.blobUnreadable));

    try {
      reader.readAsDataURL(blob);
    } catch {
      return resolve(failure(CaptureFailure.blobUnreadable));
    }
  });
}

export async function capturePageAsBase64(options = {}) {
  const capture = await capturePageRendition(options);
  if (!capture.ok) return capture;

  const decoded = await readBlobAsBase64(capture.blob, options.createFileReader);
  if (!decoded.ok) return decoded;

  return { ok: true, base64: decoded.base64, intent: capture.intent, format: capture.format };
}
