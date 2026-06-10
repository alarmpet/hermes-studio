import { join } from "node:path";
import { createFlowRequestPacer } from "./flow-request-pacer.mjs";

const DEFAULT_BATCH_SIZE = 30;
const DEFAULT_MIN_SUBMIT_GAP_MS = 60_000;
const DEFAULT_FAILURE_COOLDOWN_MS = 30 * 60_000;

function cleanId(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "default";
}

function clampInt(value, min, max, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export function normalizeFlowAccountSlots(input = {}) {
  const enabled = Boolean(input.enabled);
  const batchSize = clampInt(input.batchSize, 1, 60, DEFAULT_BATCH_SIZE);
  const minSubmitGapMs = clampInt(input.minSubmitGapMs, 30_000, 10 * 60_000, DEFAULT_MIN_SUBMIT_GAP_MS);
  const failureCooldownMs = clampInt(input.failureCooldownMs, 5 * 60_000, 6 * 60 * 60_000, DEFAULT_FAILURE_COOLDOWN_MS);
  const rawSlots = Array.isArray(input.slots) ? input.slots : [];
  const slots = rawSlots
    .map((slot, index) => {
      const id = cleanId(slot.id || `flow-${String.fromCharCode(97 + index)}`);
      return {
        id,
        label: String(slot.label || `Flow ${index + 1}`),
        enabled: slot.enabled !== false,
        profileDirName: `flow-profile-${id}`,
        stateFileName: `flow-global-pacing-${id}.json`,
      };
    })
    .filter((slot) => slot.enabled);

  const effectiveSlots = enabled && slots.length >= 2
    ? slots.slice(0, 4)
    : [{
        id: "default",
        label: "Default Flow",
        enabled: true,
        profileDirName: "flow-profile",
        stateFileName: "flow-global-pacing.json",
      }];

  return {
    enabled: enabled && effectiveSlots.length >= 2,
    batchSize,
    minSubmitGapMs,
    failureCooldownMs,
    slots: effectiveSlots,
  };
}

export function resolveFlowAccountSlotForScene({ sceneOrder = 1, config } = {}) {
  const safeOrder = Math.max(1, Math.round(Number(sceneOrder || 1)));
  const normalized = config?.slots ? config : normalizeFlowAccountSlots(config || {});
  const index = Math.floor((safeOrder - 1) / normalized.batchSize) % normalized.slots.length;
  return normalized.slots[index] || normalized.slots[0];
}

export function buildFlowAccountRouter({
  userData,
  flowProfileRoot,
  options = {},
} = {}) {
  if (!userData) throw new Error("userData is required for Flow account routing.");
  const config = normalizeFlowAccountSlots({
    enabled: options.flowAccountRoutingEnabled,
    batchSize: options.flowAccountBatchSize,
    minSubmitGapMs: options.flowAccountMinSubmitGapMs,
    failureCooldownMs: options.flowAccountFailureCooldownMs,
    slots: options.flowAccountSlots,
  });
  const profileRoot = flowProfileRoot || join(userData, "browser-profiles");
  const pacerBySlot = new Map();

  function flowPacerForSlot(slot) {
    if (!pacerBySlot.has(slot.id)) {
      pacerBySlot.set(slot.id, createFlowRequestPacer({
        userData,
        stateFileName: slot.stateFileName,
        accountSlotId: slot.id,
        minSubmitGapMs: config.minSubmitGapMs,
        failureCooldownMs: config.failureCooldownMs,
      }));
    }
    return pacerBySlot.get(slot.id);
  }

  return {
    config,
    resolveSceneContext({ sceneOrder = 1 } = {}) {
      const slot = resolveFlowAccountSlotForScene({ sceneOrder, config });
      return {
        slot,
        profileDir: join(profileRoot, slot.profileDirName),
        flowPacer: flowPacerForSlot(slot),
      };
    },
  };
}
