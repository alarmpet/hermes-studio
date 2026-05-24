import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import { dirname } from "node:path";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

export async function loadYouTubeToken(tokenPath) {
  if (!existsSync(tokenPath)) return null;
  return JSON.parse(await readFile(tokenPath, "utf8"));
}

export async function saveYouTubeToken(tokenPath, token) {
  await mkdir(dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, JSON.stringify(token, null, 2), "utf8");
  return token;
}

export function waitForOAuthCode({ port = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${server.address().port}`);
        const code = url.searchParams.get("code");
        if (!code) throw new Error("OAuth code missing");
        res.end("Hermes YouTube authentication complete. You can close this window.");
        server.close();
        resolve({ code, redirectUri: `http://127.0.0.1:${server.address().port}` });
      } catch (error) {
        res.statusCode = 400;
        res.end(error.message);
        server.close();
        reject(error);
      }
    });
    server.listen(port, "127.0.0.1");
  });
}
