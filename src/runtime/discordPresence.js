/*! Open Historia — what Discord shows the player playing © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Tells the server on this computer what is on screen, for Discord's "Playing
// Open Historia" (server/discordPresence.js does the talking to the Discord app).
// The desktop app and the downloadable local server only: the website and the
// Android app have no server beside a Discord app to talk through, so the
// request is never made there.
//
// The player can turn it off (Settings → General → Privacy, "Show what I am
// playing on Discord"; on unless turned off). Off, nothing is reported, and the
// goodbye is sent once so that what Discord is showing comes down at once.
import { useEffect, useRef, useState } from "react";
import { formatGameDateReadable } from "./gameDates.js";
import { MAP_SETTING_KEYS, getMapSettingDefaultOn } from "./mapSettings.js";

// Held back this long, so a burst of changes (a game opening, a jump landing)
// is one request.
export const PRESENCE_DEBOUNCE_MS = 1500;

// What to show: the main menu, or who the player is playing, in which scenario
// and on which in-game date.
export const presenceFor = ({ activeGame, playerName = "", scenarioName = "", inMenu = false } = {}) => {
  if (!activeGame || inMenu) return { scene: "menu" };
  return {
    scene: "game",
    player: String(playerName || ""),
    scenario: String(scenarioName || ""),
    date: formatGameDateReadable(activeGame.currentDate) || "",
  };
};

const onLocalServer = () => {
  try {
    return !import.meta.env.VITE_OH_WEB;
  } catch {
    return false;
  }
};

// Whether this build has a Discord app to talk to at all, for Settings: the
// switch is not shown where it could do nothing.
export const presenceAvailable = onLocalServer;

// The player's switch. Stored with the other on/off settings (mapSettings.js),
// and on by default: only a stored "0" is off.
export const presenceAllowed = () => getMapSettingDefaultOn(MAP_SETTING_KEYS.discordPresence);

// The switch, followed live: Settings announces a change in this window
// ("mapSettings:updated"), and the browser announces one made in another
// window of the same game ("storage"), which would otherwise go on reporting
// until it was reloaded.
const usePresenceAllowed = () => {
  const [allowed, setAllowed] = useState(presenceAllowed);
  useEffect(() => {
    const read = () => setAllowed(presenceAllowed());
    read();
    window.addEventListener("mapSettings:updated", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("mapSettings:updated", read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return allowed;
};

// The goodbye, sent when the player turns the switch off: a scene the server
// does not know, which it reads as nothing to show.
export const PRESENCE_GONE = { scene: "none" };

const postPresence = (body) => {
  fetch("/api/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body }).catch(() => {});
};

export const useDiscordPresence = (presence) => {
  const allowed = usePresenceAllowed();
  const body = JSON.stringify(presence);
  useEffect(() => {
    if (!onLocalServer() || !allowed) return undefined;
    const timer = setTimeout(() => postPresence(body), PRESENCE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [allowed, body]);

  // Turned off while something may be showing: the goodbye, once, so Discord
  // takes the activity down now. Nothing is sent for a switch that was already
  // off when the page opened: nothing was reported.
  const wasAllowed = useRef(allowed);
  useEffect(() => {
    if (wasAllowed.current && !allowed && onLocalServer()) postPresence(JSON.stringify(PRESENCE_GONE));
    wasAllowed.current = allowed;
  }, [allowed]);
};
