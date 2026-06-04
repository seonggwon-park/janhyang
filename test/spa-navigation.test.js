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
});

test("SPA navigation renders the 여음 creation route", async () => {
  const spa = await createSpa();

  await spa.click("/reflections/new");

  assert.equal(spa.location.pathname, "/reflections/new");
  assert.match(spa.app.innerHTML, /여음 남기기/);
  assert.match(spa.app.innerHTML, /id="reflectionForm"/);
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

async function createSpa() {
  const listeners = new Map();
  const elements = new Map();
  const app = element("#app");
  const nav = element("nav");
  const location = createLocation("http://localhost/");
  const localStorage = createStorage({
    "janhyang.auth": JSON.stringify({
      accessToken: "token-user-a",
      user: {
        email: "a@example.com",
        id: "aaaaaaaa-0000-4000-8000-000000000001"
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
    }
  };
  const window = {
    addEventListener() {},
    clearTimeout,
    confirm: () => true,
    history: {
      pushState(_state, _title, href) {
        location.set(href);
      }
    },
    localStorage,
    location,
    scrollTo() {},
    setTimeout
  };
  const context = {
    FormData: FakeFormData,
    URL,
    clearTimeout,
    console,
    document,
    fetch: fakeFetch,
    Intl,
    JSON,
    setTimeout,
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
    location
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
    this.value = "";
  }

  addEventListener() {}

  closest() {
    return null;
  }

  focus() {}

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

async function fakeFetch(input) {
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
        id: "aaaaaaaa-0000-4000-8000-000000000001"
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
    return jsonResponse({ records: [] });
  }

  if (path === "/api/songs/song-1") {
    return jsonResponse({
      logs: [],
      reflections: [],
      song: {
        artist: "테스트 아티스트",
        id: "song-1",
        title: "테스트 곡"
      }
    });
  }

  return jsonResponse({});
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
