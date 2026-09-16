# Connections and the Fallback list hold all AI settings

AI settings used to be one key and one model per provider, with one provider active at a time, and profiles only for the two compatible providers. They are now two things. A Connection is a provider plus a player-given name, a key, an endpoint and custom parameters. The Fallback list is an ordered list of Fallback entries, each one Connection plus one model, with optional custom-parameter overrides and its own structured-output mode. The list is the only place the game reads from to decide who answers a call. A per-task pick names an entry in the list and no longer names a bare model.

On first load we migrate every player's existing settings. Each provider with a key or endpoint, and each existing profile, becomes a Connection. The active provider and its model become entry #1. Each per-task model override becomes an entry at the bottom of the list that its task points at. The old per-provider settings stop being read after that, so going back would mean migrating in reverse. That is why this is recorded.

## Considered Options

- **Keep the per-provider settings and add the list on top of them.** Rejected. There would be two sources of truth for "which model answers", and a per-task model name cannot say which Connection it means once the list mixes providers.
- **Keep profiles and add Connections alongside them.** Rejected. Two things that both mean "a saved key and endpoint" would confuse players.
- **Task-only entries outside the fallback order.** Rejected in favour of every entry being in the list. Migrated per-task models therefore also act as backups for every other call. That is an accepted side effect, because the migrated setup never answers worse than before.

## Consequences

- Structured-output mode moves from per provider to per entry. It is learned per model, and the old "wipe it when the model changes" rule cannot work once a list holds many models.
- Keys now live inside stored lists rather than under `*_api_key` settings, so the Diagnostics log's redaction has to read them from the Connections. The profiles this replaces already had that gap.
