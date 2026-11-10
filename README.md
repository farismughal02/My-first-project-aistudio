# Sentinel Wire

Cybersecurity news aggregation with AI learning guides for beginners.

Sentinel Wire is a learning and portfolio project built with React, TypeScript, Vite, Express, and the Google Gen AI SDK. It combines live RSS/Atom headlines with a separate collection of fictional learning examples.

## Features

- Live RSS/Atom feed, search, category/source filters, manual refresh and 30-second polling.
- Read Later, theme and source-mute preferences saved in the current browser.
- Owner-only Gemini learning guides and follow-up questions about server-known articles.
- Owner-only custom feed registration on explicitly approved HTTPS hosts.
- Separate **View demo stories** mode. Example headlines and JSON exports carry demo labels.
- Per-source refresh status; failed feeds retain their last successful articles.
- JSON export of the displayed or saved articles.

## Data accuracy

Live article categories are keyword suggestions. **Severity, CVSS and exploitation status are unknown unless verified**; the application does not infer numeric CVSS scores from headlines. Demo stories, CVEs, products, indicators and mitigation examples are fictional learning material, not verified reporting or operational advice. Demo timestamps are fixed rather than refreshed on startup.

The CISA KEV JSON entry is marked **Unsupported**: a KEV integration has not been implemented. RSS parsing is limited to six entries per source and is not a complete XML syndication implementation. AI explanations can be inaccurate; check the original advisory.

## Local setup

Use **Node.js 24** and **npm 11**. `.nvmrc` selects Node 24, and `package-lock.json` makes installs repeatable.

```bash
git clone https://github.com/farismughal02/My-first-project-aistudio.git
cd My-first-project-aistudio
npm ci
```

Copy `.env.example` to `.env`:

```bash
# macOS/Linux
cp .env.example .env
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

Feed browsing works without a Gemini key. Generate an owner token locally:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put the generated value in `OWNER_ACCESS_TOKEN` in `.env`. Set `GEMINI_API_KEY` and `GEMINI_MODEL` to values available to your account to enable AI. Never commit these secrets.

```bash
npm run dev
```

Open **http://localhost:3000**. Expand **Owner access — AI and source management** and enter the owner token to use those controls. The token stays in the tab's memory and is cleared on reload. Do not share it with ordinary visitors. Use HTTPS when hosting beyond localhost.

## Configuration

| Variable | Purpose |
| --- | --- |
| `OWNER_ACCESS_TOKEN` | Random secret of 32–256 characters. Required at production startup; missing in development disables owner controls. |
| `GEMINI_API_KEY` | Server-only Gemini API key. |
| `GEMINI_MODEL` | Model available to your account; both this and the key are required for AI. |
| `PORT` | Listening port, default `3000`. |
| `HOST` | Bind address, default `127.0.0.1`. Set `0.0.0.0` when required by a container/hosting platform. |
| `AI_DAILY_REQUEST_LIMIT` | Global generation request allowance per 24-hour window; default `100`. |
| `FEED_ALLOWED_HOSTS` | Additional exact HTTPS feed hostnames, comma separated. Default source hosts are included. Redirect destinations must also be approved. |
| `DISABLE_HMR` | Optional development setting; `true` disables Vite hot reloading/file watching. |

`APP_URL` is not used. Secrets must not use a `VITE_` prefix, because frontend configuration is public.

## Build, run and check

```bash
npm run lint
npm run build
npm test
npm start
```

`build` produces `dist/` for the frontend and `build/server.js` for the backend. `start` explicitly runs production mode using Node; it does not need `tsx` or Vite development middleware. Run these commands from the repository root. Build before running tests, because the API smoke test starts the production server.

For deployment, build with development dependencies installed, then install/retain runtime dependencies with `npm ci --omit=dev`. Deploy `build/`, `dist/`, `package.json`, `package-lock.json`, and the runtime dependencies. Supply environment variables through your host's secret configuration. Configure HTTPS at your hosting platform or reverse proxy.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Express plus Vite development middleware. |
| `npm run lint` | TypeScript checking; not ESLint. |
| `npm run build` | Build frontend and backend. |
| `npm test` | Security, feed-cache, RSS, AI-validation and production API tests. |
| `npm start` | Start the built production server. |
| `npm run preview` | Frontend preview only; does not start the API. |
| `npm run clean` | Cross-platform removal of generated build directories. |

GitHub Actions runs a locked install, typechecking, build and tests on pushes and pull requests.

## Security and operational boundaries

- AI and source creation require the owner bearer token. Public visitors can read the feed. This is a single-owner prototype, not a multi-user account system.
- API traffic is limited to 120 requests/minute per socket address; owner actions to 10/minute. Forwarded IP headers are not trusted. Behind a reverse proxy, clients may share a limit; configure identity-aware limits at the hosting edge for larger deployments.
- Gemini calls have a 30-second timeout, a two-request concurrency ceiling, an output-token bound and a global request allowance. Input articles come from the server, not browser-supplied text. Guide JSON is checked before caching/rendering.
- Guides are cached by article content and model for one hour, with at most 200 entries. Limits and caches are in memory and reset on restart; they are not shared across replicas. Provider-side quotas remain necessary for an enduring spending cap.
- Feed URLs require approved HTTPS hosts. DNS answers must be public, connections are pinned to validated addresses, and redirects are revalidated. Downloads have a five-second deadline, a 1 MB size bound and at most three concurrent downloads.
- Feed refreshes share one in-flight operation and are cached for 45 seconds, including failures. Public `force=true` does not bypass this cache.
- Up to 20 custom sources are retained in server memory. They disappear on restart. Muting a source is a persistent browser display preference; it does not stop server polling.
- Invalid API JSON receives a generic error. `/api/health` reports process health, not feed or Gemini availability.

## Project structure

| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | News UI, owner access, saved stories, source preferences and AI panels. |
| `src/data/curatedDispatches.ts` | Default source configuration and labeled demo stories. |
| `src/types/news.ts` | Shared data types. |
| `public/images/` | Demo images copied into the production build. |
| `server.ts` | Configuration, API access controls, Gemini endpoints and startup. |
| `server/security.ts` | URL restrictions, bounded downloads, authentication and rate limiting. |
| `server/domain.ts` | Stable IDs, AI validation and bounded guide cache. |
| `server/feed-store.ts` | Shared refreshes, per-source status and last-good article retention. |
| `server/rss.ts` | Feed parsing and suggested categories. |
| `tests/` | Regression and production smoke tests. |

## Future improvements

- Integrate CISA KEV and verified vendor vulnerability metadata.
- Replace the limited RSS parser with a fully tested syndication parser.
- Add persistent source storage and user accounts if the app grows beyond one owner.
- Add shared limits/caches for multiple server replicas.
