# Project agent instructions

## Local development server

- Keep at most one Astro development server running for this worktree.
- Before starting one, check port 4330 with `lsof -nP -iTCP:4330 -sTCP:LISTEN`.
- If port 4330 already has this project's server, reuse `http://127.0.0.1:4330` and do not run `npm run dev` again.
- Start the server only with `npm run dev`. Do not override its host or port; the project config fixes port 4330 and enables strict-port behavior to prevent automatic fallback to 4331 or later ports.
- When a restart is necessary, stop the existing project server first, confirm port 4330 is free, and then start its replacement.
- Stop any temporary server you started before handing the task back unless the user asked to leave it running.
