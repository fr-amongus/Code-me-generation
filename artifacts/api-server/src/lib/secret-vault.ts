import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export class SecretVaultConfigurationError extends Error {
  constructor() {
    super("The project secret vault is not configured.");
    this.name = "SecretVaultConfigurationError";
  }
}

function getVaultKey(): Buffer {
  const encodedKey = process.env.CODE_ME_VAULT_KEY?.trim();
  if (!encodedKey) throw new SecretVaultConfigurationError();

  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32 || key.toString("base64") !== encodedKey) {
    throw new SecretVaultConfigurationError();
  }
  return key;
}

export type EncryptedSecretValue = {
  encryptedValue: string;
  iv: string;
  authTag: string;
};

export function encryptSecretValue(value: string): EncryptedSecretValue {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getVaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    encryptedValue: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecretValue(secret: EncryptedSecretValue): string {
  const decipher = createDecipheriv(ALGORITHM, getVaultKey(), Buffer.from(secret.iv, "base64"));
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(secret.encryptedValue, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
