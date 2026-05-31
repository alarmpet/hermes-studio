import { spawn } from "node:child_process";

export function createMcpStdioClient({ command, args = [], env = {}, cwd = process.cwd(), timeoutMs = 30_000 } = {}) {
  if (!command) throw new Error("MCP command is required.");
  let nextId = 1;
  let buffer = Buffer.alloc(0);
  const pending = new Map();
  const child = spawn(command, args, {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    cwd,
    env: { ...process.env, ...env },
  });

  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    parseMcpFrames();
  });
  child.stderr.on("data", (chunk) => {
    if (process.env.HERMES_MCP_DEBUG) process.stderr.write(chunk);
  });
  child.once("exit", () => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new Error("MCP stdio server exited before responding."));
    }
    pending.clear();
  });

  function parseMcpFrames() {
    while (buffer.length) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = buffer.subarray(0, headerEnd).toString("utf8");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        buffer = buffer.subarray(headerEnd + 4);
        continue;
      }
      const contentLength = Number(match[1]);
      const frameStart = headerEnd + 4;
      const frameEnd = frameStart + contentLength;
      if (buffer.length < frameEnd) return;
      const body = buffer.subarray(frameStart, frameEnd).toString("utf8");
      buffer = buffer.subarray(frameEnd);
      handleMessage(JSON.parse(body));
    }
  }

  function handleMessage(message = {}) {
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) {
      request.reject(new Error(message.error.message || JSON.stringify(message.error)));
      return;
    }
    request.resolve(message.result);
  }

  function send(payload) {
    const body = Buffer.from(JSON.stringify(payload), "utf8");
    child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    child.stdin.write(body);
  }

  function request(method, params = {}, requestTimeoutMs = timeoutMs) {
    const id = nextId;
    nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, requestTimeoutMs);
      pending.set(id, { resolve, reject, timer });
      send({ jsonrpc: "2.0", id, method, params });
    });
  }

  function notify(method, params = {}) {
    send({ jsonrpc: "2.0", method, params });
  }

  return {
    pid: child.pid,
    async initialize() {
      const result = await request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "hermes-studio", version: "1.0.0" },
      });
      notify("notifications/initialized");
      return result;
    },
    callTool(name, toolArgs = {}, requestTimeoutMs = timeoutMs) {
      return request("tools/call", { name, arguments: toolArgs }, requestTimeoutMs);
    },
    close() {
      for (const { reject, timer } of pending.values()) {
        clearTimeout(timer);
        reject(new Error("MCP client closed."));
      }
      pending.clear();
      child.kill();
    },
  };
}

export async function callMcpToolOverStdio({ command, args = [], env = {}, toolName, toolArgs = {}, timeoutMs = 30_000 } = {}) {
  const client = createMcpStdioClient({ command, args, env, timeoutMs });
  try {
    await client.initialize();
    return await client.callTool(toolName, toolArgs, timeoutMs);
  } finally {
    client.close();
  }
}
