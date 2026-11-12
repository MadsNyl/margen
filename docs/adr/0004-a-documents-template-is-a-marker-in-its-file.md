# A Document's Template is a marker in its own file

A Document made from a Template carries it in its HTML as `<meta name="margen-template" content="animation-video">`. Margen reads that marker to show the Template's controls and to give the Agent the Template's instructions at the start of each Session. So a video still is a video in a folder opened from elsewhere, after a git clone or on another Mac, and Margen keeps nothing about it in its data directory and writes nothing else (such as a `.claude/skills/` Skill) into the user's Project. Files carrying the marker will exist in the wild, so its name and values are hard to change once released.

The same goes for an Animation video's Voice: it is `<meta name="margen-voice" content="kokoro/af_heart">` in the file, so the video speaks with the same Voice wherever it is opened (once that Voice is downloaded there). Its id format (`<engine>/<voice>`) is just as hard to change.
