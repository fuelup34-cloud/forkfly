// Small helpers for plain Node HTTP.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(data));
}

// The whole request body as bytes, refusing anything over `limit`.
export function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (declared > limit) {
      reject(new HttpError(413, 'That file is too large.'));
      req.resume();
      return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'That file is too large.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readBody(req) {
  const raw = await readRaw(req, 16 * 1024).catch((err) => {
    throw err.status === 413 ? new HttpError(413, 'Request too large.') : err;
  });
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}

// Trimmed single-line text with no control characters, or an error naming the field.
export function cleanText(value, { min = 0, max, label, multiline = false }) {
  if (value == null) value = '';
  if (typeof value !== 'string') throw new HttpError(400, `${label} must be text.`);
  let s = value.replace(multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, ' ');
  s = multiline ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : s.replace(/\s+/g, ' ').trim();
  if (s.length < min) throw new HttpError(400, min === 1 ? `Add a ${label.toLowerCase()}.` : `${label} must be at least ${min} characters.`);
  if (s.length > max) throw new HttpError(400, `${label} must be ${max} characters or fewer.`);
  return s;
}

export function intIn(value, { min, max, label }) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${label} must be between ${min} and ${max}.`);
  return n;
}
