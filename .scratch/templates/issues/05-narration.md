# 05: Narration with a Voice

**What to build:** The Voice select in an Animation video's top bar (stored as `margen-voice`, offering a download when missing); speaking the `#narration` lines with that Voice, cached in the data directory by Voice and text; playing them in sync with play/pause; mixing them into the MP4 export; and Margen's in-process MCP server for the Agent with a tool returning each line's spoken length. Add the tool to the Animation video instructions.

**Blocked by:** 02, 03, 04

**Status:** ready-for-agent

Spec: `.scratch/templates/spec.md` (Voices and narration). Agent adapter: `src/main/agent/claude/session.ts`.

- [ ] Narration parsing (pure, unit-tested): lines with start time and text; bad JSON reported, not fatal
- [ ] Voice select + marker; missing Voice offers download
- [ ] Audio plays in sync with the clock, pauses with it, restarts correctly after seek/reload
- [ ] Export mixes narration at the right offsets
- [ ] MCP server registered on Sessions; line-length tool; fake Agent can call it in Seam 1
