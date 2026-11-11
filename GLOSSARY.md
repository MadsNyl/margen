# Glossary

**Project**
A folder the user opens in Margen (any folder, such as a website's code or a folder of HTML files) or a new empty one Margen makes. The Agent may read everything in it. Its Documents are the HTML files inside it. Checkpoints belong to it.
_Avoid_: workspace, repo, context folder

**Document**
One HTML file in a Project. A Project can hold many. Margen shows it and annotates it; only the Agent changes it.
_Avoid_: page, site, file (when the Document is meant)

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
A snapshot of the Project taken automatically before each Turn, so the user can go back to how things were before that Turn. Checkpoints belong to the Project, not to a Session or a Document, because one Turn can change several files.
_Avoid_: commit, save, version

**Viewport**
The width the Document is shown at: Desktop, Tablet, Mobile, or a custom width. Every Annotation records the Viewport it was made in.
_Avoid_: screen size, breakpoint

**Mode**
The active tool on the floating toolbar: Browse (a normal mouse), Pick, or Draw. Each Mode is its own button.
