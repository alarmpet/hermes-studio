import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const packageJsonPath = resolve(root, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const failures = [];
const checkedPaths = new Set();

function fail(message) {
  failures.push(message);
}

function normalizePath(relativePath) {
  return relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function isTrackedOrStaged(relativePath) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", relativePath], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function assertCloneFile(relativePath, reason) {
  const normalized = normalizePath(relativePath);
  if (checkedPaths.has(normalized)) return;
  checkedPaths.add(normalized);

  const absolutePath = resolve(root, normalized);
  if (!existsSync(absolutePath)) {
    fail(`${normalized} missing: ${reason}`);
    return;
  }

  if (!isTrackedOrStaged(normalized)) {
    fail(`${normalized} is not tracked or staged: ${reason}`);
  }
}

function scanPackageScript(scriptName, command) {
  const nodeScriptPattern = /node\s+(?:\.\/)?([^\s"'&|;]+\.mjs)/g;
  for (const match of command.matchAll(nodeScriptPattern)) {
    assertCloneFile(match[1], `package script ${scriptName} references this file`);
  }

  const powershellScriptPattern = /(?:-File\s+|powershell\s+[^&|;]*-File\s+)([^\s"'&|;]+\.ps1)/gi;
  for (const match of command.matchAll(powershellScriptPattern)) {
    assertCloneFile(match[1], `package script ${scriptName} references this file`);
  }
}

for (const [name, command] of Object.entries(packageJson.scripts || {})) {
  scanPackageScript(name, command);
}

for (const required of [
  "README.md",
  "START_HERE.md",
  "scripts/setup-hermes-studio.ps1",
  "scripts/create-desktop-shortcut.ps1",
  "scripts/launch-hermes-studio.ps1",
  "scripts/check-shortcut.ps1",
  "electron/main.mjs",
  "electron/renderer/index.html",
  "youtube-workflow.mjs",
  "youtube-workflow-stages.mjs",
]) {
  assertCloneFile(required, "fresh clone must include this onboarding/runtime file");
}

for (const portableFile of [
  "README.md",
  "START_HERE.md",
  "scripts/setup-hermes-studio.ps1",
  "scripts/create-desktop-shortcut.ps1",
  "scripts/check-shortcut.ps1",
]) {
  const absolutePath = resolve(root, portableFile);
  if (!existsSync(absolutePath)) continue;
  const text = readFileSync(absolutePath, "utf8");
  if (/C:\\Users\\amd/i.test(text)) {
    fail(`${portableFile} contains hardcoded C:\\Users\\amd`);
  }
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checked: "clone-ready", files: checkedPaths.size }, null, 2));
