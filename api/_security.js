export class ValidationError extends Error {
  constructor(message = "Invalid request.") {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roomCodePattern = /^[A-Z0-9]{4,12}$/;
const mojibakePattern = new RegExp([
  "\\u00c3",
  "\\u00c2",
  "\\u00e2\\u20ac",
  "\\u00e2\\u201e\\u00a2",
  "\\u00e2\\u20ac\\u0153",
  "\\u00e2\\u20ac\\u009d",
].join("|"));
const controlPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function requireRecord(value, field = "body") {
  if (!isRecord(value)) throw new ValidationError(`${field} must be an object.`);
  return value;
}

export function unicodeLength(value) {
  return Array.from(String(value || "")).length;
}

export function cleanText(value, options = {}) {
  const {
    field = "value",
    max = 255,
    min = 0,
    required = false,
    allowNewlines = false,
    fallback = "",
  } = options;
  if (value === undefined || value === null || value === "") {
    if (required) throw new ValidationError(`${field} is required.`);
    return fallback;
  }
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    throw new ValidationError(`${field} must be text.`);
  }
  let text = String(value).normalize("NFC").replace(controlPattern, "").trim();
  if (!allowNewlines) text = text.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ");
  if (required && !text) throw new ValidationError(`${field} is required.`);
  const length = unicodeLength(text);
  if (length < min) throw new ValidationError(`${field} is too short.`);
  if (length > max) throw new ValidationError(`${field} is too long.`);
  return text;
}

export function cleanEnum(value, allowed, options = {}) {
  const { field = "value", required = false, fallback } = options;
  if (value === undefined || value === null || value === "") {
    if (required) throw new ValidationError(`${field} is required.`);
    return fallback;
  }
  const text = String(value);
  if (!allowed.includes(text)) throw new ValidationError(`${field} is not supported.`);
  return text;
}

export function cleanBoolean(value, options = {}) {
  const { field = "value", fallback = false } = options;
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ValidationError(`${field} must be true or false.`);
}

export function cleanInteger(value, options = {}) {
  const { field = "value", min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, required = false, fallback = null } = options;
  if (value === undefined || value === null || value === "") {
    if (required) throw new ValidationError(`${field} is required.`);
    return fallback;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ValidationError(`${field} is out of range.`);
  }
  return number;
}

export function requireUuid(value, field = "id") {
  const text = cleanText(value, { field, max: 64, required: true });
  if (!uuidPattern.test(text)) throw new ValidationError(`${field} is invalid.`);
  return text;
}

export function optionalUuid(value, field = "id") {
  if (!value) return "";
  return requireUuid(value, field);
}

export function cleanUuidArray(value, options = {}) {
  const { field = "ids", max = 100 } = options;
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be a list.`);
  if (value.length > max) throw new ValidationError(`${field} has too many items.`);
  return value.map((item, index) => requireUuid(item, `${field}[${index}]`));
}

export function cleanRoomCode(value, field = "roomCode") {
  const text = cleanText(value, { field, max: 12, required: true }).toUpperCase();
  if (!roomCodePattern.test(text)) throw new ValidationError(`${field} is invalid.`);
  return text;
}

export function cleanUrl(value, options = {}) {
  const { field = "url", max = 2048, required = false } = options;
  const text = cleanText(value, { field, max, required, fallback: "" });
  if (!text) return "";
  if (text.startsWith("/")) return text;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new ValidationError(`${field} is invalid.`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new ValidationError(`${field} is not allowed.`);
  return parsed.toString();
}

export function cleanJsonObject(value, options = {}, depth = 0) {
  const { field = "value", maxDepth = 3, maxKeys = 40 } = options;
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) throw new ValidationError(`${field} must be an object.`);
  if (depth > maxDepth) throw new ValidationError(`${field} is too deeply nested.`);
  const entries = Object.entries(value);
  if (entries.length > maxKeys) throw new ValidationError(`${field} has too many fields.`);
  const output = {};
  for (const [key, child] of entries) {
    const cleanKey = cleanText(key, { field: `${field} key`, max: 80, required: true });
    if (isRecord(child)) output[cleanKey] = cleanJsonObject(child, options, depth + 1);
    else if (Array.isArray(child)) output[cleanKey] = child.slice(0, 40).map((item) => {
      if (isRecord(item)) return cleanJsonObject(item, options, depth + 1);
      if (typeof item === "string") return cleanText(item, { field, max: 500, allowNewlines: true });
      if (typeof item === "number" || typeof item === "boolean" || item === null) return item;
      throw new ValidationError(`${field} contains an unsupported value.`);
    });
    else if (typeof child === "string") output[cleanKey] = cleanText(child, { field, max: 500, allowNewlines: true });
    else if (typeof child === "number" || typeof child === "boolean" || child === null) output[cleanKey] = child;
    else throw new ValidationError(`${field} contains an unsupported value.`);
  }
  return output;
}

export function hasEncodingArtifacts(value) {
  return mojibakePattern.test(String(value || ""));
}

export function safeApiError(error, fallback = "Request failed.") {
  if (error instanceof ValidationError) return error.message;
  if (error && typeof error === "object" && Number(error.statusCode) >= 400 && Number(error.statusCode) < 500) {
    return error.message || fallback;
  }
  return fallback;
}
