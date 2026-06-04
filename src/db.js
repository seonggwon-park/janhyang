const maxNoteLength = 240;
const maxEmotionCount = 3;
const maxCustomEmotionLength = 24;

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
  const config = createSupabaseConfig(options);

  async function listSongs(query = "") {
    const requestUrl = supabaseUrl(config, "songs");
    requestUrl.searchParams.set("select", "*");
    requestUrl.searchParams.set("order", "created_at.desc");
    requestUrl.searchParams.set("limit", "12");

    const normalizedQuery = normalize(query);

    if (normalizedQuery) {
      const escapedQuery = escapePostgrestPattern(normalizedQuery);
      requestUrl.searchParams.set(
        "or",
        `(title.ilike.*${escapedQuery}*,artist.ilike.*${escapedQuery}*,album_name.ilike.*${escapedQuery}*)`
      );
    }

    const songs = await supabaseRequest(config, requestUrl);
    return songs.map(publicSong);
  }

  async function listAvailableEmotions(user = null) {
    if (!user?.id) {
      return emotions;
    }

    const customEmotions = await listUserEmotionRows(config, user.id);
    return [
      ...emotions,
      ...customEmotions.map(publicUserEmotion)
    ];
  }

  async function createUserEmotion(input, user) {
    const label = normalizeCustomEmotionLabel(input?.label);

    if (isDefaultEmotionValue(label)) {
      throw validationError("이미 추가한 감정이에요.");
    }

    const existing = await findUserEmotionByLabel(config, user.id, label);

    if (existing) {
      throw validationError("이미 추가한 감정이에요.");
    }

    try {
      const rows = await insertRows(config, "user_emotions", [{
        label,
        user_id: user.id
      }]);

      return publicUserEmotion(rows[0]);
    } catch (error) {
      const duplicate = await findUserEmotionByLabel(config, user.id, label);

      if (duplicate) {
        throw validationError("이미 추가한 감정이에요.");
      }

      throw error;
    }
  }

  async function getSongDetail(id, user = null) {
    const song = await findSong(config, { id });

    if (!song) {
      return null;
    }

    const [logRows, reflectionRows] = await Promise.all([
      listPublicRowsForSong(config, "music_logs", song.id),
      listPublicRowsForSong(config, "music_reflections", song.id)
    ]);

    return {
      logs: logRows.map((row) => publicLogForSong(row, user)),
      reflections: reflectionRows.map((row) => publicReflectionForSong(row, user)),
      song: publicSong(song)
    };
  }

  async function listPublicRecentRecords(limit = 6, user = null) {
    const safeLimit = normalizeLimit(limit, 6, 12);
    const [logRows, reflectionRows] = await Promise.all([
      listPublicRecentRows(config, "music_logs", safeLimit),
      listPublicRecentRows(config, "music_reflections", safeLimit)
    ]);
    const records = [
      ...logRows.map((row) => publicRecentLog(row, user)).filter(Boolean),
      ...reflectionRows.map((row) => publicRecentReflection(row, user)).filter(Boolean)
    ];

    return records
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
      .slice(0, safeLimit);
  }

  async function listPublicRecordsByEmotion(label, limit = 24, user = null) {
    const safeLimit = normalizeLimit(limit, 24, 60);
    const emotionValues = emotionValuesForLabel(label);
    const [logRows, reflectionRows] = await Promise.all([
      listPublicRowsByEmotion(config, "music_logs", emotionValues, safeLimit),
      listPublicRowsByEmotion(config, "music_reflections", emotionValues, safeLimit)
    ]);
    const records = [
      ...logRows.map((row) => publicRecentLog(row, user)).filter(Boolean),
      ...reflectionRows.map((row) => publicRecentReflection(row, user)).filter(Boolean)
    ];

    return records
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
      .slice(0, safeLimit);
  }

  async function resolvePublicSong(input) {
    const song = await resolveSong(config, input);
    return publicSong(song);
  }

  async function listLogs(user) {
    const requestUrl = supabaseUrl(config, "music_logs");
    requestUrl.searchParams.set("select", "*,songs(*)");
    requestUrl.searchParams.set("user_id", `eq.${user.id}`);
    requestUrl.searchParams.set("order", "created_at.desc");

    const logs = await supabaseRequest(config, requestUrl);
    return logs.map(hydrateLog).filter(Boolean);
  }

  async function getLog(id, user) {
    const requestUrl = supabaseUrl(config, "music_logs");
    requestUrl.searchParams.set("select", "*,songs(*)");
    requestUrl.searchParams.set("id", `eq.${id}`);
    requestUrl.searchParams.set("user_id", `eq.${user.id}`);
    requestUrl.searchParams.set("limit", "1");

    const logs = await supabaseRequest(config, requestUrl);
    return logs[0] ? hydrateLog(logs[0]) : null;
  }

  async function createLog(input, user) {
    const emotionIds = await normalizeEmotionIdsForUser(config, input?.emotionIds, user);
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

    const song = await resolveSong(config, input);
    const logRows = await insertRows(config, "music_logs", [{
      song_id: song.id,
      user_id: user.id,
      emotions: emotionIds,
      note,
      listened_at: listenedAt
    }]);

    return hydrateLog({ ...logRows[0], songs: song });
  }

  async function updateLog(id, input, user) {
    const current = await getLog(id, user);

    if (!current) {
      return null;
    }

    const emotionIds = input?.emotionIds === undefined
      ? current.emotionIds
      : await normalizeEmotionIdsForUser(config, input.emotionIds, user);
    const note = input?.note === undefined ? current.note : cleanText(input.note);
    const listenedAt = input?.listenedAt === undefined ? current.listenedAt : normalizeDate(input.listenedAt);

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

    const requestUrl = supabaseUrl(config, "music_logs");
    requestUrl.searchParams.set("id", `eq.${id}`);
    requestUrl.searchParams.set("user_id", `eq.${user.id}`);

    await supabaseRequest(config, requestUrl, {
      body: JSON.stringify({
        emotions: emotionIds,
        note,
        listened_at: listenedAt
      }),
      headers: { Prefer: "return=representation" },
      method: "PATCH"
    });

    return getLog(id, user);
  }

  async function deleteLog(id, user) {
    const requestUrl = supabaseUrl(config, "music_logs");
    requestUrl.searchParams.set("id", `eq.${id}`);
    requestUrl.searchParams.set("user_id", `eq.${user.id}`);

    const rows = await supabaseRequest(config, requestUrl, {
      headers: { Prefer: "return=representation" },
      method: "DELETE"
    });

    return rows.length > 0;
  }

  async function listReflections(user) {
    const requestUrl = supabaseUrl(config, "music_reflections");
    requestUrl.searchParams.set("select", "*,songs(*)");
    requestUrl.searchParams.set("user_id", `eq.${user.id}`);
    requestUrl.searchParams.set("order", "created_at.desc");

    const reflections = await supabaseRequest(config, requestUrl);
    return reflections.map(hydrateReflection).filter(Boolean);
  }

  async function getReflection(id, user) {
    const requestUrl = supabaseUrl(config, "music_reflections");
    requestUrl.searchParams.set("select", "*,songs(*)");
    requestUrl.searchParams.set("id", `eq.${id}`);
    requestUrl.searchParams.set("user_id", `eq.${user.id}`);
    requestUrl.searchParams.set("limit", "1");

    const reflections = await supabaseRequest(config, requestUrl);
    return reflections[0] ? hydrateReflection(reflections[0]) : null;
  }

  async function getPublicReflection(id, user = null) {
    const requestUrl = supabaseUrl(config, "music_reflections");
    requestUrl.searchParams.set("select", "*,songs(*)");
    requestUrl.searchParams.set("id", `eq.${id}`);
    requestUrl.searchParams.set("limit", "1");

    const reflections = await supabaseRequest(config, requestUrl);
    return reflections[0] ? publicReflectionDetail(reflections[0], user) : null;
  }

  async function createReflection(input, user) {
    const customEmotionLabels = await userCustomEmotionLabels(config, user);
    const reflection = normalizeReflectionInput(input, customEmotionLabels);
    const song = await resolveSong(config, input);
    const rows = await insertRows(config, "music_reflections", [{
      body: reflection.body,
      emotions: reflection.emotionIds,
      listened_at: reflection.listenedAt,
      song_id: song.id,
      title: reflection.title,
      user_id: user.id
    }]);

    return hydrateReflection({ ...rows[0], songs: song });
  }

  async function updateReflection(id, input, user) {
    const current = await getReflection(id, user);

    if (!current) {
      return null;
    }

    const customEmotionLabels = await userCustomEmotionLabels(config, user);
    const reflection = normalizeReflectionInput({
      body: input?.body === undefined ? current.body : input.body,
      emotionIds: input?.emotionIds === undefined ? current.emotionIds : input.emotionIds,
      listenedAt: input?.listenedAt === undefined ? current.listenedAt : input.listenedAt,
      title: input?.title === undefined ? current.title : input.title
    }, [...customEmotionLabels, ...current.emotionIds]);
    const requestUrl = supabaseUrl(config, "music_reflections");
    requestUrl.searchParams.set("id", `eq.${id}`);
    requestUrl.searchParams.set("user_id", `eq.${user.id}`);

    await supabaseRequest(config, requestUrl, {
      body: JSON.stringify({
        body: reflection.body,
        emotions: reflection.emotionIds,
        listened_at: reflection.listenedAt,
        title: reflection.title
      }),
      headers: { Prefer: "return=representation" },
      method: "PATCH"
    });

    return getReflection(id, user);
  }

  async function deleteReflection(id, user) {
    const requestUrl = supabaseUrl(config, "music_reflections");
    requestUrl.searchParams.set("id", `eq.${id}`);
    requestUrl.searchParams.set("user_id", `eq.${user.id}`);

    const rows = await supabaseRequest(config, requestUrl, {
      headers: { Prefer: "return=representation" },
      method: "DELETE"
    });

    return rows.length > 0;
  }

  return {
    createLog,
    createReflection,
    createUserEmotion,
    deleteLog,
    deleteReflection,
    getLog,
    getPublicReflection,
    getReflection,
    getSongDetail,
    listAvailableEmotions,
    listLogs,
    listPublicRecordsByEmotion,
    listPublicRecentRecords,
    listReflections,
    listSongs,
    resolvePublicSong,
    updateLog,
    updateReflection
  };
}

async function resolveSong(config, input) {
  const requestedId = cleanText(input?.songId);

  if (requestedId) {
    const existingById = await findSong(config, { id: requestedId });

    if (existingById) {
      return existingById;
    }
  }

  const inputSong = input?.song ?? {};
  const title = cleanText(inputSong.title);
  const artist = cleanText(inputSong.artist);
  const albumName = cleanText(inputSong.albumName ?? inputSong.album);
  const releaseYear = normalizeYear(inputSong.releaseYear ?? inputSong.year);
  const externalSource = cleanText(inputSong.externalSource);
  const externalId = cleanText(inputSong.externalId);

  if (!title || !artist) {
    throw validationError("곡 제목과 아티스트를 입력해 주세요.");
  }

  if (externalSource && externalId) {
    const existingByExternalId = await findSong(config, {
      external_source: externalSource,
      external_id: externalId
    });

    if (existingByExternalId) {
      return existingByExternalId;
    }

    return insertSong(config, {
      title,
      artist,
      album_name: emptyToNull(albumName),
      cover_image_url: emptyToNull(inputSong.coverImageUrl),
      external_id: externalId,
      external_source: externalSource,
      release_year: releaseYear
    });
  }

  const existingByName = await findSong(config, {
    title,
    artist
  });

  if (existingByName) {
    return existingByName;
  }

  return insertSong(config, {
    title,
    artist,
    album_name: emptyToNull(albumName),
    cover_image_url: null,
    external_id: null,
    external_source: "manual",
    release_year: releaseYear
  });
}

async function insertSong(config, song) {
  try {
    const rows = await insertRows(config, "songs", [song]);
    return rows[0];
  } catch (error) {
    if (song.external_source && song.external_id) {
      const existingByExternalId = await findSong(config, {
        external_source: song.external_source,
        external_id: song.external_id
      });

      if (existingByExternalId) {
        return existingByExternalId;
      }
    }

    throw error;
  }
}

async function findSong(config, filters) {
  const requestUrl = supabaseUrl(config, "songs");
  requestUrl.searchParams.set("select", "*");
  requestUrl.searchParams.set("limit", "1");

  for (const [key, value] of Object.entries(filters)) {
    requestUrl.searchParams.set(key, `eq.${value}`);
  }

  const songs = await supabaseRequest(config, requestUrl);
  return songs[0] ?? null;
}

async function insertRows(config, table, rows) {
  const requestUrl = supabaseUrl(config, table);
  return supabaseRequest(config, requestUrl, {
    body: JSON.stringify(rows),
    headers: { Prefer: "return=representation" },
    method: "POST"
  });
}

async function listUserEmotionRows(config, userId) {
  const requestUrl = supabaseUrl(config, "user_emotions");
  requestUrl.searchParams.set("select", "*");
  requestUrl.searchParams.set("user_id", `eq.${userId}`);
  requestUrl.searchParams.set("order", "created_at.asc");

  return supabaseRequest(config, requestUrl);
}

async function userCustomEmotionLabels(config, user) {
  const rows = await listUserEmotionRows(config, user.id);
  return rows.map((row) => row.label);
}

async function findUserEmotionByLabel(config, userId, label) {
  const normalizedLabel = normalizeComparableLabel(label);
  const rows = await listUserEmotionRows(config, userId);
  return rows.find((row) => normalizeComparableLabel(row.label) === normalizedLabel) ?? null;
}

async function listPublicRowsForSong(config, table, songId) {
  const requestUrl = supabaseUrl(config, table);
  requestUrl.searchParams.set("select", "*");
  requestUrl.searchParams.set("song_id", `eq.${songId}`);
  requestUrl.searchParams.set("order", "created_at.desc");

  return supabaseRequest(config, requestUrl);
}

async function listPublicRecentRows(config, table, limit) {
  const requestUrl = supabaseUrl(config, table);
  requestUrl.searchParams.set("select", "*,songs(*)");
  requestUrl.searchParams.set("order", "created_at.desc");
  requestUrl.searchParams.set("limit", String(limit));

  return supabaseRequest(config, requestUrl);
}

async function listPublicRowsByEmotion(config, table, emotionValues, limit) {
  const rowMap = new Map();

  await Promise.all([...emotionValues].map(async (emotionValue) => {
    const requestUrl = supabaseUrl(config, table);
    requestUrl.searchParams.set("select", "*,songs(*)");
    requestUrl.searchParams.set("emotions", `cs.{${postgresArrayString(emotionValue)}}`);
    requestUrl.searchParams.set("order", "created_at.desc");
    requestUrl.searchParams.set("limit", String(limit));

    const rows = await supabaseRequest(config, requestUrl);

    rows.forEach((row) => {
      rowMap.set(row.id, row);
    });
  }));

  return [...rowMap.values()]
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
    .slice(0, limit);
}

function emotionValuesForLabel(label) {
  const text = cleanText(label);
  const comparableLabel = normalizeComparableLabel(text);
  const values = new Set([text]);
  const defaultEmotion = emotions.find((emotion) => (
    normalizeComparableLabel(emotion.id) === comparableLabel ||
    normalizeComparableLabel(emotion.label) === comparableLabel
  ));

  if (defaultEmotion) {
    values.add(defaultEmotion.id);
    values.add(defaultEmotion.label);
  }

  return values;
}

function postgresArrayString(value) {
  return `"${cleanText(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function hydrateLog(row) {
  if (!row?.songs) {
    return null;
  }

  const emotionIds = Array.isArray(row.emotions) ? row.emotions : [];

  return {
    id: row.id,
    songId: row.song_id,
    userId: row.user_id,
    emotionIds,
    emotions: emotionIds.map(publicEmotion),
    note: row.note,
    listenedAt: row.listened_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    song: publicSong(row.songs)
  };
}

function publicLogForSong(row, user) {
  const emotionIds = Array.isArray(row.emotions) ? row.emotions : [];

  return {
    id: row.id,
    songId: row.song_id,
    emotionIds,
    emotions: emotionIds.map(publicEmotion),
    note: row.note,
    listenedAt: row.listened_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    authorLabel: "누군가의 잔향",
    ownedByCurrentUser: Boolean(user?.id && row.user_id === user.id)
  };
}

function publicRecentLog(row, user) {
  if (!row?.songs) {
    return null;
  }

  return {
    ...publicLogForSong(row, user),
    recordType: "log",
    song: publicSong(row.songs),
    type: "잔향"
  };
}

function hydrateReflection(row) {
  if (!row?.songs) {
    return null;
  }

  const emotionIds = Array.isArray(row.emotions) ? row.emotions : [];

  return {
    id: row.id,
    songId: row.song_id,
    userId: row.user_id,
    emotionIds,
    emotions: emotionIds.map(publicEmotion),
    title: row.title ?? "",
    body: row.body,
    listenedAt: row.listened_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    song: publicSong(row.songs)
  };
}

function publicReflectionForSong(row, user) {
  const emotionIds = Array.isArray(row.emotions) ? row.emotions : [];

  return {
    id: row.id,
    songId: row.song_id,
    emotionIds,
    emotions: emotionIds.map(publicEmotion),
    title: row.title ?? "",
    body: row.body,
    listenedAt: row.listened_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    authorLabel: "누군가의 여음",
    ownedByCurrentUser: Boolean(user?.id && row.user_id === user.id)
  };
}

function publicRecentReflection(row, user) {
  if (!row?.songs) {
    return null;
  }

  return {
    ...publicReflectionForSong(row, user),
    recordType: "reflection",
    song: publicSong(row.songs),
    type: "여음"
  };
}

function publicReflectionDetail(row, user) {
  if (!row?.songs) {
    return null;
  }

  return {
    ...publicReflectionForSong(row, user),
    song: publicSong(row.songs)
  };
}

function publicEmotion(value) {
  const text = cleanText(value);
  const defaultEmotion = emotions.find((emotion) => emotion.id === text || emotion.label === text);

  return defaultEmotion ?? {
    custom: true,
    id: text,
    label: text
  };
}

function publicUserEmotion(row) {
  return {
    custom: true,
    id: row.label,
    label: row.label,
    userEmotionId: row.id
  };
}

function publicSong(row) {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album_name ?? "",
    albumName: row.album_name ?? "",
    coverImageUrl: row.cover_image_url ?? "",
    externalId: row.external_id ?? "",
    externalSource: row.external_source ?? "manual",
    previewUrl: "",
    releaseYear: row.release_year ?? null,
    year: row.release_year ?? null,
    source: row.external_source ?? "manual"
  };
}

function createSupabaseConfig(options) {
  const url = cleanText(options.supabaseUrl ?? process.env.SUPABASE_URL);
  const key = cleanText(
    options.supabaseKey ??
      options.supabaseServiceRoleKey ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      options.supabaseAnonKey ??
      process.env.SUPABASE_ANON_KEY
  );
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (!url || !key || typeof fetchImpl !== "function") {
    return {
      error: configurationError(
        "Supabase 환경 변수가 설정되지 않았어요. SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_ANON_KEY를 확인해 주세요."
      )
    };
  }

  return {
    fetchImpl,
    key,
    url: url.replace(/\/$/, "")
  };
}

function supabaseUrl(config, table) {
  assertConfigured(config);
  return new URL(`${config.url}/rest/v1/${table}`);
}

async function supabaseRequest(config, requestUrl, options = {}) {
  assertConfigured(config);

  const response = await config.fetchImpl(requestUrl, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = new Error("Supabase 요청을 처리하지 못했어요.");
    error.statusCode = 500;
    throw error;
  }

  if (response.status === 204) {
    return [];
  }

  return response.json();
}

function assertConfigured(config) {
  if (config.error) {
    throw config.error;
  }
}

async function normalizeEmotionIdsForUser(config, ids, user) {
  return normalizeEmotionIds(ids, await userCustomEmotionLabels(config, user));
}

function normalizeEmotionIds(ids, customEmotionLabels = []) {
  if (!Array.isArray(ids)) {
    return [];
  }

  const allowed = new Set([
    ...emotions.map((emotion) => emotion.id),
    ...emotions.map((emotion) => emotion.label),
    ...customEmotionLabels.map(cleanText)
  ]);
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

function normalizeReflectionInput(input, customEmotionLabels = []) {
  const emotionIds = normalizeEmotionIds(input?.emotionIds, customEmotionLabels);
  const body = cleanMultilineText(input?.body);

  if (!emotionIds.length) {
    throw validationError("감정을 하나 이상 선택해 주세요.");
  }

  if (emotionIds.length > maxEmotionCount) {
    throw validationError(`감정은 최대 ${maxEmotionCount}개까지 선택할 수 있어요.`);
  }

  if (!body) {
    throw validationError("오래 남은 감상을 적어 주세요.");
  }

  return {
    body,
    emotionIds,
    listenedAt: normalizeDate(input?.listenedAt),
    title: emptyToNull(input?.title)
  };
}

function normalizeYear(value) {
  const year = Number.parseInt(value, 10);
  return Number.isFinite(year) ? year : null;
}

function normalizeLimit(value, fallback, max) {
  const limit = Number.parseInt(value, 10);

  if (!Number.isInteger(limit) || limit < 1) {
    return fallback;
  }

  return Math.min(limit, max);
}

function normalizeCustomEmotionLabel(value) {
  const label = cleanText(value).replace(/\s+/g, " ");

  if (!label) {
    throw validationError("감정을 입력해주세요.");
  }

  if (label.length > maxCustomEmotionLength) {
    throw validationError("조금 더 짧게 적어주세요.");
  }

  return label;
}

function isDefaultEmotionValue(label) {
  const comparableLabel = normalizeComparableLabel(label);
  return emotions.some((emotion) => (
    normalizeComparableLabel(emotion.id) === comparableLabel ||
    normalizeComparableLabel(emotion.label) === comparableLabel
  ));
}

function normalizeComparableLabel(value) {
  return cleanText(value).replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

function emptyToNull(value) {
  const text = cleanText(value);
  return text || null;
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanMultilineText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalize(value) {
  return cleanText(value).normalize("NFKC").toLocaleLowerCase("ko-KR");
}

function escapePostgrestPattern(value) {
  return normalize(value).replace(/[*,()]/g, " ");
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function configurationError(message) {
  const error = new Error(message);
  error.statusCode = 500;
  return error;
}
