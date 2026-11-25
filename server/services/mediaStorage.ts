import crypto from 'crypto';
import { AttachmentBuilder } from 'discord.js';
import { eq } from 'drizzle-orm';
import net from 'net';
import path from 'path';
import { getDatabaseHealth, getDb } from '../db/client.ts';
import { mediaAssets } from '../db/schema.ts';

const ALLOWED_DISCORD_CDN_HOSTS = new Set([
  'cdn.discordapp.com',
  'media.discordapp.net',
  'attachments.discordapp.net',
]);

const ALLOWED_MIME_TYPES = new Map<string, string>([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['video/quicktime', '.mov'],
]);

const EXTENSION_TO_MIME = new Map<string, string>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.mov', 'video/quicktime'],
]);

const MAX_DB_MEDIA_BYTES = 8 * 1024 * 1024;
const MAX_STORAGE_MEDIA_BYTES = 15 * 1024 * 1024;

function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !host ||
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    return true;
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const parts = host.split('.').map((n) => Number.parseInt(n, 10));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (ipVersion === 6) {
    const normalized = host.toLowerCase();
    if (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80') ||
      normalized.startsWith('::ffff:127.') ||
      normalized.startsWith('::ffff:10.') ||
      normalized.startsWith('::ffff:192.168.') ||
      normalized.startsWith('::ffff:169.254.')
    ) {
      return true;
    }
    return false;
  }

  return false;
}

export function validateExternalMediaUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) throw new Error('Please provide a valid URL.');
  if (trimmed.length > 1500) {
    throw new Error('Media URL is too long.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid URL format. Please enter a full http:// or https:// link.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only http:// and https:// URLs are allowed.');
  }

  if (isPrivateOrLocalHostname(parsed.hostname)) {
    throw new Error('Local or private network URLs are not permitted.');
  }

  return parsed.toString();
}

export function sanitizeFilename(name: string, fallbackExt = '.png'): string {
  const base = path.basename(name || `upload${fallbackExt}`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const trimmed = base.slice(0, 120) || `upload${fallbackExt}`;
  return trimmed;
}

export function isAllowedMediaAttachment(filename: string, contentType?: string | null): {
  allowed: boolean;
  mimeType: string;
  ext: string;
} {
  const cleanType = (contentType || '').split(';')[0].trim().toLowerCase();
  if (cleanType && ALLOWED_MIME_TYPES.has(cleanType)) {
    return {
      allowed: true,
      mimeType: cleanType,
      ext: ALLOWED_MIME_TYPES.get(cleanType) || '.bin',
    };
  }
  const ext = path.extname(filename || '').toLowerCase();
  const inferredMime = EXTENSION_TO_MIME.get(ext);
  if (inferredMime) {
    return {
      allowed: true,
      mimeType: inferredMime,
      ext,
    };
  }
  return { allowed: false, mimeType: cleanType || 'application/octet-stream', ext: ext || '.bin' };
}

async function tryUploadToSupabaseStorage(
  assetId: string,
  filename: string,
  mimeType: string,
  buffer: Buffer
): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) return null;

  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol !== 'https:' || isPrivateOrLocalHostname(parsed.hostname)) {
      return null;
    }
  } catch {
    return null;
  }

  const bucket = 'tlc-media';
  const objectPath = `tickets/${assetId}_${sanitizeFilename(filename)}`;

  try {
    // Attempt direct upload first
    let uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': mimeType,
        'x-upsert': 'true',
      },
      body: new Uint8Array(buffer),
      signal: AbortSignal.timeout(15000),
    });

    if (uploadRes.status === 404 || uploadRes.status === 400) {
      // Ensure bucket exists if not yet created
      await fetch(`${supabaseUrl}/storage/v1/bucket`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: bucket, name: bucket, public: true }),
        signal: AbortSignal.timeout(10000),
      }).catch(() => {});

      uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': mimeType,
          'x-upsert': 'true',
        },
        body: new Uint8Array(buffer),
        signal: AbortSignal.timeout(15000),
      });
    }

    if (!uploadRes.ok) {
      return null;
    }

    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
  } catch {
    return null;
  }
}

export interface PersistedMediaResult {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  storageUrl: string | null;
  isImage: boolean;
}

export async function persistDiscordAttachment(input: {
  url: string;
  filename: string;
  contentType?: string | null;
  size?: number;
  ownerDiscordId: string;
  ticketId?: string | null;
  kind: 'avatar' | 'team_logo' | 'evidence' | 'transcript_attachment';
}): Promise<PersistedMediaResult> {
  if (!getDatabaseHealth().connected) {
    throw new Error('Database connection is required to persist uploaded media.');
  }

  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    throw new Error('Invalid attachment URL.');
  }

  if (parsed.protocol !== 'https:' || !ALLOWED_DISCORD_CDN_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error('Attachments must originate from official Discord media CDN.');
  }

  const check = isAllowedMediaAttachment(input.filename, input.contentType);
  if (!check.allowed) {
    throw new Error(
      'Unsupported file format. Allowed formats: PNG, JPG, JPEG, WEBP, GIF, MP4, WEBM, MOV.'
    );
  }

  const hasSupabaseStorage = Boolean(
    process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
  const maxBytes = hasSupabaseStorage ? MAX_STORAGE_MEDIA_BYTES : MAX_DB_MEDIA_BYTES;
  if (input.size && input.size > maxBytes) {
    throw new Error(
      `File size exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB persistent storage limit.`
    );
  }

  const response = await fetch(parsed.toString(), {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Unable to download uploaded Discord file (HTTP ${response.status}).`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.byteLength === 0) {
    throw new Error('Uploaded file appears to be empty.');
  }
  if (buffer.byteLength > maxBytes) {
    throw new Error(
      `File size exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB persistent storage limit.`
    );
  }

  const id = `med-${crypto.randomUUID().slice(0, 12)}`;
  const cleanName = sanitizeFilename(input.filename, check.ext);
  const storageUrl = await tryUploadToSupabaseStorage(id, cleanName, check.mimeType, buffer);
  const dataBase64 =
    !storageUrl || buffer.byteLength <= MAX_DB_MEDIA_BYTES ? buffer.toString('base64') : null;

  const db = getDb();
  await db.insert(mediaAssets).values({
    id,
    ticketId: input.ticketId ?? null,
    ownerDiscordId: input.ownerDiscordId,
    kind: input.kind,
    filename: cleanName,
    mimeType: check.mimeType,
    byteSize: buffer.byteLength,
    dataBase64,
    storageUrl,
    sourceUrl: parsed.toString(),
    createdAt: new Date().toISOString(),
  });

  return {
    id,
    filename: cleanName,
    mimeType: check.mimeType,
    byteSize: buffer.byteLength,
    storageUrl,
    isImage: check.mimeType.startsWith('image/'),
  };
}

export async function linkMediaAssetToTicket(mediaId: string, ticketId: string): Promise<void> {
  if (!mediaId || !ticketId || !getDatabaseHealth().connected) return;
  try {
    const db = getDb();
    await db.update(mediaAssets).set({ ticketId }).where(eq(mediaAssets.id, mediaId));
  } catch {
    // Non-fatal
  }
}

export async function getMediaAssetById(mediaId: string): Promise<{
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  storageUrl: string | null;
  buffer: Buffer | null;
} | null> {
  if (!mediaId || !getDatabaseHealth().connected) return null;
  const db = getDb();
  const rows = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaId)).limit(1);
  const row = rows[0];
  if (!row) return null;

  let buffer: Buffer | null = null;
  if (row.dataBase64) {
    buffer = Buffer.from(row.dataBase64, 'base64');
  } else if (row.storageUrl) {
    try {
      const resp = await fetch(row.storageUrl, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        buffer = Buffer.from(await resp.arrayBuffer());
      }
    } catch {
      buffer = null;
    }
  }

  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    storageUrl: row.storageUrl ?? null,
    buffer,
  };
}

export async function buildDiscordAttachmentFromMediaId(
  mediaId: string,
  customName?: string
): Promise<{ attachment: AttachmentBuilder; attachmentUrl: string; filename: string; isImage: boolean } | null> {
  const asset = await getMediaAssetById(mediaId);
  if (!asset || !asset.buffer) return null;
  const filename = sanitizeFilename(customName || `${asset.id}_${asset.filename}`);
  const attachment = new AttachmentBuilder(asset.buffer, { name: filename });
  return {
    attachment,
    attachmentUrl: `attachment://${filename}`,
    filename,
    isImage: asset.mimeType.startsWith('image/'),
  };
}

export function buildPublicMediaUrl(mediaId: string): string | null {
  const appUrl = process.env.APP_URL?.trim().replace(/\/+$/, '');
  if (!appUrl || appUrl === 'MY_APP_URL') return null;
  try {
    const parsed = new URL(appUrl);
    if (isPrivateOrLocalHostname(parsed.hostname)) return null;
    return `${parsed.origin}/api/media/${encodeURIComponent(mediaId)}`;
  } catch {
    return null;
  }
}
