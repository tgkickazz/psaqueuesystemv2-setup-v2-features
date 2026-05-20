# PSA Queue System v2 — completion tracker

GitHub does **not** compute a project percentage. The “40% / 75%” lines next to files are just the **subject of the last commit that changed that path**. This file is the single place we align **what “done” means** and rough completion.

## One-line summary

| Definition | Estimate | Notes |
|------------|----------|--------|
| **Demo / internal LAN use** (screens work, queue + dashboards usable) | **~78%** | Dashboards, stats, Socket.IO, Mongo logging — good for show-and-tell. |
| **Production / internet-safe** (auth enforced on server, secrets out of repo, hardened API/socket) | **~52%** | Needs server-side verification, RBAC on routes/events, rotated credentials, cleaning leaked files from history if needed. |

## What’s in good shape

- Core queue flow (issue, assign, serve, complete, requeue) and persistence to MongoDB.
- Admin UI: session concepts, logs tables, exports, dangerous actions (reset, etc.).
- Statistics dashboard: charts + polling from REST APIs.
- Firebase client auth + role check against `/api/get-role` (UX gate; backend must still enforce).

## Gaps before “production done”

- Move Mongo URI and any keys to environment variables; rotate anything ever pushed in plain text.
- Do **not** track `node_modules/`, `log/`, `credentials.json`, archives — use root `.gitignore` (see repo root).
- Verify every sensitive **HTTP route** and **Socket.IO event** with the same admin/staff rules (client checks are not enough).
- Add rate limiting, security headers, and audit logs for admin actions.

## How to update this file

When a milestone is finished, change the table numbers and add a dated bullet under “What’s in good shape” or “Gaps”. Prefer **one commit per real feature/fix** with a clear message instead of “% progress” in every commit.

## Repo maintenance (2026-05)

- Root `.gitignore` should exclude `node_modules/`, `log/`, secrets, and archives. If those were ever committed, remove them from the index (`git rm -r --cached …`) and push; **rotate any leaked credentials** — old blobs may still exist in Git history until scrubbed or the repo is recreated.
