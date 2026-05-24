#!/usr/bin/env python
import json
import inspect
import sys
from pathlib import Path

TTS_ROOT = Path("C:/Users/amd/supertonic3-local-tts-20260517-r4/supertonic3-local-tts")
sys.path.insert(0, str(TTS_ROOT / "src"))

from supertonic3_engine import Supertonic3Engine  # noqa: E402


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "Usage: make-scenes-tts.py <job_dir> <scenes.json>"}))
        return 1

    job_dir = Path(sys.argv[1])
    scenes_path = Path(sys.argv[2])
    scenes = json.loads(scenes_path.read_text(encoding="utf-8"))
    render_options_path = job_dir / "render-options.json"
    render_options = json.loads(render_options_path.read_text(encoding="utf-8")) if render_options_path.exists() else {}
    voice = render_options.get("engineVoice") or render_options.get("voiceId") or "M1"
    speed = float(render_options.get("speechSpeed") or 1.08)
    engine = Supertonic3Engine(output_dir=job_dir)

    results = []
    for scene in scenes:
        order = int(scene["order"])
        text = str(scene["narration"]).strip()
        if not text:
            raise ValueError(f"Scene {order} narration is empty")
        out_wav = job_dir / f"scene_{order}.wav"
        kwargs = {
            "text": text,
            "output_path": out_wav,
            "voice": voice,
            "lang": "ko",
            "speed": speed,
            "total_step": 8,
            "max_chunk_length": 130,
            "silence_duration": 0.25,
            "verbose": False,
        }
        signature = inspect.signature(engine.synthesize_to_file)
        if "pitch" in signature.parameters and "pitch" in render_options:
            kwargs["pitch"] = float(render_options["pitch"])
        info = engine.synthesize_to_file(**kwargs)
        results.append({
            "order": order,
            "audio_path": str(out_wav).replace("\\", "/"),
            "duration": float(info.get("duration") or 0),
            "text": text,
        })

    manifest = {"ok": True, "scenes": results}
    (job_dir / "scene_audio_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
