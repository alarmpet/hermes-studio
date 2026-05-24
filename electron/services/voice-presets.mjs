export const VOICE_PRESETS = [
  { id: "male_30_announcer", label: "30대 남성 아나운서", gender: "male", age: 30, tone: "announcer", engineVoice: "M1", speed: 1.06, pitch: 0 },
  { id: "female_30_announcer", label: "30대 여성 아나운서", gender: "female", age: 30, tone: "announcer", engineVoice: "F1", speed: 1.06, pitch: 0 },
  { id: "male_30_low", label: "30대 남성 저음", gender: "male", age: 30, tone: "low", engineVoice: "M1", speed: 1.0, pitch: -2 },
  { id: "female_30_low", label: "30대 여성 저음", gender: "female", age: 30, tone: "low", engineVoice: "F1", speed: 1.0, pitch: -2 },
  { id: "male_30_high", label: "30대 남성 고음", gender: "male", age: 30, tone: "high", engineVoice: "M2", speed: 1.08, pitch: 2 },
  { id: "female_30_high", label: "30대 여성 고음", gender: "female", age: 30, tone: "high", engineVoice: "F1", speed: 1.08, pitch: 2 },
  { id: "male_60_announcer", label: "60대 남성 아나운서", gender: "male", age: 60, tone: "announcer", engineVoice: "M1", speed: 0.96, pitch: -1 },
  { id: "female_60_announcer", label: "60대 여성 아나운서", gender: "female", age: 60, tone: "announcer", engineVoice: "F1", speed: 0.96, pitch: -1 },
  { id: "male_60_low", label: "60대 남성 저음", gender: "male", age: 60, tone: "low", engineVoice: "M1", speed: 0.94, pitch: -3 },
  { id: "female_60_low", label: "60대 여성 저음", gender: "female", age: 60, tone: "low", engineVoice: "F1", speed: 0.94, pitch: -3 },
  { id: "male_60_high", label: "60대 남성 고음", gender: "male", age: 60, tone: "high", engineVoice: "M2", speed: 0.98, pitch: 1 },
  { id: "female_60_high", label: "60대 여성 고음", gender: "female", age: 60, tone: "high", engineVoice: "F1", speed: 0.98, pitch: 1 },
  { id: "M1", label: "Legacy M1", engineVoice: "M1", speed: 1.08, pitch: 0, visible: false },
  { id: "F1", label: "Legacy F1", engineVoice: "F1", speed: 1.06, pitch: 0, visible: false },
  { id: "M2", label: "Legacy M2", engineVoice: "M2", speed: 1.0, pitch: 0, visible: false },
];

export function getVoicePreset(id) {
  return VOICE_PRESETS.find((item) => item.id === id) || VOICE_PRESETS[0];
}

export function listVisibleVoicePresets() {
  return VOICE_PRESETS.filter((item) => item.visible !== false);
}
