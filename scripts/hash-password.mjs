// npm run hash-password -- 'пароль'  →  строка для секрета AUTH_PASS_HASH
import { webcrypto as crypto } from "node:crypto";

const pass = process.argv[2];
if (!pass) {
  console.error("usage: npm run hash-password -- 'password'");
  process.exit(1);
}
const iterations = 100_000; // потолок PBKDF2 в workerd
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
const b64 = (u8) => Buffer.from(u8).toString("base64");
console.log(`pbkdf2$${iterations}$${b64(salt)}$${b64(new Uint8Array(bits))}`);
