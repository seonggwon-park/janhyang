import assert from "node:assert/strict";
import { copyFile, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createAppServer } from "../src/server.js";
import { normalizeItunesTrack } from "../src/songSearch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "janhyang-"));
let server;
let baseUrl;
let searchCalls = 0;

before(async () => {
  await copyFile(path.join(root, "data", "db.seed.json"), path.join(tempDir, "db.seed.json"));
  server = createAppServer({
    databaseOptions: { dataDir: tempDir },
    logger: { error() {} },
    songSearch: async (query) => {
      searchCalls += 1;
      return query.trim().length < 2 ? [] : [externalSong()];
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("starts with no placeholder seed songs", async () => {
  const body = await request("/api/songs");

  assert.deepEqual(body.songs, []);
});

test("empty external song search query returns empty results", async () => {
  searchCalls = 0;

  const empty = await request("/api/songs/search?q=");
  const tooShort = await request("/api/songs/search?q=a");

  assert.deepEqual(empty.songs, []);
  assert.deepEqual(tooShort.songs, []);
  assert.equal(searchCalls, 0);
});

test("normalizes iTunes music track responses", () => {
  const song = normalizeItunesTrack({
    trackId: 1658078988,
    trackName: "Ditto",
    artistName: "NewJeans",
    collectionName: "OMG - Single",
    artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/example/100x100bb.jpg",
    previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
    releaseDate: "2022-12-19T12:00:00Z"
  });

  assert.deepEqual(song, {
    title: "Ditto",
    artist: "NewJeans",
    albumName: "OMG - Single",
    coverImageUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/example/300x300bb.jpg",
    externalId: "1658078988",
    externalSource: "itunes",
    previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
    releaseYear: 2022
  });
});

test("external song search endpoint returns normalized song results", async () => {
  const body = await request("/api/songs/search?q=ditto");

  assert.equal(body.songs.length, 1);
  assert.equal(body.songs[0].title, "Ditto");
  assert.equal(body.songs[0].externalSource, "itunes");
});

test("creates and reads a music log with a manual song", async () => {
  const created = await request("/api/logs", {
    method: "POST",
    body: JSON.stringify({
      song: {
        title: "새벽의 잔상",
        artist: "테스트 아티스트",
        album: "테스트 앨범",
        year: "2026"
      },
      emotionIds: ["calm", "warmth"],
      listenedAt: "2026-06-01",
      note: "느리게 가라앉는 마음이 남았다."
    })
  });

  assert.equal(created.log.song.title, "새벽의 잔상");
  assert.equal(created.log.song.externalSource, "manual");
  assert.deepEqual(created.log.emotions.map((emotion) => emotion.id), ["calm", "warmth"]);

  const detail = await request(`/api/logs/${encodeURIComponent(created.log.id)}`);
  assert.equal(detail.log.note, "느리게 가라앉는 마음이 남았다.");
});

test("creating logs with the same external song reuses the local song", async () => {
  const first = await createExternalLog("처음 들은 장면이 선명했다.");
  const second = await createExternalLog("다시 들어도 같은 온도가 남았다.");

  assert.equal(first.log.song.id, second.log.song.id);
  assert.equal(first.log.song.externalSource, "itunes");
  assert.equal(first.log.song.externalId, "1658078988");
  assert.equal(first.log.song.albumName, "OMG - Single");
  assert.equal(first.log.song.coverImageUrl, "https://example.com/cover.jpg");
});

test("rejects logs without emotions", async () => {
  const response = await fetch(`${baseUrl}/api/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      song: { title: "무감정", artist: "테스트" },
      emotionIds: [],
      note: "비어 있다."
    })
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /감정/);
});

async function createExternalLog(note) {
  return request("/api/logs", {
    method: "POST",
    body: JSON.stringify({
      song: externalSong(),
      emotionIds: ["calm"],
      listenedAt: "2026-06-01",
      note
    })
  });
}

function externalSong() {
  return {
    title: "Ditto",
    artist: "NewJeans",
    albumName: "OMG - Single",
    coverImageUrl: "https://example.com/cover.jpg",
    externalId: "1658078988",
    externalSource: "itunes",
    previewUrl: "https://example.com/preview.m4a",
    releaseYear: 2022
  };
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const body = await response.json();

  assert.equal(response.ok, true, body.error);
  return body;
}
