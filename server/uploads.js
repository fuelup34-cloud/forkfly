// Photo uploads for restaurant covers and menu items.
//
// The app shrinks photos before sending them. Here we only accept real JPEG, PNG or WebP files
// (checked by their first bytes, not their name), give them random names, and serve them back
// with headers that stop browsers treating them as anything but images.

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { db, schema } from './db/index.js';
import { HttpError, json, readRaw } from './http.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(HERE, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_BYTES = 5 * 1024 * 1024;
const NAME = /^[a-f0-9]{32}\.(jpg|png|webp)$/;
const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// An uploaded photo's path, as stored in the database.
export const UPLOAD_URL = /^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/;

function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// At most 60 uploads an hour per person, so nobody can fill the disk.
const recent = new Map(); // user id -> timestamps
function allow(userId) {
  const hourAgo = Date.now() - 3_600_000;
  const list = (recent.get(userId) ?? []).filter((t) => t > hourAgo);
  if (list.length >= 60) return false;
  list.push(Date.now());
  recent.set(userId, list);
  return true;
}

export async function handleUpload(req, res, user) {
  const [member] = await db.select({ id: schema.restaurantMember.restaurantId }).from(schema.restaurantMember).where(eq(schema.restaurantMember.userId, user.id)).limit(1);
  if (!member && user.role !== 'admin') throw new HttpError(403, 'Only restaurant teams can upload photos.');
  if (!allow(user.id)) throw new HttpError(429, 'That’s a lot of photos. Please wait a bit and try again.');
  const buf = await readRaw(req, MAX_BYTES);
  const ext = sniff(buf);
  if (!ext) throw new HttpError(415, 'Please choose a JPEG, PNG or WebP photo.');
  const name = `${randomBytes(16).toString('hex')}.${ext}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), buf, { flag: 'wx', mode: 0o644 });
  json(res, 201, { url: `/uploads/${name}` });
}

export function serveUpload(res, name) {
  if (!NAME.test(name)) return res.writeHead(404).end();
  const file = path.join(UPLOAD_DIR, name);
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404).end();
    res
      .writeHead(200, {
        'Content-Type': TYPES[name.split('.').pop()],
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
      })
      .end(data);
  });
}
