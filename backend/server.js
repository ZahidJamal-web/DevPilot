import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import MongoStore from "connect-mongo";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import dns from "node:dns";

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const FRONTEND_ORIGINS = FRONTEND_URL.split(",")
  .map((url) => url.trim().replace(/\/$/, ""))
  .filter(Boolean);

const isProduction = process.env.NODE_ENV === "production";
const mongoUri = process.env.MONGODB_URI;

// Local default for development; production must set GITHUB_CALLBACK_URL explicitly.
const GITHUB_CALLBACK_URL =
  process.env.GITHUB_CALLBACK_URL?.trim() ||
  (isProduction ? "" : "http://localhost:5000/api/auth/github/callback");

app.set("trust proxy", 1);

// --------------------------------------------------
// MONGODB CONNECTION CACHING FOR SERVERLESS
// --------------------------------------------------

let cachedDbPromise = null;

async function connectToDatabase() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!cachedDbPromise && mongoUri) {
    cachedDbPromise = mongoose.connect(mongoUri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
    });
  }

  if (cachedDbPromise) {
    await cachedDbPromise;
  }

  return mongoose.connection;
}

// Automatically connect/reuse database connection on incoming requests
app.use(async (req, res, next) => {
  if (mongoUri) {
    try {
      await connectToDatabase();
    } catch (err) {
      console.error("MongoDB connection error on request:", err.message);
    }
  }

  next();
});

// --------------------------------------------------
// SESSION CONFIGURATION
// --------------------------------------------------

app.use(
  session({
    name: "devpilot.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: mongoUri
      ? MongoStore.create({
          mongoUrl: mongoUri,
          collectionName: "sessions",
          ttl: 14 * 24 * 60 * 60,
        })
      : undefined,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/",
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

app.use(helmet());

const allowedOrigins = [
  ...FRONTEND_ORIGINS,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5000",
  "https://devpilot-dev.vercel.app",
  "https://devpilot-backend.vercel.app"
].filter((origin, index, all) => all.indexOf(origin) === index);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn("CORS blocked origin:", origin);
    return callback(new Error("Origin not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Rate limit exceeded. Please wait one minute and try again.",
  },
});

app.use(apiLimiter);

if (isProduction && !process.env.SESSION_SECRET) {
  console.warn(
    "WARNING: SESSION_SECRET is missing. Configure a strong secret in production."
  );
}

// --------------------------------------------------
// DATABASE MODELS
// --------------------------------------------------

const meetingSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    notes: { type: String, default: "", maxlength: 20000 },
    summary: { type: String, default: "" },
    repository: { type: String, default: "", maxlength: 201 },
    decisions: [{ type: String }],
    actionItems: [
      {
        title: String,
        owner: String,
        dueDate: String,
        completed: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true }
);

const taskSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 240,
    },
    description: { type: String, default: "", maxlength: 4000 },
    status: {
      type: String,
      enum: ["todo", "in_progress", "done"],
      default: "todo",
    },
    source: {
      type: String,
      enum: ["manual", "meeting", "github"],
      default: "manual",
    },
    repository: { type: String, default: "" },
    githubIssueUrl: { type: String, default: "" },
    dueDate: { type: String, default: "" },
  },
  { timestamps: true }
);

const Meeting =
  mongoose.models.Meeting ||
  mongoose.model("Meeting", meetingSchema);

const Task =
  mongoose.models.Task ||
  mongoose.model("Task", taskSchema);

// --------------------------------------------------
// SHARED HELPERS
// --------------------------------------------------

function requireDb(res) {
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({
      error:
        "Database is not connected. Set MONGODB_URI in backend/.env and restart the API.",
    });

    return false;
  }

  return true;
}

function requireGitHub(req, res) {
  if (!req.session.githubToken || !req.session.githubUser) {
    res.status(401).json({ error: "Connect GitHub first." });
    return false;
  }

  return true;
}

function requireUser(req, res) {
  if (!req.session.githubUser) {
    res.status(401).json({ error: "Connect GitHub first." });
    return false;
  }

  return true;
}

function safeRepoPart(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9\_.-]{1,100}$/.test(value) &&
    value !== "." &&
    value !== ".."
  );
}

function safeRepoPath(value) {
  if (typeof value !== "string" || value.length > 500) {
    return false;
  }

  if (value.startsWith("/") || value.includes("\0")) {
    return false;
  }

  return !value.split("/").some(
    (part) => part === "." || part === ".."
  );
}

function githubPath(owner, repo, path = "") {
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`;

  if (!path) return base;

  const encodedPath = path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `${base}/${encodedPath}`;
}

async function githubFetch(req, path, options = {}) {
  const token = req.session?.githubToken;

  if (!token || typeof token !== "string") {
    const error = new Error("GitHub session expired. Reconnect GitHub.");
    error.status = 401;
    throw error;
  }

  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
    signal: options.signal || AbortSignal.timeout(20000),
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    console.error("GitHub rejected the saved session token.");

    const error = new Error(
      "GitHub rejected your session. Disconnect and reconnect GitHub."
    );

    error.status = 401;
    error.githubAuthError = true;
    throw error;
  }

  if (!response.ok) {
    console.error("GitHub API error:", {
      path,
      status: response.status,
      message: data.message,
    });

    const error = new Error(
      data.message || `GitHub API request failed (${response.status}).`
    );

    error.status = response.status;
    throw error;
  }

  return data;
}

function validateRepository(owner, repo, res) {
  if (!safeRepoPart(owner) || !safeRepoPart(repo)) {
    res.status(400).json({ error: "Invalid repository path." });
    return false;
  }

  return true;
}

function parseRepositoryName(value) {
  if (typeof value !== "string") return null;

  const parts = value.trim().split("/");

  if (
    parts.length !== 2 ||
    !safeRepoPart(parts[0]) ||
    !safeRepoPart(parts[1])
  ) {
    return null;
  }

  return { owner: parts[0], repo: parts[1] };
}

// --------------------------------------------------
// OPENROUTER AI HELPER
// --------------------------------------------------

async function summarize(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    const error = new Error(
      "OPENROUTER_API_KEY is missing from backend/.env"
    );

    error.status = 503;
    throw error;
  }

  let response;

  try {
    response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:5173",
          "X-Title": "DevPilot AI",
        },
        body: JSON.stringify({
          model:
            process.env.OPENROUTER_MODEL ||
            "nvidia/nemotron-3.5-super-vl:free",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.2,
          max_tokens: 4000,
          reasoning: {
            effort: "low",
          },
        }),
        signal: AbortSignal.timeout(90000),
      }
    );
  } catch (err) {
    console.error("OpenRouter connection error:", {
      message: err.message,
      cause: err.cause?.message || err.cause?.code || null,
    });

    const error = new Error(
      err.name === "TimeoutError" || err.name === "AbortError"
        ? "OpenRouter AI timed out. Please try again."
        : "Unable to connect to OpenRouter AI. Check your connection and try again."
    );

    error.status = 502;
    throw error;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("OpenRouter API error:", response.status, data);

    const error = new Error(
      data.error?.message ||
        data.message ||
        `OpenRouter AI request failed (HTTP ${response.status}).`
    );

    error.status =
      response.status === 429
        ? 429
        : response.status >= 500
          ? 502
          : response.status;

    throw error;
  }

  const result = data.choices?.[0]?.message?.content;

  if (typeof result !== "string" || !result.trim()) {
    console.error("OpenRouter returned no text:", {
      model: data.model,
      finishReason: data.choices?.[0]?.finish_reason,
    });

    const error = new Error(
      "OpenRouter returned no text. Try again or configure a different model."
    );

    error.status = 502;
    throw error;
  }

  return result.trim();
}

function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

// --------------------------------------------------
// GITHUB FILE AND REPOSITORY CONTEXT HELPERS
// --------------------------------------------------

function decodeGitHubFile(file) {
  if (
    !file ||
    file.type !== "file" ||
    typeof file.content !== "string"
  ) {
    return "";
  }

  return Buffer.from(file.content, "base64").toString("utf8");
}

async function getRepositoryContext(req, owner, repo) {
  try {
    const readme = await githubFetch(
      req,
      githubPath(owner, repo, "README.md")
    );

    const content = decodeGitHubFile(readme);

    return content
      ? `Repository README:\n${content.slice(0, 7000)}`
      : "";
  } catch (error) {
    if (error.status !== 404) {
      console.warn("Could not load repository README:", error.message);
    }

    return "";
  }
}

async function loadCodeContext(req, owner, repo, path) {
  const result = await githubFetch(
    req,
    githubPath(owner, repo, path)
  );

  if (!Array.isArray(result)) {
    if (result.type !== "file") {
      const error = new Error(
        "Select a file or a folder containing files."
      );

      error.status = 400;
      throw error;
    }

    if (result.size > 150000) {
      const error = new Error(
        "This file is too large for one AI request. Select a smaller file."
      );

      error.status = 413;
      throw error;
    }

    const content = decodeGitHubFile(result);

    return {
      path,
      files: [{ path, content: content.slice(0, 18000) }],
      totalFiles: 1,
    };
  }

  const files = result
    .filter((item) => item.type === "file" && item.size <= 150000)
    .filter((item) =>
      /\.(js|jsx|ts|tsx|py|java|go|rs|php|rb|cs|cpp|c|h|css|scss|html|json|md|yml|yaml|sql|sh)$/i.test(
        item.name
      )
    )
    .slice(0, 8);

  if (!files.length) {
    const error = new Error(
      "No supported code files were found in this folder. Select a specific file."
    );

    error.status = 400;
    throw error;
  }

  const loaded = await Promise.all(
    files.map(async (item) => {
      try {
        const file = await githubFetch(
          req,
          githubPath(owner, repo, item.path)
        );

        return {
          path: item.path,
          content: decodeGitHubFile(file).slice(0, 7000),
        };
      } catch {
        return {
          path: item.path,
          content: "[Unable to load this file]",
        };
      }
    })
  );

  return {
    path,
    files: loaded,
    totalFiles: files.length,
  };
}


app.get("/", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "DevPilot API",
    message: "Backend is running",
    health: "/api/health",
  });
});

// --------------------------------------------------
// HEALTH
// --------------------------------------------------


app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "DevPilot API",
    database:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected",
  });
});

// --------------------------------------------------
// GITHUB OAUTH
// --------------------------------------------------

app.get("/api/auth/github", (req, res, next) => {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const callbackUrl = GITHUB_CALLBACK_URL;

  if (!clientId || !callbackUrl) {
    return res.status(500).json({
      success: false,
      message: "GitHub OAuth configuration is incomplete.",
    });
  }

  const state = crypto.randomBytes(32).toString("hex");
  req.session.oauthState = state;

  req.session.save((err) => {
    if (err) {
      console.error("Failed to save OAuth session:", err.message);
      return next(err);
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope: "read:user user:email repo",
      state,
    });

    return res.redirect(
      `https://github.com/login/oauth/authorize?${params.toString()}`
    );
  });
});

app.get(
  "/api/auth/github/callback",
  asyncRoute(async (req, res) => {
    const frontendUrl =
      FRONTEND_ORIGINS[0] || "http://localhost:5173";

    const { code, state, error } = req.query;

    if (error) {
      console.error("GitHub OAuth denied:", String(error));

      return res.redirect(
        `${frontendUrl}/?authError=${encodeURIComponent(String(error))}`
      );
    }

    // Log only non-secret diagnostics. Never log OAuth codes,
    // tokens, or complete session contents.
    console.log("GitHub OAuth callback received:", {
      hasSession: Boolean(req.session),
      hasSessionId: Boolean(req.sessionID),
      hasStateParameter: typeof state === "string",
      hasSavedOAuthState: Boolean(req.session?.oauthState),
      hasCode: typeof code === "string",
    });

    // Validate OAuth state to prevent CSRF.
    if (
      typeof code !== "string" ||
      typeof state !== "string" ||
      !req.session?.oauthState ||
      state !== req.session.oauthState
    ) {
      console.error(
        "GitHub OAuth state validation failed. The session cookie may be missing or the session store may have changed."
      );

      return res.status(400).send(
        "GitHub sign-in expired or its session cookie was not received. Use the same localhost hostname throughout sign-in and try again."
      );
    }

    delete req.session.oauthState;

    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    const clientId = process.env.GITHUB_CLIENT_ID?.trim();
    const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
    const callbackUrl = GITHUB_CALLBACK_URL;

    if (!clientId || !clientSecret || !callbackUrl) {
      console.error("GitHub OAuth configuration is incomplete.");

      return res.status(500).send(
        "GitHub OAuth is not configured correctly."
      );
    }

    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: callbackUrl,
        }),
        signal: AbortSignal.timeout(20000),
      }
    );

    const tokenData = await tokenResponse.json();

    console.log("GitHub token exchange:", {
      status: tokenResponse.status,
      hasToken: Boolean(tokenData.access_token),
      error: tokenData.error || null,
      errorDescription: tokenData.error_description || null,
    });

    if (
      !tokenResponse.ok ||
      !tokenData.access_token ||
      tokenData.error
    ) {
      return res.redirect(
        `${frontendUrl}/?authError=github_token_exchange_failed`
      );
    }

    const accessToken = tokenData.access_token;

    const verifyResponse = await fetch(
      "https://api.github.com/user",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(20000),
      }
    );

    if (!verifyResponse.ok) {
      const details = await verifyResponse.json().catch(() => ({}));

      console.error("GitHub token verification failed:", {
        status: verifyResponse.status,
        message: details.message || "Unknown GitHub API error",
      });

      return res.redirect(
        `${frontendUrl}/?authError=github_token_invalid`
      );
    }

    const user = await verifyResponse.json();

    req.session.githubToken = accessToken;
    req.session.githubUser = {
      id: String(user.id),
      login: user.login,
      name: user.name,
      avatar_url: user.avatar_url,
      html_url: user.html_url,
    };

    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    console.log("GitHub connected successfully:", user.login);

    return res.redirect(frontendUrl);
  })
);

app.get("/api/auth/github/check", async (req, res) => {
  try {
    const token = req.session?.githubToken;

    if (!token) {
      return res.status(401).json({
        valid: false,
        message: "No GitHub token in session. Connect GitHub again.",
      });
    }

    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status === 401 ? 401 : 502).json({
        valid: false,
        status: response.status,
        message: data.message || "GitHub token verification failed.",
      });
    }

    return res.json({
      valid: true,
      status: response.status,
      login: data.login,
      message: "GitHub token is valid.",
    });
  } catch (err) {
    console.error("GitHub token check failed:", err.message);

    return res.status(500).json({
      valid: false,
      message: "Could not verify the GitHub token.",
    });
  }
});

app.get("/api/auth/me", (req, res) => {
  return res.json({
    user: req.session?.githubUser || null,
    connected: Boolean(
      req.session?.githubUser && req.session?.githubToken
    ),
  });
});

app.post("/api/auth/logout", (req, res, next) => {
  if (!req.session) {
    return res.json({ ok: true });
  }

  req.session.destroy((err) => {
    if (err) return next(err);

    res.clearCookie("devpilot.sid", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/",
    });

    return res.json({ ok: true });
  });
});

// --------------------------------------------------
// GITHUB REPOSITORIES
// --------------------------------------------------

app.get(
  "/api/github/repos",
  asyncRoute(async (req, res) => {
    const token = req.session?.githubToken;

    if (!token || !req.session?.githubUser) {
      return res.status(401).json({
        success: false,
        message: "GitHub is not connected. Connect GitHub again.",
      });
    }

    const data = await githubFetch(
      req,
      "/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member"
    );

    if (!Array.isArray(data)) {
      return res.status(502).json({
        success: false,
        message: "GitHub returned an unexpected repository response.",
      });
    }

    return res.json(
      data.map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        owner: repo.owner?.login,
        description: repo.description,
        private: repo.private,
        html_url: repo.html_url,
        language: repo.language,
        stargazers_count: repo.stargazers_count,
        open_issues_count: repo.open_issues_count,
        updated_at: repo.updated_at,
        default_branch: repo.default_branch,
      }))
    );
  })
);

app.get(
  "/api/github/repos/:owner/:repo/contents",
  asyncRoute(async (req, res) => {
    if (!requireGitHub(req, res)) return;

    const { owner, repo } = req.params;
    const rawPath = req.query.path;

    const path =
      typeof rawPath === "string"
        ? rawPath.trim().replace(/^\/+|\/+$/g, "")
        : "";

    if (!validateRepository(owner, repo, res)) return;

    if (!safeRepoPath(path)) {
      return res.status(400).json({
        error: "Invalid file or folder path.",
      });
    }

    const data = await githubFetch(
      req,
      githubPath(owner, repo, path)
    );

    if (Array.isArray(data)) {
      return res.json({
        type: "directory",
        path,
        items: data.map((item) => ({
          name: item.name,
          path: item.path,
          type: item.type,
          size: item.size,
          html_url: item.html_url,
        })),
      });
    }

    if (data?.type !== "file") {
      return res.status(400).json({
        error: "Unsupported GitHub content type.",
      });
    }

    if (data.size > 150000) {
      return res.status(413).json({
        error: "File is too large to display in the browser.",
      });
    }

    return res.json({
      type: "file",
      name: data.name,
      path: data.path,
      size: data.size,
      html_url: data.html_url,
      content: decodeGitHubFile(data),
    });
  })
);

// --------------------------------------------------
// GITHUB PULL REQUESTS
// --------------------------------------------------

app.get(
  "/api/github/repos/:owner/:repo/pulls",
  asyncRoute(async (req, res) => {
    if (!requireGitHub(req, res)) return;

    const { owner, repo } = req.params;

    if (!validateRepository(owner, repo, res)) return;

    const data = await githubFetch(
      req,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&per_page=30&sort=updated&direction=desc`
    );

    res.json(
      data.map((pr) => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        html_url: pr.html_url,
        user: {
          login: pr.user?.login,
          avatar_url: pr.user?.avatar_url,
        },
        head: { ref: pr.head?.ref, sha: pr.head?.sha },
        base: { ref: pr.base?.ref },
        draft: pr.draft,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        additions: pr.additions,
        deletions: pr.deletions,
        changed_files: pr.changed_files,
      }))
    );
  })
);

app.get(
  "/api/github/repos/:owner/:repo/pulls/:number",
  asyncRoute(async (req, res) => {
    if (!requireGitHub(req, res)) return;

    const { owner, repo, number } = req.params;

    if (
      !validateRepository(owner, repo, res) ||
      !/^\d+$/.test(number)
    ) {
      return res.status(400).json({
        error: "Invalid pull request path.",
      });
    }

    const [pr, files] = await Promise.all([
      githubFetch(
        req,
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`
      ),
      githubFetch(
        req,
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/files?per_page=30`
      ),
    ]);

    res.json({
      pullRequest: {
        number: pr.number,
        title: pr.title,
        body: pr.body,
        html_url: pr.html_url,
        state: pr.state,
        user: pr.user?.login,
        base: pr.base?.ref,
        head: pr.head?.ref,
      },
      files: files.map((file) => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch || "",
      })),
    });
  })
);

app.post(
  "/api/github/repos/:owner/:repo/pulls/:number/review",
  asyncRoute(async (req, res) => {
    if (!requireGitHub(req, res)) return;

    const { owner, repo, number } = req.params;

    if (
      !validateRepository(owner, repo, res) ||
      !/^\d+$/.test(number)
    ) {
      return res.status(400).json({
        error: "Invalid pull request path.",
      });
    }

    const [pr, files] = await Promise.all([
      githubFetch(
        req,
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`
      ),
      githubFetch(
        req,
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/files?per_page=20`
      ),
    ]);

    const diffText = files
      .map(
        (file) =>
          `FILE: ${file.filename}\nSTATUS: ${file.status}\nPATCH:\n${file.patch || "[No patch available]"}`
      )
      .join("\n\n")
      .slice(0, 24000);

    const review = await summarize(
      `You are a careful senior software engineer reviewing a GitHub pull request. Analyze only the supplied title, description, and diff. Do not claim tests were run. Flag actionable issues with file references when possible. Separate confirmed observations from risks. Format Markdown with: Executive summary; Findings (severity Critical/High/Medium/Low, evidence, impact, suggested fix); Positive observations; Tests to add/run. If no issues are evident, say so.

Repository: ${owner}/${repo}
PR #${number}: ${pr.title}
Description: ${pr.body || "(none)"}
Diff:
${diffText}`
    );

    res.json({
      review,
      pullRequest: {
        number: pr.number,
        title: pr.title,
        html_url: pr.html_url,
      },
      filesReviewed: files.length,
    });
  })
);

// --------------------------------------------------
// GITHUB ISSUE CREATION
// --------------------------------------------------

app.post(
  "/api/github/repos/:owner/:repo/issues",
  asyncRoute(async (req, res) => {
    if (!requireGitHub(req, res)) return;

    const { owner, repo } = req.params;
    const { title, body = "", confirmed = false } = req.body || {};

    if (!validateRepository(owner, repo, res)) return;

    if (confirmed !== true) {
      return res.status(400).json({
        error:
          "Explicit confirmation is required before creating a GitHub issue.",
      });
    }

    if (
      typeof title !== "string" ||
      title.trim().length < 3 ||
      title.length > 240
    ) {
      return res.status(400).json({
        error: "Issue title must be between 3 and 240 characters.",
      });
    }

    const issue = await githubFetch(
      req,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: typeof body === "string" ? body.slice(0, 6000) : "",
        }),
      }
    );

    res.status(201).json({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      html_url: issue.html_url,
    });
  })
);

// --------------------------------------------------
// GENERAL TEXT SUMMARIZER
// --------------------------------------------------

app.post(
  "/api/ai/summarize",
  asyncRoute(async (req, res) => {
    const { text, kind = "meeting" } = req.body || {};

    if (typeof text !== "string" || text.trim().length < 10) {
      return res.status(400).json({
        error: "Provide at least 10 characters of notes or text.",
      });
    }

    if (text.length > 20000) {
      return res.status(413).json({
        error: "Text is too long (maximum 20,000 characters).",
      });
    }

    const prompt =
      kind === "code"
        ? `Review the supplied developer-provided code or change summary. Return Markdown with Summary, Potential risks, Findings with evidence, and Suggested next steps. Do not claim to have executed code.\n\n${text}`
        : `Summarize these meeting notes for a software development team. Return Markdown with Summary, Decisions, Action items (owner/deadline only if present), and Open questions. Do not invent missing owners or deadlines.\n\n${text}`;

    res.json({ summary: await summarize(prompt) });
  })
);

// --------------------------------------------------
// DEDICATED CODE ASSISTANT
// --------------------------------------------------

app.post(
  "/api/ai/code-assistant",
  asyncRoute(async (req, res) => {
    if (!requireGitHub(req, res)) return;

    const { owner, repo, path, question } = req.body || {};

    if (!validateRepository(owner, repo, res)) return;

    if (!safeRepoPath(path)) {
      return res.status(400).json({
        error: "Select a valid repository file or folder first.",
      });
    }

    if (
      typeof question !== "string" ||
      question.trim().length < 2 ||
      question.length > 4000
    ) {
      return res.status(400).json({
        error: "Enter a question between 2 and 4,000 characters.",
      });
    }

    const [codeContext, readme] = await Promise.all([
      loadCodeContext(req, owner, repo, path),
      getRepositoryContext(req, owner, repo),
    ]);

    const sourceText = codeContext.files
      .map(
        (file) =>
          `FILE: ${file.path}\n\`\`\`\n${file.content}\n\`\`\``
      )
      .join("\n\n");

    const answer = await summarize(
      `You are an expert senior software engineer assistant. Answer the user's question accurately using only the provided repository context and code files. Reference specific file paths and lines where relevant. Do not assume tests ran.

Repository: ${owner}/${repo}
${readme}

Selected path: ${codeContext.path} (${codeContext.totalFiles} file(s) loaded)
Code:
${sourceText}

User Question:
${question}`
    );

    res.json({
      answer,
      path: codeContext.path,
      filesAnalyzed: codeContext.totalFiles,
    });
  })
);

// --------------------------------------------------
// GLOBAL ERROR HANDLER
// --------------------------------------------------


/* --------------------------------------------------
   MEETINGS API — MongoDB
-------------------------------------------------- */

// Get all meetings for the signed-in user
app.get(
  "/api/meetings",
  asyncRoute(async (req, res) => {
    if (!requireUser(req, res) || !requireDb(res)) return;

    const userId = req.session.githubUser.id;

    const meetings = await Meeting.find({ userId })
      .sort({ updatedAt: -1 })
      .lean();

    res.json(meetings);
  })
);

// Create a meeting
app.post(
  "/api/meetings",
  asyncRoute(async (req, res) => {
    if (!requireUser(req, res) || !requireDb(res)) return;

    const { title, notes = "", summary = "", repository = "",
      decisions = [], actionItems = [] } = req.body || {};

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Meeting title is required." });
    }

    const meeting = await Meeting.create({
      userId: req.session.githubUser.id,
      title: title.trim(),
      notes: typeof notes === "string" ? notes.slice(0, 20000) : "",
      summary: typeof summary === "string" ? summary : "",
      repository: typeof repository === "string" ? repository : "",
      decisions: Array.isArray(decisions) ? decisions : [],
      actionItems: Array.isArray(actionItems) ? actionItems : [],
    });

    res.status(201).json(meeting);
  })
);

// Update a meeting
app.put(
  "/api/meetings/:id",
  asyncRoute(async (req, res) => {
    if (!requireUser(req, res) || !requireDb(res)) return;

    const allowed = [
      "title", "notes", "summary", "repository",
      "decisions", "actionItems",
    ];

    const updates = {};

    for (const key of allowed) {
      if (req.body?.[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    if (typeof updates.title === "string") {
      updates.title = updates.title.trim();
      if (!updates.title) {
        return res.status(400).json({ error: "Meeting title is required." });
      }
    }

    const meeting = await Meeting.findOneAndUpdate(
      { _id: req.params.id, userId: req.session.githubUser.id },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found." });
    }

    res.json(meeting);
  })
);

// Delete a meeting
app.delete(
  "/api/meetings/:id",
  asyncRoute(async (req, res) => {
    if (!requireUser(req, res) || !requireDb(res)) return;

    const meeting = await Meeting.findOneAndDelete({
      _id: req.params.id,
      userId: req.session.githubUser.id,
    });

    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found." });
    }

    res.json({ success: true, message: "Meeting deleted." });
  })
);


/* --------------------------------------------------
   TASKS API — MongoDB
-------------------------------------------------- */

// Get all tasks for the signed-in user
app.get(
  "/api/tasks",
  asyncRoute(async (req, res) => {
    if (!requireUser(req, res) || !requireDb(res)) return;

    const tasks = await Task.find({
      userId: req.session.githubUser.id,
    })
      .sort({ updatedAt: -1 })
      .lean();

    res.json(tasks);
  })
);

// Create a task
app.post(
  "/api/tasks",
  asyncRoute(async (req, res) => {
    if (!requireUser(req, res) || !requireDb(res)) return;

    const {
      title,
      description = "",
      status = "todo",
      source = "manual",
      repository = "",
      githubIssueUrl = "",
      dueDate = "",
    } = req.body || {};

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Task title is required." });
    }

    const task = await Task.create({
      userId: req.session.githubUser.id,
      title: title.trim(),
      description,
      status,
      source,
      repository,
      githubIssueUrl,
      dueDate,
    });

    res.status(201).json(task);
  })
);

// Update a task
app.patch(
  "/api/tasks/:id",
  asyncRoute(async (req, res) => {
    if (!requireUser(req, res) || !requireDb(res)) return;

    const allowed = [
      "title", "description", "status", "source",
      "repository", "githubIssueUrl", "dueDate",
    ];

    const updates = {};

    for (const key of allowed) {
      if (req.body?.[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    if (typeof updates.title === "string") {
      updates.title = updates.title.trim();
      if (!updates.title) {
        return res.status(400).json({ error: "Task title is required." });
      }
    }

    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.session.githubUser.id },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!task) {
      return res.status(404).json({ error: "Task not found." });
    }

    res.json(task);
  })
);

// Delete a task
app.delete(
  "/api/tasks/:id",
  asyncRoute(async (req, res) => {
    if (!requireUser(req, res) || !requireDb(res)) return;

    const task = await Task.findOneAndDelete({
      _id: req.params.id,
      userId: req.session.githubUser.id,
    });

    if (!task) {
      return res.status(404).json({ error: "Task not found." });
    }

    res.json({ success: true, message: "Task deleted." });
  })
);

app.use((err, _req, res, _next) => {
  console.error("Unhandled Backend Error:", err);

  const status = err.status || 500;

  res.status(status).json({
    error: err.message || "An internal server error occurred.",
    githubAuthError: Boolean(err.githubAuthError),
  });
});

// --------------------------------------------------
// SERVER INITIALIZATION
// --------------------------------------------------

if (!process.env.VERCEL) {
  app.listen(PORT, async () => {
    console.log(`DevPilot API running on port ${PORT}`);

    if (mongoUri) {
      await connectToDatabase().catch((err) =>
        console.error("MongoDB initial connection error:", err.message)
      );
    }
  });
}

export default app;