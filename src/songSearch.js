const itunesSearchUrl = "https://itunes.apple.com/search";
const minQueryLength = 2;
const defaultLimit = 12;

export async function searchExternalSongs(query, options = {}) {
  const term = cleanText(query);

  if (term.length < minQueryLength) {
    return [];
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    return [];
  }

  const url = new URL(itunesSearchUrl);
  url.searchParams.set("term", term);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "musicTrack");
  url.searchParams.set("country", options.country ?? "KR");
  url.searchParams.set("limit", String(options.limit ?? defaultLimit));

  try {
    const response = await fetchImpl(url);

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    if (!Array.isArray(data.results)) {
      return [];
    }

    return data.results.map(normalizeItunesTrack).filter(Boolean);
  } catch {
    return [];
  }
}

export function normalizeItunesTrack(track) {
  const title = cleanText(track?.trackName);
  const artist = cleanText(track?.artistName);
  const externalId = cleanText(track?.trackId);

  if (!title || !artist || !externalId) {
    return null;
  }

  return {
    title,
    artist,
    albumName: cleanText(track?.collectionName),
    coverImageUrl: upgradeArtworkUrl(cleanText(track?.artworkUrl100)),
    externalId,
    externalSource: "itunes",
    previewUrl: cleanText(track?.previewUrl),
    releaseYear: releaseYearFromDate(track?.releaseDate)
  };
}

function upgradeArtworkUrl(url) {
  if (!url) {
    return "";
  }

  return url.replace(/\/\d+x\d+bb(?=\.(jpg|png|webp)$)/i, "/300x300bb");
}

function releaseYearFromDate(value) {
  const date = cleanText(value);
  const match = date.match(/^(\d{4})-/);

  return match ? Number.parseInt(match[1], 10) : null;
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
