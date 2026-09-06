import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const SALT_BYTES = 16;
const KEY_LENGTH = 64;
const SCRYPT_N = 131_072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;
const HASH_PREFIX = 'scrypt';

const SCRYPT_OPTIONS = {
  N: SCRYPT_N,
  r: SCRYPT_R,
  p: SCRYPT_P,
  maxmem: SCRYPT_MAXMEM,
} satisfies ScryptOptions;

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

export class PasswordValidationError extends Error {
  readonly code = 'invalid_password';

  constructor(message: string) {
    super(message);
    this.name = 'PasswordValidationError';
  }
}

export function validatePassword(password: string): string {
  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new PasswordValidationError(
      'Password must be between 12 and 128 characters',
    );
  }

  return password;
}

export async function hashPassword(password: string): Promise<string> {
  const validated = validatePassword(password);
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(
    validated,
    salt,
    KEY_LENGTH,
    SCRYPT_OPTIONS,
  );

  return [
    HASH_PREFIX,
    `n=${SCRYPT_N}`,
    `r=${SCRYPT_R}`,
    `p=${SCRYPT_P}`,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const parsed = parseEncodedHash(encodedHash);
  if (parsed === null) {
    return false;
  }

  try {
    const derived = await scryptAsync(password, parsed.salt, KEY_LENGTH, {
      N: parsed.n,
      r: parsed.r,
      p: parsed.p,
      maxmem: SCRYPT_MAXMEM,
    });

    if (derived.length !== parsed.hash.length) {
      return false;
    }

    return timingSafeEqual(derived, parsed.hash);
  } catch {
    return false;
  }
}

type ParsedHash = {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
};

function parseEncodedHash(encodedHash: string): ParsedHash | null {
  const parts = encodedHash.split('$');
  if (parts.length !== 6) {
    return null;
  }

  const [algorithm, nPart, rPart, pPart, saltPart, hashPart] = parts;
  if (
    algorithm !== HASH_PREFIX ||
    nPart === undefined ||
    rPart === undefined ||
    pPart === undefined ||
    saltPart === undefined ||
    hashPart === undefined ||
    !nPart.startsWith('n=') ||
    !rPart.startsWith('r=') ||
    !pPart.startsWith('p=')
  ) {
    return null;
  }

  const n = Number.parseInt(nPart.slice(2), 10);
  const r = Number.parseInt(rPart.slice(2), 10);
  const p = Number.parseInt(pPart.slice(2), 10);

  if (
    !Number.isInteger(n) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    n !== SCRYPT_N ||
    r !== SCRYPT_R ||
    p !== SCRYPT_P ||
    saltPart.length === 0 ||
    hashPart.length === 0
  ) {
    return null;
  }

  try {
    const salt = Buffer.from(saltPart, 'base64url');
    const hash = Buffer.from(hashPart, 'base64url');
    if (salt.length !== SALT_BYTES || hash.length !== KEY_LENGTH) {
      return null;
    }
    return { n, r, p, salt, hash };
  } catch {
    return null;
  }
}

/** Precomputed valid hash used to equalize timing when a user is missing. */
export const DUMMY_PASSWORD_HASH =
  'scrypt$n=131072$r=8$p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
