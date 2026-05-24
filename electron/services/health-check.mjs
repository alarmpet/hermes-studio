import { existsSync } from "node:fs";
import { join } from "node:path";

export function validateTtsPath(ttsRoot) {
  const pythonPath = join(ttsRoot, "supertonic3-local-tts", ".venv-win", "Scripts", "python.exe");
  const enginePath = join(ttsRoot, "supertonic3-local-tts", "src", "supertonic3_engine.py");
  return {
    ok: existsSync(pythonPath) && existsSync(enginePath),
    pythonPath,
    enginePath,
  };
}
