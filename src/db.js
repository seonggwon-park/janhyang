import crypto from "node:crypto";
import { access, copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const maxNoteLength = 240;
const maxEmotionCount = 3;

export const emotions = [
  { id: "comfort", label: "위로" },
  { id: "longing", label: "그리움" },
  { id: "calm", label: "고요" },
  { id: "sadness", label: "슬픔" },
  { id: "hope", label: "희망" },
  { id: "warmth", label: "온기" },
  { id: "emptiness", label: "공허" },
  { id: "resolve", label: "다짐" }
];

export function createDatabase(options = {}) {
  const dataDir = options.dataDir ?? process.env.JANHYANG_DATA_DIR ?? path.join(projectRoot, "data");
  const dbPath = options.dbPath ?? process.env.JANHYANG_DB_PATH ?? path.join(dataDir, "db.json");
  const seedPath = options.seedPath ?? path.join(dataDir, "db.seed.json");

  async function ensureDatabase() {
    await mkdir(path.dirname(dbPath), { recursive: true });

    if (await exists(dbPath)) {
      return;
    }

    if (await exists(seedPath)) {
      await copyFile(seedPath, dbPath);
      return;
    }

    await writeJson(dbPath, { songs: [], logs: [] });
  }

  async function readDatabase() {
    await ensureDatabase();
    const raw = await readFile(dbPath, "utf8");
    const parsed = JSON.parse(raw);

    return {
      songs: Array.isArray(parsed.songs) ? parsed.songs : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : []
    };
  }

  async function writeDatabase(database) {
    await mkdir(path.dirname(dbPath), { recursive: true });
    const tempPath = `${dbPath}.${process.pid}.${Date.now()}.tmp`;
    await writeJson(tempPath, database);
    await rename(tempPath, dbPath);
  }

  async function listSongs(query = "") {
    const database = await readDatabase();
    const normalizedQuery = normalize(query);
    const songs = normalizedQuery
      ? database.songs.filter((song) => songMatches(song, normalizedQuery))
      : database.songs;

    return songs.slice(0, 12).map(publicSong);
  }

  async function listLogs() {
    const database = await readDatabase();
    return database.logs
      .map((log) => hydrateLog(log, database.songs))
      .filter(Boolean)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async function getLog(id) {
    const database = await readDatabase();
    const log = database.logs.find((item) => item.id === id);
    return log ? hydrateLog(log, database.songs) : null;
  }

  async function createLog(input) {
    const database = await readDatabase();
    const emotionIds = normalizeEmotionIds(input?.emotionIds);
    const note = cleanText(input?.note);
    const listenedAt = normalizeDate(input?.listenedAt);

    if (!emotionIds.length) {
      throw validationError("감정을 하나 이상 선택해 주세요.");
    }

    if (emotionIds.length > maxEmotionCount) {
      throw validationError(`감정은 최대 ${maxEmotionCount}개까지 선택할 수 있어요.`);
    }

    if (!note) {
      throw validationError("곡이 남긴 감정을 짧게 적어 주세요.");
    }

    if (note.length > maxNoteLength) {
      throw validationError(`메모는 ${maxNoteLength}자 이내로 남겨 주세요.`);
    }

    const song = resolveSong(database, input);
    const now = new Date().toISOString();
    const log = {
      id: `log_${crypto.randomUUID()}`,
      songId: song.id,
      emotionIds,
      note,
      listenedAt,
      createdAt: now,
      updatedAt: now
    };

    database.logs.push(log);
    await writeDatabase(database);
    return hydrateLog(log, database.songs);
  }

  return {
    createLog,
    getLog,
    listLogs,
    listSongs,
    paths: { dataDir, dbPath, seedPath }
  };
}

function resolveSong(database, input) {
  const requestedId = cleanText(input?.songId);
  const existingById = requestedId ? database.songs.find((song) => song.id === requestedId) : null;

  if (existingById) {
    return existingById;
  }

  const manualSong = input?.song ?? {};
  const title = cleanText(manualSong.title);
  const artist = cleanText(manualSong.artist);
  const albumName = cleanText(manualSong.albumName ?? manualSong.album);
  const parsedYear = Number.parseInt(manualSong.releaseYear ?? manualSong.year, 10);
  const year = Number.isFinite(parsedYear) ? parsedYear : null;
  const externalSource = cleanText(manualSong.externalSource);
  const externalId = cleanText(manualSong.externalId);

  if (!title || !artist) {
    throw validationError("곡 제목과 아티스트를 입력해 주세요.");
  }

  if (externalSource && externalId) {
    const existingByExternalId = database.songs.find((song) => {
      return song.externalSource === externalSource && song.externalId === externalId;
    });

    if (existingByExternalId) {
      return existingByExternalId;
    }

    const song = {
      id: `song_${crypto.randomUUID()}`,
      title,
      artist,
      albumName,
      coverImageUrl: cleanText(manualSong.coverImageUrl),
      externalId,
      externalSource,
      previewUrl: cleanText(manualSong.previewUrl),
      releaseYear: year,
      source: externalSource
    };

    database.songs.push(song);
    return song;
  }

  const existingByName = database.songs.find((song) => {
    return normalize(song.title) === normalize(title) && normalize(song.artist) === normalize(artist);
  });

  if (existingByName) {
    return existingByName;
  }

  const song = {
    id: `song_${crypto.randomUUID()}`,
    title,
    artist,
    album: albumName,
    year,
    externalSource: "manual",
    source: "manual"
  };

  database.songs.push(song);
  return song;
}

function hydrateLog(log, songs) {
  const song = songs.find((item) => item.id === log.songId);

  if (!song) {
    return null;
  }

  return {
    ...log,
    emotions: log.emotionIds
      .map((id) => emotions.find((emotion) => emotion.id === id))
      .filter(Boolean),
    song: publicSong(song)
  };
}

function publicSong(song) {
  const albumName = song.albumName ?? song.album ?? "";
  const releaseYear = song.releaseYear ?? song.year ?? null;

  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    album: albumName,
    albumName,
    coverImageUrl: song.coverImageUrl ?? "",
    externalId: song.externalId ?? "",
    externalSource: song.externalSource ?? song.source ?? "manual",
    previewUrl: song.previewUrl ?? "",
    releaseYear,
    year: releaseYear,
    source: song.source ?? song.externalSource ?? "manual"
  };
}

function songMatches(song, normalizedQuery) {
  return [song.title, song.artist, song.albumName, song.album, song.releaseYear, song.year]
    .map(normalize)
    .some((value) => value.includes(normalizedQuery));
}

function normalizeEmotionIds(ids) {
  if (!Array.isArray(ids)) {
    return [];
  }

  const allowed = new Set(emotions.map((emotion) => emotion.id));
  const seen = new Set();

  return ids
    .map(cleanText)
    .filter((id) => allowed.has(id))
    .filter((id) => {
      if (seen.has(id)) {
        return false;
      }

      seen.add(id);
      return true;
    });
}

function normalizeDate(value) {
  const date = cleanText(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  return new Date().toISOString().slice(0, 10);
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return cleanText(value).normalize("NFKC").toLocaleLowerCase("ko-KR");
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
