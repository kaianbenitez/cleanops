import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function encryptionKey(): Buffer {
  const value = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!value) throw new Error("Settings encryption is not configured");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("Settings encryption is not configured");
  return key;
}

/** Encrypts a settings secret as base64(iv + ciphertext + GCM auth tag). */
export function encryptSettingSecret(value: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]).toString("base64");
}

/** Returns null for an unavailable key or invalid/stale ciphertext. */
export function decryptSettingSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const packed = Buffer.from(value, "base64");
    if (packed.length <= IV_BYTES + TAG_BYTES) return null;
    const iv = packed.subarray(0, IV_BYTES);
    const tag = packed.subarray(packed.length - TAG_BYTES);
    const ciphertext = packed.subarray(IV_BYTES, packed.length - TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
