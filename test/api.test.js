import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import vercelHandler from "../api/index.js";
import { createDatabase } from "../src/db.js";
import { createAppServer } from "../src/server.js";
import { normalizeItunesTrack } from "../src/songSearch.js";

let server;
let baseUrl;
let searchCalls = 0;
let userAToken;
let userBToken;

const userA = {
  email: "a@example.com",
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  password: "password-a"
};
const userB = {
  email: "b@example.com",
  id: "bbbbbbbb-0000-4000-8000-000000000002",
  password: "password-b"
};

before(async () => {
  const supabase = createMockSupabase([userA, userB]);
  server = createAppServer({
    authOptions: {
      fetchImpl: supabase.fetch,
      supabaseAnonKey: "test-anon-key",
      supabaseUrl: "https://example.supabase.co"
    },
    databaseOptions: {
      fetchImpl: supabase.fetch,
      supabaseKey: "test-service-role-key",
      supabaseUrl: "https://example.supabase.co"
    },
    logger: { error() {} },
    songSearch: async (query) => {
      searchCalls += 1;
      return query.trim().length < 2 ? [] : [externalSong()];
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  userAToken = (await request("/api/auth/login", {
    body: JSON.stringify({ email: userA.email, password: userA.password }),
    method: "POST"
  }, null)).accessToken;
  userBToken = (await request("/api/auth/login", {
    body: JSON.stringify({ email: userB.email, password: userB.password }),
    method: "POST"
  }, null)).accessToken;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("starts with no saved songs", async () => {
  const body = await request("/api/songs", {}, null);

  assert.deepEqual(body.songs, []);
});

test("empty external song search query returns empty results", async () => {
  searchCalls = 0;

  const empty = await request("/api/songs/search?q=", {}, null);
  const tooShort = await request("/api/songs/search?q=a", {}, null);

  assert.deepEqual(empty.songs, []);
  assert.deepEqual(tooShort.songs, []);
  assert.equal(searchCalls, 0);
});

test("normalizes iTunes music track responses", () => {
  const song = normalizeItunesTrack({
    artistName: "NewJeans",
    artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/example/100x100bb.jpg",
    collectionName: "OMG - Single",
    previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
    releaseDate: "2022-12-19T12:00:00Z",
    trackId: 1658078988,
    trackName: "Ditto"
  });

  assert.deepEqual(song, {
    albumName: "OMG - Single",
    artist: "NewJeans",
    coverImageUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/example/300x300bb.jpg",
    externalId: "1658078988",
    externalSource: "itunes",
    previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
    releaseYear: 2022,
    title: "Ditto"
  });
});

test("external song search endpoint returns normalized song results", async () => {
  const body = await request("/api/songs/search?q=ditto", {}, null);

  assert.equal(body.songs.length, 1);
  assert.equal(body.songs[0].title, "Ditto");
  assert.equal(body.songs[0].externalSource, "itunes");
});

test("Vercel entrypoint exports a default handler and supports rewritten API paths", async () => {
  assert.equal(typeof vercelHandler, "function");

  const body = await request("/api/index.js?path=songs/search&q=ditto", {}, null);

  assert.equal(body.songs.length, 1);
  assert.equal(body.songs[0].title, "Ditto");
});

test("requires authentication for user-owned log routes", async () => {
  const list = await rawRequest("/api/logs", {}, null);
  const create = await rawRequest("/api/logs", {
    body: JSON.stringify({
      emotionIds: ["calm"],
      note: "비공개 잔향",
      song: { artist: "테스트", title: "테스트 곡" }
    }),
    method: "POST"
  }, null);

  assert.equal(list.status, 401);
  assert.equal(create.status, 401);
});

test("requires authentication for user-owned reflection routes", async () => {
  const list = await rawRequest("/api/reflections", {}, null);
  const create = await rawRequest("/api/reflections", {
    body: JSON.stringify({
      body: "혼자만 볼 수 있는 긴 여음.",
      emotionIds: ["calm"],
      song: { artist: "테스트", title: "테스트 곡" }
    }),
    method: "POST"
  }, null);

  assert.equal(list.status, 401);
  assert.equal(create.status, 401);
});

test("creates and reads a music log with a manual song for the current user", async () => {
  const created = await request("/api/logs", {
    body: JSON.stringify({
      emotionIds: ["calm", "warmth"],
      listenedAt: "2026-06-01",
      note: "소리가 가라앉고 마음에 남았다.",
      song: {
        album: "테스트 앨범",
        artist: "테스트 아티스트",
        title: "안녕의 여운",
        year: "2026"
      }
    }),
    method: "POST"
  });

  assert.equal(created.log.userId, userA.id);
  assert.equal(created.log.song.title, "안녕의 여운");
  assert.equal(created.log.song.externalSource, "manual");
  assert.deepEqual(created.log.emotions.map((emotion) => emotion.id), ["calm", "warmth"]);

  const detail = await request(`/api/logs/${encodeURIComponent(created.log.id)}`);
  assert.equal(detail.log.note, "소리가 가라앉고 마음에 남았다.");
});

test("creates and reads a long reflection with a manual song for the current user", async () => {
  const created = await request("/api/reflections", {
    body: JSON.stringify({
      body: "짧게 지나가지 않는 마음이 있어서 한참을 적어두었다.\n이 노래는 오래 남는 장면처럼 돌아왔다.",
      emotionIds: ["longing", "calm"],
      listenedAt: "2026-06-02",
      song: {
        album: "여음 앨범",
        artist: "테스트 아티스트",
        title: "긴 밤의 노래",
        year: "2026"
      },
      title: "오래 남은 밤"
    }),
    method: "POST"
  });

  assert.equal(created.reflection.userId, userA.id);
  assert.equal(created.reflection.title, "오래 남은 밤");
  assert.equal(created.reflection.song.externalSource, "manual");
  assert.deepEqual(created.reflection.emotions.map((emotion) => emotion.id), ["longing", "calm"]);

  const detail = await request(`/api/reflections/${encodeURIComponent(created.reflection.id)}`);
  assert.match(detail.reflection.body, /오래 남는 장면/);
});

test("only returns logs owned by the authenticated user", async () => {
  const created = await createExternalLog("첫 번째 장면은 아직 선명하다.");
  const ownerLogs = await request("/api/logs");
  const otherLogs = await request("/api/logs", {}, userBToken);
  const otherDetail = await rawRequest(`/api/logs/${encodeURIComponent(created.log.id)}`, {}, userBToken);

  assert.ok(ownerLogs.logs.some((log) => log.id === created.log.id));
  assert.equal(otherLogs.logs.some((log) => log.id === created.log.id), false);
  assert.equal(otherDetail.status, 404);
});

test("only returns reflections owned by the authenticated user", async () => {
  const created = await createExternalReflection("다른 사람에게 보이면 안 되는 긴 감상.");
  const ownerReflections = await request("/api/reflections");
  const otherReflections = await request("/api/reflections", {}, userBToken);
  const otherDetail = await rawRequest(`/api/reflections/${encodeURIComponent(created.reflection.id)}`, {}, userBToken);

  assert.ok(ownerReflections.reflections.some((reflection) => reflection.id === created.reflection.id));
  assert.equal(otherReflections.reflections.some((reflection) => reflection.id === created.reflection.id), false);
  assert.equal(otherDetail.status, 404);
});

test("song detail publicly lists records for the song while my pages stay private", async () => {
  const createdLog = await createExternalLog("공개 노래 페이지에서는 보이는 짧은 잔향.");
  const createdReflection = await createExternalReflection("공개 노래 페이지에서는 보이는 긴 여음.");
  const songId = createdLog.log.song.id;

  assert.equal(createdReflection.reflection.song.id, songId);

  const anonymousDetail = await request(`/api/songs/${encodeURIComponent(songId)}`, {}, null);
  const otherUserDetail = await request(`/api/songs/${encodeURIComponent(songId)}`, {}, userBToken);
  const ownerDetail = await request(`/api/songs/${encodeURIComponent(songId)}`);
  const otherLogs = await request("/api/logs", {}, userBToken);
  const otherReflections = await request("/api/reflections", {}, userBToken);

  const anonymousLog = anonymousDetail.logs.find((log) => log.id === createdLog.log.id);
  const anonymousReflection = anonymousDetail.reflections.find((reflection) => reflection.id === createdReflection.reflection.id);
  const otherUserLog = otherUserDetail.logs.find((log) => log.id === createdLog.log.id);
  const otherUserReflection = otherUserDetail.reflections.find((reflection) => reflection.id === createdReflection.reflection.id);
  const ownerLog = ownerDetail.logs.find((log) => log.id === createdLog.log.id);
  const ownerReflection = ownerDetail.reflections.find((reflection) => reflection.id === createdReflection.reflection.id);

  assert.equal(anonymousDetail.song.id, songId);
  assert.equal(anonymousLog.authorLabel, "누군가의 잔향");
  assert.equal(anonymousReflection.authorLabel, "누군가의 여음");
  assert.equal(anonymousLog.ownedByCurrentUser, false);
  assert.equal(anonymousReflection.ownedByCurrentUser, false);
  assert.equal("userId" in anonymousLog, false);
  assert.equal("userId" in anonymousReflection, false);
  assert.equal(otherUserLog.ownedByCurrentUser, false);
  assert.equal(otherUserReflection.ownedByCurrentUser, false);
  assert.equal(ownerLog.ownedByCurrentUser, true);
  assert.equal(ownerReflection.ownedByCurrentUser, true);
  assert.equal(otherLogs.logs.some((log) => log.id === createdLog.log.id), false);
  assert.equal(otherReflections.reflections.some((reflection) => reflection.id === createdReflection.reflection.id), false);
});

test("creating logs with the same external song reuses the Supabase song row", async () => {
  const first = await createExternalLog("처음 들은 장면이 선명했다.");
  const second = await createExternalLog("다시 들어도 같은 온도가 남았다.");

  assert.equal(first.log.song.id, second.log.song.id);
  assert.equal(first.log.song.externalSource, "itunes");
  assert.equal(first.log.song.externalId, "1658078988");
  assert.equal(first.log.song.albumName, "OMG - Single");
  assert.equal(first.log.song.coverImageUrl, "https://example.com/cover.jpg");
});

test("creating reflections with the same external song reuses the Supabase song row", async () => {
  const first = await createExternalReflection("여음으로 남긴 첫 번째 긴 감상.");
  const second = await createExternalReflection("같은 노래에 대해 다시 길게 적은 감상.");

  assert.equal(first.reflection.song.id, second.reflection.song.id);
  assert.equal(first.reflection.song.externalSource, "itunes");
  assert.equal(first.reflection.song.externalId, "1658078988");
});

test("update and delete only work for the owning user", async () => {
  const created = await createExternalLog("수정되기 전의 잔향.");
  const otherUpdate = await rawRequest(`/api/logs/${encodeURIComponent(created.log.id)}`, {
    body: JSON.stringify({ note: "다른 사람이 바꿀 수 없다." }),
    method: "PATCH"
  }, userBToken);

  assert.equal(otherUpdate.status, 404);

  const updated = await request(`/api/logs/${encodeURIComponent(created.log.id)}`, {
    body: JSON.stringify({ note: "조용히 다시 적은 잔향." }),
    method: "PATCH"
  });

  assert.equal(updated.log.note, "조용히 다시 적은 잔향.");

  const otherDelete = await rawRequest(`/api/logs/${encodeURIComponent(created.log.id)}`, {
    method: "DELETE"
  }, userBToken);

  assert.equal(otherDelete.status, 404);

  const deleted = await request(`/api/logs/${encodeURIComponent(created.log.id)}`, {
    method: "DELETE"
  });
  const afterDelete = await rawRequest(`/api/logs/${encodeURIComponent(created.log.id)}`);

  assert.equal(deleted.ok, true);
  assert.equal(afterDelete.status, 404);
});

test("reflection update and delete only work for the owning user", async () => {
  const created = await createExternalReflection("수정되기 전의 긴 여음.");
  const otherUpdate = await rawRequest(`/api/reflections/${encodeURIComponent(created.reflection.id)}`, {
    body: JSON.stringify({ body: "다른 사람이 바꿀 수 없다." }),
    method: "PATCH"
  }, userBToken);

  assert.equal(otherUpdate.status, 404);

  const updated = await request(`/api/reflections/${encodeURIComponent(created.reflection.id)}`, {
    body: JSON.stringify({
      body: "천천히 다시 적은 긴 여음.",
      emotionIds: ["warmth"],
      listenedAt: "2026-06-03",
      title: "다시 적은 여음"
    }),
    method: "PATCH"
  });

  assert.equal(updated.reflection.body, "천천히 다시 적은 긴 여음.");
  assert.equal(updated.reflection.title, "다시 적은 여음");
  assert.deepEqual(updated.reflection.emotions.map((emotion) => emotion.id), ["warmth"]);

  const otherDelete = await rawRequest(`/api/reflections/${encodeURIComponent(created.reflection.id)}`, {
    method: "DELETE"
  }, userBToken);

  assert.equal(otherDelete.status, 404);

  const deleted = await request(`/api/reflections/${encodeURIComponent(created.reflection.id)}`, {
    method: "DELETE"
  });
  const afterDelete = await rawRequest(`/api/reflections/${encodeURIComponent(created.reflection.id)}`);

  assert.equal(deleted.ok, true);
  assert.equal(afterDelete.status, 404);
});

test("returns a clear error when Supabase env vars are missing", async () => {
  const badServer = createAppServer({
    database: createDatabase({ supabaseKey: "", supabaseUrl: "" }),
    logger: { error() {} }
  });

  await new Promise((resolve) => badServer.listen(0, "127.0.0.1", resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${badServer.address().port}/api/songs`);
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.match(body.error, /Supabase 환경 변수/);
  } finally {
    await new Promise((resolve) => badServer.close(resolve));
  }
});

test("rejects logs without emotions after authentication", async () => {
  const response = await rawRequest("/api/logs", {
    body: JSON.stringify({
      emotionIds: [],
      note: "비어 있다.",
      song: { artist: "테스트", title: "무감정" }
    }),
    method: "POST"
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /감정/);
});

test("rejects reflections without a body after authentication", async () => {
  const response = await rawRequest("/api/reflections", {
    body: JSON.stringify({
      body: "",
      emotionIds: ["calm"],
      song: { artist: "테스트", title: "빈 여음" }
    }),
    method: "POST"
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /감상/);
});

async function createExternalLog(note) {
  return request("/api/logs", {
    body: JSON.stringify({
      emotionIds: ["calm"],
      listenedAt: "2026-06-01",
      note,
      song: externalSong()
    }),
    method: "POST"
  });
}

async function createExternalReflection(body) {
  return request("/api/reflections", {
    body: JSON.stringify({
      body,
      emotionIds: ["calm"],
      listenedAt: "2026-06-02",
      song: externalSong(),
      title: "긴 여음"
    }),
    method: "POST"
  });
}

function createMockSupabase(seedUsers = []) {
  const state = {
    logs: [],
    nextReflectionId: 1,
    nextLogId: 1,
    nextSongId: 1,
    nextTokenId: 1,
    reflections: [],
    sessions: new Map(),
    songs: [],
    users: seedUsers.map((user) => ({ ...user }))
  };

  return {
    fetch: async (input, options = {}) => {
      const requestUrl = new URL(String(input));

      if (requestUrl.pathname.startsWith("/auth/v1/")) {
        return handleAuthRequest(state, requestUrl, options);
      }

      if (!requestUrl.pathname.startsWith("/rest/v1/")) {
        return jsonResponse({ error: "not found" }, 404);
      }

      const table = requestUrl.pathname.split("/").pop();

      if (options.method === "POST" && table === "songs") {
        const rows = JSON.parse(options.body).map((song) => {
          const now = new Date().toISOString();
          const row = {
            created_at: now,
            id: `00000000-0000-4000-8000-${String(state.nextSongId++).padStart(12, "0")}`,
            updated_at: now,
            ...song
          };
          state.songs.push(row);
          return row;
        });

        return jsonResponse(rows);
      }

      if (options.method === "POST" && table === "music_logs") {
        const rows = JSON.parse(options.body).map((log) => {
          const now = new Date().toISOString();
          const row = {
            created_at: now,
            id: `10000000-0000-4000-8000-${String(state.nextLogId++).padStart(12, "0")}`,
            updated_at: now,
            ...log
          };
          state.logs.push(row);
          return row;
        });

        return jsonResponse(rows);
      }

      if (options.method === "POST" && table === "music_reflections") {
        const rows = JSON.parse(options.body).map((reflection) => {
          const now = new Date().toISOString();
          const row = {
            created_at: now,
            id: `20000000-0000-4000-8000-${String(state.nextReflectionId++).padStart(12, "0")}`,
            updated_at: now,
            ...reflection
          };
          state.reflections.push(row);
          return row;
        });

        return jsonResponse(rows);
      }

      if ((options.method === "PATCH" || options.method === "PUT") && table === "music_logs") {
        const patch = JSON.parse(options.body);
        const rows = applyFilters(state.logs, requestUrl).map((log) => {
          Object.assign(log, patch, { updated_at: new Date().toISOString() });
          return log;
        });

        return jsonResponse(rows);
      }

      if ((options.method === "PATCH" || options.method === "PUT") && table === "music_reflections") {
        const patch = JSON.parse(options.body);
        const rows = applyFilters(state.reflections, requestUrl).map((reflection) => {
          Object.assign(reflection, patch, { updated_at: new Date().toISOString() });
          return reflection;
        });

        return jsonResponse(rows);
      }

      if (options.method === "DELETE" && table === "music_logs") {
        const rows = applyFilters(state.logs, requestUrl);
        state.logs = state.logs.filter((log) => !rows.includes(log));
        return jsonResponse(rows);
      }

      if (options.method === "DELETE" && table === "music_reflections") {
        const rows = applyFilters(state.reflections, requestUrl);
        state.reflections = state.reflections.filter((reflection) => !rows.includes(reflection));
        return jsonResponse(rows);
      }

      if (table === "songs") {
        return jsonResponse(applyFilters(state.songs, requestUrl));
      }

      if (table === "music_logs") {
        const rows = applyFilters(state.logs, requestUrl).map((log) => ({
          ...log,
          songs: state.songs.find((song) => song.id === log.song_id) ?? null
        }));

        return jsonResponse(rows);
      }

      if (table === "music_reflections") {
        const rows = applyFilters(state.reflections, requestUrl).map((reflection) => ({
          ...reflection,
          songs: state.songs.find((song) => song.id === reflection.song_id) ?? null
        }));

        return jsonResponse(rows);
      }

      return jsonResponse({ error: "not found" }, 404);
    }
  };
}

function handleAuthRequest(state, requestUrl, options) {
  const pathname = requestUrl.pathname.replace("/auth/v1", "");

  if (options.method === "POST" && pathname === "/token") {
    const body = JSON.parse(options.body);
    const user = state.users.find((candidate) => candidate.email === body.email && candidate.password === body.password);

    if (!user) {
      return jsonResponse({ error: "invalid credentials" }, 401);
    }

    return jsonResponse(createSession(state, user));
  }

  if (options.method === "POST" && pathname === "/signup") {
    const body = JSON.parse(options.body);
    const existing = state.users.find((candidate) => candidate.email === body.email);

    if (existing) {
      return jsonResponse({ error: "already registered" }, 422);
    }

    const user = {
      email: body.email,
      id: `cccccccc-0000-4000-8000-${String(state.users.length + 1).padStart(12, "0")}`,
      password: body.password
    };
    state.users.push(user);

    return jsonResponse(createSession(state, user));
  }

  if (options.method === "GET" && pathname === "/user") {
    const user = userFromToken(state, options);
    return user ? jsonResponse(publicUser(user)) : jsonResponse({ error: "unauthorized" }, 401);
  }

  if (options.method === "POST" && pathname === "/logout") {
    const token = tokenFromHeaders(options);
    state.sessions.delete(token);
    return jsonResponse({}, 204);
  }

  return jsonResponse({ error: "not found" }, 404);
}

function createSession(state, user) {
  const token = `token-${state.nextTokenId++}-${user.id}`;
  state.sessions.set(token, user.id);

  return {
    access_token: token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `refresh-${token}`,
    user: publicUser(user)
  };
}

function userFromToken(state, options) {
  const userId = state.sessions.get(tokenFromHeaders(options));
  return state.users.find((user) => user.id === userId) ?? null;
}

function tokenFromHeaders(options) {
  const authorization = options.headers?.Authorization ?? options.headers?.authorization ?? "";
  const match = String(authorization).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function publicUser(user) {
  return {
    email: user.email,
    id: user.id
  };
}

function applyFilters(rows, requestUrl) {
  let filtered = [...rows];

  for (const [key, value] of requestUrl.searchParams.entries()) {
    if (["select", "order", "limit", "or"].includes(key)) {
      continue;
    }

    if (value.startsWith("eq.")) {
      const expected = value.slice(3);
      filtered = filtered.filter((row) => String(row[key] ?? "") === expected);
    }
  }

  const order = requestUrl.searchParams.get("order");

  if (order === "created_at.desc") {
    filtered.sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
  }

  const limit = Number.parseInt(requestUrl.searchParams.get("limit"), 10);
  return Number.isFinite(limit) ? filtered.slice(0, limit) : filtered;
}

function jsonResponse(body, status = 200) {
  return {
    json: async () => body,
    ok: status >= 200 && status < 300,
    status
  };
}

function externalSong() {
  return {
    albumName: "OMG - Single",
    artist: "NewJeans",
    coverImageUrl: "https://example.com/cover.jpg",
    externalId: "1658078988",
    externalSource: "itunes",
    previewUrl: "https://example.com/preview.m4a",
    releaseYear: 2022,
    title: "Ditto"
  };
}

async function request(pathname, options = {}, token = userAToken) {
  const response = await rawRequest(pathname, options, token);

  assert.equal(response.ok, true, response.body.error);
  return response.body;
}

async function rawRequest(pathname, options = {}, token = userAToken) {
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  };
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers
  });
  const body = await response.json();

  return {
    body,
    ok: response.ok,
    status: response.status
  };
}
