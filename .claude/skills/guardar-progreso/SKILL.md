---
name: guardar-progreso
description: "Trigger: guarda el progreso, guardar en la documentación y en engram, cierra la sesión, save progress. Records verified progress in repo docs and Engram, then reads both back."
license: Apache-2.0
metadata:
  author: "agutierrezreginodev"
  version: "1.0"
---

## Activation Contract

Load when the user asks to save, record or close progress («guarda el progreso», «guárdalo en la documentación y en engram», «cerremos la sesión»), or before ending a work block that changed code, decisions or deployments.

## Hard Rules

- Record only verified facts with evidence (commit, PR number, test counts, command output). Mark anything unverified as pending.
- Quote user and PO decisions verbatim in the user's language; never paraphrase them.
- Never write secrets, connection strings, credential paths or production URLs into docs or Engram.
- Docs go through the repo flow: commit on a `docs/...` branch, push, open a PR. Never push to `main` directly. Merge only if the user authorized it.
- Engram: call `mem_current_project` first and pass its exact `project`. Use a `topic_key` to upsert evolving records. Resolve every `judgment_required` candidate with `mem_judge`.
- Never claim "saved" before the read-back step passes.

## Decision Gates

| What happened | Record it in |
|---|---|
| Work on a feature with `odd/tasks/<feature>.md` | Append a `## Log` entry `L#` (date, evidence, next step); update its `## Tasks` rows; upsert Engram `odd/<feature>/tasks` |
| A plan item changed status, or new items arrived (PO document) | `docs/plan-trabajo-restante.md` (row status or a new subsection) |
| User or PO decisions | Engram `decision` with a stable `topic_key`, plus the feature document or plan |
| Merge, deploy or production migration | Engram `config` memory plus the feature document `## Log` |
| User-facing behavior changed but the guides were not updated | `docs/guia-uso-proyectos-v2.md` and `docs/guia-prueba-proyectos.md` |

## Execution Steps

1. Inventory: `git status -sb`, `git log --oneline origin/main..HEAD` on each touched branch, `gh pr list --state all --limit 10`, then `mem_context`.
2. Find gaps: for each commit, PR, decision and deployment, `rg` the docs and `mem_search` the topic keys. List what is missing or stale, such as «Next: push and PR» after the merge.
3. Update the docs per the Decision Gates. Commit with `docs(...)` Conventional Commits, push and open or extend a docs PR.
4. Update Engram: upsert the mirrors and decisions, save non-obvious discoveries, then `mem_session_summary` (Goal, Instructions, Discoveries, Accomplished, Next Steps, Relevant Files).
5. Read back: `rg` each new docs entry on the pushed branch and `mem_search` each `topic_key`. Fix anything missing before reporting.

## Output Contract

Return in the user's language:
- A table: item → where it was saved (file and line, or Engram id/topic) → evidence.
- The docs PR link and its CI/merge state.
- Everything still pending, and anything you could not verify.

## References

- `odd/tasks/` — feature documents (Specs, Tasks, Log).
- `docs/plan-trabajo-restante.md` — plan and item status.
- `docs/runbook-lanzamiento-v2.md` — production procedure to cite for migrations.
