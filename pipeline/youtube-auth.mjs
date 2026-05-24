import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { google } from "googleapis";
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

export async function startOAuthCodeReceiver({ port = 0 } = {}) {
  let settled = false;
  let rejectCode;
  let resolveCode;
  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${server.address().port}`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      if (error) throw new Error(error);
      if (!code) throw new Error("OAuth code missing");
      settled = true;
      res.end("Hermes YouTube authentication complete. You can close this window.");
      server.close();
      resolveCode({ code, redirectUri: `http://127.0.0.1:${server.address().port}` });
    } catch (err) {
      res.statusCode = 400;
      res.end(err.message);
      if (!settled) {
        settled = true;
        server.close();
        rejectCode(err);
      }
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const redirectUri = `http://127.0.0.1:${server.address().port}`;
  return {
    redirectUri,
    codePromise,
    close: () => server.close(),
  };
}

export async function startYouTubeOAuth({ clientSecretsPath, tokenPath, openExternal }) {
  const secrets = JSON.parse(await readFile(clientSecretsPath, "utf8"));
  const credentials = secrets.installed || secrets.web;
  if (!credentials?.client_id || !credentials?.client_secret) {
    throw new Error("client_secrets.json must contain installed or web OAuth credentials.");
  }
  const receiver = await startOAuthCodeReceiver();
  const oauth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    receiver.redirectUri,
  );
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: YOUTUBE_SCOPES,
  });
  await openExternal(authUrl);
  const { code } = await receiver.codePromise;
  const { tokens } = await oauth2Client.getToken(code);
  await saveYouTubeToken(tokenPath, tokens);
  return {
    ok: true,
    target: "youtube",
    status: "authenticated",
    tokenPath,
    redirectUri: receiver.redirectUri,
    message: "YouTube 업로드 인증이 완료되었습니다.",
  };
}
