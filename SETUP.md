# Setting up the Docs Sync Agent in existing repos

This project **is the agent**. It runs as a GitHub Actions job **inside your code repo**.
On every PR to `main` it:

1. reads the PR diff via the GitHub API,
2. checks out your **docs repo**,
3. asks the LLM which docs are impacted,
4. opens / updates / closes a PR in the docs repo to mirror the code PR,
5. posts a Slack notification.

You do **not** run it inside the docs repo. The docs repo only receives PRs.

---

## 0. One-time prerequisites (shared across all code repos)

1. **Docs-repo token (`DOCS_REPO_PAT`)** — a fine-grained PAT scoped to the **docs repo**:
   - Repository access: only your docs repo
   - Permissions: **Contents: Read and write**, **Pull requests: Read and write**
   - (A classic PAT with the `repo` scope also works.)

2. **LLM key** — `ANTHROPIC_API_KEY` (Claude) **or** `OPENAI_API_KEY` (OpenAI).

3. **Slack incoming webhook (`SLACK_WEBHOOK_URL`)** — api.slack.com → your app →
   Incoming Webhooks → add to the channel → copy the URL.

> **Tip:** set these as **organization-level** secrets/variables so every code repo
> inherits them and you don't repeat this per repo.

---

## Pick how the agent code reaches CI

### Option A — Shared agent repo (recommended for multiple code repos)

Push this folder to its own repo, e.g. `your-org/docs-sync-agent`. Each code repo then
only needs a small workflow that checks the agent out and runs it.

In **each code repo**, add `.github/workflows/docs-sync.yml`:

```yaml
name: Docs Sync
on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches: [main]
permissions:
  contents: read
  pull-requests: read
concurrency:
  group: docs-sync-${{ github.event.pull_request.number }}
  cancel-in-progress: true
jobs:
  docs-sync:
    runs-on: ubuntu-latest
    # Skip PRs from forks (they don't get secrets).
    if: github.event.pull_request.head.repo.full_name == github.repository
    steps:
      - name: Checkout docs-sync-agent
        uses: actions/checkout@v4
        with:
          repository: your-org/docs-sync-agent
          ref: main
          # token: ${{ secrets.DOCS_REPO_PAT }}   # only if the agent repo is PRIVATE

      - name: Checkout docs repo
        uses: actions/checkout@v4
        with:
          repository: ${{ vars.DOCS_REPO }}
          token: ${{ secrets.DOCS_REPO_PAT }}
          path: docs-checkout

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - run: npm ci
      - run: npm run build

      - name: Run agent
        env:
          LLM_PROVIDER: ${{ vars.LLM_PROVIDER }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          DOCS_REPO: ${{ vars.DOCS_REPO }}
          DOCS_REPO_PAT: ${{ secrets.DOCS_REPO_PAT }}
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CODE_REPO: ${{ github.repository }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
          DOCS_REPO_DIR: docs-checkout
        run: npm start
```

> If the agent repo is private and in the same org, the built-in `GITHUB_TOKEN` can't
> check it out — either make the agent repo public or pass a read token to its checkout
> (uncomment the `token:` line, or use a dedicated PAT).

### Option B — Vendor into a single code repo

Copy these files into the code repo (at the root). The workflow already shipped here —
[`.github/workflows/docs-sync.yml`](.github/workflows/docs-sync.yml) — runs `npm ci/build/start`
in the checkout and works as-is. If you place the files in a subfolder instead, add a
`working-directory:` to the npm steps.

---

## Add secrets & variables (per code repo, or once at org level)

Repo → **Settings → Secrets and variables → Actions**:

**Secrets**
- `DOCS_REPO_PAT`
- `SLACK_WEBHOOK_URL`
- `ANTHROPIC_API_KEY` **or** `OPENAI_API_KEY`

**Variables**
- `DOCS_REPO` = `owner/repo` of the docs repo
- `LLM_PROVIDER` = `anthropic` or `openai`

`GITHUB_TOKEN`, `CODE_REPO`, `PR_NUMBER`, and `DOCS_REPO_DIR` are provided automatically.
If your docs repo's default branch isn't `main`, add a `DOCS_BASE_BRANCH` variable and pass
it through in the `env:` block.

---

## Verify

1. Open a PR in the code repo with any code change (there's no path filter — the whole
   diff is considered).
2. Watch the workflow run → a `docs-sync/pr-<n>` PR should appear in the docs repo and a
   Slack message should arrive.
3. Push another commit to the PR → the same docs PR updates.
4. Revert the change so docs are no longer affected → the docs PR closes automatically.

To rehearse locally first, copy `.env.example` to `.env`, fill the five required values
plus a real `CODE_REPO`/`PR_NUMBER`, and run `npm run dev` (use `DRY_RUN=true npm run dev`
to plan without opening a PR).
