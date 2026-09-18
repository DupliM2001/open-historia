/*! Open Historia — the Dossier: the documents this government holds © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// The timeline is public. This is what the player's own government has on file
// and nobody else necessarily does: a secret protocol, a letter from another
// head of state, an intelligence assessment, the full articles of a treaty.
//
// The panel shows only what this player may read — the audience rule
// (AI/audience.js audienceSeesScoped) applied to each report's visibleTo, the
// same rule the advisor and the leaders read through — so a document addressed
// to two other powers is not here at all. Written only by the simulation
// (runtime/reports.js, impacts.reports); nothing here writes.

import React, { memo, useEffect, useMemo, useState } from "react";

import Markdown, { MarkdownStyleInjector } from "./markdown.jsx";
import { toCountryName } from "../../runtime/ownerNames.js";
import { refreshRuntimeState } from "../../runtime/runtimeStore.js";
import { useRuntimeState } from "../../runtime/useRuntimeState.js";
import { reportsFor } from "../../runtime/reports.js";
import { audienceSeesScoped, viewerAudience } from "../AI/audience.js";
import { useIsMobile } from "../../runtime/useIsMobile.js";

const selectReports = (world) => (Array.isArray(world?.reports) ? world.reports : []);
const selectCountry = (game) => game?.country || "";

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const DossierDockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
    <path d="M13 3v5h5" />
    <path d="M8 13h7M8 17h5" />
  </svg>
);

// "held by France and Germany", "published", "held by us alone".
const describeHolders = (report, player) => {
  if (report.visibleTo === null) return "Published";
  const others = report.visibleTo.filter((name) => name.toLowerCase() !== player.toLowerCase());
  if (!others.length) return "Held by us alone";
  if (others.length === 1) return `Shared with ${others[0]}`;
  return `Shared with ${others.slice(0, -1).join(", ")} and ${others[others.length - 1]}`;
};

const ReportCard = memo(({ report, player, expanded, onToggle }) => (
  <div style={{
    background: "rgba(255,255,255,0.035)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "0.75rem",
    overflow: "hidden",
  }}
  >
    <button
      type="button"
      onClick={onToggle}
      style={{
        background: "none",
        border: "none",
        color: "white",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        fontFamily: "inherit",
        gap: "0.25rem",
        padding: "0.7rem 0.85rem",
        textAlign: "left",
        width: "100%",
      }}
    >
      <span style={{ fontSize: "0.86rem", fontWeight: 700, lineHeight: 1.3 }}>{report.title}</span>
      <span data-no-translate style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.7rem" }}>
        {[report.dateline, describeHolders(report, player)].filter(Boolean).join(" · ")}
      </span>
    </button>
    {expanded && (
      <div
        className="dossier-document"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.07)",
          fontSize: "0.8rem",
          lineHeight: 1.5,
          padding: "0.7rem 0.85rem 0.9rem",
        }}
      >
        <Markdown className="chat-markdown">{report.body}</Markdown>
      </div>
    )}
  </div>
));
ReportCard.displayName = "ReportCard";

const DossierPanel = ({ isOpen, onClose }) => {
  const reports = useRuntimeState("world", selectReports);
  const country = useRuntimeState("game", selectCountry);
  const [expandedId, setExpandedId] = useState("");
  const [query, setQuery] = useState("");
  const isMobile = useIsMobile();
  const player = useMemo(() => toCountryName(String(country ?? "")), [country]);

  // Opening it is when it has to be current; later changes arrive through the slice.
  useEffect(() => {
    if (!isOpen) return;
    refreshRuntimeState(["world", "game"]).catch(() => { /* the last good list stays up */ });
  }, [isOpen]);

  // Exactly the audience rule every other reader of a report uses: this player's
  // government, and nothing addressed only to others.
  const visible = useMemo(() => {
    const audience = viewerAudience([player]);
    const held = reportsFor(reports, (visibleTo) => audienceSeesScoped(audience, visibleTo));
    const needle = query.trim().toLowerCase();
    if (!needle) return held;
    return held.filter((report) => `${report.title} ${report.body}`.toLowerCase().includes(needle));
  }, [player, query, reports]);

  return (
    <div
      style={{
        backdropFilter: "blur(8px)",
        backgroundColor: "rgba(24, 24, 27, 0.95)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "16px",
        bottom: isOpen ? "4.25rem" : "-30rem",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
        color: "white",
        display: "flex",
        flexDirection: "column",
        fontFamily: "sans-serif",
        height: "min(calc(100vh - 9rem), max(calc(100vh - 16rem), 30rem))",
        left: "0rem",
        maxWidth: "calc(100vw - 1rem)",
        minHeight: "10rem",
        opacity: isOpen ? 1 : 0,
        overflow: "hidden",
        pointerEvents: isOpen ? "auto" : "none",
        position: "fixed",
        transition: "bottom 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease",
        width: isMobile ? "calc(100vw - 1rem)" : "26.25rem",
        zIndex: 9998,
      }}
    >
      <MarkdownStyleInjector />
      <div style={{
        alignItems: "center",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        display: "flex",
        justifyContent: "space-between",
        padding: "1rem 1.25rem 0.75rem",
      }}
      >
        <span style={{ fontSize: "1rem", fontWeight: 700, letterSpacing: "0.01em" }}>
          Dossier
          {visible.length > 0 && (
            <span data-no-translate style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.72rem", fontWeight: 500, marginLeft: "0.4rem" }}>
              {visible.length}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.55)", cursor: "pointer", display: "flex", padding: "0.2rem" }}
        >
          <CloseIcon />
        </button>
      </div>

      {reports.length > 0 && (
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0.6rem 1rem 0.7rem" }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the documents"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "0.6rem",
              color: "white",
              fontFamily: "inherit",
              fontSize: "0.8rem",
              outline: "none",
              padding: "0.45rem 0.6rem",
              width: "100%",
            }}
          />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", overflowY: "auto", padding: "0.75rem 1rem 1rem" }}>
        {visible.length === 0 ? (
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.82rem", lineHeight: 1.5, margin: 0 }}>
            {query.trim()
              ? "No document here says that."
              : "Nothing on file yet. Secret protocols, private letters, intelligence assessments and the full text of treaties arrive here as the world writes them — the timeline shows only what anyone could see."}
          </p>
        ) : visible.map((report) => (
          <ReportCard
            key={report.id}
            report={report}
            player={player}
            expanded={expandedId === report.id}
            onToggle={() => setExpandedId((current) => (current === report.id ? "" : report.id))}
          />
        ))}
      </div>
    </div>
  );
};

const Dossier = ({ hovered, isOpen, onToggle, setHovered }) => {
  const [hasOpened, setHasOpened] = useState(false);
  useEffect(() => {
    if (isOpen) setHasOpened(true);
  }, [isOpen]);

  return (
    <>
      {hasOpened && <DossierPanel isOpen={isOpen} onClose={onToggle} />}
      <button
        type="button"
        title="Dossier"
        style={{
          alignItems: "center",
          background: isOpen ? "rgba(59,130,246,0.16)" : hovered ? "rgba(255,255,255,0.075)" : "rgba(255,255,255,0.035)",
          border: isOpen ? "1px solid rgba(96,165,250,0.34)" : "1px solid rgba(255,255,255,0.1)",
          borderRadius: "10px",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
          color: "white",
          cursor: "pointer",
          display: "flex",
          fontFamily: "inherit",
          fontSize: "1.2rem",
          height: "3.3rem",
          justifyContent: "center",
          outline: "none",
          transform: hovered ? "translateY(-1px)" : "translateY(0)",
          transition: "all 0.12s ease",
          width: "3.3rem",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onToggle}
      >
        <DossierDockIcon />
      </button>
    </>
  );
};

export { Dossier, DossierPanel };
