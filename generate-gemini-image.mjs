#!/usr/bin/env node

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_MODEL = "gemini-3.1-flash-image-preview";

function usage() {
  const script = fileURLToPath(import.meta.url);
  return `Usage:
  node ${script} --prompt "a cinematic product photo" --out generated.png

Options:
  --prompt <text>       Required text prompt.
  --out <path>          Output image path. Default: generated_image.png
  --model <name>        Gemini image model. Default: ${DEFAULT_MODEL}
  --aspect <ratio>      Optional aspect ratio, e.g. 1:1, 16:9, 9:16.
  --size <size>         Optional image size for Gemini 3 image models, e.g. 512, 1K, 2K, 4K.

Environment:
  GEMINI_API_KEY        Required Google AI Studio API key.
`;
}

function parseArgs(argv) {
  const args = {
    model: DEFAULT_MODEL,
    out: "generated_image.png",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }

    if (!key.startsWith("--")) {
      throw new Error(`Unexpected argument: ${key}`);
    }

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }

    if (key === "--prompt") args.prompt = value;
    else if (key === "--out") args.out = value;
    else if (key === "--model") args.model = value;
    else if (key === "--aspect") args.aspectRatio = value;
    else if (key === "--size") args.imageSize = value;
    else throw new Error(`Unknown option: ${key}`);

    i += 1;
  }

  return args;
}

function buildRequest(prompt, { aspectRatio, imageSize }) {
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE"],
    },
  };

  if (aspectRatio || imageSize) {
    body.generationConfig.responseFormat = {
      image: {
        ...(aspectRatio ? { aspectRatio } : {}),
        ...(imageSize ? { imageSize } : {}),
      },
    };
  }

  return body;
}

function firstImagePart(responseJson) {
  for (const candidate of responseJson.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return part.inlineData;
      }
      if (part.inline_data?.data) {
        return part.inline_data;
      }
    }
  }

  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  if (!args.prompt) {
    throw new Error("Missing required --prompt.\n\n" + usage());
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required. Create an API key in Google AI Studio and set it as an environment variable.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(buildRequest(args.prompt, args)),
  });

  const responseText = await response.text();
  let responseJson;
  try {
    responseJson = JSON.parse(responseText);
  } catch {
    throw new Error(`Google API returned non-JSON response (${response.status}): ${responseText}`);
  }

  if (!response.ok) {
    const message = responseJson.error?.message ?? responseText;
    throw new Error(`Google API request failed (${response.status}): ${message}`);
  }

  const imagePart = firstImagePart(responseJson);
  if (!imagePart) {
    const text = responseJson.candidates?.flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.text)
      .filter(Boolean)
      .join("\n");
    throw new Error(`No image was returned.${text ? ` Model text response:\n${text}` : ""}`);
  }

  const outputPath = resolve(args.out);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(imagePart.data, "base64"));

  console.log(`Saved ${imagePart.mimeType ?? imagePart.mime_type ?? "image"} to ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
