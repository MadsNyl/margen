# Follow-ups found while implementing

Collected for the final review/fix pass.

- The Turn prompt doesn't tell the Agent which Document is open (from ticket 15). For a new, empty Document the Agent only has the description. Include the open Document's path in every Turn's prompt (ticket 12 builds the prompt in `src/main/turns/`).
- Switching Documents or Sessions during a Turn closes the Agent without asking (from 08/10). Decide: refuse, or ask first.
- Sign in can't be cancelled; a closed Terminal leaves the step "working" for up to 10 minutes (from 02).
- Sessions of renamed or deleted Documents stay stored but are no longer listed (from 08).
- Model/effort choice resets per Document; Settings could remember it (from 10).
- Checkpoints: no size guard for very large Projects; nested git repos are skipped (from 11).
- Only the root `.gitignore` is read when finding Documents; symlinked folders aren't followed (from 03).
