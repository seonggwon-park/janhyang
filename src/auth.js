export function createAuthService(options = {}) {
  const config = createAuthConfig(options);

  async function login(input) {
    const email = cleanText(input?.email);
    const password = String(input?.password ?? "");

    if (!email || !password) {
      throw validationError("이메일과 비밀번호를 입력해 주세요.");
    }

    const data = await authRequest(config, "/token?grant_type=password", {
      body: JSON.stringify({ email, password }),
      method: "POST"
    });

    return normalizeSession(data);
  }

  async function signup(input) {
    const email = cleanText(input?.email);
    const password = String(input?.password ?? "");

    if (!email || !password) {
      throw validationError("이메일과 비밀번호를 입력해 주세요.");
    }

    const data = await authRequest(config, "/signup", {
      body: JSON.stringify({ email, password }),
      method: "POST"
    });

    return normalizeSession(data);
  }

  async function logout(token) {
    if (!token) {
      return { ok: true };
    }

    await authRequest(config, "/logout", {
      method: "POST",
      token
    });

    return { ok: true };
  }

  async function getUser(token) {
    if (!token) {
      throw unauthorizedError();
    }

    const data = await authRequest(config, "/user", {
      method: "GET",
      token
    });

    return normalizeUser(data);
  }

  async function requireUser(request) {
    return getUser(bearerToken(request));
  }

  return {
    getUser,
    login,
    logout,
    requireUser,
    signup
  };
}

export function bearerToken(request) {
  const authorization = request.headers?.authorization ?? request.headers?.Authorization ?? "";
  const match = String(authorization).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function createAuthConfig(options) {
  const url = cleanText(options.supabaseUrl ?? process.env.SUPABASE_URL);
  const anonKey = cleanText(options.supabaseAnonKey ?? process.env.SUPABASE_ANON_KEY);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (!url || !anonKey || typeof fetchImpl !== "function") {
    return {
      error: configurationError(
        "Supabase Auth 환경 변수가 설정되지 않았어요. SUPABASE_URL과 SUPABASE_ANON_KEY를 확인해 주세요."
      )
    };
  }

  return {
    anonKey,
    fetchImpl,
    url: url.replace(/\/$/, "")
  };
}

async function authRequest(config, pathname, options = {}) {
  assertConfigured(config);

  const response = await config.fetchImpl(new URL(`${config.url}/auth/v1${pathname}`), {
    ...options,
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${options.token ?? config.anonKey}`,
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = new Error(response.status === 401 ? "로그인이 필요해요." : "인증 요청을 처리하지 못했어요.");
    error.statusCode = response.status === 401 ? 401 : 400;
    throw error;
  }

  if (response.status === 204) {
    return {};
  }

  return response.json();
}

function normalizeSession(data) {
  const user = normalizeUser(data.user ?? data);

  return {
    accessToken: data.access_token ?? "",
    expiresAt: data.expires_at ?? null,
    refreshToken: data.refresh_token ?? "",
    user
  };
}

function normalizeUser(data) {
  const id = cleanText(data?.id);
  const email = cleanText(data?.email);

  if (!id) {
    throw unauthorizedError();
  }

  return { email, id };
}

function assertConfigured(config) {
  if (config.error) {
    throw config.error;
  }
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function unauthorizedError() {
  const error = new Error("로그인이 필요해요.");
  error.statusCode = 401;
  return error;
}

function configurationError(message) {
  const error = new Error(message);
  error.statusCode = 500;
  return error;
}
