# Use BrandCurrent locally

From PowerShell:

```powershell
Set-Location 'D:\CHATGPT\MARKETTING BY CODEX'
npm run local
```

Open http://localhost:3000 in the same browser each time. No BrandCurrent login or signup is required, including when Supabase settings exist. Keep the terminal running. You can also run `./Start-BrandCurrent.ps1`; it installs the locked dependencies only if they are missing.

Brands, scans, campaign metadata and limits stay in browser localStorage. Generated media stays in IndexedDB, avoiding localStorage's small capacity. Navigation and reload preserve saved results. Closing the tab interrupts local scans/generation; those runs are labeled interrupted next time. Switching browsers or clearing site data does not transfer your workspace.

## Website scans

Enter a public website and choose **Discover my brand**. The basic scanner fetches HTML, internal links and accessible CSS on the local server, without a scraping API key. It reads up to six pages per run and records observed sources. Access failures and limits remain visible as partial coverage. **Scan again** refreshes the bounded scan; it does not promise a full-site crawl. JavaScript execution, screenshot analysis and broad external research use the separate Firecrawl/Browserless server workflow.

## Image and text generation

Copy `.env.example` to `.env` once, preserving any existing configuration. Set your own `GEMINI_API_KEY` and positive conservative `COST_TEXT` / `COST_IMAGE` estimates. Restart the server. Set the monthly limit in **Workspace settings**, and a campaign limit in the content form. Provider billing is separate; browser limits are advisory estimates for this browser, not account-wide billing controls.

Choose formats and destinations, supply the creative brief, and optionally give a public PNG/JPEG/WebP product reference. Each platform version is generated and its finished output is reviewed. Failed reviews feed correction attempts, up to five per version. Only qualifying content enters the gallery. Missing credentials, provider errors and unavailable models produce errors; they never produce placeholder art or fabricated scores.

The image adapter uses Google's documented native Gemini image API. Default model: `gemini-3-pro-image`; change the model identifier in server configuration when needed. See [Google image generation](https://ai.google.dev/gemini-api/docs/image-generation).

## Social posting and analytics

Logging into BrandCurrent is not needed for local drafting. Authorizing the social platform is required for posting to that account. No passwords or public/shared API keys can replace that authorization.

Unattended scheduling, account tokens, customer events and reporting require the secure server workspace: Supabase schema/migrations and private storage, encryption key, Inngest configuration and reachable signed workflow endpoints, plus the platform OAuth applications. Video also needs the media processor. The existing server implementation is retained; local browser storage is not presented as a durable scheduler. Connections shows missing configuration explicitly.

No provider key, social account, live publication or live analytics connection is bundled with the project. Do not put secrets in source control or frontend storage.
