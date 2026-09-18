/*! Open Historia — the bottom-left launcher dock's geometry, in one place © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// The dock is the rounded pill at the bottom left holding the launchers: Chat,
// Actions, Projects & Operations, Dossier. Its width is a function of how many
// there are, and the Search control sits just to the right of it.
//
// That width used to be a literal in chat.jsx and a second literal in
// search.jsx, with a comment asking the next person to keep them in step. They
// drifted the first time a launcher was added (Projects) and again the second
// (Dossier), and the second time Search ended up sitting ON TOP of the new
// button. So the number lives here and both files derive from it: adding a
// fifth launcher moves Search on its own.

// The pill itself.
export const DOCK_BOTTOM_REM = 0.5;
export const DOCK_LEFT_REM = 0.5;
export const DOCK_HEIGHT_REM = 4;
// One launcher, and the gap to the next.
export const DOCK_BUTTON_REM = 3.3;
export const DOCK_GAP_REM = 0.75;
// The pill's own slack around them.
const DOCK_SLACK_REM = 0.65;

export const DOCK_LAUNCHERS = ["chat", "actions", "projects", "dossier"];

export const dockWidthRem = (buttons = DOCK_LAUNCHERS.length) =>
    DOCK_SLACK_REM + buttons * (DOCK_BUTTON_REM + DOCK_GAP_REM);

export const DOCK_WIDTH_REM = dockWidthRem();
export const DOCK_WIDTH = `${DOCK_WIDTH_REM}rem`;

// Where anything beside the dock begins.
export const DOCK_RIGHT_EDGE_REM = DOCK_LEFT_REM + DOCK_WIDTH_REM;
export const BESIDE_DOCK_LEFT = `${DOCK_RIGHT_EDGE_REM + 0.5}rem`;

// The bottom edge of the launcher BUTTONS, not of the pill: a smaller control
// beside them looks deliberate when it lines up with the buttons, and looks
// like a mistake when it lines up with nothing.
export const DOCK_BUTTON_BOTTOM_REM = DOCK_BOTTOM_REM + (DOCK_HEIGHT_REM - DOCK_BUTTON_REM) / 2;
export const DOCK_BUTTON_BOTTOM = `${DOCK_BUTTON_BOTTOM_REM}rem`;
