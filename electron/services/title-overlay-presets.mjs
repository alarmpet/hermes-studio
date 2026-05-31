export const TITLE_OVERLAY_PRESETS = [
  {
    id: "bold-black-accent",
    label: "Bold Black Accent",
    background: "#000000",
    backgroundOpacity: 0.86,
    primary: "#ffffff",
    accent: "#fde047",
    outline: "#000000",
    outlineOpacity: 1,
  },
  {
    id: "white-editorial",
    label: "White Editorial",
    background: "#ffffff",
    backgroundOpacity: 0.96,
    primary: "#111827",
    accent: "#f97316",
    outline: "#ffffff",
    outlineOpacity: 0.75,
  },
  {
    id: "black-green-hook",
    label: "Black Green Hook",
    background: "#000000",
    backgroundOpacity: 0.9,
    primary: "#ffffff",
    accent: "#22c55e",
    outline: "#000000",
    outlineOpacity: 1,
  },
  {
    id: "minimal-shadow",
    label: "Minimal Shadow",
    background: "#000000",
    backgroundOpacity: 0.72,
    primary: "#ffffff",
    accent: "#ffffff",
    outline: "#000000",
    outlineOpacity: 1,
  },
];

export const TITLE_OVERLAY_STYLE_IDS = TITLE_OVERLAY_PRESETS.map((preset) => preset.id);

export function getTitleOverlayPreset(id = "bold-black-accent") {
  return TITLE_OVERLAY_PRESETS.find((item) => item.id === id) || TITLE_OVERLAY_PRESETS[0];
}
