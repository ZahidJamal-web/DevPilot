# DevSync AI — GitHub + AI collaboration workspace

A React + Express starter for a developer SaaS that brings together GitHub repositories, pull requests, AI review summaries, meeting notes, and tasks.

## Included in this milestone
- GitHub OAuth sign-in with OAuth `state` validation
- Fetch repositories for the signed-in GitHub user
- List open pull requests and inspect PR file patches
- AI review of PR diffs (findings, severity, evidence, fixes, test suggestions)
- MongoDB persistence for meetings and tasks, scoped to GitHub user ID
- Meeting-note AI summarization
- Create GitHub issues only after explicit UI confirmation
- Mongo-backed Express sessions when `MONGODB_URI` is configured
- Basic Helmet security headers and API rate limiting

## Requirements
- Node.js 20+
- MongoDB local instance or MongoDB Atlas connection string
- GitHub OAuth App credentials
- Gemini API key for AI summaries and PR reviews

## Local setup
1. Copy `backend/.env.example` to `backend/.env` and fill the values.
2. Run from the project root:
   ```bash
   npm install
   npm install --prefix backend
   npm install --prefix frontend
   npm run dev
   ```
3. Open `http://localhost:5173`.

## Environment variables
- `MONGODB_URI`: MongoDB connection string; required for meetings/tasks and persistent sessions.
- `SESSION_SECRET`: generate a long random value; do not use the development fallback in production.
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`: OAuth app settings.
- `GEMINI_API_KEY`, `GEMINI_MODEL`: AI provider configuration.
- `FRONTEND_URL`: exact frontend origin; no trailing slash.
- `NODE_ENV=production` enables secure cookies.

## GitHub OAuth
Create an OAuth App in GitHub Developer Settings.
- Homepage: `http://localhost:5173`
- Callback: `http://localhost:5000/api/auth/github/callback`

The starter uses OAuth scope `repo`, which can grant access to private repositories. For production, consider a GitHub App with least-privilege permissions and make the access purpose clear to users. Do not log access tokens or send private code to an AI service without user consent.

## API routes
- `GET /api/health`
- `GET /api/auth/github`, `GET /api/auth/github/callback`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/github/repos`
- `GET /api/github/repos/:owner/:repo/pulls`
- `GET /api/github/repos/:owner/:repo/pulls/:number`
- `POST /api/github/repos/:owner/:repo/pulls/:number/review`
- `POST /api/github/repos/:owner/:repo/issues` — requires `{ "confirmed": true, "title": "...", "body": "..." }`
- `POST /api/ai/summarize` — `{ "text": "...", "kind": "meeting" | "code" }`
- `GET/POST /api/meetings`, `PUT/DELETE /api/meetings/:id`
- `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/:id`

## Production checklist — do this before public launch
This code is a working development starter, not a complete security-reviewed SaaS. Before exposing it publicly:
- Ensure `SESSION_SECRET` is a strong random secret and remove all development fallbacks.
- Keep `MONGODB_URI` configured so sessions are not stored in Express MemoryStore.
- Add CSRF protection appropriate to your OAuth/session architecture, robust schema validation, audit logs, and monitoring.
- Encrypt/restrict access to OAuth tokens at rest; implement token revocation and disconnect cleanup.
- Prefer GitHub App installation tokens with narrowly scoped permissions for production.
- Add per-user and per-organization authorization, billing/quotas, AI cost limits, and retention controls.
- Validate ownership/access for every repository operation and carefully review GitHub API permissions.
- Add tests, error tracking, and deployment-specific cookie/CORS checks.
- Provide clear consent before sending private repository diffs to the configured AI provider.
- Add pagination/background jobs/webhook signature verification for larger teams.

## Deployment notes
The frontend can be deployed to Vercel (`frontend` root directory, build `npm run build`, output `dist`). Deploy the Express backend to a host that supports a persistent Node process and configure MongoDB there. Set frontend `VITE_API_URL` to the backend URL and update `FRONTEND_URL` and `GITHUB_CALLBACK_URL` to exact production URLs. If using cross-site cookies, configure `SameSite=None; Secure`, CSRF protection, and CORS for your exact origin rather than using wildcard CORS.

## UI update
The frontend now opens with an enterprise-style DevSync AI welcome page. Select **Get started** to enter the workspace, or **Connect GitHub** to begin OAuth. The welcome choice is remembered in the browser so the OAuth redirect returns to the workspace instead of showing the intro again. The overview's GitHub issue composer is now scoped to the Overview page rather than appearing on every workspace screen.
