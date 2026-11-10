# Sentinel Wire

Cybersecurity news aggregation with AI learning guides for beginners.

Sentinel Wire brings security stories into one interface and helps students understand the threats behind the headlines. Built as a first project with AI Studio, it pairs a React frontend with an Express backend for fetching feeds and requesting explanations from Gemini.

## Main features

- **News feed:** Fetches RSS/Atom stories from configured sources, including The Hacker News, BleepingComputer, KrebsOnSecurity, SANS ISC, and Google Project Zero. Live articles are merged with bundled dispatches and sorted by publication time.
- **Search and filtering:** Search article text and available metadata; filter by category, severity, source, or the actively exploited flag. Separate views organize vulnerabilities and advisories.
- **Article reader:** Read summaries and details, open original source links, and view affected products, indicators of compromise, and remediation steps when included in the article data.
- **Beginner learning guides:** Request plain-English summaries, everyday analogies, attack breakdowns, jargon definitions, protection tips, and a multiple-choice comprehension question. Ask follow-up questions about an article or regenerate its guide.
- **Read Later:** Save articles in the browser using localStorage, then search or filter the saved list without signing in.
- **Source controls:** Add custom RSS/Atom URLs and toggle sources in the current interface.
- **Refresh and export:** Refresh manually, enable 30-second polling, and export the current view or saved articles as JSON.
- **Theme preference:** Switch between light and dark modes, with the preference stored locally.

## Current scope and data limitations

This is a learning and portfolio prototype. The feed includes bundled example dispatches, and the interface can inject simulated breaking alerts. These entries should not be treated as independently verified reporting, even when they display source names, CVE identifiers, or recent timestamps.

For live articles, categories, severity, exploitation flags, and some displayed CVSS values are assigned through keyword rules in `server.ts`. They are not verified vulnerability assessments. The configured CISA KEV JSON source is currently excluded from the RSS fetching path; a CISA entry in the source list does not mean the KEV catalog is being synchronized.

The server parses up to six entries per feed and caches nonempty live results for 45 seconds. Third-party feed failures can leave the bundled content visible. AI responses depend on Gemini access and may need checking against the original advisory.

Custom sources and generated-guide caches are held in server memory and reset when the server restarts. Source toggles are frontend state rather than persistent server configuration. Saved articles and theme preferences belong to the current browser; there is no account-based synchronization or database persistence.

## Technology stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite |
| Styling and UI | Tailwind CSS 4, Lucide React icons |
| Backend | Express 4, TypeScript executed with tsx |
| AI | Google Gen AI SDK (`@google/genai`), called from the server |
| Configuration | dotenv and `.env.example` |
| Storage | Browser localStorage and in-memory server state |

## Local setup

### Prerequisites

- Git and a Node.js installation with npm. The repository does not declare a required Node.js version; use a current runtime compatible with the dependency versions in `package.json`.
- Internet access for live feeds and Gemini requests.
- A Gemini API key for AI guides and follow-up answers. Feed browsing does not require the key.

### Install and run

```bash
git clone https://github.com/farismughal02/My-first-project-aistudio.git
cd My-first-project-aistudio
npm install
```

Copy `.env.example` to `.env` in the project root.

macOS/Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `.env` as described below, then start the app:

```bash
npm run dev
```

Open **http://localhost:3000**. The development command starts Express with Vite middleware, so a separate frontend server is unnecessary. Port `3000` is hardcoded in `server.ts`.

The repository includes `bun.lock`; the commands above use the npm scripts declared in `package.json`.

## Environment variables

The server loads the root `.env` file through `dotenv/config`.

| Variable | Guidance |
| --- | --- |
| `GEMINI_API_KEY` | Replace `MY_GEMINI_API_KEY` with your own key to use AI explanations and follow-up answers. The key is read on the server. The example file notes that AI Studio can inject it through its Secrets panel. |
| `APP_URL` | Included in the template for the hosted application URL, but not currently read by the application code. It is not needed for local functionality. |
| `NODE_ENV` | Set to `production` when serving the built frontend through Express. Otherwise the server uses Vite development middleware. |
| `DISABLE_HMR` | Optional Vite setting: `true` disables hot module replacement and file watching. Leave unset for ordinary local development. |

Example local `.env`:

```dotenv
GEMINI_API_KEY="replace_with_your_key"
APP_URL="http://localhost:3000"
```

Keep actual keys out of commits and screenshots. `.gitignore` excludes `.env*` files while allowing `.env.example`. Do not rename the key to a `VITE_` variable or place it in frontend code.

Both AI endpoints currently request `gemini-3.8-flash` in `server.ts`. If that model is unavailable to your key, update both calls to a model available to your account. The model is not configurable through an environment variable in the current implementation.

## Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Express with Vite development middleware. |
| `npm run lint` | Run TypeScript checking (`tsc --noEmit`); this is not an ESLint command. |
| `npm run build` | Build the frontend into `dist/`. |
| `npm start` | Start the Express server; set `NODE_ENV=production` to serve `dist/`. |
| `npm run preview` | Preview the Vite frontend build only; it does not start the Express API. |
| `npm run clean` | Remove `dist` and `server.js` using `rm -rf` (requires a compatible shell). |

### Serve a production build locally

```bash
npm run build
```

macOS/Linux:

```bash
NODE_ENV=production npm start
```

Windows PowerShell:

```powershell
$env:NODE_ENV = "production"
npm start
```

Open **http://localhost:3000**. Keep the installed runtime dependencies available: the start script executes `server.ts` with `tsx`.

## Project structure

| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | Feed interface, filters, article reader, AI panels, saved articles, and export actions |
| `src/data/curatedDispatches.ts` | Default sources and bundled example dispatches |
| `src/types/news.ts` | Shared article, source, and learning-guide types |
| `src/index.css` | Global styles and Tailwind configuration |
| `server.ts` | Feed fetching, parsing, caching, source creation, Gemini endpoints, and frontend serving |
| `vite.config.ts` | React/Tailwind plugins and development settings |
| `.env.example` | Environment-variable template |

## Future improvements

- Clearly label bundled and simulated entries throughout the interface and separate them from live reporting.
- Integrate the CISA KEV JSON catalog and replace heuristic CVSS values with verified source data.
- Persist custom sources and preferences, improve feed parsing, and expose per-source errors.
- Add automated tests for parsing, filtering, and API error paths, plus model configuration and response validation.
- Add authentication, rate limiting, and stricter custom-feed URL validation before public deployment.
