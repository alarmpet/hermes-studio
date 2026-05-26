#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const launcherPath = resolve(root, "scripts/launch-hermes-studio.ps1");
const exePath = resolve(root, "dist-electron/win-unpacked/Hermes YouTube Studio.exe");

assert.ok(existsSync(launcherPath), "desktop launcher script should exist");
assert.ok(existsSync(exePath), "latest unpacked Hermes Studio exe should exist");

const launcher = readFileSync(launcherPath, "utf8");
assert.match(launcher, /Stop-Process/, "launcher should terminate old Hermes processes");
assert.match(launcher, /Hermes YouTube Studio\.exe/, "launcher should start the latest Hermes exe");
assert.match(launcher, /Start-Process/, "launcher should start Hermes after cleanup");

const shortcutProbe = spawnSync("powershell.exe", [
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-Command",
  "$desktop=[Environment]::GetFolderPath('Desktop'); $lnk=Join-Path $desktop 'Hermes YouTube Studio.lnk'; if(!(Test-Path $lnk)){throw 'shortcut missing'}; $sh=New-Object -ComObject WScript.Shell; $sc=$sh.CreateShortcut($lnk); [pscustomobject]@{TargetPath=$sc.TargetPath; Arguments=$sc.Arguments; WorkingDirectory=$sc.WorkingDirectory; IconLocation=$sc.IconLocation} | ConvertTo-Json -Compress",
], { encoding: "utf8" });

assert.equal(shortcutProbe.status, 0, shortcutProbe.stderr || shortcutProbe.stdout);
const shortcut = JSON.parse(shortcutProbe.stdout);
assert.match(shortcut.TargetPath, /powershell\.exe$/i, "desktop shortcut should point to PowerShell launcher");
assert.match(shortcut.Arguments, /launch-hermes-studio\.ps1/i, "desktop shortcut should invoke the Hermes launcher script");
assert.match(shortcut.IconLocation, /Hermes YouTube Studio\.exe,0/i, "desktop shortcut should keep the Hermes app icon");

console.log(JSON.stringify({ ok: true, checked: "desktop-shortcut-launcher", launcherPath, exePath }));
