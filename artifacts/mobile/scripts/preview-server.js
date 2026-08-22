#!/usr/bin/env node
/**
 * preview-server.js
 * Serves a styled landing page on port 5000 showing the Expo Go QR code
 * and connection URL so Replit's preview pane has real content.
 * QR code is generated server-side — no external CDN needed.
 */
const http = require("http");
const QRCode = require("qrcode");

const METRO_PORT = 8000;
const PREVIEW_PORT = 5000;

function getExpoUrl() {
  const domain = process.env.REPLIT_EXPO_DEV_DOMAIN || process.env.REPLIT_DEV_DOMAIN;
  if (domain) return `exp://${domain}`;
  return `exp://localhost:${METRO_PORT}`;
}

function checkMetro() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${METRO_PORT}/status`, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body.includes("packager-status:running")));
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

function buildHtml(expoUrl, qrDataUrl, metroReady) {
  const statusColor = metroReady ? "#34d399" : "#fbbf24";
  const statusBg   = metroReady ? "rgba(52,211,153,0.12)" : "rgba(251,191,36,0.12)";
  const statusBorder = metroReady ? "rgba(52,211,153,0.25)" : "rgba(251,191,36,0.25)";
  const statusText = metroReady ? "Metro bundler running" : "Metro starting up\u2026";
  const pulse = metroReady ? "animation:pulse 2s infinite;" : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>AfuChat \u2014 Expo Preview</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      min-height:100vh;
      background:linear-gradient(135deg,#0a0a0f 0%,#0d1117 60%,#0a0f1e 100%);
      display:flex;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      color:#fff;
    }
    .card{
      background:rgba(255,255,255,0.04);
      border:1px solid rgba(255,255,255,0.08);
      border-radius:24px;
      padding:40px 48px;
      max-width:480px;width:90%;
      text-align:center;
      box-shadow:0 32px 64px rgba(0,0,0,0.5);
    }
    .logo{
      width:64px;height:64px;border-radius:18px;
      background:linear-gradient(135deg,#1018D8,#0a6fcc);
      display:inline-flex;align-items:center;justify-content:center;
      font-size:32px;margin-bottom:20px;
      box-shadow:0 8px 24px rgba(31,149,255,0.4);
    }
    h1{font-size:26px;font-weight:700;letter-spacing:-0.5px;margin-bottom:6px}
    .sub{font-size:14px;color:rgba(255,255,255,0.45);margin-bottom:24px}
    .status{
      display:inline-flex;align-items:center;gap:8px;
      font-size:13px;font-weight:600;
      padding:7px 16px;border-radius:100px;
      margin-bottom:24px;
      background:${statusBg};
      color:${statusColor};
      border:1px solid ${statusBorder};
    }
    .dot{width:8px;height:8px;border-radius:50%;background:${statusColor};${pulse}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
    .qr-wrap{
      background:#ffffff;border-radius:16px;
      padding:12px;display:inline-block;
      margin-bottom:24px;
      box-shadow:0 8px 32px rgba(0,0,0,0.4);
    }
    .qr-wrap img{display:block;border-radius:6px}
    .url-box{
      background:rgba(255,255,255,0.06);
      border:1px solid rgba(255,255,255,0.1);
      border-radius:10px;
      padding:10px 16px;
      font-size:12px;font-family:monospace;
      color:rgba(255,255,255,0.65);
      word-break:break-all;
      margin-bottom:24px;
      user-select:all;cursor:text;
    }
    .steps{text-align:left;margin-bottom:4px}
    .step{
      display:flex;align-items:flex-start;gap:12px;
      padding:10px 0;
      border-bottom:1px solid rgba(255,255,255,0.06);
      font-size:13px;color:rgba(255,255,255,0.65);
      line-height:1.45;
    }
    .step:last-child{border-bottom:none}
    .step-num{
      width:22px;height:22px;border-radius:50%;flex-shrink:0;margin-top:1px;
      background:rgba(31,149,255,0.15);border:1px solid rgba(31,149,255,0.35);
      color:#1018D8;font-size:11px;font-weight:700;
      display:flex;align-items:center;justify-content:center;
    }
    .badge{
      display:inline-block;background:#1018D8;color:#fff;
      font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;
      vertical-align:middle;margin-left:4px;
    }
    .footer{margin-top:20px;font-size:11px;color:rgba(255,255,255,0.25)}
    /* auto-refresh every 10 s so status dot updates */
    ${metroReady ? "" : "/* page will reload until Metro is ready */"}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">\ud83d\udcac</div>
    <h1>AfuChat</h1>
    <p class="sub">React Native &middot; Expo SDK 55</p>

    <div class="status">
      <div class="dot"></div>
      ${statusText}
    </div>

    <div class="qr-wrap">
      <img src="${qrDataUrl}" width="200" height="200" alt="Expo Go QR code"/>
    </div>

    <div class="url-box">${expoUrl}</div>

    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <span>Install <strong>Expo Go</strong> from the Play Store on your Android device</span>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <span>Open Expo Go &rarr; tap <strong>"Scan QR code"</strong> (not your camera app)</span>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <span>Scan the code above &mdash; the app bundles and launches <span class="badge">live reload</span></span>
      </div>
      <div class="step">
        <div class="step-num">4</div>
        <span>Phone must be on the <strong>same Wi-Fi</strong> as this server, or use the URL above</span>
      </div>
    </div>

    <p class="footer">Auto-refreshes every 10&thinsp;s &middot; Metro on :${METRO_PORT}</p>
  </div>
  <script>setTimeout(()=>location.reload(),10000);</script>
</body>
</html>`;
}

async function serve() {
  const expoUrl = getExpoUrl();
  console.log(`[preview] Expo URL: ${expoUrl}`);

  // Pre-generate QR at startup; re-generate each request so URL changes are picked up
  const server = http.createServer(async (req, res) => {
    if (req.url === "/health") { res.writeHead(200).end("ok"); return; }
    const [metroReady, qrDataUrl] = await Promise.all([
      checkMetro(),
      QRCode.toDataURL(expoUrl, { width: 200, margin: 1, color: { dark: "#000000", light: "#ffffff" } }),
    ]);
    const html = buildHtml(expoUrl, qrDataUrl, metroReady);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(html);
  });

  server.listen(PREVIEW_PORT, "0.0.0.0", () => {
    console.log(`[preview] Landing page \u2192 http://0.0.0.0:${PREVIEW_PORT}`);
  });
}

serve().catch(console.error);
