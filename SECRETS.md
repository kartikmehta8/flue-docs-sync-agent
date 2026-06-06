# Getting every secret & variable

This walks through **how to obtain each value** and **where to paste it**. Everything goes
into the **code repo** (`kartikmehta8/self`) — nothing is configured in the docs repo.

## What you need

| Name | Type | Required? | Used for |
| --- | --- | --- | --- |
| `DOCS_REPO_PAT` | Secret | ✅ always | Push branches + open PRs in `kartikmehta8/self-docs` |
| `SLACK_WEBHOOK_URL` | Secret | ✅ always | Posting the docs-PR notification |
| `ANTHROPIC_API_KEY` **or** `OPENAI_API_KEY` | Secret | ✅ one of them | Calling the LLM |
| `LLM_PROVIDER` | Variable | ✅ always | Choosing `anthropic` or `openai` |
| `AGENT_REPO_TOKEN` | Secret | ⚠️ only if `flue-docs-sync-agent` is **private** | Checking out the agent repo |

Built-in / auto-provided (do **not** create): `GITHUB_TOKEN`, `CODE_REPO`, `PR_NUMBER`, `DOCS_REPO_DIR`.

---

## 1. `DOCS_REPO_PAT` — token to write to the docs repo

A GitHub **fine-grained personal access token** scoped to only `kartikmehta8/self-docs`.

1. Go to **https://github.com/settings/personal-access-tokens/new**
   (GitHub → your avatar → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**).
2. **Token name:** `docs-sync-self-docs`
3. **Expiration:** 90 days (or your policy; set a calendar reminder to rotate).
4. **Resource owner:** `kartikmehta8`
5. **Repository access:** select **Only select repositories** → choose **`kartikmehta8/self-docs`**.
6. **Permissions → Repository permissions:**
   - **Contents** → **Read and write**
   - **Pull requests** → **Read and write**
   - (Metadata → Read-only is selected automatically — leave it.)
7. Click **Generate token** and **copy it now** (starts with `github_pat_…`; shown only once).

> Tip: the docs PR will appear as opened by **whoever owns this token**. To make it post as
> a bot rather than under your name, create the token from a dedicated machine/bot account.

➡️ Paste into `self` as a **secret** named `DOCS_REPO_PAT` (see [§6](#6-where-to-paste-them)).

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

➡️ Paste into `self` as a **secret** named `SLACK_WEBHOOK_URL`.

---

## 3a. `ANTHROPIC_API_KEY` — if you chose Claude

1. Go to **https://console.anthropic.com** and sign in.
2. Ensure billing is set up: **Settings → Billing** (add a payment method / credits).
3. **Settings → API Keys → Create Key**, name it `docs-sync`, **copy it** (starts with `sk-ant-…`).

➡️ Paste into `self` as a **secret** named `ANTHROPIC_API_KEY`, and set `LLM_PROVIDER=anthropic`.

## 3b. `OPENAI_API_KEY` — if you chose OpenAI

1. Go to **https://platform.openai.com/api-keys** and sign in.
2. Ensure billing is set up: **Settings → Billing**.
3. **Create new secret key**, name it `docs-sync`, **copy it** (starts with `sk-…`).

➡️ Paste into `self` as a **secret** named `OPENAI_API_KEY`, and set `LLM_PROVIDER=openai`.

> You only need **one** of these — whichever matches `LLM_PROVIDER`.

---

## 4. `LLM_PROVIDER` — which model vendor to use

Not a secret — a plain **variable**. Value is exactly one of:

- `anthropic` (uses `ANTHROPIC_API_KEY`, default model `claude-opus-4-8`)
- `openai` (uses `OPENAI_API_KEY`, default model `gpt-4o`)

➡️ Add into `self` as a **variable** named `LLM_PROVIDER`.

---

## 5. `AGENT_REPO_TOKEN` — only if the agent repo is private

If **`kartikmehta8/flue-docs-sync-agent` is public, skip this** (and remove the `token:` line
from the agent-checkout step). The code repo's built-in token can't read a *different* private
repo, so a private agent repo needs its own read token.

1. Create another fine-grained PAT (same path as [§1](#1-docs_repo_pat--token-to-write-to-the-docs-repo)).
2. **Repository access:** Only select repositories → **`kartikmehta8/flue-docs-sync-agent`**.
3. **Permissions:** **Contents → Read-only** (that's all the checkout needs).
4. Generate and copy.

➡️ Paste into `self` as a **secret** named `AGENT_REPO_TOKEN`, and uncomment the `token:` line
in the workflow.

*(Simpler alternative: just make `flue-docs-sync-agent` public — it contains no secrets, since
`.env` is gitignored and only `.env.example` is committed.)*

---

## 6. Where to paste them

In **`kartikmehta8/self`** → **Settings → Secrets and variables → Actions**:

- **Secrets** tab → **New repository secret** → for `DOCS_REPO_PAT`, `SLACK_WEBHOOK_URL`,
  your API key, (and `AGENT_REPO_TOKEN` if needed).
- **Variables** tab → **New repository variable** → for `LLM_PROVIDER`.

> If you'll add more code repos later, set these at **org level** instead
> (**Org → Settings → Secrets and variables → Actions**) so every repo inherits them.

### Or via the `gh` CLI

```bash
# from any terminal logged into gh (gh auth login)
gh secret   set DOCS_REPO_PAT     -R kartikmehta8/self   # paste value when prompted
gh secret   set SLACK_WEBHOOK_URL -R kartikmehta8/self
gh secret   set ANTHROPIC_API_KEY -R kartikmehta8/self   # or OPENAI_API_KEY
gh variable set LLM_PROVIDER       -R kartikmehta8/self -b "anthropic"
# only if the agent repo is private:
gh secret   set AGENT_REPO_TOKEN  -R kartikmehta8/self
```

---

## 7. Final checklist

- [ ] `DOCS_REPO_PAT` secret — fine-grained PAT on `self-docs` (Contents R/W, PRs R/W)
- [ ] `SLACK_WEBHOOK_URL` secret — tested with `curl`
- [ ] `ANTHROPIC_API_KEY` **or** `OPENAI_API_KEY` secret — billing enabled
- [ ] `LLM_PROVIDER` variable — matches the key you added
- [ ] Agent repo public **or** `AGENT_REPO_TOKEN` secret added + `token:` line uncommented
- [ ] `.github/workflows/docs-sync.yml` committed on `main` of `self`

Then open a PR in `self` and watch: workflow runs → PR appears in `self-docs` → Slack pings.
