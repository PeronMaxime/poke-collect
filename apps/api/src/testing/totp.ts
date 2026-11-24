import { createHmac } from 'node:crypto';

/**
 * Codes de l'application d'authentification, pour les tests : ce que calcule le téléphone d'un
 * administrateur à partir du lien `otpauth://` montré à l'enrôlement (RFC 6238 : SHA-1, 6
 * chiffres, 30 s). Les tests suivent ainsi le vrai parcours du second facteur.
 */

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(text: string): Buffer {
  let bits = '';
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const value = BASE32.indexOf(char);
    if (value < 0) throw new Error(`Caractère base32 invalide : ${char}`);
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => parseInt(byte, 2)));
}

/** Code à 6 chiffres valable à `at` pour le lien `otpauth://totp/…?secret=…` d'un enrôlement. */
export function totpCode(totpURI: string, at: number = Date.now()): string {
  const secret = new URL(totpURI).searchParams.get('secret');
  if (!secret) throw new Error(`Lien TOTP sans secret : ${totpURI}`);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, '0');
}
