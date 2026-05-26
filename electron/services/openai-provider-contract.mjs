export const OPENAI_PROVIDER_MODES = ["disabled", "thumbnail-api", "scene-json-api", "prompt-qa-api"];

export function shouldUseOpenAiProvider(options = {}) {
  return OPENAI_PROVIDER_MODES.includes(options.openaiProviderMode)
    && options.openaiProviderMode !== "disabled"
    && Boolean(options.openaiApiKeyConfigured);
}

export function buildOpenAiSceneSchema() {
  return {
    type: "json_schema",
    name: "hermes_scene_plan",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "script", "scenes"],
      properties: {
        title: { type: "string" },
        script: { type: "string" },
        scenes: {
          type: "array",
          minItems: 1,
          maxItems: 18,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["order", "narration", "visual_category", "image_prompt", "duration_seconds"],
            properties: {
              order: { type: "integer", minimum: 1 },
              narration: { type: "string" },
              visual_category: { type: "string" },
              image_prompt: { type: "string" },
              duration_seconds: { type: "number", minimum: 1 },
            },
          },
        },
      },
    },
  };
}
