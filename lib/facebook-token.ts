import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

// Distinct HKDF info labels per secret type so one ciphertext never shares a
// key derivation with another.
export const SECRET_INFOS = {
  facebookPageToken: 'facebook-page-token',
  llmProviderKey: 'llm-provider-key',
  youtubeToken: 'youtube-token',
  tiktokToken: 'tiktok-token',
} as const;

function encryptionKey(info: string): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET is required to store encrypted secrets.');
  }
  return Buffer.from(
    hkdfSync('sha256', secret, 'ph-news-workbench', info, 32)
  );
}

export function encryptSecret(secret: string, info: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(info), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);

  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptSecret(payload: string, info: string): string {
  const [version, iv, tag, ciphertext] = payload.split('.');
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error('Stored secret is not readable.');
  }

  const tagBytes = Buffer.from(tag, 'base64url');
  if (tagBytes.length !== TAG_BYTES) {
    throw new Error('Stored secret is not readable.');
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey(info),
    Buffer.from(iv, 'base64url')
  );
  decipher.setAuthTag(tagBytes);

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function encryptToken(token: string): string {
  return encryptSecret(token, SECRET_INFOS.facebookPageToken);
}

export function decryptToken(payload: string): string {
  return decryptSecret(payload, SECRET_INFOS.facebookPageToken);
}

export function encryptYouTubeSecret(token: string): string {
  return encryptSecret(token, SECRET_INFOS.youtubeToken);
}

export function decryptYouTubeSecret(payload: string): string {
  return decryptSecret(payload, SECRET_INFOS.youtubeToken);
}

export function encryptTikTokSecret(token: string): string {
  return encryptSecret(token, SECRET_INFOS.tiktokToken);
}

export function decryptTikTokSecret(payload: string): string {
  return decryptSecret(payload, SECRET_INFOS.tiktokToken);
}
