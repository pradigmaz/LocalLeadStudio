const PUNYCODE_BASE = 36;
const PUNYCODE_TMIN = 1;
const PUNYCODE_TMAX = 26;
const PUNYCODE_SKEW = 38;
const PUNYCODE_DAMP = 700;
const PUNYCODE_INITIAL_BIAS = 72;
const PUNYCODE_INITIAL_N = 128;
const PUNYCODE_DELIMITER = "-";

const decodeDigit = (codePoint: number) => {
  if (codePoint >= 48 && codePoint <= 57) return codePoint - 22;
  if (codePoint >= 65 && codePoint <= 90) return codePoint - 65;
  if (codePoint >= 97 && codePoint <= 122) return codePoint - 97;
  return PUNYCODE_BASE;
};

const adaptBias = (delta: number, numPoints: number, firstTime: boolean) => {
  let nextDelta = firstTime ? Math.floor(delta / PUNYCODE_DAMP) : delta >> 1;
  nextDelta += Math.floor(nextDelta / numPoints);

  let k = 0;
  while (nextDelta > ((PUNYCODE_BASE - PUNYCODE_TMIN) * PUNYCODE_TMAX) >> 1) {
    nextDelta = Math.floor(nextDelta / (PUNYCODE_BASE - PUNYCODE_TMIN));
    k += PUNYCODE_BASE;
  }

  return k + Math.floor(((PUNYCODE_BASE - PUNYCODE_TMIN + 1) * nextDelta) / (nextDelta + PUNYCODE_SKEW));
};

const decodePunycodeLabel = (label: string) => {
  if (!label.toLowerCase().startsWith("xn--")) return label;

  const input = label.slice(4);
  const output: number[] = [];
  const delimiterIndex = input.lastIndexOf(PUNYCODE_DELIMITER);
  let index = 0;

  if (delimiterIndex >= 0) {
    for (let i = 0; i < delimiterIndex; i += 1) {
      output.push(input.charCodeAt(i));
    }
    index = delimiterIndex + 1;
  }

  let n = PUNYCODE_INITIAL_N;
  let i = 0;
  let bias = PUNYCODE_INITIAL_BIAS;

  while (index < input.length) {
    const oldI = i;
    let weight = 1;

    for (let k = PUNYCODE_BASE; ; k += PUNYCODE_BASE) {
      const digit = decodeDigit(input.charCodeAt(index));
      index += 1;
      i += digit * weight;

      const threshold = k <= bias
        ? PUNYCODE_TMIN
        : k >= bias + PUNYCODE_TMAX
          ? PUNYCODE_TMAX
          : k - bias;

      if (digit < threshold) break;
      weight *= PUNYCODE_BASE - threshold;
    }

    const outputLength = output.length + 1;
    bias = adaptBias(i - oldI, outputLength, oldI === 0);
    n += Math.floor(i / outputLength);
    i %= outputLength;
    output.splice(i, 0, n);
    i += 1;
  }

  return String.fromCodePoint(...output);
};

const decodePunycodeHost = (host: string) => host
  .split(".")
  .map(decodePunycodeLabel)
  .join(".");

export const formatDisplayUrl = (url: string) => {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = decodePunycodeHost(parsed.hostname.replace(/^www\./, ""));
    let path = decodeURIComponent(parsed.pathname);
    if (path.length > 18) path = `${path.substring(0, 18)}...`;
    return host + (path !== "/" ? path : "");
  } catch {
    const cleaned = url.split(/[?#]/, 1)[0];
    if (cleaned.length > 32) return `${cleaned.substring(0, 32)}...`;
    return cleaned;
  }
};
