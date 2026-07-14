# Pi Extension Boundary

## Context

Pine embeds `@earendil-works/pi-agent-core` and supplies its own Electron host and Vue UI. The locally installed Pi CLI is `@earendil-works/pi-coding-agent` 0.80.3, while Pine currently resolves `pi-agent-core` 0.80.6.

Before implementing behavior related to Pi, first check whether it belongs in a reusable Pi extension. Prefer an extension when the behavior is useful inside Pi itself and can be expressed through its public extension lifecycle without replacing host UI.

## Session search decision

Pi extensions can:

- register an alternative command such as `/pine-resume`;
- list sessions with `SessionManager.list()`;
- switch through the supported `ctx.switchSession()` command API;
- observe or cancel `session_before_switch` and rebuild state during `session_start`.

Pi extensions cannot non-invasively replace the built-in `/resume` selector. In Pi 0.80.3, interactive mode handles the exact `/resume` input before extension command dispatch. A same-name extension command is reported as a built-in conflict and omitted from autocomplete. The `session_before_switch` event runs only after the built-in selector has already chosen a target.

Pine therefore owns its Electron Session Search Overlay and session switching at the host boundary. It keeps Pi JSONL sessions as the source of truth and uses `JsonlSessionRepo` rather than introducing a second session format.

Opening a workspace initializes the session repository and search index without creating a Pi session. The runtime keeps a nullable active-session slot and creates a persistent session atomically when the first message needs one. Resuming an existing session fills the same slot without creating an empty session first.

Empty Pi sessions are excluded from the derived search index and deleted through `JsonlSessionRepo`. Sessions created or resumed by the current runtime are protected from cleanup while live, preventing a concurrent history refresh from racing the first message write. An abandoned empty session is removed the next time the workspace is opened and its history is refreshed.

The SQLite FTS5 database under `.pine/cache/` is a derived, disposable index. It uses the trigram tokenizer for Latin and CJK substring search, stores source modification times for incremental refresh, and can be rebuilt entirely from Pi JSONL files.

If CLI integration is needed later, extract the search engine behind a shared package and add a thin `/pine-resume` Pi extension adapter. Do not patch or shadow the built-in `/resume` command.
