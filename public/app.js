const app = document.querySelector("#app");
const nav = document.querySelector("nav");
const maxEmotionCount = 3;
const minSongSearchLength = 2;
const authStorageKey = "janhyang.auth";

let emotions = [];
let authSession = readStoredSession();
let currentUser = authSession?.user ?? null;
let navLinks = [];

document.addEventListener("click", async (event) => {
  const logoutButton = event.target.closest("button[data-logout]");

  if (logoutButton) {
    event.preventDefault();
    await logout();
    return;
  }

  const link = event.target.closest("a[data-link]");

  if (!link) {
    return;
  }

  event.preventDefault();
  navigate(link.getAttribute("href"));
});

window.addEventListener("popstate", renderRoute);

init();

async function init() {
  renderNavigation();
  app.innerHTML = `<div class="loading">불러오는 중</div>`;

  try {
    const response = await api("/api/emotions");
    emotions = response.emotions;
    await loadCurrentUser();
    renderNavigation();
    await renderRoute();
  } catch (error) {
    app.innerHTML = renderEmpty(error.message);
  }
}

async function renderRoute() {
  const pathname = window.location.pathname;
  const detailMatch = pathname.match(/^\/logs\/([^/]+)$/);
  const reflectionDetailMatch = pathname.match(/^\/reflections\/([^/]+)$/);
  setCurrentNav(pathname);

  if (pathname === "/") {
    await renderHome();
    return;
  }

  if (pathname === "/login") {
    renderAuthPage("login");
    return;
  }

  if (pathname === "/signup") {
    renderAuthPage("signup");
    return;
  }

  if (!currentUser && (
    pathname === "/logs/new" ||
    pathname === "/logs" ||
    pathname === "/records" ||
    pathname === "/reflections/new" ||
    pathname === "/reflections" ||
    detailMatch ||
    reflectionDetailMatch
  )) {
    renderAuthPrompt();
    return;
  }

  if (pathname === "/logs/new") {
    await renderNewLog();
    return;
  }

  if (pathname === "/logs") {
    await renderLogs();
    return;
  }

  if (pathname === "/reflections/new") {
    await renderNewReflection();
    return;
  }

  if (pathname === "/reflections") {
    await renderReflections();
    return;
  }

  if (pathname === "/records") {
    await renderRecords();
    return;
  }

  if (detailMatch) {
    await renderLogDetail(decodeURIComponent(detailMatch[1]));
    return;
  }

  if (reflectionDetailMatch) {
    await renderReflectionDetail(decodeURIComponent(reflectionDetailMatch[1]));
    return;
  }

  app.innerHTML = `
    <section class="empty-state">
      <div>
        <h1>길을 찾지 못했어요</h1>
        <a class="button" href="/" data-link>홈으로</a>
      </div>
    </section>
  `;
}

async function renderHome() {
  const logs = currentUser ? (await api("/api/logs")).logs : [];
  const recentLogs = logs.slice(0, 3);
  const uniqueSongCount = new Set(logs.map((log) => log.song.id)).size;
  const emotionCount = logs.reduce((total, log) => total + log.emotions.length, 0);

  app.innerHTML = `
    <section class="home-hero">
      <div class="hero-copy">
        <p class="eyebrow">잔향</p>
        <h1>노래가 지나간 자리에 남은 감정</h1>
        <p class="lead">잔향은 마음에 오래 남은 노래와 그 순간의 감정을 짧은 문장으로 기록하는 공간입니다.</p>
        <div class="quiet-stats" aria-label="내 잔향 요약">
          <span><strong>${logs.length}</strong>개의 잔향</span>
          <span><strong>${uniqueSongCount}</strong>곡</span>
          <span><strong>${emotionCount}</strong>개의 감정</span>
        </div>
        <div class="actions">
          <a class="button" href="/logs/new" data-link>잔향 남기기</a>
          <a class="ghost-button" href="/logs" data-link>내 잔향 보기</a>
        </div>
        <p class="home-signin-note"><a href="/reflections/new" data-link>짧게 남기기 어려운 노래는 여음으로 남겨보세요.</a></p>
        ${currentUser ? "" : renderHomeSigninNote()}
      </div>
      <div class="hero-paper" aria-hidden="true">
        <span>마음의 여백</span>
        <p>마음에 오래 남은 노래를 나만의 작은 기록으로.</p>
      </div>
    </section>
    <section class="recent-section" aria-label="최근 잔향">
      <div class="section-head">
        <p class="eyebrow">최근의 잔향</p>
        <h2>조용히 덮인 감정들</h2>
      </div>
      ${recentLogs.length ? renderLogCards(recentLogs) : renderEmpty(currentUser ? "아직 남겨둔 잔향이 없어요." : "로그인하면 나만의 잔향이 여기에 모여요.")}
    </section>
  `;
}

function renderAuthPage(mode) {
  const isSignup = mode === "signup";

  app.innerHTML = `
    <section class="auth-panel">
      <p class="eyebrow">${isSignup ? "회원가입" : "로그인"}</p>
      <h1>${isSignup ? "잔향 시작하기" : "다시 잔향으로"}</h1>
      <p class="page-description">${isSignup ? "마음에 남은 노래를 나만의 기록으로 남겨보세요." : "내가 남긴 노래와 감정을 조용히 보관해요."}</p>
      <form id="authForm" class="auth-form">
        <div class="field">
          <label for="email">이메일</label>
          <input id="email" name="email" type="email" autocomplete="email" required>
        </div>
        <div class="field">
          <label for="password">비밀번호</label>
          <input id="password" name="password" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}" required>
        </div>
        <div class="form-footer">
          <p id="authError" class="error" role="alert"></p>
          <button class="button" type="submit">${isSignup ? "잔향 시작하기" : "로그인"}</button>
        </div>
      </form>
      <p id="authNotice" class="notice" aria-live="polite"></p>
      <p class="auth-switch">
        ${isSignup ? "이미 계정이 있다면" : "처음이라면"}
        <a href="${isSignup ? "/login" : "/signup"}" data-link>${isSignup ? "로그인" : "회원가입"}</a>
      </p>
    </section>
  `;

  const form = document.querySelector("#authForm");
  const errorBox = document.querySelector("#authError");
  const notice = document.querySelector("#authNotice");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.textContent = "";
    notice.textContent = "";

    const formData = new FormData(form);

    try {
      const session = await api(`/api/auth/${isSignup ? "signup" : "login"}`, {
        method: "POST",
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password")
        })
      });

      if (session.accessToken) {
        setSession(session);
        navigate(isSignup ? "/logs/new" : "/logs");
        return;
      }

      notice.textContent = "가입 확인이 필요해요. 메일을 확인한 뒤 로그인해 주세요.";
    } catch (error) {
      errorBox.textContent = error.message;
    }
  });
}

function renderAuthPrompt() {
  app.innerHTML = `
    <section class="auth-prompt">
      <p class="eyebrow">개인 잔향</p>
      <h1>내 잔향을 보려면 로그인이 필요해요.</h1>
      <p class="page-description">로그인하면 노래와 감정을 나만의 공간에 조용히 보관할 수 있어요.</p>
      <div class="actions">
        <a class="button" href="/login" data-link>로그인</a>
        <a class="ghost-button" href="/signup" data-link>회원가입</a>
      </div>
    </section>
  `;
}

async function renderNewLog() {
  let selectedSong = null;

  app.innerHTML = `
    <section class="page-head">
      <div>
        <p class="eyebrow">잔향 남기기</p>
        <h1>오늘의 잔향</h1>
        <p class="page-description">마음에 남은 노래를 고르고, 그 노래가 남긴 감정을 적어보세요.</p>
      </div>
      <a class="ghost-button" href="/logs" data-link>내 잔향</a>
    </section>
    <section class="entry-layout">
      <div class="song-panel">
        <p class="panel-kicker">마음에 남은 노래</p>
        <div class="field">
          <label for="songSearch">노래 찾기</label>
          <input id="songSearch" type="search" autocomplete="off" placeholder="제목, 아티스트, 앨범">
        </div>
        <div id="selectedSong" class="selected-song" aria-live="polite"></div>
        <div id="songResults" class="song-results"></div>
      </div>
      <form id="logForm" class="entry-form">
        <div class="field note-field">
          <label for="note">짧은 문장</label>
          <textarea id="note" name="note" maxlength="240" required placeholder="이 노래는 어떤 장면으로 남았나요?"></textarea>
        </div>
        <fieldset class="field emotion-options">
          <legend>남은 감정</legend>
          ${emotions.map(renderEmotionOption).join("")}
        </fieldset>
        <div class="field date-field">
          <label for="listenedAt">들은 날</label>
          <input id="listenedAt" name="listenedAt" type="date" value="${today()}">
        </div>
        <div class="manual-section">
          <p class="panel-kicker">직접 입력</p>
          <p class="helper-copy">찾는 노래가 없다면 아래에 조용히 적어주세요.</p>
          <div class="manual-grid">
            <div class="field">
              <label for="title">노래 제목</label>
              <input id="title" name="title" autocomplete="off" required>
            </div>
            <div class="field">
              <label for="artist">아티스트</label>
              <input id="artist" name="artist" autocomplete="off" required>
            </div>
          </div>
          <div class="manual-grid">
            <div class="field">
              <label for="album">앨범</label>
              <input id="album" name="album" autocomplete="off">
            </div>
            <div class="field">
              <label for="year">연도</label>
              <input id="year" name="year" inputmode="numeric" autocomplete="off">
            </div>
          </div>
        </div>
        <div class="form-footer">
          <p id="formError" class="error" role="alert"></p>
          <button class="button" type="submit">잔향 남기기</button>
        </div>
      </form>
    </section>
  `;

  const searchInput = document.querySelector("#songSearch");
  const results = document.querySelector("#songResults");
  const selectedSongBox = document.querySelector("#selectedSong");
  const form = document.querySelector("#logForm");
  const errorBox = document.querySelector("#formError");

  renderSongSearchIdle(results);

  searchInput.addEventListener("input", debounce(async () => {
    await updateSongResults(searchInput.value);
  }, 320));

  results.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-song-id]");

    if (!button) {
      return;
    }

    selectedSong = JSON.parse(button.dataset.song);
    fillSongFields(selectedSong);
    selectedSongBox.classList.add("is-visible");
    selectedSongBox.innerHTML = `
      ${renderSongArtwork(selectedSong)}
      <span>
        <strong>${escapeHtml(selectedSong.title)}</strong>
        <small>${escapeHtml(selectedSong.artist)}${renderSongMeta(selectedSong)}</small>
      </span>
    `;
  });

  form.addEventListener("input", (event) => {
    if (["title", "artist", "album", "year"].includes(event.target.name)) {
      selectedSong = null;
      selectedSongBox.classList.remove("is-visible");
      selectedSongBox.innerHTML = "";
    }
  });

  form.addEventListener("change", (event) => {
    if (event.target.name !== "emotion") {
      return;
    }

    const checked = [...form.querySelectorAll('input[name="emotion"]:checked')];

    if (checked.length > maxEmotionCount) {
      event.target.checked = false;
      errorBox.textContent = `감정은 최대 ${maxEmotionCount}개까지 선택할 수 있어요.`;
    } else {
      errorBox.textContent = "";
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.textContent = "";

    const formData = new FormData(form);
    const manualSong = {
      title: formData.get("title"),
      artist: formData.get("artist"),
      album: formData.get("album"),
      year: formData.get("year")
    };
    const payload = {
      songId: selectedSong?.id && !selectedSong.externalId ? selectedSong.id : "",
      song: selectedSong ? songPayload(selectedSong) : manualSong,
      emotionIds: formData.getAll("emotion"),
      listenedAt: formData.get("listenedAt"),
      note: formData.get("note")
    };

    try {
      const { log } = await api("/api/logs", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      navigate(`/logs/${encodeURIComponent(log.id)}`);
    } catch (error) {
      errorBox.textContent = error.message;
    }
  });

  async function updateSongResults(query) {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < minSongSearchLength) {
      renderSongSearchIdle(results);
      return;
    }

    results.innerHTML = `<div class="search-state">노래를 찾는 중이에요.</div>`;

    try {
      const { songs } = await api(`/api/songs/search?q=${encodeURIComponent(trimmedQuery)}`);
      results.innerHTML = songs.length ? songs.map(renderSongResult).join("") : renderSongSearchEmpty();
    } catch {
      results.innerHTML = renderSongSearchEmpty();
    }
  }
}

async function renderNewReflection() {
  let selectedSong = null;

  app.innerHTML = `
    <section class="page-head">
      <div>
        <p class="eyebrow">여음 남기기</p>
        <h1>여음 남기기</h1>
        <p class="page-description">짧게 지나가지 않는 감정을 조금 더 길게 적어보세요.</p>
      </div>
      <a class="ghost-button" href="/reflections" data-link>내 여음</a>
    </section>
    <section class="entry-layout reflection-layout">
      <div class="song-panel">
        <p class="panel-kicker">오래 남은 노래</p>
        <div class="field">
          <label for="songSearch">노래 찾기</label>
          <input id="songSearch" type="search" autocomplete="off" placeholder="제목, 아티스트, 앨범">
        </div>
        <div id="selectedSong" class="selected-song" aria-live="polite"></div>
        <div id="songResults" class="song-results"></div>
      </div>
      <form id="reflectionForm" class="entry-form reflection-form">
        <div class="field">
          <label for="reflectionTitle">제목</label>
          <input id="reflectionTitle" name="title" autocomplete="off" placeholder="이 감상에 제목을 붙인다면">
        </div>
        <div class="field reflection-body-field">
          <label for="body">긴 감상</label>
          <textarea id="body" name="body" required placeholder="이 노래가 오래 남은 이유를 천천히 적어보세요."></textarea>
        </div>
        <fieldset class="field emotion-options">
          <legend>남은 감정</legend>
          ${emotions.map(renderEmotionOption).join("")}
        </fieldset>
        <div class="field date-field">
          <label for="listenedAt">들은 날</label>
          <input id="listenedAt" name="listenedAt" type="date" value="${today()}">
        </div>
        <div class="manual-section">
          <p class="panel-kicker">직접 입력</p>
          <p class="helper-copy">찾는 노래가 없다면 아래에 조용히 적어주세요.</p>
          <div class="manual-grid">
            <div class="field">
              <label for="title">노래 제목</label>
              <input id="title" name="songTitle" autocomplete="off" required>
            </div>
            <div class="field">
              <label for="artist">아티스트</label>
              <input id="artist" name="artist" autocomplete="off" required>
            </div>
          </div>
          <div class="manual-grid">
            <div class="field">
              <label for="album">앨범</label>
              <input id="album" name="album" autocomplete="off">
            </div>
            <div class="field">
              <label for="year">연도</label>
              <input id="year" name="year" inputmode="numeric" autocomplete="off">
            </div>
          </div>
        </div>
        <div class="form-footer">
          <p id="formError" class="error" role="alert"></p>
          <button class="button" type="submit">여음 남기기</button>
        </div>
      </form>
    </section>
  `;

  const searchInput = document.querySelector("#songSearch");
  const results = document.querySelector("#songResults");
  const selectedSongBox = document.querySelector("#selectedSong");
  const form = document.querySelector("#reflectionForm");
  const errorBox = document.querySelector("#formError");

  renderSongSearchIdle(results);

  searchInput.addEventListener("input", debounce(async () => {
    await updateSongResults(searchInput.value);
  }, 320));

  results.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-song-id]");

    if (!button) {
      return;
    }

    selectedSong = JSON.parse(button.dataset.song);
    fillSongFields(selectedSong);
    selectedSongBox.classList.add("is-visible");
    selectedSongBox.innerHTML = `
      ${renderSongArtwork(selectedSong)}
      <span>
        <strong>${escapeHtml(selectedSong.title)}</strong>
        <small>${escapeHtml(selectedSong.artist)}${renderSongMeta(selectedSong)}</small>
      </span>
    `;
  });

  form.addEventListener("input", (event) => {
    if (["songTitle", "artist", "album", "year"].includes(event.target.name)) {
      selectedSong = null;
      selectedSongBox.classList.remove("is-visible");
      selectedSongBox.innerHTML = "";
    }
  });

  form.addEventListener("change", (event) => {
    if (event.target.name !== "emotion") {
      return;
    }

    const checked = [...form.querySelectorAll('input[name="emotion"]:checked')];

    if (checked.length > maxEmotionCount) {
      event.target.checked = false;
      errorBox.textContent = `감정은 최대 ${maxEmotionCount}개까지 선택할 수 있어요.`;
    } else {
      errorBox.textContent = "";
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.textContent = "";

    const formData = new FormData(form);
    const manualSong = {
      title: formData.get("songTitle"),
      artist: formData.get("artist"),
      album: formData.get("album"),
      year: formData.get("year")
    };
    const payload = {
      songId: selectedSong?.id && !selectedSong.externalId ? selectedSong.id : "",
      song: selectedSong ? songPayload(selectedSong) : manualSong,
      emotionIds: formData.getAll("emotion"),
      listenedAt: formData.get("listenedAt"),
      title: formData.get("title"),
      body: formData.get("body")
    };

    try {
      const { reflection } = await api("/api/reflections", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      navigate(`/reflections/${encodeURIComponent(reflection.id)}`);
    } catch (error) {
      errorBox.textContent = error.message;
    }
  });

  async function updateSongResults(query) {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < minSongSearchLength) {
      renderSongSearchIdle(results);
      return;
    }

    results.innerHTML = `<div class="search-state">노래를 찾는 중이에요.</div>`;

    try {
      const { songs } = await api(`/api/songs/search?q=${encodeURIComponent(trimmedQuery)}`);
      results.innerHTML = songs.length ? songs.map(renderSongResult).join("") : renderSongSearchEmpty();
    } catch {
      results.innerHTML = renderSongSearchEmpty();
    }
  }
}

async function renderLogs() {
  const { logs } = await api("/api/logs");

  app.innerHTML = `
    <section class="page-head">
      <div>
        <p class="eyebrow">내 잔향</p>
        <h1>내 잔향</h1>
        <p class="page-description">노래와 함께 남겨둔 감정들을 조용히 모아두었어요.</p>
      </div>
      <a class="button" href="/logs/new" data-link>잔향 남기기</a>
    </section>
    <section class="archive-list">
      ${logs.length ? renderLogCards(logs) : renderEmpty("아직 남겨둔 잔향이 없어요.")}
    </section>
  `;
}

async function renderReflections() {
  const { reflections } = await api("/api/reflections");

  app.innerHTML = `
    <section class="page-head">
      <div>
        <p class="eyebrow">내 여음</p>
        <h1>내 여음</h1>
        <p class="page-description">조금 더 길게 남겨둔 노래의 감상들을 모아두었어요.</p>
      </div>
      <a class="button" href="/reflections/new" data-link>여음 남기기</a>
    </section>
    <section class="archive-list">
      ${reflections.length ? renderReflectionCards(reflections) : renderEmpty("아직 남겨둔 여음이 없어요.")}
    </section>
  `;
}

async function renderRecords() {
  const [{ logs }, { reflections }] = await Promise.all([
    api("/api/logs"),
    api("/api/reflections")
  ]);

  app.innerHTML = `
    <section class="page-head">
      <div>
        <p class="eyebrow">내 기록</p>
        <h1>내 기록</h1>
        <p class="page-description">짧게 남긴 잔향과 오래 남긴 여음을 한곳에서 살펴봐요.</p>
      </div>
    </section>
    <section class="record-sections">
      <div class="record-section">
        <div class="section-head">
          <div>
            <p class="eyebrow">내 잔향</p>
            <h2>짧게 남긴 감정</h2>
          </div>
          <a class="ghost-button" href="/logs" data-link>내 잔향</a>
        </div>
        ${logs.length ? renderLogCards(logs.slice(0, 2)) : renderEmpty("아직 남겨둔 잔향이 없어요.")}
      </div>
      <div class="record-section">
        <div class="section-head">
          <div>
            <p class="eyebrow">내 여음</p>
            <h2>조금 더 긴 감상</h2>
          </div>
          <a class="ghost-button" href="/reflections" data-link>내 여음</a>
        </div>
        ${reflections.length ? renderReflectionCards(reflections.slice(0, 2)) : renderEmpty("아직 남겨둔 여음이 없어요.")}
      </div>
    </section>
  `;
}

async function renderLogDetail(id) {
  try {
    const { log } = await api(`/api/logs/${encodeURIComponent(id)}`);

    app.innerHTML = `
      <article class="entry-detail">
        <a class="back-link" href="/logs" data-link>내 잔향으로</a>
        <div class="detail-meta">
          <p class="eyebrow">${formatDate(log.listenedAt)}</p>
          <div class="detail-song">
            <span class="song-disc" aria-hidden="true">${escapeHtml(songInitial(log.song))}</span>
            <div>
              <h1>${escapeHtml(log.song.title)}</h1>
              <p class="muted">${escapeHtml(log.song.artist)}${renderSongMeta(log.song)}</p>
            </div>
          </div>
        </div>
        <p class="detail-note">${escapeHtml(log.note)}</p>
        <div class="emotion-row">
          ${log.emotions.map((emotion) => `<span class="tag">${escapeHtml(emotion.label)}</span>`).join("")}
        </div>
        <p class="detail-date">남긴 날 ${formatDate(log.createdAt.slice(0, 10))}</p>
      </article>
    `;
  } catch {
    app.innerHTML = `
      <section class="empty-state">
        <div>
          <h1>잔향을 찾을 수 없어요</h1>
          <a class="button" href="/logs" data-link>내 잔향</a>
        </div>
      </section>
    `;
  }
}

async function renderReflectionDetail(id) {
  try {
    const { reflection } = await api(`/api/reflections/${encodeURIComponent(id)}`);

    app.innerHTML = `
      <article class="entry-detail reflection-detail">
        <a class="back-link" href="/reflections" data-link>내 여음으로</a>
        <div class="detail-meta">
          <p class="eyebrow">${formatDate(reflection.listenedAt)}</p>
          <div class="detail-song">
            <span class="song-disc" aria-hidden="true">${escapeHtml(songInitial(reflection.song))}</span>
            <div>
              <h1>${escapeHtml(reflection.title || reflection.song.title)}</h1>
              <p class="muted">${escapeHtml(reflection.title ? `${reflection.song.title} · ${reflection.song.artist}` : reflection.song.artist)}${renderSongMeta(reflection.song)}</p>
            </div>
          </div>
        </div>
        <div class="reflection-body">${escapeHtml(reflection.body)}</div>
        <div class="emotion-row">
          ${reflection.emotions.map((emotion) => `<span class="tag">${escapeHtml(emotion.label)}</span>`).join("")}
        </div>
        <p class="detail-date">남긴 날 ${formatDate(reflection.createdAt.slice(0, 10))}</p>
      </article>
    `;
  } catch {
    app.innerHTML = `
      <section class="empty-state">
        <div>
          <h1>여음을 찾을 수 없어요</h1>
          <a class="button" href="/reflections" data-link>내 여음</a>
        </div>
      </section>
    `;
  }
}

function renderNavigation() {
  nav.innerHTML = currentUser
    ? `
      <a href="/" data-link>홈</a>
      <a href="/logs/new" data-link>잔향 남기기</a>
      <a href="/reflections/new" data-link>여음 남기기</a>
      <a href="/records" data-link>내 기록</a>
      <span class="account-pill" title="${escapeHtml(currentUser.email)}">${escapeHtml(currentUser.email)}</span>
      <button class="nav-logout" type="button" data-logout>로그아웃</button>
    `
    : `
      <a href="/" data-link>홈</a>
      <a href="/login" data-link>로그인</a>
      <a href="/signup" data-link>회원가입</a>
    `;
  navLinks = [...nav.querySelectorAll("a[data-link]")];
  setCurrentNav(window.location.pathname);
}

function renderHomeSigninNote() {
  return `<p class="home-signin-note">내 잔향을 보려면 로그인이 필요해요.</p>`;
}

function renderLogCards(logs) {
  return `
    <div class="log-list">
      ${logs.map((log) => `
        <a class="log-card" href="/logs/${encodeURIComponent(log.id)}" data-link>
          <span class="log-date">${formatDate(log.listenedAt)}</span>
          <p class="note-preview">${escapeHtml(previewNote(log.note))}</p>
          <div class="song-line">
            <span>
              <span class="song-title">${escapeHtml(log.song.title)}</span>
              <span class="song-meta">${escapeHtml(log.song.artist)}${renderSongMeta(log.song)}</span>
            </span>
          </div>
          <div class="emotion-row">
            ${log.emotions.map((emotion) => `<span class="tag">${escapeHtml(emotion.label)}</span>`).join("")}
          </div>
        </a>
      `).join("")}
    </div>
  `;
}

function renderReflectionCards(reflections) {
  return `
    <div class="log-list reflection-list">
      ${reflections.map((reflection) => `
        <a class="log-card reflection-card" href="/reflections/${encodeURIComponent(reflection.id)}" data-link>
          <span class="log-date">${formatDate(reflection.listenedAt)}</span>
          <h3>${escapeHtml(reflection.title || reflection.song.title)}</h3>
          <p class="note-preview">${escapeHtml(previewLongText(reflection.body))}</p>
          <div class="song-line">
            <span>
              <span class="song-title">${escapeHtml(reflection.song.title)}</span>
              <span class="song-meta">${escapeHtml(reflection.song.artist)}${renderSongMeta(reflection.song)}</span>
            </span>
          </div>
          <div class="emotion-row">
            ${reflection.emotions.map((emotion) => `<span class="tag">${escapeHtml(emotion.label)}</span>`).join("")}
          </div>
        </a>
      `).join("")}
    </div>
  `;
}

function renderSongResult(song) {
  return `
    <button class="song-result" type="button" data-song-id="${escapeHtml(song.id ?? song.externalId ?? "")}" data-song="${escapeHtml(JSON.stringify(song))}">
      ${renderSongArtwork(song)}
      <span class="song-result-copy">
        <span class="song-title">${escapeHtml(song.title)}</span>
        <small>${escapeHtml(song.artist)}${renderSongMeta(song)}</small>
      </span>
    </button>
  `;
}

function renderEmotionOption(emotion) {
  return `
    <label class="emotion-option">
      <input type="checkbox" name="emotion" value="${escapeHtml(emotion.id)}">
      <span>${escapeHtml(emotion.label)}</span>
    </label>
  `;
}

function renderSongMeta(song) {
  const pieces = [song.albumName ?? song.album, song.releaseYear ?? song.year].filter(Boolean);
  return pieces.length ? ` · ${pieces.map(escapeHtml).join(" · ")}` : "";
}

function renderEmpty(message) {
  return `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`;
}

function fillSongFields(song) {
  document.querySelector("#title").value = song.title ?? "";
  document.querySelector("#artist").value = song.artist ?? "";
  document.querySelector("#album").value = song.albumName ?? song.album ?? "";
  document.querySelector("#year").value = song.releaseYear ?? song.year ?? "";
}

function renderSongArtwork(song) {
  if (song.coverImageUrl) {
    return `<img class="song-artwork" src="${escapeHtml(song.coverImageUrl)}" alt="" loading="lazy">`;
  }

  return `<span class="song-disc" aria-hidden="true">${escapeHtml(songInitial(song))}</span>`;
}

function renderSongSearchIdle(container) {
  container.innerHTML = `<div class="search-state">마음에 남은 노래를 검색해보세요.</div>`;
}

function renderSongSearchEmpty() {
  return `
    <div class="search-state">
      <strong>찾는 노래가 없어요.</strong>
      <span>직접 적어서 잔향을 남길 수 있어요.</span>
    </div>
  `;
}

function songPayload(song) {
  return {
    title: song.title,
    artist: song.artist,
    albumName: song.albumName ?? song.album ?? "",
    coverImageUrl: song.coverImageUrl ?? "",
    externalId: song.externalId ?? "",
    externalSource: song.externalSource ?? "",
    previewUrl: song.previewUrl ?? "",
    releaseYear: song.releaseYear ?? song.year ?? null
  };
}

function navigate(pathname) {
  window.history.pushState({}, "", pathname);
  renderRoute();
  app.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setCurrentNav(pathname) {
  navLinks.forEach((link) => {
    const href = link.getAttribute("href");
    const active = href === "/"
      ? pathname === "/"
      : href === "/logs"
        ? pathname === "/logs" || /^\/logs\/[^/]+$/.test(pathname)
        : href === "/records"
          ? pathname === "/records" || pathname.startsWith("/logs") || pathname.startsWith("/reflections")
        : pathname === href;
    link.toggleAttribute("aria-current", active);
  });
}

async function loadCurrentUser() {
  if (!authSession?.accessToken) {
    return;
  }

  try {
    const { user } = await api("/api/auth/me");
    authSession = { ...authSession, user };
    currentUser = user;
    window.localStorage.setItem(authStorageKey, JSON.stringify(authSession));
  } catch {
    clearSession();
  }
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    clearSession();
    navigate("/");
  }
}

function setSession(session) {
  authSession = session;
  currentUser = session.user;
  window.localStorage.setItem(authStorageKey, JSON.stringify(session));
  renderNavigation();
}

function clearSession() {
  authSession = null;
  currentUser = null;
  window.localStorage.removeItem(authStorageKey);
  renderNavigation();
}

function readStoredSession() {
  try {
    const session = JSON.parse(window.localStorage.getItem(authStorageKey) ?? "null");
    return session?.accessToken ? session : null;
  } catch {
    return null;
  }
}

function authHeaders() {
  return authSession?.accessToken ? { Authorization: `Bearer ${authSession.accessToken}` } : {};
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...options.headers
    }
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error ?? "요청을 처리하지 못했어요.");
  }

  return body;
}

function debounce(fn, wait) {
  let timeoutId;

  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), wait);
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

function previewNote(note) {
  const text = String(note ?? "").trim();
  return text.length > 86 ? `${text.slice(0, 86)}...` : text;
}

function previewLongText(text) {
  const normalizedText = String(text ?? "").replace(/\s+/g, " ").trim();
  return normalizedText.length > 132 ? `${normalizedText.slice(0, 132)}...` : normalizedText;
}

function songInitial(song) {
  return String(song?.title ?? "잔").trim().slice(0, 1) || "잔";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character];
  });
}
