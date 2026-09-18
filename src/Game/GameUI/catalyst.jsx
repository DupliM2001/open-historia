/*! Open Historia — Catalyst mode © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Catalyst mode: a moment played out as a scene, beat by beat, then written into
// the record as one event. Nothing of it exists until the player enters the mode
// from the Tools menu — a time skip no longer proposes scenes. The player says
// what scene they want or leaves the choice to the simulation, picks or writes
// each move, may take a move back, and ends the scene or sets it aside. Time
// stands still while a scene is in progress (gameplay.js refuses a skip).
//
// Costs, said beside the buttons that spend them: starting a scene is one AI
// request, each move one more, and ending it one more. Taking a move back and
// setting the scene aside cost nothing.
import React, { useState } from "react";
import { useRuntimeState } from "../../runtime/useRuntimeState.js";
import { canRewindCatalystTo, catalystChoiceTexts, isSceneInProgress } from "../AI/catalystRewind.js";
import { advanceActiveCatalyst, createCatalyst, endActiveCatalyst, rewindActiveCatalyst, setAsideActiveCatalyst } from "../AI/gameplayLazy.js";
import { useUnseenEventIds } from "./useUnseenEvents.js";

const YELLOW = "#facc15";
const selectScene = (world) => world?.activeCatalyst ?? null;

const panelStyle = {
    background: "rgba(18,18,22,0.97)",
    border: "1px solid rgba(250,204,21,0.38)",
    borderRadius: "16px",
    boxShadow: "0 18px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(250,204,21,0.06) inset",
    color: "white",
    display: "flex",
    flexDirection: "column",
    fontFamily: "sans-serif",
    maxHeight: "min(46rem, calc(100vh - 2rem))",
    maxWidth: "calc(100vw - 2rem)",
    overflow: "hidden",
    width: "40rem",
};
const primaryButton = (disabled) => ({
    background: disabled ? "rgba(250,204,21,0.25)" : YELLOW,
    border: "none",
    borderRadius: "10px",
    color: "#1c1917",
    cursor: disabled ? "default" : "pointer",
    fontFamily: "inherit",
    fontSize: "0.82rem",
    fontWeight: 800,
    padding: "0.6rem 1rem",
});
const quietButton = (disabled) => ({
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "10px",
    color: disabled ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.85)",
    cursor: disabled ? "default" : "pointer",
    fontFamily: "inherit",
    fontSize: "0.78rem",
    fontWeight: 700,
    padding: "0.55rem 0.9rem",
});
const choiceButton = (disabled) => ({
    background: "rgba(250,204,21,0.06)",
    border: "1px solid rgba(250,204,21,0.28)",
    borderRadius: "10px",
    color: disabled ? "rgba(255,255,255,0.4)" : "#fef9c3",
    cursor: disabled ? "default" : "pointer",
    fontFamily: "inherit",
    fontSize: "0.82rem",
    lineHeight: 1.4,
    padding: "0.6rem 0.8rem",
    textAlign: "left",
    width: "100%",
});
const inputStyle = {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: "10px",
    boxSizing: "border-box",
    color: "white",
    fontFamily: "inherit",
    fontSize: "0.82rem",
    lineHeight: 1.45,
    padding: "0.6rem 0.75rem",
    resize: "vertical",
    width: "100%",
};
const caption = { color: "rgba(255,255,255,0.42)", fontSize: "0.68rem", lineHeight: 1.45 };

// The scene's own words, written in the game's language already.
const SceneText = ({ children, style }) => (
    <div data-no-translate style={{ fontSize: "0.88rem", lineHeight: 1.6, whiteSpace: "pre-wrap", ...style }}>{children}</div>
);

export const CatalystPanel = ({ open = true, onClose, onOpenTimeline }) => {
    const scene = useRuntimeState("world", selectScene);
    const unseen = useUnseenEventIds();
    const [request, setRequest] = useState("");
    const [move, setMove] = useState("");
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [finished, setFinished] = useState(null); // { title } of a scene just written into the record

    const choices = catalystChoiceTexts(scene?.choices);
    const beats = Array.isArray(scene?.history) ? scene.history : [];
    const revealing = unseen.size > 0;

    // One engine call at a time; its errors are the panel's to show.
    const run = async (label, work) => {
        if (busy) return null;
        setBusy(label);
        setError("");
        try {
            return await work();
        } catch (failure) {
            setError(String(failure?.message || failure));
            return null;
        } finally {
            setBusy("");
        }
    };

    const begin = () => run("Writing the scene…", async () => {
        setFinished(null);
        await createCatalyst({ request });
        setRequest("");
    });
    // A move: one of the offered choices, or the player's own words. When the
    // scene resolves, it is written into the record and closes.
    const play = (text) => run("Playing the move…", async () => {
        const wording = String(text ?? "").trim();
        if (!wording) return;
        const title = scene?.title || "";
        const result = await advanceActiveCatalyst(wording);
        setMove("");
        if (result && !result.catalyst) setFinished({ title: result.events?.at?.(-1)?.title || title });
    });
    const takeBack = (index) => run("Taking the move back…", () => rewindActiveCatalyst({ beatIndex: index }));
    const end = () => run("Writing the scene into the record…", async () => {
        const title = scene?.title || "";
        const result = await endActiveCatalyst();
        if (result?.resolved) setFinished({ title: result.events?.at?.(-1)?.title || title });
    });
    const setAside = () => run("Setting the scene aside…", () => setAsideActiveCatalyst());

    if (!open) return null;
    const idle = !busy;

    return (
        <div style={{ alignItems: "center", background: "rgba(0,0,0,0.55)", display: "flex", inset: 0, justifyContent: "center", padding: "1rem", position: "fixed", zIndex: 10001 }}>
            <div role="dialog" aria-label="Catalyst mode" style={panelStyle}>
                <div style={{ alignItems: "center", borderBottom: "1px solid rgba(250,204,21,0.18)", display: "flex", gap: "0.75rem", justifyContent: "space-between", padding: "0.9rem 1.1rem" }}>
                    <div>
                        <div style={{ color: YELLOW, fontSize: "0.95rem", fontWeight: 850, letterSpacing: "0.02em" }}>⚡ Catalyst mode</div>
                        <div style={{ ...caption, marginTop: "0.15rem" }}>Play out a moment as a scene. Time stands still until it ends.</div>
                    </div>
                    <button type="button" onClick={onClose} title="Leave Catalyst mode — a scene in progress stays where it is" style={quietButton(false)}>✕ Leave</button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem", overflowY: "auto", padding: "1rem 1.1rem 1.1rem" }}>
                    {finished && (
                        <div style={{ background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.3)", borderRadius: "10px", fontSize: "0.8rem", lineHeight: 1.5, padding: "0.7rem 0.85rem" }}>
                            The scene is over and written into the record{finished.title ? <>: <span data-no-translate style={{ fontWeight: 800 }}>{finished.title}</span></> : null}.
                            {typeof onOpenTimeline === "function" && (
                                <button type="button" onClick={onOpenTimeline} style={{ ...quietButton(false), marginLeft: "0.6rem", padding: "0.3rem 0.6rem" }}>See it on the timeline</button>
                            )}
                        </div>
                    )}

                    {!scene ? (
                        <>
                            <label htmlFor="catalyst-request" style={{ fontSize: "0.84rem", fontWeight: 800 }}>What scene do you want to play?</label>
                            <textarea
                                id="catalyst-request"
                                rows={3}
                                value={request}
                                disabled={!idle}
                                onChange={(event) => setRequest(event.target.value)}
                                placeholder="A secret meeting with the German chancellor the night before the vote… Leave it empty and the moment will be chosen for you."
                                style={inputStyle}
                            />
                            {revealing && <div style={{ ...caption, color: "#fde68a" }}>Finish revealing the last time skip first: a scene starts from what you have seen.</div>}
                            <div style={{ alignItems: "center", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                                <button type="button" onClick={begin} disabled={!idle || revealing} style={primaryButton(!idle || revealing)}>Begin the scene</button>
                                <span style={caption}>Starting a scene is one AI request; each move is one more, and ending it one more.</span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <SceneText style={{ fontSize: "1.05rem", fontWeight: 850 }}>{scene.title || "Untitled scene"}</SceneText>
                                {scene.premise && <SceneText style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.78rem", fontStyle: "italic", marginTop: "0.2rem" }}>{scene.premise}</SceneText>}
                                {scene.request && <div style={{ ...caption, marginTop: "0.3rem" }}>You asked for: <span data-no-translate>{scene.request}</span></div>}
                                {!isSceneInProgress(scene) && <div style={{ ...caption, marginTop: "0.3rem" }}>A scene the last time skip proposed. Play it, or set it aside and start your own.</div>}
                            </div>

                            {beats.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                    {beats.map((beat, index) => (
                                        <div key={index} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", padding: "0.55rem 0.7rem" }}>
                                            <div style={{ alignItems: "baseline", display: "flex", gap: "0.5rem", justifyContent: "space-between" }}>
                                                <div style={{ fontSize: "0.74rem", color: "#fde68a" }}>
                                                    Your move: <span data-no-translate>{beat.choice}</span>
                                                </div>
                                                {canRewindCatalystTo(scene, index) && (
                                                    <button type="button" onClick={() => takeBack(index)} disabled={!idle} title="Return the scene to just before this move — free; choosing again is one request" style={{ ...quietButton(!idle), fontSize: "0.68rem", padding: "0.2rem 0.5rem" }}>↶ Take back</button>
                                                )}
                                            </div>
                                            {beat.summary && <SceneText style={{ color: "rgba(255,255,255,0.72)", fontSize: "0.8rem", marginTop: "0.25rem" }}>{beat.summary}</SceneText>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {!beats.length && scene.opening && <SceneText>{scene.opening}</SceneText>}

                            <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                                {choices.map((choice) => (
                                    <button type="button" key={choice} onClick={() => play(choice)} disabled={!idle} style={choiceButton(!idle)}>
                                        <span data-no-translate>{choice}</span>
                                    </button>
                                ))}
                            </div>

                            <div style={{ display: "flex", gap: "0.5rem" }}>
                                <input
                                    value={move}
                                    disabled={!idle}
                                    onChange={(event) => setMove(event.target.value)}
                                    onKeyDown={(event) => { if (event.key === "Enter") play(move); }}
                                    placeholder="Or write your own move…"
                                    style={{ ...inputStyle, resize: "none" }}
                                />
                                <button type="button" onClick={() => play(move)} disabled={!idle || !move.trim()} style={primaryButton(!idle || !move.trim())}>Play</button>
                            </div>
                            <div style={caption}>Each move is one AI request. The scene ends when it reaches its outcome, or when you end it.</div>

                            <div style={{ alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", flexWrap: "wrap", gap: "0.6rem", paddingTop: "0.8rem" }}>
                                <button type="button" onClick={end} disabled={!idle || !beats.length} title={beats.length ? "Write what has happened into the record — one request" : "Play a move first; with none played there is nothing to record"} style={quietButton(!idle || !beats.length)}>End the scene</button>
                                <button type="button" onClick={setAside} disabled={!idle} title="Close the scene without writing anything — free" style={quietButton(!idle)}>Set aside</button>
                                <span style={caption}>Ending writes the scene into the record (one request). Setting it aside keeps nothing.</span>
                            </div>
                        </>
                    )}

                    {busy && <div style={{ color: YELLOW, fontSize: "0.78rem", fontWeight: 700 }}>{busy}</div>}
                    {error && <div style={{ color: "#fca5a5", fontSize: "0.78rem", lineHeight: 1.45 }}>{error}</div>}
                </div>
            </div>
        </div>
    );
};

export default CatalystPanel;
