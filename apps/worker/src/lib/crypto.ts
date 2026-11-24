// AES-GCM encryption for tokens at rest in KV, keyed from SESSION_SECRET.

const enc = new TextEncoder();
const dec = new TextDecoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function getKey(secret: string): Promise<CryptoKey> {
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle
      .digest("SHA-256", enc.encode(`taa:v1:${secret}`))
      .then((raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]));
    keyCache.set(secret, k);
  }
  return k;
}

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64 = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export function assertSecret(secret: string | undefined): string {
  if (!secret || secret.length < 16) throw new Error("SESSION_SECRET must be set (>= 16 chars)");
  return secret;
}

export async function encrypt(plain: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getKey(secret), enc.encode(plain));
  return `${b64(iv)}.${b64(ct)}`;
}

export async function decrypt(token: string, secret: string): Promise<string> {
  const [iv, ct] = token.split(".");
  if (!iv || !ct) throw new Error("malformed ciphertext");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await getKey(secret), unb64(ct));
  return dec.decode(pt);
}

export function randomId(bytes = 32): string {
  return b64(crypto.getRandomValues(new Uint8Array(bytes)));
}
