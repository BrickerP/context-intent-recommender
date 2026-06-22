# Context Intent Recommender

Context Intent Recommender is a small local prototype for agent frontends.
It captures the user's current browser context, sends it to a local runtime,
and returns the most useful next action, such as summarize, reply, translate,
review code, or ask the user for more context.

The project is intentionally local-first:

- The Chrome extension captures the active tab context.
- The local runtime stores the latest snapshot and exposes simple HTTP APIs.
- The CLI prints the latest recommendation or hands an action to Codex CLI.
- A deterministic router is included as an offline fallback and test target.

## What It Captures

The extension produces a `ContextSnapshot`:

```json
{
  "app": "chrome",
  "url": "https://github.com/example/project/pull/123",
  "pageTitle": "Fix auth redirect by alice - Pull Request #123",
  "hasSelection": false,
  "selectedText": "",
  "selectionTextClass": "empty",
  "isEditing": false,
  "visibleContentSummary": "Conversation Commits Checks Files changed Review changes diff...",
  "sourceMeta": {
    "source": "chrome_extension",
    "timestamp": 1782145299149,
    "visibleTextCharCount": 1000,
    "selectedTextCharCount": 0
  }
}
```

This is a live-page context bridge, not a URL scraper. It can capture logged-in
pages and selections because the user explicitly runs the extension on the
active tab.

## Requirements

- Node.js 22 or newer
- Chrome or Chromium
- Optional: Codex CLI installed and authenticated for `frontend show`

If Codex CLI is not available, use `frontend show --router` for the deterministic
offline router.

## Install

```bash
git clone https://github.com/BrickerP/context-intent-recommender.git
cd context-intent-recommender
npm install
npm link
```

`npm link` makes the `frontend` command available from your shell. If you do not
want to link it, replace `frontend ...` commands with `node scripts/frontend.js ...`.

## Start The Runtime

In one terminal:

```bash
npm run runtime
```

By default it listens on:

```text
http://127.0.0.1:8787
```

Useful endpoints:

- `POST /context` stores the latest extension snapshot.
- `GET /context` returns the latest stored snapshot.
- `GET /recommend` runs the deterministic fallback router on the latest snapshot.
- `GET /agent?actionId=<id>` builds a Codex CLI handoff prompt.
- `GET /health` checks whether the runtime is alive.

If port `8787` is already occupied by this runtime, the server exits cleanly and
tells you to use the existing process.

## Load The Chrome Extension

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder:

```text
<repo>/chrome-extension
```

Then open any normal web page and click the extension icon. The popup will:

1. Read the active tab context.
2. Send it to `http://127.0.0.1:8787/context`.
3. Show recommended actions, the raw context, and the runtime response.

Chrome does not allow this style of script injection on browser-internal pages
such as `chrome://extensions`.

## Use The CLI

After the extension has captured a page:

```bash
frontend show
```

`frontend show` asks Codex CLI to recommend actions using the captured
`ContextSnapshot` and the schema in `schemas/agent-recommendation.schema.json`.

For a fully offline deterministic result:

```bash
frontend show --router
```

Print the raw latest context:

```bash
frontend context
```

Build a prompt for a selected action:

```bash
frontend agent summarize_assessment
```

Run that selected action through Codex CLI:

```bash
frontend agent summarize_assessment --run
```

## Example Flow

```bash
npm run runtime
```

Load the extension, open a GitHub pull request, and click `Refresh context`.

```bash
frontend show --router
```

Example output:

```text
Scene: github_pr (0.96)
Fallback: false
Router: rules_first_codex_handoff
Context: Fix auth redirect by alice - Pull Request #123

1. Summarize PR changes [summarize_changes] 0.91
2. Draft a code review [write_review] 0.9
3. Find potential risks [find_risks] 0.86
```

## Architecture

```text
Chrome extension
  -> collects ContextSnapshot from the active tab
  -> POST /context to local runtime
  -> runtime stores latest snapshot
  -> CLI reads latest snapshot
  -> Codex CLI agent or deterministic router recommends actions
```

The runtime intentionally keeps a small router surface. For product use, the
agent can own semantic reasoning while the deterministic router remains a fast,
offline, explainable fallback.

## Development

Run tests:

```bash
npm test
```

Check the CLI syntax:

```bash
node --check scripts/frontend.js
node --check scripts/runtime-server.js
```

## Troubleshooting

- `Runtime request failed`: start the runtime with `npm run runtime`.
- `Codex agent recommendation failed`: install/authenticate Codex CLI, or use `frontend show --router`.
- Extension cannot capture a page: reload the target page and avoid `chrome://` browser-internal pages.
- No context yet: click the extension popup's `Refresh context` button on a normal page.
