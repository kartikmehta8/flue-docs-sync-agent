# Documentation Sync Agent Plan

## Goal

Automatically keep documentation in sync when code changes are merged.

### Workflow

```text
Code Repo PR Merged
        ↓
GitHub Action Trigger
        ↓
Checkout Code Repo
        ↓
Checkout Docs Repo
        ↓
Run Documentation Sync Agent
        ↓
Analyze Changed Files + PR Diff
        ↓
Find Impacted Docs
        ↓
Update Docs Repo
        ↓
Create Pull Request in Docs Repo
```
## MVP

- Trigger on merged PR
- Read changed files and diff
- Determine docs impact
- Update docs repo only
- Create PR in docs repo
- Skip PR if no docs changes required

## Stack

- Node.js 22+
- TypeScript
- Flue
- GitHub Actions
- Octokit
- Anthropic Claude

## Secrets

- ANTHROPIC_API_KEY
- DOCS_REPO_PAT

## Project Structure

```text
docs-sync-agent/
├── src/
│   ├── index.ts
│   ├── agent.ts
│   ├── github.ts
│   ├── diff.ts
│   ├── docs-map.ts
│   └── prompt.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Responsibilities

1. Read merged PR metadata
2. Collect diff
3. Search docs repo
4. Determine impact
5. Update docs
6. Open docs PR

## Safety Rules

- Never modify source repo
- Only modify docs repo
- No secrets
- No hallucinated behavior
- Prefer small edits
- Preserve style

## Documentation Impact Detection

Typical triggers:

```text
src/sdk/**
src/api/**
src/routes/**
src/controllers/**
src/services/**
openapi/**
examples/**
README.md
```

## Branch Naming

```text
docs-sync/pr-<number>-<sha>
```

## PR Title

```text
docs: sync updates for PR #<number>
```

## Agent Prompt

You are a Documentation Sync Agent.

Determine whether documentation must be updated based on merged code changes.

Rules:
- Edit docs only
- Prefer updating existing pages
- Create new pages only when necessary
- Keep changes minimal
- Never invent functionality

## GitHub Action Overview

```yaml
on:
  pull_request:
    types: [closed]
```

Condition:

```yaml
if: github.event.pull_request.merged == true
```

## Processing Flow

1. Checkout code repo
2. Checkout docs repo
3. Load PR metadata
4. Get changed files
5. Analyze diff
6. Search docs
7. Generate updates
8. Commit changes
9. Create docs PR

## JSON Planning Output

```json
{
  "needsDocsUpdate": true,
  "reason": "New SDK method",
  "filesToUpdate": [
    "docs/sdk/authentication.mdx"
  ]
}
```

## Future Enhancements

- Slack notifications
- Linear tickets
- Changelog generation
- Stale docs detection
- Architecture diagrams
- Weekly docs health reports

## Acceptance Criteria

- PR merge triggers workflow
- Docs repo is checked out
- Agent identifies impacted docs
- Docs PR created automatically
- No PR if docs unaffected
