import { verifyPanelAuth, verifyRecoveryToken } from "./security.js";
import { deployLatest, restartCurrentDeployment, updatePanel } from "../services/updater.js";

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
});

export async function handlePlatformRoute(request, url, env, legacy) {
  if (url.pathname === "/api/recover" && request.method === "POST") {
    if (!env.PANEL_RECOVERY_TOKEN) {
      return json({ error: "PANEL_RECOVERY_TOKEN is not configured on Railway" }, 503);
    }
    const { api_token: token } = await request.json().catch(() => ({}));
    if (!verifyRecoveryToken(token, env)) return json({ error: "Invalid recovery token" }, 401);
    await env.DB.prepare("DELETE FROM settings WHERE key = 'panel_password'").run();
    await env.DB.prepare("DELETE FROM sessions").run().catch(() => {});
    legacy.LOGIN_ATTEMPTS.clear();
    return json({ success: true });
  }

  const platformPath = ["/api/auto-update-setup", "/api/restart-core", "/api/update-panel"].includes(url.pathname);
  if (!platformPath) return null;
  if (!(await verifyPanelAuth(request, env.DB))) return json({ error: "Unauthorized" }, 401);

  if (url.pathname === "/api/auto-update-setup" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const configured = Boolean(env.RAILWAY_TOKEN || (env.GITHUB_TOKEN && env.GITHUB_REPO && env.GITHUB_WORKFLOW_ID));
    if (body.action === "check") {
      const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'auto_update'").first();
      return json({ has_token: configured, auto_update: row?.value === "1" });
    }
    if (body.action === "enable") {
      if (!configured) return json({ error: "TOKEN_MISSING" }, 400);
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_update', '1')").run();
      return json({ success: true });
    }
    if (body.action === "disable") {
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_update', '0')").run();
      return json({ success: true });
    }
    return json({ error: "Invalid action" }, 400);
  }

  if (url.pathname === "/api/restart-core" && request.method === "POST") {
    if (!env.RAILWAY_TOKEN || !env.RAILWAY_DEPLOYMENT_ID) {
      return json({ error: "Railway restart requires RAILWAY_TOKEN and RAILWAY_DEPLOYMENT_ID" }, 503);
    }
    await legacy.flushExpiredTraffic(env);
    await restartCurrentDeployment(env);
    return json({ success: true });
  }

  if (url.pathname === "/api/update-panel" && request.method === "POST") {
    if (!env.RAILWAY_TOKEN && !(env.GITHUB_TOKEN && env.GITHUB_REPO && env.GITHUB_WORKFLOW_ID)) {
      return json({ error: "Railway/GitHub update credentials are not configured" }, 503);
    }
    const result = await updatePanel(env);
    return json({ success: true, provider: result.provider });
  }

  return json({ error: "Method Not Allowed" }, 405);
}
