let counter = 0;

/** Monotonic-ish id generator: PREFIX-timestamp36-counter36. Good enough for an in-memory demo. */
export function nextId(prefix) {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randFloat(min, max, decimals = 2) {
  const v = Math.random() * (max - min) + min;
  return Number(v.toFixed(decimals));
}

export function chance(p) {
  return Math.random() < p;
}

export function nowIso() {
  return new Date().toISOString();
}
