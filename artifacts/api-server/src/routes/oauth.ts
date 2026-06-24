/**
 * AfuChat OAuth 2.0 / OpenID Connect Provider
 *
 * Endpoints (all under /api prefix):
 *   GET  /oauth/authorize   — consent + login page
 *   POST /oauth/authorize   — process consent / login form
 *   POST /oauth/token       — exchange code for tokens (or refresh)
 *   GET  /oauth/userinfo    — OIDC user-info endpoint
 *   GET  /oauth/apps        — list developer's registered apps
 *   POST /oauth/apps        — register a new OAuth app
 *   PUT  /oauth/apps/:id    — update an app
 *   DELETE /oauth/apps/:id  — delete / revoke an app
 *   GET  /oauth/developer   — developer portal HTML page
 *   GET  /oauth/revoke-access — user-facing "revoke app" endpoint
 */

import crypto from "crypto";
import { Router, type Request, type Response } from "express";
import { getAdminClient } from "../lib/supabase-admin";
import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_DOMAIN, APP_ORIGIN, API_ORIGIN } from "../lib/constants";
import { setOAuthSession, getOAuthSession, clearOAuthSession } from "../lib/oauth-session";

const router = Router();

const SCOPE_DESCRIPTIONS: Record<string, { label: string; icon: string }> = {
  openid:  { label: "Verify your identity with AfuChat",        icon: "🔑" },
  profile: { label: "Read your display name, handle, and avatar", icon: "👤" },
  email:   { label: "Read your email address",                   icon: "📧" },
  phone:   { label: "Read your phone number",                    icon: "📱" },
  offline_access: { label: "Stay connected (refresh tokens)",    icon: "🔄" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

function sha256b64url(s: string): string {
  return crypto.createHash("sha256").update(s).digest("base64url");
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function oauthError(res: Response, redirectUri: string | null, state: string | null, code: string, desc: string): void {
  if (redirectUri) {
    const u = new URL(redirectUri);
    u.searchParams.set("error", code);
    u.searchParams.set("error_description", desc);
    if (state) u.searchParams.set("state", state);
    res.redirect(u.toString());
  } else {
    res.status(400).json({ error: code, error_description: desc });
  }
}

// ── Consent page HTML ──────────────────────────────────────────────────────────
function renderConsentPage(opts: {
  clientName: string;
  clientLogo: string | null;
  clientWebsite: string | null;
  scopes: string[];
  params: Record<string, string>;
  session: { uid: string; handle: string; display_name: string; avatar_url: string | null } | null;
  error?: string;
}): string {
  const { clientName, clientLogo, scopes, params, session, error } = opts;

  const scopeItems = scopes.map(s => {
    const d = SCOPE_DESCRIPTIONS[s] || { label: s, icon: "🔹" };
    return `<div class="scope-item"><span class="scope-icon">${d.icon}</span><span>${esc(d.label)}</span></div>`;
  }).join("");

  const hiddenParams = Object.entries(params)
    .filter(([k]) => !["identifier","password","action"].includes(k))
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("\n");

  const userBlock = session
    ? `<div class="user-card">
        ${session.avatar_url
          ? `<img class="user-avatar" src="${esc(session.avatar_url)}" alt="">`
          : `<div class="user-avatar-init">${esc((session.display_name || "?")[0].toUpperCase())}</div>`}
        <div>
          <div class="user-name">${esc(session.display_name)}</div>
          <div class="user-handle">@${esc(session.handle)}</div>
        </div>
        <button type="button" class="switch-btn" onclick="document.getElementById('switch-wrap').style.display='block';document.getElementById('user-card-wrap').style.display='none'">Switch account</button>
       </div>`
    : "";

  const loginBlock = `
    <div id="login-wrap" style="${session ? "display:none" : ""}">
      <p class="section-title">Log in to AfuChat</p>
      <div class="input-group">
        <label>Username or Email</label>
        <input type="text" name="identifier" autocomplete="username" autocapitalize="none" placeholder="@handle or email" required>
      </div>
      <div class="input-group">
        <label>Password</label>
        <input type="password" name="password" autocomplete="current-password" placeholder="Your AfuChat password" required>
      </div>
    </div>`;

  const switchBlock = session
    ? `<div id="switch-wrap" style="display:none">
        <p class="section-title">Log in with a different account</p>
        <div class="input-group">
          <label>Username or Email</label>
          <input type="text" name="switch_identifier" autocomplete="username" autocapitalize="none" placeholder="@handle or email">
        </div>
        <div class="input-group">
          <label>Password</label>
          <input type="password" name="switch_password" autocomplete="current-password" placeholder="Your AfuChat password">
        </div>
       </div>`
    : "";

  const logoHtml = clientLogo
    ? `<img class="app-logo" src="${esc(clientLogo)}" alt="${esc(clientName)}">`
    : `<div class="app-logo-init">${esc(clientName[0]?.toUpperCase() ?? "A")}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize ${esc(clientName)} \u00b7 AfuChat</title>
<meta name="robots" content="noindex,nofollow">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#f1f1f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#141414;border:1px solid #222;border-radius:22px;width:100%;max-width:420px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.6)}
.hdr{background:linear-gradient(135deg,#0d1f14 0%,#0a1a0f 100%);padding:30px 28px 26px;text-align:center;border-bottom:1px solid #1e2e22}
.app-row{display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:18px}
.app-logo,.app-logo-init{width:56px;height:56px;border-radius:14px;object-fit:cover;background:#222;flex-shrink:0}
.app-logo-init{background:#2a2a2a;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#888}
.arrow{color:#2a2a2a;font-size:22px}
.afu-mark{width:56px;height:56px;border-radius:14px;background:#1DB954;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:900;color:#fff;flex-shrink:0}
.hdr h1{font-size:17px;font-weight:700;color:#f1f1f1;margin-bottom:6px}
.hdr p{font-size:13px;color:rgba(255,255,255,.45)}
.body{padding:24px 28px 28px}
.scopes{margin-bottom:22px}
.section-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.09em;color:#555;margin-bottom:12px}
.scope-item{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #1a1a1a;font-size:13px;color:#bbb}
.scope-item:last-child{border-bottom:none}
.scope-icon{font-size:16px;width:26px;text-align:center;flex-shrink:0}
.divider{border:none;border-top:1px solid #1e1e1e;margin:20px 0}
.input-group{margin-bottom:14px}
.input-group label{display:block;font-size:12px;color:#666;margin-bottom:6px;font-weight:500}
.input-group input{width:100%;background:#0d0d0d;border:1px solid #222;border-radius:11px;padding:12px 14px;color:#f1f1f1;font-size:14px;outline:none;transition:border-color .15s}
.input-group input:focus{border-color:#1DB954}
.error-box{background:#ff375f14;border:1px solid #ff375f40;border-radius:11px;padding:10px 14px;color:#ff6b86;font-size:13px;margin-bottom:16px;display:flex;gap:8px;align-items:flex-start}
.user-card{display:flex;align-items:center;gap:12px;padding:12px 14px;background:#1a2a1e;border:1px solid #1e3a22;border-radius:12px;margin-bottom:20px}
.user-avatar{width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0}
.user-avatar-init{width:40px;height:40px;border-radius:50%;background:#1DB954;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;flex-shrink:0}
.user-name{font-size:14px;font-weight:600;color:#f1f1f1}
.user-handle{font-size:12px;color:#888;margin-top:2px}
.switch-btn{background:none;border:none;color:#1DB954;font-size:12px;cursor:pointer;margin-left:auto;white-space:nowrap;padding:4px 0}
.btn-row{display:flex;gap:10px;margin-top:22px}
.btn{flex:1;padding:14px;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;border:none;transition:opacity .15s;line-height:1}
.btn-approve{background:#1DB954;color:#fff}
.btn-approve:hover{opacity:.88}
.btn-deny{background:#1a1a1a;color:#666;border:1px solid #252525}
.btn-deny:hover{background:#1e1e1e}
.footer{font-size:11px;color:#3a3a3a;text-align:center;margin-top:18px;line-height:1.6}
.footer a{color:#444;text-decoration:none}
.footer a:hover{color:#666}
</style>
</head>
<body>
<div class="card">
  <div class="hdr">
    <div class="app-row">
      ${logoHtml}
      <span class="arrow">&#8594;</span>
      <div class="afu-mark">A</div>
    </div>
    <h1>${esc(clientName)} wants access</h1>
    <p>Authorize ${esc(clientName)} to use your AfuChat account</p>
  </div>
  <div class="body">
    <div class="scopes">
      <p class="section-title">This app will be able to</p>
      ${scopeItems}
    </div>
    <hr class="divider">
    ${error ? `<div class="error-box"><span>⚠️</span><span>${esc(error)}</span></div>` : ""}
    <form method="POST" action="/api/oauth/authorize">
      ${hiddenParams}
      <div id="user-card-wrap">${userBlock}</div>
      ${loginBlock}
      ${switchBlock}
      <div class="btn-row">
        <button type="submit" name="action" value="deny"  class="btn btn-deny">Deny</button>
        <button type="submit" name="action" value="approve" class="btn btn-approve">Authorize</button>
      </div>
    </form>
    <p class="footer">
      By authorizing you agree to share this information with <strong>${esc(clientName)}</strong>.<br>
      Revoke access anytime in <a href="${APP_ORIGIN}/settings">AfuChat Settings</a>.
    </p>
  </div>
</div>
</body>
</html>`;
}

// ── Developer portal HTML ──────────────────────────────────────────────────────
const DEVELOPER_PORTAL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AfuChat Developer Portal</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#f1f1f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:32px 16px}
.wrap{max-width:800px;margin:0 auto}
h1{font-size:24px;font-weight:700;margin-bottom:6px}
.sub{color:#666;font-size:14px;margin-bottom:32px}
.section{background:#141414;border:1px solid #222;border-radius:16px;padding:24px;margin-bottom:24px}
h2{font-size:16px;font-weight:600;margin-bottom:16px}
.field{margin-bottom:14px}
label{display:block;font-size:12px;color:#666;margin-bottom:6px;font-weight:500}
input,textarea{width:100%;background:#0d0d0d;border:1px solid #222;border-radius:10px;padding:10px 12px;color:#f1f1f1;font-size:13px;outline:none}
input:focus,textarea:focus{border-color:#1DB954}
textarea{resize:vertical;min-height:70px}
.btn{background:#1DB954;color:#fff;font-weight:700;font-size:13px;padding:10px 20px;border-radius:10px;border:none;cursor:pointer;margin-top:4px}
.btn:hover{opacity:.88}
.btn-del{background:#ff375f20;color:#ff6b86;border:1px solid #ff375f30}
.mono{font-family:monospace;background:#0d0d0d;border:1px solid #1e1e1e;padding:6px 10px;border-radius:8px;font-size:12px;color:#1DB954;word-break:break-all}
.app-card{background:#0d0d0d;border:1px solid #1e1e1e;border-radius:12px;padding:16px;margin-bottom:12px}
.app-name{font-size:15px;font-weight:600;margin-bottom:4px}
.app-id{color:#666;font-size:12px;margin-bottom:10px}
.tag{display:inline-block;background:#1DB95420;color:#1DB954;font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;margin-right:4px}
.msg{padding:10px 14px;border-radius:10px;font-size:13px;margin:12px 0}
.msg-ok{background:#1DB95414;border:1px solid #1DB95440;color:#1DB954}
.msg-err{background:#ff375f14;border:1px solid #ff375f40;color:#ff6b86}
#apps-list{min-height:40px}
</style>
</head>
<body>
<div class="wrap">
  <h1>AfuChat Developer Portal</h1>
  <p class="sub">Register your app to add "Login with AfuChat" to your platform.</p>

  <div class="section">
    <h2>Authentication</h2>
    <p style="font-size:13px;color:#666;margin-bottom:14px">Paste your AfuChat Bearer token (from Settings &rarr; Developer) to manage your apps.</p>
    <div class="field"><label>AfuChat Access Token (Bearer)</label><input type="password" id="token-input" placeholder="eyJ..."></div>
    <button class="btn" onclick="loadApps()">Load My Apps</button>
  </div>

  <div class="section">
    <h2>Register a New App</h2>
    <div class="field"><label>App Name *</label><input id="app-name" placeholder="My Awesome App"></div>
    <div class="field"><label>Description</label><input id="app-desc" placeholder="What does your app do?"></div>
    <div class="field"><label>Website URL</label><input id="app-web" placeholder="https://myapp.com"></div>
    <div class="field"><label>Logo URL</label><input id="app-logo" placeholder="https://myapp.com/logo.png"></div>
    <div class="field"><label>Redirect URIs * <span style="color:#555;font-weight:400">(one per line)</span></label><textarea id="app-uris" placeholder="https://myapp.com/callback&#10;https://staging.myapp.com/callback"></textarea></div>
    <div class="field"><label>Scopes <span style="color:#555;font-weight:400">(space-separated)</span></label><input id="app-scopes" value="openid profile email"></div>
    <button class="btn" onclick="createApp()">Create App</button>
    <div id="create-msg"></div>
  </div>

  <div class="section">
    <h2>My Apps</h2>
    <div id="apps-list"><p style="color:#555;font-size:13px">Load your token above to view apps.</p></div>
  </div>

  <div class="section">
    <h2>Integration Guide</h2>
    <p style="font-size:13px;color:#888;margin-bottom:12px">Add "Login with AfuChat" to your app in 3 steps:</p>
    <ol style="font-size:13px;color:#aaa;padding-left:18px;line-height:2">
      <li>Redirect users to the authorization URL</li>
      <li>Exchange the code for tokens</li>
      <li>Fetch user info</li>
    </ol>
    <div style="margin-top:16px;display:grid;gap:10px">
      <div><p style="font-size:12px;color:#666;margin-bottom:6px">1. Authorization URL</p><div class="mono">GET /api/oauth/authorize?client_id=CLIENT_ID&redirect_uri=YOUR_REDIRECT&response_type=code&scope=openid+profile+email&state=RANDOM_STATE&code_challenge=CODE_CHALLENGE&code_challenge_method=S256</div></div>
      <div><p style="font-size:12px;color:#666;margin-bottom:6px">2. Token Exchange</p><div class="mono">POST /api/oauth/token<br>Content-Type: application/x-www-form-urlencoded<br><br>grant_type=authorization_code&code=AUTH_CODE&redirect_uri=YOUR_REDIRECT&client_id=CLIENT_ID&client_secret=CLIENT_SECRET&code_verifier=CODE_VERIFIER</div></div>
      <div><p style="font-size:12px;color:#666;margin-bottom:6px">3. User Info</p><div class="mono">GET /api/oauth/userinfo<br>Authorization: Bearer ACCESS_TOKEN</div></div>
    </div>
  </div>
</div>

<script>
const API = '';
function token() { return document.getElementById('token-input').value.trim(); }

async function apiFetch(path, opts={}) {
  const t = token();
  return fetch(API + path, {
    ...opts,
    headers: { 'Authorization': t ? 'Bearer ' + t : '', 'Content-Type': 'application/json', ...(opts.headers||{}) }
  });
}

async function loadApps() {
  const el = document.getElementById('apps-list');
  el.innerHTML = '<p style="color:#555;font-size:13px">Loading…</p>';
  try {
    const r = await apiFetch('/api/oauth/apps');
    const data = await r.json();
    if (!r.ok) { el.innerHTML = '<p class="msg msg-err">' + (data.error||'Failed to load') + '</p>'; return; }
    if (!data.length) { el.innerHTML = '<p style="color:#555;font-size:13px">No apps yet. Register one above.</p>'; return; }
    el.innerHTML = data.map(a => \`
      <div class="app-card">
        <div class="app-name">\${a.name}</div>
        <div class="app-id">client_id: <span style="color:#1DB954">\${a.client_id}</span></div>
        <div style="margin-bottom:10px">\${a.scopes.map(s=>'<span class="tag">'+s+'</span>').join('')}</div>
        <div style="font-size:12px;color:#555;margin-bottom:10px">Redirect URIs: \${a.redirect_uris.join(', ')}</div>
        <button class="btn btn-del" onclick="deleteApp('\${a.id}')">Delete App</button>
      </div>
    \`).join('');
  } catch(e) { el.innerHTML = '<p class="msg msg-err">Network error</p>'; }
}

async function createApp() {
  const msg = document.getElementById('create-msg');
  const uris = document.getElementById('app-uris').value.split('\\n').map(s=>s.trim()).filter(Boolean);
  const body = {
    name: document.getElementById('app-name').value.trim(),
    description: document.getElementById('app-desc').value.trim(),
    website_url: document.getElementById('app-web').value.trim(),
    logo_url: document.getElementById('app-logo').value.trim(),
    redirect_uris: uris,
    scopes: document.getElementById('app-scopes').value.trim().split(/\\s+/),
  };
  if (!body.name || !uris.length) { msg.innerHTML='<div class="msg msg-err">Name and at least one Redirect URI are required.</div>'; return; }
  try {
    const r = await apiFetch('/api/oauth/apps', { method:'POST', body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) { msg.innerHTML='<div class="msg msg-err">'+(data.error||'Failed')+'</div>'; return; }
    msg.innerHTML='<div class="msg msg-ok">App created! client_id: <strong>'+data.client_id+'</strong><br>client_secret (save this, shown once): <strong style="word-break:break-all">'+data.client_secret+'</strong></div>';
    loadApps();
  } catch(e) { msg.innerHTML='<div class="msg msg-err">Network error</div>'; }
}

async function deleteApp(id) {
  if (!confirm('Delete this app? All tokens will be revoked.')) return;
  const r = await apiFetch('/api/oauth/apps/'+id, { method:'DELETE' });
  if (r.ok) loadApps();
}
</script>
</body>
</html>`;

// ── GET /oauth/authorize ───────────────────────────────────────────────────────
router.get("/oauth/authorize", async (req: Request, res: Response) => {
  const {
    response_type, client_id, redirect_uri, scope = "openid profile",
    state = "", code_challenge, code_challenge_method,
  } = req.query as Record<string, string>;

  if (response_type !== "code") {
    return res.status(400).send("response_type must be 'code'");
  }
  if (!client_id || !redirect_uri) {
    return res.status(400).send("client_id and redirect_uri are required");
  }

  const admin = getAdminClient();
  const { data: app } = await admin
    .from("oauth_apps")
    .select("client_id,name,logo_url,website_url,redirect_uris,scopes")
    .eq("client_id", client_id)
    .eq("is_active", true)
    .single();

  if (!app) return res.status(400).send("Unknown client_id");
  if (!app.redirect_uris.includes(redirect_uri)) {
    return res.status(400).send("redirect_uri not allowed for this client");
  }

  const requestedScopes = scope.split(/[\s,+]+/).filter(Boolean);
  const allowedScopes   = requestedScopes.filter((s: string) => app.scopes.includes(s));

  const session = getOAuthSession(req);

  const params: Record<string, string> = {
    client_id, redirect_uri, scope: allowedScopes.join(" "), state,
    response_type,
    ...(code_challenge        ? { code_challenge }        : {}),
    ...(code_challenge_method ? { code_challenge_method } : {}),
  };

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(renderConsentPage({
    clientName:    app.name,
    clientLogo:    app.logo_url,
    clientWebsite: app.website_url,
    scopes:        allowedScopes,
    params,
    session,
  }));
});

// ── POST /oauth/authorize ─────────────────────────────────────────────────────
router.post("/oauth/authorize", async (req: Request, res: Response) => {
  const {
    action, client_id, redirect_uri, scope = "", state = "",
    code_challenge, code_challenge_method,
    identifier, password,
    switch_identifier, switch_password,
  } = req.body as Record<string, string>;

  const requestedScopes = scope.split(/[\s,+]+/).filter(Boolean);

  const params: Record<string, string> = {
    client_id, redirect_uri, scope, state, response_type: "code",
    ...(code_challenge        ? { code_challenge }        : {}),
    ...(code_challenge_method ? { code_challenge_method } : {}),
  };

  if (action === "deny") {
    return oauthError(res, redirect_uri, state, "access_denied", "User denied access");
  }

  const admin = getAdminClient();

  // Validate app
  const { data: app } = await admin
    .from("oauth_apps")
    .select("client_id,name,logo_url,website_url,redirect_uris,scopes")
    .eq("client_id", client_id)
    .eq("is_active", true)
    .single();

  if (!app || !app.redirect_uris.includes(redirect_uri)) {
    return res.status(400).send("Invalid client or redirect_uri");
  }

  // Determine active user
  let session = getOAuthSession(req);
  const effectiveIdentifier = switch_identifier || identifier;
  const effectivePassword   = switch_password   || password;

  // If new credentials supplied, or no session → verify credentials
  if (effectiveIdentifier || !session) {
    if (!effectiveIdentifier || !effectivePassword) {
      return res.setHeader("Content-Type", "text/html; charset=utf-8").send(
        renderConsentPage({ clientName: app.name, clientLogo: app.logo_url, clientWebsite: app.website_url, scopes: requestedScopes, params, session: null, error: "Username and password are required." }),
      );
    }

    // Resolve identifier → email
    let email = effectiveIdentifier;
    if (!email.includes("@") || email.startsWith("@")) {
      const cleanHandle = email.replace(/^@/, "").toLowerCase();
      const { data: p } = await admin.from("profiles").select("id").eq("handle", cleanHandle).single();
      if (!p) {
        const { data: byPhone } = await admin.from("profiles").select("id").ilike("phone_number", `%${cleanHandle}%`).single();
        if (!byPhone) {
          return res.setHeader("Content-Type", "text/html; charset=utf-8").send(
            renderConsentPage({ clientName: app.name, clientLogo: app.logo_url, clientWebsite: app.website_url, scopes: requestedScopes, params, session: null, error: "Account not found. Check your username." }),
          );
        }
        const { data: userById } = await admin.auth.admin.getUserById(byPhone.id);
        email = userById?.user?.email || email;
      } else {
        const { data: userById } = await admin.auth.admin.getUserById(p.id);
        email = userById?.user?.email || email;
      }
    }

    // Verify password via Supabase auth
    const authResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password: effectivePassword }),
    });
    if (!authResp.ok) {
      return res.setHeader("Content-Type", "text/html; charset=utf-8").send(
        renderConsentPage({ clientName: app.name, clientLogo: app.logo_url, clientWebsite: app.website_url, scopes: requestedScopes, params, session: null, error: "Invalid username or password." }),
      );
    }
    const authData = await authResp.json() as { user?: { id: string } };
    const userId   = authData?.user?.id;
    if (!userId) {
      return res.setHeader("Content-Type", "text/html; charset=utf-8").send(
        renderConsentPage({ clientName: app.name, clientLogo: app.logo_url, clientWebsite: app.website_url, scopes: requestedScopes, params, session: null, error: "Authentication failed. Try again." }),
      );
    }

    // Load profile
    const { data: profile } = await admin.from("profiles").select("handle,display_name,avatar_url").eq("id", userId).single();
    session = {
      uid:          userId,
      handle:       profile?.handle || "",
      display_name: profile?.display_name || "",
      avatar_url:   profile?.avatar_url || null,
      exp:          Date.now() + 24 * 60 * 60 * 1000,
    };
    setOAuthSession(res, session);
  }

  if (!session) {
    return res.setHeader("Content-Type", "text/html; charset=utf-8").send(
      renderConsentPage({ clientName: app.name, clientLogo: app.logo_url, clientWebsite: app.website_url, scopes: requestedScopes, params, session: null, error: "Session expired. Please log in again." }),
    );
  }

  // Create authorization code
  const code      = randomToken(32);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await admin.from("oauth_auth_codes").insert({
    code,
    client_id,
    user_id:              session.uid,
    redirect_uri,
    scopes:               requestedScopes,
    code_challenge:       code_challenge || null,
    code_challenge_method: code_challenge_method || null,
    expires_at:           expiresAt.toISOString(),
  });

  // Upsert consent record
  await admin.from("oauth_consents").upsert({
    user_id:   session.uid,
    client_id,
    scopes:    requestedScopes,
    granted_at: new Date().toISOString(),
  }, { onConflict: "user_id,client_id" });

  // Redirect back to the app
  const callbackUrl = new URL(redirect_uri);
  callbackUrl.searchParams.set("code",  code);
  if (state) callbackUrl.searchParams.set("state", state);
  return res.redirect(callbackUrl.toString());
});

// ── POST /oauth/token ─────────────────────────────────────────────────────────
router.post("/oauth/token", async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  const { grant_type, client_id, client_secret, code, redirect_uri, code_verifier, refresh_token } = req.body as Record<string, string>;
  const admin = getAdminClient();

  // Validate client
  const { data: app } = await admin
    .from("oauth_apps")
    .select("id,client_id,client_secret,is_active")
    .eq("client_id", client_id)
    .single();

  if (!app || !app.is_active || app.client_secret !== client_secret) {
    return res.status(401).json({ error: "invalid_client" });
  }

  // ── authorization_code grant ─────────────────────────────────────────────
  if (grant_type === "authorization_code") {
    if (!code || !redirect_uri) {
      return res.status(400).json({ error: "invalid_request", error_description: "code and redirect_uri are required" });
    }

    const { data: authCode } = await admin
      .from("oauth_auth_codes")
      .select("*")
      .eq("code", code)
      .eq("client_id", client_id)
      .eq("redirect_uri", redirect_uri)
      .eq("used", false)
      .single();

    if (!authCode || new Date(authCode.expires_at) < new Date()) {
      return res.status(400).json({ error: "invalid_grant", error_description: "Authorization code invalid or expired" });
    }

    // PKCE verification
    if (authCode.code_challenge) {
      if (!code_verifier) {
        return res.status(400).json({ error: "invalid_grant", error_description: "code_verifier required" });
      }
      const method    = authCode.code_challenge_method || "S256";
      const computed  = method === "S256" ? sha256b64url(code_verifier) : code_verifier;
      if (computed !== authCode.code_challenge) {
        return res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
      }
    }

    // Mark code as used
    await admin.from("oauth_auth_codes").update({ used: true }).eq("id", authCode.id);

    // Create access token
    const accessToken  = randomToken(32);
    const refreshToken = randomToken(32);
    const atExpiry     = new Date(Date.now() + 60 * 60 * 1000);       // 1 hour
    const rtExpiry     = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const { data: at, error: atErr } = await admin.from("oauth_access_tokens").insert({
      token:      accessToken,
      client_id,
      user_id:    authCode.user_id,
      scopes:     authCode.scopes,
      expires_at: atExpiry.toISOString(),
    }).select("id").single();

    if (atErr || !at) {
      return res.status(500).json({ error: "server_error", error_description: "Failed to create access token" });
    }

    await admin.from("oauth_refresh_tokens").insert({
      token:           refreshToken,
      access_token_id: at.id,
      client_id,
      user_id:         authCode.user_id,
      scopes:          authCode.scopes,
      expires_at:      rtExpiry.toISOString(),
    });

    return res.json({
      access_token:  accessToken,
      token_type:    "Bearer",
      expires_in:    3600,
      refresh_token: authCode.scopes.includes("offline_access") ? refreshToken : undefined,
      scope:         authCode.scopes.join(" "),
    });
  }

  // ── refresh_token grant ──────────────────────────────────────────────────
  if (grant_type === "refresh_token") {
    if (!refresh_token) {
      return res.status(400).json({ error: "invalid_request", error_description: "refresh_token is required" });
    }

    const { data: rt } = await admin
      .from("oauth_refresh_tokens")
      .select("*")
      .eq("token", refresh_token)
      .eq("client_id", client_id)
      .eq("revoked", false)
      .single();

    if (!rt || new Date(rt.expires_at) < new Date()) {
      return res.status(400).json({ error: "invalid_grant", error_description: "Refresh token invalid or expired" });
    }

    // Revoke old refresh token
    await admin.from("oauth_refresh_tokens").update({ revoked: true }).eq("id", rt.id);

    // Create new access + refresh token
    const newAt  = randomToken(32);
    const newRt  = randomToken(32);
    const atExp  = new Date(Date.now() + 60 * 60 * 1000);
    const rtExp  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const { data: atRow, error: atRowErr } = await admin.from("oauth_access_tokens").insert({
      token: newAt, client_id, user_id: rt.user_id, scopes: rt.scopes, expires_at: atExp.toISOString(),
    }).select("id").single();

    if (atRowErr || !atRow) {
      return res.status(500).json({ error: "server_error", error_description: "Failed to create access token" });
    }

    await admin.from("oauth_refresh_tokens").insert({
      token: newRt, access_token_id: atRow.id, client_id, user_id: rt.user_id, scopes: rt.scopes, expires_at: rtExp.toISOString(),
    });

    return res.json({
      access_token:  newAt,
      token_type:    "Bearer",
      expires_in:    3600,
      refresh_token: newRt,
      scope:         rt.scopes.join(" "),
    });
  }

  return res.status(400).json({ error: "unsupported_grant_type" });
});

// ── GET /oauth/userinfo ───────────────────────────────────────────────────────
router.get("/oauth/userinfo", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || "";
  const token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) return res.status(401).json({ error: "unauthorized" });

  const admin = getAdminClient();
  const { data: at } = await admin
    .from("oauth_access_tokens")
    .select("user_id,scopes,expires_at,revoked")
    .eq("token", token)
    .single();

  if (!at || at.revoked || new Date(at.expires_at) < new Date()) {
    return res.status(401).json({ error: "invalid_token" });
  }

  const scopes = at.scopes as string[];
  const { data: profile } = await admin
    .from("profiles")
    .select("id,handle,display_name,avatar_url,bio,is_verified,country")
    .eq("id", at.user_id)
    .single();

  const { data: userAuth } = await admin.auth.admin.getUserById(at.user_id);
  const email = userAuth?.user?.email;
  const phone = userAuth?.user?.phone;

  const info: Record<string, unknown> = { sub: at.user_id };
  if (scopes.includes("profile")) {
    info.name           = profile?.display_name;
    info.preferred_username = profile?.handle;
    info.picture        = profile?.avatar_url;
    info.profile        = profile ? `${APP_ORIGIN}/@${profile.handle}` : undefined;
    info.website        = APP_ORIGIN;
    info.verified       = profile?.is_verified ?? false;
  }
  if (scopes.includes("email")   && email) { info.email = email; info.email_verified = true; }
  if (scopes.includes("phone")   && phone) { info.phone_number = phone; info.phone_number_verified = true; }

  return res.json(info);
});

// ── GET /oauth/developer ───────────────────────────────────────────────────────
router.get("/oauth/developer", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(DEVELOPER_PORTAL_HTML);
});

// ── Middleware: require Supabase Bearer token ─────────────────────────────────
async function requireSupabaseAuth(req: Request, res: Response, next: () => void): Promise<void> {
  const authHeader = req.headers.authorization || "";
  const token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) { res.status(401).json({ error: "unauthorized" }); return; }

  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) { res.status(401).json({ error: "invalid_token" }); return; }
  (req as any).authUserId = data.user.id;
  next();
}

// ── GET /oauth/apps ────────────────────────────────────────────────────────────
router.get("/oauth/apps", requireSupabaseAuth as any, async (req: Request, res: Response) => {
  const userId = (req as any).authUserId as string;
  const admin  = getAdminClient();
  const { data } = await admin
    .from("oauth_apps")
    .select("id,client_id,name,description,logo_url,website_url,redirect_uris,scopes,is_active,created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  res.json(data || []);
});

// ── POST /oauth/apps ───────────────────────────────────────────────────────────
router.post("/oauth/apps", requireSupabaseAuth as any, async (req: Request, res: Response) => {
  const userId = (req as any).authUserId as string;
  const { name, description, logo_url, website_url, redirect_uris, scopes } = req.body as {
    name: string; description?: string; logo_url?: string; website_url?: string;
    redirect_uris: string[]; scopes?: string[];
  };

  if (!name || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return res.status(400).json({ error: "name and redirect_uris are required" });
  }

  const clientId     = `afu_${randomToken(12)}`;
  const clientSecret = randomToken(32);

  const admin = getAdminClient();
  const { data, error } = await admin.from("oauth_apps").insert({
    client_id:     clientId,
    client_secret: clientSecret,
    name:          name.trim(),
    description:   description?.trim() || null,
    logo_url:      logo_url?.trim()    || null,
    website_url:   website_url?.trim() || null,
    redirect_uris,
    scopes:        Array.isArray(scopes) ? scopes : ["openid", "profile", "email"],
    owner_id:      userId,
  }).select("id,client_id,name,redirect_uris,scopes").single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ ...data, client_secret: clientSecret });
});

// ── PUT /oauth/apps/:appId ─────────────────────────────────────────────────────
router.put("/oauth/apps/:appId", requireSupabaseAuth as any, async (req: Request, res: Response) => {
  const userId = (req as any).authUserId as string;
  const { name, description, logo_url, website_url, redirect_uris, scopes } = req.body as {
    name?: string; description?: string; logo_url?: string; website_url?: string;
    redirect_uris?: string[]; scopes?: string[];
  };

  const patch: Record<string, unknown> = {};
  if (name              !== undefined) patch.name          = name.trim();
  if (description       !== undefined) patch.description   = description?.trim() || null;
  if (logo_url          !== undefined) patch.logo_url      = logo_url?.trim() || null;
  if (website_url       !== undefined) patch.website_url   = website_url?.trim() || null;
  if (Array.isArray(redirect_uris))    patch.redirect_uris = redirect_uris;
  if (Array.isArray(scopes))           patch.scopes        = scopes;

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "no fields to update" });
  }

  const admin = getAdminClient();
  const { data, error } = await admin.from("oauth_apps")
    .update(patch)
    .eq("id", req.params.appId)
    .eq("owner_id", userId)
    .select("id,client_id,name,description,logo_url,website_url,redirect_uris,scopes,is_active")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "app not found or access denied" });
  return res.json(data);
});

// ── DELETE /oauth/apps/:appId ─────────────────────────────────────────────────
router.delete("/oauth/apps/:appId", requireSupabaseAuth as any, async (req: Request, res: Response) => {
  const userId = (req as any).authUserId as string;
  const admin  = getAdminClient();
  const { error } = await admin.from("oauth_apps")
    .update({ is_active: false })
    .eq("id", req.params.appId)
    .eq("owner_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

// ── GET /oauth/connected-apps (user revoke screen) ────────────────────────────
router.get("/oauth/connected-apps", requireSupabaseAuth as any, async (req: Request, res: Response) => {
  const userId = (req as any).authUserId as string;
  const admin  = getAdminClient();
  const { data } = await admin
    .from("oauth_consents")
    .select("id,client_id,scopes,granted_at,oauth_apps!oauth_consents_client_id_fkey(name,logo_url,website_url)")
    .eq("user_id", userId);
  res.json(data || []);
});

// ── DELETE /oauth/connected-apps/:consentId ───────────────────────────────────
router.delete("/oauth/connected-apps/:consentId", requireSupabaseAuth as any, async (req: Request, res: Response) => {
  const userId = (req as any).authUserId as string;
  const admin  = getAdminClient();

  const { data: consent } = await admin
    .from("oauth_consents").select("client_id").eq("id", req.params.consentId).eq("user_id", userId).single();
  if (!consent) return res.status(404).json({ error: "not found" });

  // Revoke all tokens for this app+user
  await Promise.all([
    admin.from("oauth_access_tokens").update({ revoked: true }).eq("user_id", userId).eq("client_id", consent.client_id),
    admin.from("oauth_refresh_tokens").update({ revoked: true }).eq("user_id", userId).eq("client_id", consent.client_id),
    admin.from("oauth_consents").delete().eq("id", req.params.consentId).eq("user_id", userId),
  ]);
  return res.json({ ok: true });
});

export default router;
