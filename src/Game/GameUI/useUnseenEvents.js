/*! Open Historia — the newest skip's unseen events, for a panel © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// The events of the newest time skip the player has not been shown yet
// (runtime/unseenEvents.js), kept current as the reveal moves on and as turns
// land. A panel shows what an unseen event brought — a thread it opened, a
// letter it delivered, a copy an agent stole in it — only once the reveal has
// reached that event.
import { useEffect, useMemo, useState } from "react";
import { useRuntimeState } from "../../runtime/useRuntimeState.js";
import { UNSEEN_EVENTS_CHANGED, latestTurnEventIds, unseenEvents } from "../../runtime/unseenEvents.js";

// A primitive, so the store wakes the panel only when the newest turn changes.
const selectLatestTurnKey = (world) => latestTurnEventIds(world).join("\n");

export const useUnseenEventIds = () => {
    const turnKey = useRuntimeState("world", selectLatestTurnKey);
    const [version, setVersion] = useState(0);
    useEffect(() => {
        const bump = () => setVersion((value) => value + 1);
        window.addEventListener(UNSEEN_EVENTS_CHANGED, bump);
        return () => window.removeEventListener(UNSEEN_EVENTS_CHANGED, bump);
    }, []);
    return useMemo(
        () => unseenEvents.unseenInTurn(String(turnKey || "").split("\n").filter(Boolean)),
        // `version` is not read: it is what makes a reveal step ask again.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [turnKey, version],
    );
};

// For code outside React (a poll, a watcher): the same answer, from a world it
// already holds.
export const unseenEventIdsFor = (world) => unseenEvents.unseenFor(world);
