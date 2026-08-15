import { timingSafeEqual } from "node:crypto";

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function cookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export async function verifyPanelAuth(request, db) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'panel_password'").first();
  if (!row?.value) return true;
  return safeEqual(cookieValue(request, "panel_session"), row.value);
}

export function verifyRecoveryToken(input, env) {
  return Boolean(env.PANEL_RECOVERY_TOKEN) && safeEqual(input, env.PANEL_RECOVERY_TOKEN);
}

export function isSameOrigin(request, publicBaseUrl) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const expected = publicBaseUrl ? new URL(publicBaseUrl).origin : new URL(request.url).origin;
    return new URL(origin).origin === expected;
  } catch {
    return false;
  }
}
