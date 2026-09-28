import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { get, put } from "@vercel/blob";

const SESSION_PATH = "private/spielerplus/session.json";

type EncryptedSessionPayload = {
  version: 1;
  iv: string;
  tag: string;
  data: string;
  updatedAt: string;
};

function getEncryptionKey(): Buffer | null {
  const value = process.env.SPIELERPLUS_SESSION_KEY?.trim();
  if (!value) return null;

  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error(
      "SPIELERPLUS_SESSION_KEY muss aus genau 64 Hex-Zeichen bestehen."
    );
  }

  return Buffer.from(value, "hex");
}

function encryptCookie(cookie: string, key: Buffer): EncryptedSessionPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(cookie, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
    updatedAt: new Date().toISOString()
  };
}

function decryptCookie(payload: EncryptedSessionPayload, key: Buffer): string {
  if (payload.version !== 1) {
    throw new Error("Unbekannte SpielerPlus-Session-Version.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final()
  ]).toString("utf8");
}

export function isPersistentSpielerPlusSessionConfigured(): boolean {
  return Boolean(
    process.env.SPIELERPLUS_SESSION_KEY?.trim() &&
      (process.env.BLOB_READ_WRITE_TOKEN?.trim() ||
        (process.env.VERCEL_OIDC_TOKEN?.trim() &&
          process.env.BLOB_STORE_ID?.trim()))
  );
}

export async function loadPersistedSpielerPlusCookie(): Promise<string | null> {
  const key = getEncryptionKey();
  if (!key || !isPersistentSpielerPlusSessionConfigured()) return null;

  const result = await get(SESSION_PATH, {
    access: "private",
    useCache: false
  });

  if (!result || result.statusCode !== 200) return null;

  const text = await new Response(result.stream).text();
  const payload = JSON.parse(text) as EncryptedSessionPayload;
  const cookie = decryptCookie(payload, key).trim();

  return cookie || null;
}

export async function savePersistedSpielerPlusCookie(
  cookie: string
): Promise<void> {
  const key = getEncryptionKey();
  if (!key || !isPersistentSpielerPlusSessionConfigured()) return;

  const payload = encryptCookie(cookie.trim(), key);

  await put(SESSION_PATH, JSON.stringify(payload), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0
  });
}
