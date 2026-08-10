import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot })
  .toString("utf8").split("\0").filter(Boolean);

const rules = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub classic token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["GitHub fine-grained token", /\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["Google service account private key", /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----/],
];

const allowedFiles = new Set([".env.example"]);
const findings = [];
for (const relative of tracked) {
  if (allowedFiles.has(relative)) continue;
  const absolute = path.join(repoRoot, relative);
  let stat;
  try { stat = statSync(absolute); } catch { continue; }
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024) continue;
  let text;
  try { text = readFileSync(absolute, "utf8"); } catch { continue; }
  if (text.includes("\u0000")) continue;
  for (const [name, pattern] of rules) {
    const match = pattern.exec(text);
    if (!match) continue;
    const line = text.slice(0, match.index).split("\n").length;
    findings.push(`${relative}:${line}: ${name}`);
  }
}

if (findings.length) {
  console.error("[noema] Potential committed secrets found:\n" + findings.map((item) => `  ${item}`).join("\n"));
  process.exit(1);
}
console.log(`[noema] Secret scan passed (${tracked.length} tracked files).`);
