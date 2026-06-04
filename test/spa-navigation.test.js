import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

test("SPA navigation renders the 잔향 creation route", async () => {
  const spa = await createSpa();

  await spa.click("/logs/new");

  assert.equal(spa.location.pathname, "/logs/new");
  assert.match(spa.app.innerHTML, /오늘의 잔향/);
  assert.match(spa.app.innerHTML, /id="logForm"/);
  assert.match(spa.app.innerHTML, /익명으로 남기기/);
});

test("SPA navigation renders the 여음 creation route", async () => {
  const spa = await createSpa();

  await spa.click("/reflections/new");

  assert.equal(spa.location.pathname, "/reflections/new");
  assert.match(spa.app.innerHTML, /여음 남기기/);
  assert.match(spa.app.innerHTML, /id="reflectionForm"/);
  assert.match(spa.app.innerHTML, /익명으로 남기기/);
});

test("navigation shows nickname and opens account settings", async () => {
  const spa = await createSpa();

  assert.match(spa.nav.innerHTML, /바람/);
  assert.doesNotMatch(spa.nav.innerHTML, /a@example.com/);

  await spa.click("/account");

  assert.equal(spa.location.pathname, "/account");
  assert.match(spa.app.innerHTML, /내 계정/);
  assert.match(spa.app.innerHTML, /value="바람"/);
});

test("SPA navigation keeps song query params for create CTAs", async () => {
  const spa = await createSpa();

  await spa.click("/logs/new?songId=song-1");

  assert.equal(spa.location.pathname, "/logs/new");
  assert.equal(spa.location.search, "?songId=song-1");
  assert.match(spa.app.innerHTML, /오늘의 잔향/);

  await spa.click("/reflections/new?songId=song-1");

  assert.equal(spa.location.pathname, "/reflections/new");
  assert.equal(spa.location.search, "?songId=song-1");
  assert.match(spa.app.innerHTML, /여음 남기기/);
});

test("home 여음 preview links to the full reflection detail", async () => {
  const spa = await createSpa();

  assert.match(spa.app.innerHTML, /href="\/reflections\/reflection-1"/);
  assert.match(spa.app.innerHTML, /여음 읽기/);

  await spa.click("/reflections/reflection-1");

  assert.equal(spa.location.pathname, "/reflections/reflection-1");
  assert.match(spa.app.innerHTML, /아주 긴 여음 본문 첫 문장/);
  assert.match(spa.app.innerHTML, /마지막 문장까지 전문으로 남아 있어요/);
  assert.doesNotMatch(spa.app.innerHTML, /삭제하기/);
});

test("home emotion chips navigate to emotion browse pages", async () => {
  const spa = await createSpa();

  assert.match(spa.app.innerHTML, /감정 둘러보기/);
  assert.match(spa.app.innerHTML, /href="\/emotions\/%EA%B3%A0%EC%9A%94"/);

  await spa.click("/emotions/%EA%B3%A0%EC%9A%94");

  assert.equal(spa.location.pathname, "/emotions/%EA%B3%A0%EC%9A%94");
  assert.match(spa.app.innerHTML, /고요으로 남은 노래들/);
  assert.match(spa.app.innerHTML, /아주 긴 여음 본문 첫 문장/);
});

test("home music search resolves a result and opens song detail", async () => {
  const spa = await createSpa();
  const input = spa.element("#homeSongSearch");
  const results = spa.element("#homeSongResults");

  input.value = "ditto";
  await input.dispatch("input", { target: input });

  assert.match(results.innerHTML, /Ditto/);

  await results.dispatch("click", {
    target: {
      closest(selector) {
        if (selector !== "button[data-home-song]") {
          return null;
        }

        return {
          dataset: {
            homeSong: JSON.stringify(externalSong())
          }
        };
      }
    }
  });

  assert.equal(spa.location.pathname, "/songs/song-1");
  assert.match(spa.app.innerHTML, /테스트 곡/);
});

test("song detail 여음 preview links to the full reflection detail", async () => {
  const spa = await createSpa();

  await spa.click("/songs/song-1");

  assert.match(spa.app.innerHTML, /data-card-href="\/reflections\/reflection-1"/);
  assert.match(spa.app.innerHTML, /여음 읽기/);

  await spa.click("/reflections/reflection-1");

  assert.equal(spa.location.pathname, "/reflections/reflection-1");
  assert.match(spa.app.innerHTML, /아주 긴 여음 본문 첫 문장/);
});

test("owned reflection detail shows edit and delete actions", async () => {
  const spa = await createSpa({ reflectionOwned: true });

  await spa.click("/reflections/reflection-1");

  assert.match(spa.app.innerHTML, /고치기/);
  assert.match(spa.app.innerHTML, /삭제하기/);
});

async function createSpa(options = {}) {
  const listeners = new Map();
  const elements = new Map();
  const app = element("#app");
  const nav = element("nav");
  const location = createLocation("http://localhost/");
  const instantSetTimeout = (handler) => {
    handler();
    return 0;
  };
  const instantClearTimeout = () => {};
  const localStorage = createStorage({
    "janhyang.auth": JSON.stringify({
      accessToken: "token-user-a",
      user: {
        email: "a@example.com",
        id: "aaaaaaaa-0000-4000-8000-000000000001",
        nickname: "바람",
        profile: {
          id: "aaaaaaaa-0000-4000-8000-000000000001",
          nickname: "바람"
        }
      }
    })
  });
  const document = {
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    querySelector(selector) {
      if (selector === "#app") {
        return app;
      }

      if (selector === "nav") {
        return nav;
      }

      return element(selector);
    },
    querySelectorAll() {
      return [];
    }
  };
  const window = {
    addEventListener() {},
    clearTimeout: instantClearTimeout,
    confirm: () => true,
    history: {
      pushState(_state, _title, href) {
        location.set(href);
      }
    },
    localStorage,
    location,
    scrollTo() {},
    setTimeout: instantSetTimeout
  };
  const context = {
    FormData: FakeFormData,
    URL,
    clearTimeout: instantClearTimeout,
    console,
    document,
    fetch: (input, init) => fakeFetch(input, init, options),
    Intl,
    JSON,
    setTimeout: instantSetTimeout,
    URLSearchParams,
    window
  };

  function element(selector) {
    if (!elements.has(selector)) {
      elements.set(selector, new FakeElement(selector));
    }

    return elements.get(selector);
  }

  vm.runInNewContext(appSource, context, { filename: "public/app.js" });
  await settle();

  return {
    app,
    async click(href) {
      const handler = listeners.get("click");
      assert.equal(typeof handler, "function");
      await handler({
        preventDefault() {},
        target: {
          closest(selector) {
            if (selector === "a[data-link]") {
              return {
                getAttribute(name) {
                  return name === "href" ? href : null;
                }
              };
            }

            return null;
          }
        }
      });
      await settle();
    },
    element,
    location,
    nav
  };
}

class FakeElement {
  constructor(selector) {
    this.selector = selector;
    this.classList = {
      add() {},
      remove() {}
    };
    this.innerHTML = "";
    this.listeners = new Map();
    this.value = "";
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  closest() {
    return null;
  }

  focus() {}

  async dispatch(type, event = {}) {
    const handler = this.listeners.get(type);

    if (handler) {
      await handler(event);
      await settle();
    }
  }

  querySelector(selector) {
    return new FakeElement(`${this.selector} ${selector}`);
  }

  querySelectorAll() {
    return [];
  }

  toggleAttribute() {}
}

class FakeFormData {
  constructor() {}

  get() {
    return "";
  }

  getAll() {
    return [];
  }
}

function createLocation(initialHref) {
  const location = {
    hash: "",
    href: initialHref,
    origin: "http://localhost",
    pathname: "/",
    search: "",
    set(href) {
      const url = new URL(href, location.origin);
      location.hash = url.hash;
      location.href = url.href;
      location.pathname = url.pathname;
      location.search = url.search;
    }
  };
  location.set(initialHref);
  return location;
}

function createStorage(initialValues = {}) {
  const values = new Map(Object.entries(initialValues));

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

async function fakeFetch(input, _init, options = {}) {
  const path = String(input);

  if (path === "/api/emotions") {
    return jsonResponse({
      emotions: [
        { id: "calm", label: "고요" },
        { id: "warmth", label: "온기" }
      ]
    });
  }

  if (path === "/api/auth/me") {
    return jsonResponse({
      user: {
        email: "a@example.com",
        id: "aaaaaaaa-0000-4000-8000-000000000001",
        nickname: "바람",
        profile: {
          id: "aaaaaaaa-0000-4000-8000-000000000001",
          nickname: "바람"
        }
      }
    });
  }

  if (path === "/api/profile") {
    return jsonResponse({
      profile: {
        id: "aaaaaaaa-0000-4000-8000-000000000001",
        nickname: "바람"
      }
    });
  }

  if (path === "/api/logs") {
    return jsonResponse({ logs: [] });
  }

  if (path === "/api/reflections") {
    return jsonResponse({ reflections: [] });
  }

  if (path === "/api/records/recent?limit=6") {
    return jsonResponse({
      records: [{
        body: longReflectionBody(),
        createdAt: "2026-06-04T00:00:00.000Z",
        emotionIds: ["calm"],
        emotions: [{ id: "calm", label: "고요" }],
        id: "reflection-1",
        listenedAt: "2026-06-04",
        recordType: "reflection",
        song: {
          artist: "테스트 아티스트",
          id: "song-1",
          title: "테스트 곡"
        },
        title: "긴 여음",
        type: "여음"
      }]
    });
  }

  if (path.startsWith("/api/emotions/") && path.endsWith("/records?limit=24")) {
    return jsonResponse({
      records: [{
        body: longReflectionBody(),
        createdAt: "2026-06-04T00:00:00.000Z",
        emotionIds: ["calm"],
        emotions: [{ id: "calm", label: "고요" }],
        id: "reflection-1",
        listenedAt: "2026-06-04",
        recordType: "reflection",
        song: {
          artist: "테스트 아티스트",
          id: "song-1",
          title: "테스트 곡"
        },
        title: "긴 여음",
        type: "여음"
      }]
    });
  }

  if (path === "/api/songs/search?q=ditto") {
    return jsonResponse({ songs: [externalSong()] });
  }

  if (path === "/api/songs/resolve") {
    return jsonResponse({
      song: {
        ...externalSong(),
        id: "song-1"
      }
    });
  }

  if (path === "/api/songs/song-1") {
    return jsonResponse({
      logs: [],
      reflections: [{
        authorLabel: "누군가의 여음",
        body: longReflectionBody(),
        createdAt: "2026-06-04T00:00:00.000Z",
        emotionIds: ["calm"],
        emotions: [{ id: "calm", label: "고요" }],
        id: "reflection-1",
        listenedAt: "2026-06-04",
        ownedByCurrentUser: options.reflectionOwned ?? false,
        title: "긴 여음"
      }],
      song: {
        artist: "테스트 아티스트",
        id: "song-1",
        title: "테스트 곡"
      }
    });
  }

  if (path === "/api/reflections/reflection-1") {
    return jsonResponse({
      reflection: {
        body: longReflectionBody(),
        createdAt: "2026-06-04T00:00:00.000Z",
        emotionIds: ["calm"],
        emotions: [{ id: "calm", label: "고요" }],
        id: "reflection-1",
        listenedAt: "2026-06-04",
        ownedByCurrentUser: options.reflectionOwned ?? false,
        song: {
          artist: "테스트 아티스트",
          id: "song-1",
          title: "테스트 곡"
        },
        title: "긴 여음"
      }
    });
  }

  return jsonResponse({});
}

function longReflectionBody() {
  return "아주 긴 여음 본문 첫 문장. 중간 문장들이 천천히 이어지고, 마지막 문장까지 전문으로 남아 있어요.";
}

function externalSong() {
  return {
    albumName: "OMG - Single",
    artist: "NewJeans",
    coverImageUrl: "https://example.com/cover.jpg",
    externalId: "1658078988",
    externalSource: "itunes",
    releaseYear: 2022,
    title: "Ditto"
  };
}

function jsonResponse(body, status = 200) {
  return {
    json: async () => body,
    ok: status >= 200 && status < 300,
    status
  };
}

async function settle() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();
}
