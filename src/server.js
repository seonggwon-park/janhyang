import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, emotions } from "./db.js";
import { searchExternalSongs } from "./songSearch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultPublicDir = path.join(projectRoot, "public");
const defaultPort = 3000;

export function createAppServer(options = {}) {
  const publicDir = options.publicDir ?? defaultPublicDir;
  const database = options.database ?? createDatabase(options.databaseOptions);
  const songSearch = options.songSearch ?? ((query) => searchExternalSongs(query, options.songSearchOptions));
  const logger = options.logger ?? console;

  return createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");

      if (requestUrl.pathname.startsWith("/api/")) {
        await handleApiRequest(request, response, requestUrl, database, songSearch);
        return;
      }

      await serveStatic(response, publicDir, requestUrl.pathname);
    } catch (error) {
      logger.error(error);
      sendJson(response, error.statusCode ?? 500, {
        error: error.statusCode ? error.message : "서버에서 문제가 생겼어요."
      });
    }
  });
}

async function handleApiRequest(request, response, requestUrl, database, songSearch) {
  const method = request.method ?? "GET";
  const pathname = requestUrl.pathname;

  if (method === "GET" && pathname === "/api/health") {
    sendJson(response, 200, { ok: true, name: "janhyang" });
    return;
  }

  if (method === "GET" && pathname === "/api/emotions") {
    sendJson(response, 200, { emotions });
    return;
  }

  if (method === "GET" && pathname === "/api/songs") {
    const songs = await database.listSongs(requestUrl.searchParams.get("q") ?? "");
    sendJson(response, 200, { songs });
    return;
  }

  if (method === "GET" && pathname === "/api/songs/search") {
    const query = requestUrl.searchParams.get("q") ?? "";

    if (query.trim().length < 2) {
      sendJson(response, 200, { songs: [] });
      return;
    }

    let songs = [];

    try {
      songs = await songSearch(query);
    } catch {
      songs = [];
    }

    sendJson(response, 200, { songs });
    return;
  }

  if (method === "GET" && pathname === "/api/logs") {
    const logs = await database.listLogs();
    sendJson(response, 200, { logs });
    return;
  }

  if (method === "POST" && pathname === "/api/logs") {
    const body = await readJsonBody(request);
    const log = await database.createLog(body);
    sendJson(response, 201, { log });
    return;
  }

  const logDetailMatch = pathname.match(/^\/api\/logs\/([^/]+)$/);

  if (method === "GET" && logDetailMatch) {
    const log = await database.getLog(decodeURIComponent(logDetailMatch[1]));

    if (!log) {
      sendJson(response, 404, { error: "기록을 찾을 수 없어요." });
      return;
    }

    sendJson(response, 200, { log });
    return;
  }

  sendJson(response, 404, { error: "요청한 API가 없어요." });
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;

    if (size > 1_000_000) {
      const error = new Error("요청 본문이 너무 커요.");
      error.statusCode = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("JSON 형식이 올바르지 않아요.");
    error.statusCode = 400;
    throw error;
  }
}

async function serveStatic(response, publicDir, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(publicDir, `.${decodeURIComponent(requestedPath)}`);

  if (!isInsideDirectory(publicDir, filePath)) {
    sendText(response, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  if (await isFile(filePath)) {
    const body = await readFile(filePath);
    sendBuffer(response, 200, body, contentType(filePath));
    return;
  }

  const fallbackPath = path.join(publicDir, "index.html");
  const body = await readFile(fallbackPath);
  sendBuffer(response, 200, body, "text/html; charset=utf-8");
}

function sendJson(response, statusCode, body) {
  sendText(response, statusCode, JSON.stringify(body), "application/json; charset=utf-8");
}

function sendText(response, statusCode, body, type) {
  response.writeHead(statusCode, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

function sendBuffer(response, statusCode, body, type) {
  response.writeHead(statusCode, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

function contentType(filePath) {
  const extension = path.extname(filePath);

  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml; charset=utf-8"
  }[extension] ?? "application/octet-stream";
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function isInsideDirectory(directory, filePath) {
  const relativePath = path.relative(directory, filePath);
  return relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const port = Number.parseInt(process.env.PORT ?? `${defaultPort}`, 10);
  const server = createAppServer();

  server.listen(port, () => {
    console.log(`잔향 is running at http://localhost:${port}`);
  });
}
