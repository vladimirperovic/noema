import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const OUTPUT_DIR = path.join(ROOT, "docs", "screenshots");
const PUBLIC_DIR = path.join(ROOT, "public");
const SERVER_ENTRY = path.join(ROOT, "src", "index.js");
const HOST = "127.0.0.1";

const cleanRoutes = new Map([
  ["index.html", { route: "/", name: "home" }],
  ["archive.html", { route: "/arhiva", name: "archive" }],
  ["notes.html", { route: "/notes", name: "notes" }],
  ["documents.html", { route: "/documents", name: "documents" }],
  ["links.html", { route: "/links", name: "links" }],
  ["ai-projects.html", { route: "/ai-projects", name: "ai-projects" }],
  ["inspiration.html", { route: "/inspiration", name: "inspiration" }],
  ["buildingsite.html", { route: "/buildingsite", name: "building-sites" }],
  ["backup.html", { route: "/backup", name: "backup" }],
  ["help.html", { route: "/help", name: "help" }],
  ["stats.html", { route: "/stats", name: "stats" }],
]);

async function assertCleanDataDirectory() {
  if (!existsSync(DATA_DIR)) return;
  const entries = await readdir(DATA_DIR);
  if (entries.length > 0) {
    throw new Error(
      "Refusing to generate screenshots because data/ is not empty. " +
      "Run this only in a clean checkout; screenshots must never use personal data.",
    );
  }
}

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Noema exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Noema did not become healthy at ${baseUrl}.`);
}

async function startServer(port, uiPassword = "") {
  const baseUrl = `http://${HOST}:${port}`;
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      HOST,
      PORT: String(port),
      PUBLIC_BASE_URL: baseUrl,
      NODE_ENV: "test",
      NOEMA_TIMEZONE: "UTC",
      NOEMA_CORS_ORIGIN: baseUrl,
      NOEMA_API_TOKEN: "screenshot-demo-token",
      ENCRYPTION_KEY: "screenshot-demo-encryption-key-not-for-production",
      UI_PASSWORD: uiPassword,
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      GOOGLE_REFRESH_TOKEN: "",
      GA4_CLIENT_EMAIL: "",
      GA4_PRIVATE_KEY: "",
      PAGESPEED_API_KEY: "",
      NOEMA_ANALYTICS_PROJECTS: "",
    },
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.stdout.on("data", (chunk) => process.stdout.write(`[noema] ${chunk}`));
  await waitForHealth(baseUrl, child).catch((error) => {
    throw new Error(`${error.message}\n${stderr}`);
  });
  return { child, baseUrl };
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function api(baseUrl, route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${route} returned ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function makeDemoImage(browser, title, subtitle) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.setContent(`<!doctype html>
    <style>
      html,body{margin:0;width:100%;height:100%;font-family:Arial,sans-serif;background:#e8e5df;color:#202020}
      main{height:100%;display:grid;place-items:center;background:linear-gradient(135deg,#d7d2c8,#f7f5f1)}
      section{width:72%;border:1px solid rgba(0,0,0,.18);padding:72px;background:rgba(255,255,255,.58);box-shadow:0 30px 90px rgba(0,0,0,.08)}
      h1{font-size:72px;font-weight:400;letter-spacing:-3px;margin:0 0 18px}
      p{font-size:28px;line-height:1.4;margin:0;color:#606060}
    </style>
    <main><section><h1>${title}</h1><p>${subtitle}</p></section></main>`);
  const original = await page.screenshot({ type: "jpeg", quality: 88 });
  await page.setViewportSize({ width: 640, height: 420 });
  const thumbnail = await page.screenshot({ type: "jpeg", quality: 80 });
  await page.close();
  return {
    name: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg`,
    type: "image/jpeg",
    data: original.toString("base64"),
    thumbnailData: thumbnail.toString("base64"),
  };
}

async function seedNeutralDemo(baseUrl, browser) {
  await api(baseUrl, "/api/notes", {
    title: "Review checklist",
    body: "Confirm scope\nPrepare questions\nRecord the decision",
    labels: ["demo", "workflow"],
    pinned: true,
    archived: false,
  });

  await api(baseUrl, "/api/documents", {
    title: "Project brief",
    body: "<h2>Purpose</h2><p>This neutral document demonstrates the long-form workspace.</p><h2>Next step</h2><p>Adapt the module to your own domain.</p>",
    label: "demo",
  });

  await api(baseUrl, "/api/links", {
    url: "https://example.com/reference",
    title: "Example reference",
    description: "A neutral saved link used only for public screenshots.",
    label: "research",
    image: "",
  });

  await api(baseUrl, "/api/ai-projects", {
    url: "https://example.com/experiment",
    title: "Prototype experiment",
    description: "An example collection item that can be renamed or repurposed.",
    label: "prototype",
    image: "",
  });

  const inspirationImage = await makeDemoImage(browser, "Material study", "Neutral demo content for the Inspiration module");
  await api(baseUrl, "/api/inspirations", {
    title: "Material and light",
    sourceUrl: "https://example.com/inspiration",
    address: "Example location",
    label: "materials",
    images: [inspirationImage],
  });

  const siteImage = await makeDemoImage(browser, "Field record", "Building Sites can be adapted to any location-based photo journal");
  await api(baseUrl, "/api/buildingsites", {
    title: "Example field visit",
    location: "Sample project",
    address: "Example address",
    documentUrl: "https://example.com/documentation",
    label: "inspection",
    tags: ["demo", "progress", "location"],
    images: [siteImage],
  });

  await api(baseUrl, "/api/backup/snapshot", {});
}

async function discoverPages() {
  const htmlFiles = (await readdir(PUBLIC_DIR)).filter((file) => file.endsWith(".html"));
  const pages = [];
  for (const file of htmlFiles) {
    if (file === "login.html" || file === "404.html") continue;
    const known = cleanRoutes.get(file);
    if (known) pages.push(known);
    else pages.push({ route: `/${file}`, name: file.replace(/\.html$/, "").replace(/[^a-z0-9-]+/gi, "-").toLowerCase() });
  }
  pages.sort((a, b) => a.name === "home" ? -1 : b.name === "home" ? 1 : a.name.localeCompare(b.name));
  pages.push({ route: "/this-page-does-not-exist", name: "404" });
  return pages;
}

async function capturePage(page, url, output) {
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  if (!response) throw new Error(`No response for ${url}`);
  await page.waitForTimeout(700);
  await page.screenshot({ path: output, fullPage: true });
  console.log(`captured ${path.relative(ROOT, output)}`);
}

async function main() {
  await assertCleanDataDirectory();
  await mkdir(OUTPUT_DIR, { recursive: true });
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  let server;
  try {
    server = await startServer(3000);
    await seedNeutralDemo(server.baseUrl, browser);

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    for (const item of await discoverPages()) {
      await capturePage(page, `${server.baseUrl}${item.route}`, path.join(OUTPUT_DIR, `${item.name}.png`));
    }
    await context.close();
    await stopServer(server.child);

    server = await startServer(3010, "public-screenshot-demo-password");
    const loginContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const loginPage = await loginContext.newPage();
    await capturePage(loginPage, `${server.baseUrl}/login`, path.join(OUTPUT_DIR, "login.png"));
    await loginContext.close();
  } finally {
    await stopServer(server?.child);
    await browser.close();
    await rm(DATA_DIR, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});