# Glossary

**Project**
A folder the user opens in Margen (any folder, such as a website's code or a folder of HTML files) or a new empty one Margen makes. The Agent may read everything in it. Its Documents are the HTML files inside it.
_Avoid_: workspace, repo, context folder

**Document**
One HTML file in a Project. A Project can hold many. Margen shows it and annotates it, and the Agent changes it. The user can also fix plain text by hand: double-click it in Browse.
_Avoid_: page, site, file (when the Document is meant)

**Template**
A named starting point for a new Document, built into Margen: the first version of its file and how the Agent should work on it: Animation video, Poster and Slides. A Document started without one is Blank: an empty page the Agent may make into anything.
_Avoid_: starter, skeleton, boilerplate, preset (a Permission preset is something else)

**Animation video**
A Document made from the Animation video Template: a page of a fixed frame size whose motion is all HTML and CSS animation on one clock, so it plays like a video and can be exported as one. The user plays and pauses it from the top bar and annotates whatever frame it is paused on.
_Avoid_: animation, clip, movie

**Poster**
A Document made from the Poster Template: one A4 sheet that is the poster itself, edge to edge, never a smaller poster on a backdrop. The editor shows the whole sheet fitted to the window, and it exports to PDF as one A4 page.
_Avoid_: flyer, page (when the Poster is meant)

**Slides**
A Document made from the Slides Template: a deck where each slide fills the whole window and shows its number, stepped through with the arrow keys, Space and Enter rather than buttons. The editor shows it at 16:9, fitted; it exports to PDF one slide per page.
_Avoid_: presentation, deck (in the UI), slideshow

**Voice**
An open-source speech model the user downloads into Margen and that runs on their own Mac, turning a video's narration into speech.
_Avoid_: TTS, speech model, voice model

**Voice pack**
One download from Settings → Voices holding one or more Voices (Kokoro's holds several speakers; a Piper pack holds one). Voices are installed and deleted a Voice pack at a time.
_Avoid_: model, bundle

**Narration**
The lines an Animation video speaks, each with the time it starts, written in the Document and spoken with the video's one Voice.
_Avoid_: voiceover, script, captions

**Frame size**
The fixed width and height of an Animation video (16:9, 9:16, 1:1 or 4:5), chosen when it is made and changed only when the user asks for another. The export is exactly this size whatever the window is.
_Avoid_: resolution, aspect, viewport (the Viewport is something else)

**Agent**
The local coding agent (Claude Code first, Codex later) that the user's own subscription runs and that edits the Document.
_Avoid_: AI, bot, model

**Session**
One continuous conversation with one Agent about one Document. The Agent can still read and change any file in the Project. The Agent can't be changed partway through a Session. Each Document has one active Session at a time; earlier Sessions can be resumed.
_Avoid_: chat, thread

**Turn**
One message the user sends and the Agent's full response to it, ending when the Agent stops or is interrupted.

**Annotation**
A piece of context the user attaches to a Document by picking an element or drawing on it. Each one has an optional comment and a number. Until it's sent, an Annotation shows on the Document as a numbered marker and in the Composer as a matching chip.
_Avoid_: selection, highlight, comment (the comment is part of an Annotation)

**Pick Annotation**
An Annotation that points at one specific element in the Document, chosen by clicking it or by moving to it with the arrow keys.

**Draw Annotation**
An Annotation made of freehand strokes on the Document, with a comment. The strokes can point (circling something) or show what to make (sketching a shape or writing text); the comment says which, and the Agent works it out from both. It carries a screenshot with the strokes drawn in and any elements the strokes enclose. More strokes can be added until it's sent or set aside.
_Avoid_: sketch, scribble

**Composer**
The draft message the user is writing, together with the Annotations they've collected, all sent as one Turn. It appears both as a quick input next to the newest Annotation on the Document and as the input in the chat panel; both show the same draft.

**Queue**
Messages that were sent while the Agent was busy with a Turn. Each goes out as its own Turn, in order, once the Agent is free.
_Avoid_: batch (collecting Annotations is the Composer's job, not the Queue's)

**Checkpoint**
A snapshot taken automatically before each Turn (and before each text edit made by hand), so the user can go back to how the Document was before that Turn. Checkpoints belong to one Document: each Document lists and numbers its own, and reverting restores that Document's file only. Other files a Turn changed stay as they are.
_Avoid_: commit, save, version

**Permission preset**
How much the Agent may do without asking, chosen in Settings and shown in the Composer. The Editor preset (the default) lets it read the Project, write inside it and use the web; shell commands and any path outside the Project ask first. Allow everything never asks.
_Avoid_: permission mode, sandbox

**Approval request**
A card in the chat asking whether the Agent may do one thing the Permission preset doesn't allow by itself. The user answers Allow once or Deny; afterwards it stays in the chat showing the answer.
_Avoid_: prompt, permission dialog

**Viewport**
The width the Document is shown at: Desktop, Tablet, Mobile, or a custom width. With Fit on, it is a whole screen of that kind, scaled down to fit the window. Every Annotation records the Viewport it was made in.
_Avoid_: screen size, breakpoint

**Mode**
The active tool on the floating toolbar: Browse (a normal mouse), Pick, or Draw. Each Mode is its own button.
