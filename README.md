# Documentation Sync Agent

Automatically keeps a documentation PR in sync with an **open** code PR.

When you open a PR to `main` in the **code** repo (and on every later commit), a GitHub
Action runs this agent. It reads the live PR diff, asks an LLM which docs are impacted,
and reconciles a PR in the **docs** repo — opening, updating, or closing it to match the
current state of your code PR — then posts a Slack notification so anyone can review/merge.

```text
Code PR opened / new commits  →  GitHub Action  →  Analyze live diff  →  Find impacted docs
                                                          │
                    ┌─────────────────────────────────────┼─────────────────────────────────┐
              docs needed,                          docs needed,                       docs no longer
              no docs PR yet                         docs PR exists                      needed (reverted)
                    │                                     │                                   │
                  OPEN docs PR                       UPDATE docs PR                       CLOSE docs PR
                    └──────────────────────── 🔔 Slack notification (full context) ───────────────────┘
```

### The "mirror" model

The docs PR mirrors the source PR. The agent re-runs on every commit and reconciles:

| Docs change needed? | Docs PR exists? | Action |
| --- | --- | --- |
| yes | no | **open** a docs PR + Slack |
| yes | yes | **update** the docs PR (force-update branch) + Slack (only if content changed) |
| no | yes | **close** the docs PR + delete branch + Slack (code was reverted/changed) |
| no | no | noop |

The docs branch is stable per source PR (`docs-sync/pr-<number>`), so the same PR is
updated in place rather than duplicated. See [`src/decide.ts`](src/decide.ts).

## What's different from the base plan

This build implements the plan plus **two changes**:

1. **Slack notification on PR open** — as soon as the docs PR is opened, a Slack message
   is sent with full context (source PR, the agent's reasoning, the exact files changed,
   and "Review & merge" / "View source PR" buttons) so anyone can review and merge.
   Update/close events get their own notifications too. See [`src/slack.ts`](src/slack.ts).
2. **Choose your LLM provider** — pick **OpenAI** or **Claude (Anthropic)** via
   `LLM_PROVIDER`. See [`src/config.ts`](src/config.ts) and [`src/llm/`](src/llm/).

## Setup

```bash
npm install
cp .env.example .env   # then fill in values
```

### Choosing a provider (Change 2)

Set `LLM_PROVIDER` to `anthropic` or `openai` and provide the matching key:

```bash
# Claude
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# or OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

If `LLM_PROVIDER` is omitted, the provider is inferred from whichever key is present.
Default models: `claude-opus-4-8` (anthropic) / `gpt-4o` (openai). To override, set the
optional `LLM_MODEL` env var (not in `.env.example` to keep setup minimal).

### What you actually configure

Only five values:

| Var | Purpose |
| --- | --- |
| `LLM_PROVIDER` + `ANTHROPIC_API_KEY` **or** `OPENAI_API_KEY` | Pick Claude or OpenAI (Change 2) |
| `DOCS_REPO` | `owner/repo` of the docs repo |
| `DOCS_REPO_PAT` | Token that can push branches + open PRs in the docs repo |
| `SLACK_WEBHOOK_URL` | Where the docs-PR notification goes (Change 1) |

Everything else (`CODE_REPO`, `GITHUB_TOKEN`, `PR_NUMBER`, `DOCS_REPO_DIR`) is provided
automatically in GitHub Actions, and `DOCS_BASE_BRANCH` defaults to `main`. Set those four
manually only for local runs.

### 4. End-to-end (opens/updates/closes a real docs PR + sends Slack)

1. Clone the docs repo locally: `git clone <docs-repo> ./docs-checkout`.
2. Fill `.env` with a real provider key, `GITHUB_TOKEN`, `DOCS_REPO_PAT`, `CODE_REPO`,
   `DOCS_REPO`, an **open** `PR_NUMBER`, and `SLACK_WEBHOOK_URL`.
3. `DRY_RUN=false npm run dev`. A `docs-sync/pr-<n>` branch + PR appears in the docs repo
   and a Slack "ready for review" message arrives.
4. Push a commit to the source PR that changes code, run again → the **same** docs PR is
   updated and an "updated" Slack message arrives.
5. Push a commit that reverts the change so docs are no longer affected, run again → the
   docs PR is **closed** and a "closed" Slack message arrives. This mirrors the synchronize
   flow CI runs automatically.

To test Slack formatting alone, paste the output of `buildSlackPayload(...)` into the
[Slack Block Kit Builder](https://app.slack.com/block-kit-builder).

### 5. In CI (GitHub Actions)

The workflow [`.github/workflows/docs-sync.yml`](.github/workflows/docs-sync.yml) triggers on
`pull_request: [opened, synchronize, reopened]` targeting `main` (with per-PR concurrency so
rapid commits cancel stale runs). Configure on the **code** repo:

**Secrets:** `DOCS_REPO_PAT`, `SLACK_WEBHOOK_URL`, and one of `ANTHROPIC_API_KEY` /
`OPENAI_API_KEY` (`GITHUB_TOKEN` is built in).

**Variables:** `DOCS_REPO` (`owner/repo`) and `LLM_PROVIDER`. That's it.

Test it by opening a small PR (any file change works), then pushing follow-up commits, and
watching the Action logs + the docs repo + Slack as the docs PR opens, updates, and
(after a revert) closes.

## Safety rules (enforced by design)

- Only the **docs** repo is written to (separate `DOCS_REPO_PAT`); the code repo is read-only.
- No-op edits are dropped, so empty PRs are never opened.
- A missing Slack webhook logs a warning but never fails the sync.
- The agent is instructed to make minimal edits and never invent functionality.

## Scope of changes considered

**Every file changed by the PR, anywhere in the repo** — there is no path/pattern filter.
The full diff is sent to the LLM, which decides whether (and which) docs are impacted.
See [`src/diff.ts`](src/diff.ts).
