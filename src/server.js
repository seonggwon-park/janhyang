import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthService, bearerToken } from "./auth.js";
import { createDatabase } from "./db.js";
import { searchExternalSongs } from "./songSearch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultPublicDir = path.join(projectRoot, "public");
const defaultPort = 3000;

try {
  process.loadEnvFile(path.join(projectRoot, ".env"));
} catch {
  // A checked-in .env file is optional; deployed environments usually provide vars directly.
}

export function createAppServer(options = {}) {
  return createServer(createRequestHandler(options));
}

export function createRequestHandler(options = {}) {
  const publicDir = options.publicDir ?? defaultPublicDir;
  const apiHandler = createApiHandler(options);
  const logger = options.logger ?? console;

  return async function requestHandler(request, response) {
    try {
      const requestUrl = createRequestUrl(request);

      if (requestUrl.pathname.startsWith("/api/")) {
        await apiHandler(request, response, requestUrl);
        return;
      }

      await serveStatic(response, publicDir, requestUrl.pathname);
    } catch (error) {
      logger.error(error);
      sendJson(response, error.statusCode ?? 500, {
        error: error.statusCode ? error.message : "서버에서 문제가 생겼어요."
      });
    }
  };
}

export function createApiHandler(options = {}) {
  const auth = options.auth ?? createAuthService(options.authOptions);
  const database = options.database ?? createDatabase(options.databaseOptions);
  const songSearch = options.songSearch ?? ((query) => searchExternalSongs(query, options.songSearchOptions));
  const logger = options.logger ?? console;

  return async function apiHandler(request, response, providedUrl) {
    try {
      const requestUrl = providedUrl ?? createRequestUrl(request);
      await handleApiRequest(request, response, requestUrl, auth, database, songSearch);
    } catch (error) {
      logger.error(error);
      sendJson(response, error.statusCode ?? 500, {
        error: error.statusCode ? error.message : "서버에서 문제가 생겼어요."
      });
    }
  };
}

function createRequestUrl(request) {
  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  const rewrittenPath = requestUrl.searchParams.get("path");

  if ((requestUrl.pathname === "/api/index.js" || requestUrl.pathname === "/api") && rewrittenPath) {
    requestUrl.pathname = `/api/${rewrittenPath.replace(/^\/+/, "")}`;
    requestUrl.searchParams.delete("path");
  }

  return requestUrl;
}

async function handleApiRequest(request, response, requestUrl, auth, database, songSearch) {
  const method = request.method ?? "GET";
  const pathname = requestUrl.pathname;

  if (method === "GET" && pathname === "/api/health") {
    sendJson(response, 200, { ok: true, name: "janhyang" });
    return;
  }

  if (method === "GET" && pathname === "/api/emotions") {
    const user = await optionalUser(auth, request);
    sendJson(response, 200, { emotions: await database.listAvailableEmotions(user) });
    return;
  }

  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await auth.login(body));
    return;
  }

  if (method === "POST" && pathname === "/api/auth/signup") {
    const body = await readJsonBody(request);
    sendJson(response, 201, await auth.signup(body));
    return;
  }

  if (method === "POST" && pathname === "/api/auth/logout") {
    sendJson(response, 200, await auth.logout(bearerToken(request)));
    return;
  }

  if (method === "GET" && pathname === "/api/auth/me") {
    sendJson(response, 200, { user: await auth.requireUser(request) });
    return;
  }

  if (method === "POST" && pathname === "/api/user-emotions") {
    const user = await auth.requireUser(request);
    const body = await readJsonBody(request);
    const emotion = await database.createUserEmotion(body, user);
    sendJson(response, 201, { emotion });
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

  if (method === "GET" && pathname === "/api/records/recent") {
    const user = await optionalUser(auth, request);
    const records = await database.listPublicRecentRecords(requestUrl.searchParams.get("limit") ?? 6, user);
    sendJson(response, 200, { records });
    return;
  }

  const songDetailMatch = pathname.match(/^\/api\/songs\/([^/]+)$/);

  if (method === "GET" && songDetailMatch) {
    const user = await optionalUser(auth, request);
    const songDetail = await database.getSongDetail(decodeURIComponent(songDetailMatch[1]), user);

    if (!songDetail) {
      sendJson(response, 404, { error: "노래를 찾을 수 없어요." });
      return;
    }

    sendJson(response, 200, songDetail);
    return;
  }

  if (method === "GET" && pathname === "/api/logs") {
    const user = await auth.requireUser(request);
    const logs = await database.listLogs(user);
    sendJson(response, 200, { logs });
    return;
  }

  if (method === "POST" && pathname === "/api/logs") {
    const user = await auth.requireUser(request);
    const body = await readJsonBody(request);
    const log = await database.createLog(body, user);
    sendJson(response, 201, { log });
    return;
  }

  if (method === "GET" && pathname === "/api/reflections") {
    const user = await auth.requireUser(request);
    const reflections = await database.listReflections(user);
    sendJson(response, 200, { reflections });
    return;
  }

  if (method === "POST" && pathname === "/api/reflections") {
    const user = await auth.requireUser(request);
    const body = await readJsonBody(request);
    const reflection = await database.createReflection(body, user);
    sendJson(response, 201, { reflection });
    return;
  }

  const logDetailMatch = pathname.match(/^\/api\/logs\/([^/]+)$/);
  const reflectionDetailMatch = pathname.match(/^\/api\/reflections\/([^/]+)$/);

  if (method === "GET" && logDetailMatch) {
    const user = await auth.requireUser(request);
    const log = await database.getLog(decodeURIComponent(logDetailMatch[1]), user);

    if (!log) {
      sendJson(response, 404, { error: "기록을 찾을 수 없어요." });
      return;
    }

    sendJson(response, 200, { log });
    return;
  }

  if ((method === "PATCH" || method === "PUT") && logDetailMatch) {
    const user = await auth.requireUser(request);
    const body = await readJsonBody(request);
    const log = await database.updateLog(decodeURIComponent(logDetailMatch[1]), body, user);

    if (!log) {
      sendJson(response, 404, { error: "기록을 찾을 수 없어요." });
      return;
    }

    sendJson(response, 200, { log });
    return;
  }

  if (method === "DELETE" && logDetailMatch) {
    const user = await auth.requireUser(request);
    const deleted = await database.deleteLog(decodeURIComponent(logDetailMatch[1]), user);

    if (!deleted) {
      sendJson(response, 404, { error: "기록을 찾을 수 없어요." });
      return;
    }

    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "GET" && reflectionDetailMatch) {
    const user = await auth.requireUser(request);
    const reflection = await database.getReflection(decodeURIComponent(reflectionDetailMatch[1]), user);

    if (!reflection) {
      sendJson(response, 404, { error: "여음을 찾을 수 없어요." });
      return;
    }

    sendJson(response, 200, { reflection });
    return;
  }

  if ((method === "PATCH" || method === "PUT") && reflectionDetailMatch) {
    const user = await auth.requireUser(request);
    const body = await readJsonBody(request);
    const reflection = await database.updateReflection(decodeURIComponent(reflectionDetailMatch[1]), body, user);

    if (!reflection) {
      sendJson(response, 404, { error: "여음을 찾을 수 없어요." });
      return;
    }

    sendJson(response, 200, { reflection });
    return;
  }

  if (method === "DELETE" && reflectionDetailMatch) {
    const user = await auth.requireUser(request);
    const deleted = await database.deleteReflection(decodeURIComponent(reflectionDetailMatch[1]), user);

    if (!deleted) {
      sendJson(response, 404, { error: "여음을 찾을 수 없어요." });
      return;
    }

    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 404, { error: "요청한 API가 없어요." });
}

async function optionalUser(auth, request) {
  const token = bearerToken(request);

  if (!token) {
    return null;
  }

  try {
    return await auth.getUser(token);
  } catch {
    return null;
  }
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
