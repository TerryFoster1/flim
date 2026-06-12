import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

const baseUrl = process.env.FLIM_BASE_URL || "https://www.flim.ca";
const port = Number(process.env.CHROME_DEBUG_PORT || 9223);
const chromePath = process.env.CHROME_PATH || [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((candidate) => existsSync(candidate));

function requestJson(url, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitForChrome() {
  const url = `http://127.0.0.1:${port}/json/version`;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      return await requestJson(url);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("Chrome DevTools did not become ready.");
}

class DevToolsSocket {
  constructor(wsUrl) {
    this.url = new URL(wsUrl);
    this.callbacks = new Map();
    this.events = [];
    this.nextId = 1;
    this.buffer = Buffer.alloc(0);
  }

  connect() {
    return new Promise((resolve, reject) => {
      const key = randomBytes(16).toString("base64");
      this.socket = net.createConnection({ host: this.url.hostname, port: Number(this.url.port) }, () => {
        this.socket.write([
          `GET ${this.url.pathname}${this.url.search} HTTP/1.1`,
          `Host: ${this.url.host}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${key}`,
          "Sec-WebSocket-Version: 13",
          "",
          "",
        ].join("\r\n"));
      });

      let handshake = Buffer.alloc(0);
      const onHandshake = (chunk) => {
        handshake = Buffer.concat([handshake, chunk]);
        const marker = handshake.indexOf("\r\n\r\n");
        if (marker === -1) return;
        const header = handshake.slice(0, marker).toString("utf8");
        if (!/^HTTP\/1\.1 101\b/.test(header)) {
          reject(new Error(`WebSocket handshake failed: ${header.split("\r\n")[0]}`));
          return;
        }
        this.socket.off("data", onHandshake);
        this.socket.on("data", (data) => this.readFrames(data));
        const rest = handshake.slice(marker + 4);
        if (rest.length) this.readFrames(rest);
        resolve();
      };

      this.socket.on("data", onHandshake);
      this.socket.on("error", reject);
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({ id, method, params });
    this.writeFrame(payload);
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
    });
  }

  writeFrame(payload) {
    const body = Buffer.from(payload);
    const mask = randomBytes(4);
    const header = [];
    header.push(0x81);
    if (body.length < 126) {
      header.push(0x80 | body.length);
    } else if (body.length < 65536) {
      header.push(0x80 | 126, (body.length >> 8) & 255, body.length & 255);
    } else {
      throw new Error("CDP payload too large for this lightweight client.");
    }
    const masked = Buffer.alloc(body.length);
    for (let index = 0; index < body.length; index += 1) {
      masked[index] = body[index] ^ mask[index % 4];
    }
    this.socket.write(Buffer.concat([Buffer.from(header), mask, masked]));
  }

  readFrames(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      let offset = 2;
      let length = second & 0x7f;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        length = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }
      const masked = (second & 0x80) !== 0;
      const maskOffset = masked ? 4 : 0;
      if (this.buffer.length < offset + maskOffset + length) return;
      let payload = this.buffer.slice(offset + maskOffset, offset + maskOffset + length);
      if (masked) {
        const mask = this.buffer.slice(offset, offset + 4);
        payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
      }
      this.buffer = this.buffer.slice(offset + maskOffset + length);
      if (opcode === 0x8) {
        this.close();
        return;
      }
      if (opcode !== 0x1) continue;
      const message = JSON.parse(payload.toString("utf8"));
      if (message.id && this.callbacks.has(message.id)) {
        const callback = this.callbacks.get(message.id);
        this.callbacks.delete(message.id);
        if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
        else callback.resolve(message.result);
      } else if (message.method) {
        this.events.push(message);
      }
    }
  }

  close() {
    this.socket?.destroy();
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}

function assertLoaded(result, label) {
  if (!result?.ok) throw new Error(`${label} did not run: ${result?.reason || "unknown"}`);
  if (result.unavailable) throw new Error(`${label} showed Details Unavailable at ${result.url}`);
  if (!result.h1 || /details/i.test(result.h1)) throw new Error(`${label} did not render a title at ${result.url}`);
}

let chrome;
let cdp;
try {
  const profilePath = path.join(os.tmpdir(), `flim-cdp-profile-${Date.now()}`);
  if (!chromePath) {
    throw new Error("Chrome or Edge was not found. Set CHROME_PATH to run UI verification.");
  }
  chrome = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profilePath}`,
  ], { stdio: "ignore" });

  await waitForChrome();
  const target = await requestJson(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`${baseUrl}/playlists`)}`, "PUT");
  cdp = new DevToolsSocket(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Log.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await cdp.send("Emulation.setUserAgentOverride", {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  await cdp.send("Page.navigate", { url: `${baseUrl}/playlists` });
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const publicPlaylistClick = await evaluate(cdp, `(async () => {
    const playlist = [...document.querySelectorAll('button')].find((button) => /Movie Marathon|Time Travel|Blockbusters/i.test(button.innerText));
    if (!playlist) return { ok: false, reason: 'No public playlist card found', url: location.href, body: document.body.innerText.slice(0, 1200) };
    playlist.click();
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const poster = [...document.querySelectorAll('button')].find((button) => /poster-card-button/.test(button.className) && button.querySelector('img, .poster'));
    if (!poster) return { ok: false, reason: 'No title poster found', url: location.href, body: document.body.innerText.slice(0, 1200) };
    poster.click();
    await new Promise((resolve) => setTimeout(resolve, 8000));
    return {
      ok: true,
      url: location.href,
      h1: document.querySelector('h1')?.innerText || '',
      unavailable: /Details unavailable|Details are taking longer/i.test(document.body.innerText),
      body: document.body.innerText.slice(0, 1600),
    };
  })()`);
  assertLoaded(publicPlaylistClick, "Public playlist title click");

  await cdp.send("Page.navigate", { url: `${baseUrl}/movies/1891` });
  await new Promise((resolve) => setTimeout(resolve, 6000));
  const relatedTitleClick = await evaluate(cdp, `(async () => {
    const related = [...document.querySelectorAll('button')].find((button) => /^View$/i.test(button.innerText.trim()));
    if (!related) return { ok: false, reason: 'No related title View button found', url: location.href, body: document.body.innerText.slice(0, 1200) };
    related.click();
    await new Promise((resolve) => setTimeout(resolve, 8000));
    return {
      ok: true,
      url: location.href,
      h1: document.querySelector('h1')?.innerText || '',
      unavailable: /Details unavailable|Details are taking longer/i.test(document.body.innerText),
      body: document.body.innerText.slice(0, 1600),
    };
  })()`);
  assertLoaded(relatedTitleClick, "Related title click");

  const events = cdp.events
    .filter((event) => {
      const params = event.params || {};
      const url = params.response?.url || params.request?.url || "";
      const text = params.entry?.text || params.args?.map((arg) => arg.value || arg.description).join(" ") || "";
      return url.includes("/api/movies") || /title_details|tmdb_client|unavailable|failed|error/i.test(text);
    })
    .slice(-30)
    .map((event) => ({
      method: event.method,
      url: event.params?.response?.url || event.params?.request?.url || event.params?.entry?.url || "",
      status: event.params?.response?.status || undefined,
      text: event.params?.entry?.text || event.params?.args?.[0]?.value || "",
    }));

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    checks: {
      publicPlaylistClick: { url: publicPlaylistClick.url, title: publicPlaylistClick.h1 },
      relatedTitleClick: { url: relatedTitleClick.url, title: relatedTitleClick.h1 },
    },
    events,
  }, null, 2));
} finally {
  cdp?.close();
  chrome?.kill();
}
