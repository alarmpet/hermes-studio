#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

// 1. Required Root Files
const REQUIRED_ROOT_FILES = [
  "START_HERE.md",
  "AGENTS.md",
  "CLAUDE.md",
  "index.md",
  "log.md",
  "README.md",
  "TEMPLATE_MANIFEST.md",
  "VERSION",
  "LICENSE.md"
];

// 2. Required Directories
const REQUIRED_DIRS = [
  "AI-Sessions",
  "AI-Sessions/raw",
  "AI-Sessions/conversations",
  "AI-Sessions/wiki",
  "AI-Sessions/wiki/sources",
  "AI-Sessions/wiki/concepts",
  "AI-Sessions/wiki/decisions",
  "AI-Sessions/wiki/errors",
  "AI-Sessions/wiki/projects",
  "AI-Sessions/wiki/design",
  "AI-Sessions/wiki/dev-tasks",
  "prompts",
  "scripts"
];

// 3. Required Commands in AGENTS.md / CLAUDE.md
const REQUIRED_COMMANDS = ["save", "ingest", "query", "reference", "lint"];

// 4. Secret Scan Settings
const SECRET_REGEXES = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sbp_[A-Za-z0-9_-]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /(?:api[_-]?key|client[_-]?secret|password|token)\s*[:=]\s*["'][^"']{16,}["']/i
];

const SECRET_EXCLUSIONS = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-electron",
  "AI-Sessions/raw",
  "AI-Sessions/conversations",
  "docs",
  "prompts",
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "START_HERE.md",
  "TEMPLATE_MANIFEST.md",
  "LICENSE.md",
  "package-lock.json",
  "package.json",
  ".aistudio-browser-profile",
  "outputs",
  "charts",
  "_tmp_agent_skills_repo",
  ".pytest_cache",
  ".worktree-snapshots",
  "obsi",
  "telegram-flow-news-config.json",
  "telegram.txt",
  "openrouter.txt.txt",
  "brave.txt",
  "client_secrets.json",
  "youtube-token.json"
]);

function fail(message) {
  console.error(`\x1b[31m[WIKI VALIDATION FAILED] ${message}\x1b[0m`);
  process.exit(1);
}

function success(message) {
  console.log(`\x1b[32m[WIKI VALIDATION PASSED] ${message}\x1b[0m`);
}

// Ensure required files exist
for (const file of REQUIRED_ROOT_FILES) {
  const fullPath = path.join(ROOT, file);
  if (!fs.existsSync(fullPath)) {
    fail(`Required root file missing: ${file}`);
  }
}
success("All required root files exist.");

// Ensure required directories exist
for (const dir of REQUIRED_DIRS) {
  const fullPath = path.join(ROOT, dir);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
    // Attempt to create it if missing (as guide says raw/concepts etc. are required)
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`Created missing required directory: ${dir}`);
  }
}
success("All required directories exist.");

// Validate AGENTS.md and CLAUDE.md commands
for (const file of ["AGENTS.md", "CLAUDE.md"]) {
  const content = fs.readFileSync(path.join(ROOT, file), "utf8");
  for (const cmd of REQUIRED_COMMANDS) {
    // Match exact word prefix or command name
    const regex = new RegExp(`\\b${cmd}\\b`, "i");
    if (!regex.test(content)) {
      fail(`Command "${cmd}" is not documented in ${file}`);
    }
  }
}
success("All required commands are defined in AGENTS.md and CLAUDE.md.");

// Validate index.md prompt links
const indexContent = fs.readFileSync(path.join(ROOT, "index.md"), "utf8");
for (const cmd of REQUIRED_COMMANDS) {
  const expectedLink = `prompts/${cmd}.md`;
  if (!indexContent.includes(expectedLink)) {
    fail(`index.md is missing link to prompt library: ${expectedLink}`);
  }
}
success("index.md contains links to all prompt files.");

// Validate all wiki documents frontmatter
function getFilesRecursively(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath));
    } else if (file.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

const wikiFiles = getFilesRecursively(path.join(ROOT, "AI-Sessions/wiki"));
const VALID_TYPES = new Set(["decision", "source", "concept", "error", "project", "design", "dev-task", "handoff"]);
const VALID_STATUSES = new Set(["draft", "active", "superseded"]);

for (const file of wikiFiles) {
  const relPath = path.relative(ROOT, file).replace(/\\/g, "/");
  const content = fs.readFileSync(file, "utf8");
  
  // Frontmatter start check: first characters should be ---
  if (!content.startsWith("---")) {
    fail(`File ${relPath} must start with YAML frontmatter delimiter (---).`);
  }
  
  const parts = content.split("---");
  if (parts.length < 3) {
    fail(`File ${relPath} has incomplete/unclosed YAML frontmatter.`);
  }
  
  const yamlText = parts[1];
  const yamlLines = yamlText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const metadata = {};
  for (const line of yamlLines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    metadata[key] = val;
  }
  
  // Check required keys
  if (!metadata.type) fail(`File ${relPath} frontmatter missing required key: type`);
  if (!metadata.date) fail(`File ${relPath} frontmatter missing required key: date`);
  if (!metadata.status) fail(`File ${relPath} frontmatter missing required key: status`);
  
  // Validate type
  if (!VALID_TYPES.has(metadata.type)) {
    fail(`File ${relPath} has invalid frontmatter type: "${metadata.type}". Valid types: ${Array.from(VALID_TYPES).join(", ")}`);
  }
  
  // Validate status
  if (!VALID_STATUSES.has(metadata.status)) {
    fail(`File ${relPath} has invalid frontmatter status: "${metadata.status}". Valid statuses: ${Array.from(VALID_STATUSES).join(", ")}`);
  }
  
  // Validate date (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.date)) {
    fail(`File ${relPath} has invalid frontmatter date format: "${metadata.date}". Must match YYYY-MM-DD.`);
  }

  // Validate source paths if it looks like a local file
  if (metadata.source && (metadata.source.startsWith("AI-Sessions/") || metadata.source.includes(".md"))) {
    const sourcePath = path.join(ROOT, metadata.source);
    if (!fs.existsSync(sourcePath)) {
      fail(`File ${relPath} references non-existent source file: "${metadata.source}".`);
    }
  }
}
success(`All ${wikiFiles.length} wiki files have valid frontmatter structure.`);

// 5. Secret Scanner
function scanDirectoryForSecrets(dir) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const relPath = path.relative(ROOT, fullPath).replace(/\\/g, "/");
    
    // Check exclusions
    if (SECRET_EXCLUSIONS.has(relPath) || SECRET_EXCLUSIONS.has(file)) continue;
    
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      scanDirectoryForSecrets(fullPath);
    } else {
      // Only scan text-like files
      if (/\.(md|txt|json|js|mjs|py|yml|yaml|sh|ps1)$/.test(file)) {
        const fileContent = fs.readFileSync(fullPath, "utf8");
        const lines = fileContent.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          for (const regex of SECRET_REGEXES) {
            const match = line.match(regex);
            if (match) {
              // Fail if it matches a secret
              fail(`Potential secret leak found in ${relPath}:${i + 1} - Matched pattern: ${match[0]}`);
            }
          }
        }
      }
    }
  }
}

scanDirectoryForSecrets(ROOT);
success("Secret scan complete. No potential secret leaks found.");

success("Obsidian AI Wiki structure and security validation passed successfully!");
process.exit(0);
