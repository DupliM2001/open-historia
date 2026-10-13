/*! Open Historia — the setup video asks YouTube for nothing until it is pressed © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Run: node --test src/Game/GameUI/apiSetupVideo.test.js
//
// Runs without node_modules: it reads the source rather than rendering it (the
// prompt is JSX, which bare node cannot load).
//
// The AI setup prompt used to draw YouTube's player the moment it appeared,
// which is a request to YouTube from every new player who has no key yet,
// whether or not they ever watch the video. The player's place is now a button
// that says pressing it loads YouTube, and the frame exists only after it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./apiSetupPrompt.jsx", import.meta.url), "utf8");
const videoAt = source.indexOf("const TutorialVideo = ");
const promptAt = source.indexOf("export const ApiSetupPrompt = ");
const video = source.slice(videoAt, promptAt);
const prompt = source.slice(promptAt);

test("the video has a component of its own, ahead of the prompt", () => {
    assert.ok(videoAt > 0 && promptAt > videoAt, "TutorialVideo has moved; this guard needs updating");
});

test("the YouTube frame is drawn in one place, and only once the button was pressed", () => {
    assert.equal(source.split("<iframe").length - 1, 1, "one frame in the file");
    assert.match(video, /const \[playing, setPlaying\] = useState\(false\);/, "nothing is playing to begin with");
    // The frame is the pressed half of the choice, the button the other.
    assert.match(video, /\{playing \? \(\s*<iframe[\s\S]*?\/>\s*\) : \(\s*<button[\s\S]*?onClick=\{\(\) => setPlaying\(true\)\}/);
    assert.equal(prompt.includes("<iframe"), false, "the prompt itself draws no frame");
    assert.equal(prompt.includes("TUTORIAL_EMBED_URL"), false, "nor names the player's address");
    assert.equal(source.split("TUTORIAL_EMBED_URL").length - 1, 2, "the address is defined once and used once");
});

test("the button says that pressing it loads YouTube", () => {
    assert.match(video, /<span>\{"Play the video \(loads YouTube\)"\}<\/span>/);
});

test("the player is the no-cookie one, and nothing else in the prompt loads from YouTube", () => {
    assert.match(source, /const TUTORIAL_EMBED_URL = `https:\/\/www\.youtube-nocookie\.com\/embed\/\$\{TUTORIAL_VIDEO_ID\}\?/);
    // No thumbnail fetched from YouTube's image hosts to dress the button up.
    assert.doesNotMatch(source, /ytimg\.com|img\.youtube\.com/);
    // The link beside it is a link: followed only when pressed.
    assert.match(prompt, /<a href=\{TUTORIAL_VIDEO_URL\} target="_blank"/);
});

test("hiding the video still works, and showing it again starts from the button", () => {
    assert.match(prompt, /\{online \? \(\s*<TutorialVideo \/>\s*\) : \(/, "the video's place, while there is a connection");
    assert.match(prompt, /onClick=\{\(\) => setShowTutorial\(false\)\}[\s\S]{0,300}Hide the video/);
    assert.match(prompt, /onClick=\{\(\) => setShowTutorial\(true\)\}[\s\S]{0,300}Show the video tutorial/);
    // TutorialVideo is unmounted while hidden, so its "playing" does not survive.
    assert.match(prompt, /\{showTutorial \? \(/);
});
