# Getting every secret & variable

This walks through **how to obtain each value** and **where to paste it**. Everything goes
into the **code repo** (the repo the workflow runs in) — nothing is configured in the docs repo.

Throughout, substitute your own names:

| Placeholder | Meaning | Example |
| --- | --- | --- |
| `<code-repo>` | repo where the workflow runs (code lives here) | `acme/app` |
| `<docs-repo>` | repo where docs PRs are opened | `acme/docs` |
| `<agent-repo>` | this project, pushed to GitHub | `acme/docs-sync-agent` |

## What you need

| Name | Type | Required? | Used for |
| --- | --- | --- | --- |
| `DOCS_REPO_PAT` | Secret | ✅ always | Push branches + open PRs in `<docs-repo>` |
| `SLACK_WEBHOOK_URL` | Secret | ✅ always | Posting the docs-PR notification |
| `ANTHROPIC_API_KEY` **or** `OPENAI_API_KEY` | Secret | ✅ one of them | Calling the LLM |
| `LLM_PROVIDER` | Variable | ✅ always | Choosing `anthropic` or `openai` |
| `DOCS_REPO` | Variable | ✅ always* | `owner/repo` of `<docs-repo>` |
| `AGENT_REPO_TOKEN` | Secret | ⚠️ only if `<agent-repo>` is **private** | Checking out the agent repo |

\* You can skip the `DOCS_REPO` variable if you hard-code the docs repo directly in the workflow
(both the `Checkout docs repo` step and the `DOCS_REPO` env line).

Built-in / auto-provided (do **not** create): `GITHUB_TOKEN`, `CODE_REPO`, `PR_NUMBER`, `DOCS_REPO_DIR`.

---

## 1. `DOCS_REPO_PAT` — token to write to the docs repo

A GitHub **fine-grained personal access token** scoped to only `<docs-repo>`.

1. Go to **https://github.com/settings/personal-access-tokens/new**
   (GitHub → your avatar → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**).
2. **Token name:** e.g. `docs-sync`
3. **Expiration:** 90 days (or your policy; set a calendar reminder to rotate).
4. **Resource owner:** the org/user that owns `<docs-repo>`.
5. **Repository access:** select **Only select repositories** → choose **`<docs-repo>`**.
6. **Permissions → Repository permissions** — both are required:
   - **Contents** → **Read and write** (push the docs branch)
   - **Pull requests** → **Read and write** (open / update / close the docs PR)
   - (Metadata → Read-only is selected automatically — leave it.)
7. Click **Generate token** and **copy it now** (starts with `github_pat_…`; shown only once).

> ⚠️ **Most common failure:** if you grant only *Contents* but not *Pull requests*, the branch
> push succeeds but opening the PR fails with `403 Resource not accessible by personal access
> token` (GitHub's response header says `x-accepted-github-permissions: pull_requests=write`).
> Both permissions are mandatory.
>
> Editing permissions on an existing fine-grained PAT **does not change the token value**, so if
> you fix this later you do **not** need to update the `DOCS_REPO_PAT` secret.

> Tip: the docs PR will appear as opened by **whoever owns this token**. To make it post as a
> bot rather than under your name, create the token from a dedicated machine/bot account.

➡️ Paste into `<code-repo>` as a **secret** named `DOCS_REPO_PAT` (see [§7](#7-where-to-paste-them)).

---

## 2. `SLACK_WEBHOOK_URL` — where notifications are posted

A Slack **incoming webhook** bound to one channel.

1. Go to **https://api.slack.com/apps** → **Create New App** → **From scratch**.
2. Name it `docs-sync` and pick your workspace → **Create App**.
3. In the left sidebar, open **Incoming Webhooks** → toggle **Activate Incoming Webhooks** to **On**.
4. Click **Add New Webhook to Workspace** → choose the channel (e.g. `#docs-prs`) → **Allow**.
5. Copy the **Webhook URL** (looks like `https://hooks.slack.com/services/T000/B000/XXXX`).

> Test it from your terminal:
> ```bash
> curl -X POST -H 'Content-Type: application/json' \
>   -d '{"text":"docs-sync test ✅"}' "<your-webhook-url>"
> ```
> You should see the message land in the channel.

➡️ Paste into `<code-repo>` as a **secret** named `SLACK_WEBHOOK_URL`.

---

## 3a. `ANTHROPIC_API_KEY` — if you chose Claude

1. Go to **https://console.anthropic.com** and sign in.
2. Ensure billing is set up: **Settings → Billing** (add a payment method / credits).
3. **Settings → API Keys → Create Key**, name it `docs-sync`, **copy it** (starts with `sk-ant-…`).

➡️ Paste into `<code-repo>` as a **secret** named `ANTHROPIC_API_KEY`, and set `LLM_PROVIDER=anthropic`.

## 3b. `OPENAI_API_KEY` — if you chose OpenAI

1. Go to **https://platform.openai.com/api-keys** and sign in.
2. Ensure billing is set up: **Settings → Billing**.
3. **Create new secret key**, name it `docs-sync`, **copy it** (starts with `sk-…`).

➡️ Paste into `<code-repo>` as a **secret** named `OPENAI_API_KEY`, and set `LLM_PROVIDER=openai`.

> You only need **one** of these — whichever matches `LLM_PROVIDER`.

---

## 4. `LLM_PROVIDER` — which model vendor to use

Not a secret — a plain **variable**. Value is exactly one of:

- `anthropic` (uses `ANTHROPIC_API_KEY`, default model `claude-opus-4-8`)
- `openai` (uses `OPENAI_API_KEY`, default model `gpt-4o`)

➡️ Add into `<code-repo>` as a **variable** named `LLM_PROVIDER`.

---

## 5. `DOCS_REPO` — which repo receives docs PRs

Not a secret — a plain **variable**. Value is the `owner/repo` of your docs repo, e.g. `acme/docs`.

➡️ Add into `<code-repo>` as a **variable** named `DOCS_REPO`.
*(Skip this if you hard-coded the docs repo directly in the workflow instead.)*

---

## 6. `AGENT_REPO_TOKEN` — only if the agent repo is private

If **`<agent-repo>` is public, skip this** (and remove the `token:` line from the agent-checkout
step). The code repo's built-in token can't read a *different* private repo, so a private agent
repo needs its own read token.

1. Create another fine-grained PAT (same path as [§1](#1-docs_repo_pat--token-to-write-to-the-docs-repo)).
2. **Repository access:** Only select repositories → **`<agent-repo>`**.
3. **Permissions:** **Contents → Read-only** (that's all the checkout needs).
4. Generate and copy.

➡️ Paste into `<code-repo>` as a **secret** named `AGENT_REPO_TOKEN`, and uncomment the `token:`
line in the workflow.

*(Simpler alternative: just make `<agent-repo>` public — it contains no secrets, since `.env` is
gitignored and only `.env.example` is committed.)*

---

## 7. Where to paste them

In **`<code-repo>`** → **Settings → Secrets and variables → Actions**:

- **Secrets** tab → **New repository secret** → for `DOCS_REPO_PAT`, `SLACK_WEBHOOK_URL`,
  your API key, (and `AGENT_REPO_TOKEN` if needed).
- **Variables** tab → **New repository variable** → for `LLM_PROVIDER` and `DOCS_REPO`.

> If you'll add more code repos later, set these at **org level** instead
> (**Org → Settings → Secrets and variables → Actions**) so every repo inherits them.

### Or via the `gh` CLI

```bash
# from any terminal logged into gh (gh auth login)
gh secret   set DOCS_REPO_PAT     -R <code-repo>   # paste value when prompted
gh secret   set SLACK_WEBHOOK_URL -R <code-repo>
gh secret   set ANTHROPIC_API_KEY -R <code-repo>   # or OPENAI_API_KEY
gh variable set LLM_PROVIDER       -R <code-repo> -b "anthropic"
gh variable set DOCS_REPO          -R <code-repo> -b "<docs-repo>"
# only if the agent repo is private:
gh secret   set AGENT_REPO_TOKEN  -R <code-repo>
```

---

## 8. Final checklist

- [ ] `DOCS_REPO_PAT` secret — fine-grained PAT on `<docs-repo>` (**Contents R/W + Pull requests R/W**)
- [ ] `SLACK_WEBHOOK_URL` secret — tested with `curl`
- [ ] `ANTHROPIC_API_KEY` **or** `OPENAI_API_KEY` secret — billing enabled
- [ ] `LLM_PROVIDER` variable — matches the key you added
- [ ] `DOCS_REPO` variable — `owner/repo` of the docs repo (or hard-coded in the workflow)
- [ ] Agent repo public **or** `AGENT_REPO_TOKEN` secret added + `token:` line uncommented
- [ ] `.github/workflows/docs-sync.yml` committed on the default branch of `<code-repo>`
- [ ] Actions enabled on `<code-repo>` (forks have Actions disabled until you enable them)

Then open a PR in `<code-repo>` and watch: workflow runs → PR appears in `<docs-repo>` → Slack pings.
