import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

// Один пользователь: логин и PBKDF2-хеш пароля лежат в секретах,
// сессия — подписанная HMAC кука `exp.signature` на 30 дней.

const COOKIE = "tl_session";
const TTL_S = 60 * 60 * 24 * 30;
const MAX_FAILURES = 8;
const FAILURE_WINDOW_S = 15 * 60;

const enc = new TextEncoder();

const toB64Url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function equal(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sign(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return toB64Url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

async function verifyPassword(pass: string, stored: string) {
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromB64(salt), iterations: Number(iter) },
    key,
    256,
  );
  return equal(new Uint8Array(bits), fromB64(hash));
}

async function isValidSession(env: Env, token: string | undefined) {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return equal(enc.encode(sig), enc.encode(await sign(env.SESSION_SECRET, exp)));
}

export async function login(c: Context<{ Bindings: Env }>) {
  const env = c.env;
  const ip = c.req.header("cf-connecting-ip") ?? "local";
  const now = Math.floor(Date.now() / 1000);

  const { n } = (await env.DB.prepare("SELECT COUNT(*) AS n FROM login_failures WHERE ip = ? AND ts > ?")
    .bind(ip, now - FAILURE_WINDOW_S)
    .first<{ n: number }>()) ?? { n: 0 };
  if (n >= MAX_FAILURES) return c.json({ error: "Слишком много попыток, подожди 15 минут" }, 429);

  const body = await c.req.json<{ user?: string; pass?: string }>().catch(() => ({}) as { user?: string; pass?: string });
  const userOk = equal(enc.encode((body.user ?? "").trim().toLowerCase()), enc.encode(env.AUTH_USER.toLowerCase()));
  const passOk = await verifyPassword(body.pass ?? "", env.AUTH_PASS_HASH);

  if (!userOk || !passOk) {
    await env.DB.prepare("INSERT INTO login_failures (ip, ts) VALUES (?, ?)").bind(ip, now).run();
    return c.json({ error: "Неверный логин или пароль" }, 401);
  }

  await env.DB.prepare("DELETE FROM login_failures WHERE ip = ? OR ts < ?").bind(ip, now - FAILURE_WINDOW_S).run();
  const exp = String(now + TTL_S);
  setCookie(c, COOKIE, `${exp}.${await sign(env.SESSION_SECRET, exp)}`, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: TTL_S,
  });
  return c.json({ user: env.AUTH_USER });
}

export function logout(c: Context) {
  deleteCookie(c, COOKIE, { path: "/" });
  return c.json({ ok: true });
}

export const requireAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (!(await isValidSession(c.env, getCookie(c, COOKIE)))) return c.json({ error: "unauthorized" }, 401);
  await next();
};
