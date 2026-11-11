# Follow-ups found while implementing

Collected for the final review/fix pass.

- Switching Documents or Sessions during a Turn closes the Agent without asking (from 08/10). Decide: refuse, or ask first.
- Sign in can't be cancelled; a closed Terminal leaves the step "working" for up to 10 minutes (from 02).
- Sessions of renamed or deleted Documents stay stored but are no longer listed (from 08).
- Model/effort choice resets per Document; Settings could remember it (from 10).
- Checkpoints: no size guard for very large Projects; nested git repos are skipped (from 11).
- Only the root `.gitignore` is read when finding Documents; symlinked folders aren't followed (from 03).
- Esc with no comment box open both leaves Pick and stops a running Turn; the prototype only stops (from 12). Keys pressed while the Document view has focus come over the bridge and never stop a Turn.
- Annotation numbers restart at 1 per Document view, not per Session, so a resumed Session can have two #1s (from 12).
- Flaky (1 in ~15 runs): editor.test "a change to the page's stylesheet or images reloads it too, another Document does not" sometimes sees an extra update (from the 09 merger). Likely the 500 ms poll of the Document file in `watchDocument`.
