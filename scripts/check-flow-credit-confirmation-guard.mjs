#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const flow = readFileSync(resolve(root, "automation/google-flow-media.mjs"), "utf8");
const packageJson = readFileSync(resolve(root, "package.json"), "utf8");

assert.match(flow, /rejectPaidFlowCreditConfirmation/, "Flow automation should reject paid credit confirmations for any mode");
assert.match(flow, /FLOW_PAID_CREDIT_CONFIRMATION_REJECTED/, "Flow automation should expose a structured paid-credit rejection code");
assert.match(flow, /paidCreditVisible/, "Flow confirmation probes should classify paid credit confirmations before approval");
assert.match(flow, /paid-credit-confirmation-not-approved/, "Flow approval helper should refuse paid credit confirmation dialogs");
assert.match(flow, /const paidCreditRejection = await rejectPaidFlowCreditConfirmation\(page\)/, "submission verification should reject paid credits before generic approval handling");
assert.match(packageJson, /check-flow-credit-confirmation-guard\.mjs/, "package checks should include paid credit guard");

console.log(JSON.stringify({ ok: true, checked: "flow-credit-confirmation-guard" }));
