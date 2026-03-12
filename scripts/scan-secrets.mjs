import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const ALLOWED_EXT = new Set([".js", ".mjs", ".json", ".md", ".yml", ".yaml", ".html", ".css"]);
const IGNORE_DIR = new Set(["node_modules", ".git", "icons", ".claude"]);

const PATTERNS = [
  {
    name: "Google OAuth Client ID",
    regex: /\b\d{6,}-[a-z0-9-]+\.apps\.googleusercontent\.com\b/gi,
  },
  {
    name: "OpenAI API key",
    regex: /\bsk-[A-Za-z0-9]{20,}\b/g,
  },
  {
    name: "Gemini API key",
    regex: /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  },
];

const findings = [];
await walk(ROOT);

if (findings.length > 0) {
  console.error("Potential secrets found:");
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.name} -> ${finding.value}`);
  }
  process.exit(1);
}

console.log("Secret scan passed.");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIR.has(entry.name)) continue;
      await walk(fullPath);
      continue;
    }

    if (!ALLOWED_EXT.has(extname(entry.name))) continue;

    const content = await readFile(fullPath, "utf8");
    for (const pattern of PATTERNS) {
      const matches = content.match(pattern.regex);
      if (!matches) continue;
      for (const match of matches) {
        if (match.includes("YOUR_CLIENT_ID.apps.googleusercontent.com")) continue;
        findings.push({
          file: fullPath.replace(`${ROOT}/`, ""),
          name: pattern.name,
          value: mask(match),
        });
      }
    }
  }
}

function mask(value) {
  if (value.length <= 10) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
