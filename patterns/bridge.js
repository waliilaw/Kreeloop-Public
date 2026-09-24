const MAX_TRANSFER_DEPTH = 16;
const ANONYMOUS_METHOD = "anonymous";
const TRANSFERABLE_PRIMITIVES = new Set(["string", "number", "boolean", "bigint", "undefined"]);

export const GUARD_FAILURE_REASON = "guardFailed";

export const TRANSFER_REFUSAL = Object.freeze({
  FUNCTION: "function",
  SYMBOL: "symbol",
  CLASS_INSTANCE: "classInstance",
  CIRCULAR: "circular",
  TOO_DEEP: "tooDeep"
});

function prototypeOf(value) {
  try {
    return Object.getPrototypeOf(value);
  } catch {
    return undefined;
  }
}

function enumerableKeysOf(value) {
  try {
    return Object.keys(value);
  } catch {
    return [];
  }
}

function allPropertyNamesOf(value) {
  try {
    return Object.getOwnPropertyNames(value);
  } catch {
    return [];
  }
}

function readProperty(source, key) {
  try {
    return source[key];
  } catch {
    return undefined;
  }
}

function isPlainObject(value) {
  const proto = prototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isThenable(value) {
  if (!value) return false;
  const kind = typeof value;
  if (kind !== "object" && kind !== "function") return false;
  return typeof readProperty(value, "then") === "function";
}

function copy(value, depth, open) {
  if (value === null) return null;

  const kind = typeof value;
  if (TRANSFERABLE_PRIMITIVES.has(kind)) return value;
  if (kind !== "object") return undefined;
  if (depth > MAX_TRANSFER_DEPTH) return undefined;
  if (open.has(value)) return undefined;

  open.add(value);
  const copied = Array.isArray(value) ? copyArray(value, depth, open) : copyPlainObject(value, depth, open);
  open.delete(value);
  return copied;
}

function copyArray(value, depth, open) {
  return value.map((item) => {
    const copied = copy(item, depth + 1, open);
    return copied === undefined && item !== undefined ? null : copied;
  });
}

function copyPlainObject(value, depth, open) {
  if (!isPlainObject(value)) return undefined;

  const out = {};
  for (const key of enumerableKeysOf(value)) {
    const original = readProperty(value, key);
    const copied = copy(original, depth + 1, open);
    if (copied !== undefined || original === undefined) out[key] = copied;
  }
  return out;
}

export function toTransferable(value) {
  return copy(value, 0, new Set());
}

function inspect(value, path, depth, open) {
  if (value === null) return null;

  const kind = typeof value;
  if (kind === "function") return { path, reason: TRANSFER_REFUSAL.FUNCTION };
  if (kind === "symbol") return { path, reason: TRANSFER_REFUSAL.SYMBOL };
  if (TRANSFERABLE_PRIMITIVES.has(kind)) return null;
  if (open.has(value)) return { path, reason: TRANSFER_REFUSAL.CIRCULAR };
  if (depth > MAX_TRANSFER_DEPTH) return { path, reason: TRANSFER_REFUSAL.TOO_DEEP };

  open.add(value);
  const found = Array.isArray(value)
    ? inspectArray(value, path, depth, open)
    : inspectObject(value, path, depth, open);
  open.delete(value);
  return found;
}

function inspectArray(value, path, depth, open) {
  for (let index = 0; index < value.length; index += 1) {
    const found = inspect(readProperty(value, index), `${path}[${index}]`, depth + 1, open);
    if (found) return found;
  }
  return null;
}

function inspectObject(value, path, depth, open) {
  if (!isPlainObject(value)) return { path, reason: TRANSFER_REFUSAL.CLASS_INSTANCE };

  for (const key of enumerableKeysOf(value)) {
    const found = inspect(readProperty(value, key), `${path}.${key}`, depth + 1, open);
    if (found) return found;
  }
  return null;
}

export function findUntransferable(value, rootPath = "value") {
  return inspect(value, rootPath, 0, new Set());
}

export function assertTransferable(value, label = "value") {
  const found = findUntransferable(value, label);
  if (!found) return value;
  throw new TypeError(`${found.path} cannot cross the add-on runtime bridge: ${found.reason}`);
}

function callFallback(fallback, name, error) {
  if (typeof fallback !== "function") return fallback;
  try {
    return fallback(name, error);
  } catch {
    return undefined;
  }
}

export function guardMethod(fn, options = {}) {
  const settings = options ?? {};
  const declaredName = typeof settings.name === "string" && settings.name.length > 0 ? settings.name : fn.name;
  const name = declaredName || ANONYMOUS_METHOD;
  const onFailure = typeof settings.onFailure === "function" ? settings.onFailure : null;

  const fail = (error) => {
    if (onFailure) {
      try {
        onFailure(name, error);
      } catch {}
    }
    const substitute = toTransferable(callFallback(settings.fallback, name, error));
    if (substitute !== undefined) return substitute;
    return { ok: false, reason: GUARD_FAILURE_REASON, method: name };
  };

  const copyOrFail = (value) => {
    try {
      return toTransferable(value);
    } catch (error) {
      return fail(error);
    }
  };

  return function guarded(...args) {
    let produced;
    try {
      produced = fn.apply(this, args);
    } catch (error) {
      return fail(error);
    }
    if (isThenable(produced)) return Promise.resolve(produced).then(copyOrFail, fail);
    return copyOrFail(produced);
  };
}

function apiMemberNames(api) {
  const names = new Set(enumerableKeysOf(api));

  let level = prototypeOf(api);
  while (level && level !== Object.prototype) {
    for (const key of allPropertyNamesOf(level)) names.add(key);
    level = prototypeOf(level);
  }

  names.delete("constructor");
  return [...names];
}

export function guardApi(api, options = {}) {
  if (!api || typeof api !== "object") return {};

  const settings = options ?? {};
  const fallbacks = settings.fallbacks ?? {};
  const onFailure = typeof settings.onFailure === "function" ? settings.onFailure : null;

  const guarded = {};
  for (const name of apiMemberNames(api)) {
    const member = readProperty(api, name);
    if (typeof member !== "function") {
      guarded[name] = member;
      continue;
    }
    guarded[name] = guardMethod(member.bind(api), {
      name,
      onFailure,
      fallback: name in fallbacks ? fallbacks[name] : settings.fallback
    });
  }
  return guarded;
}
