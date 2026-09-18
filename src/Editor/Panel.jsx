/*!
 * Open Historia Map Editor
 * Copyright (c) 2026 Nicholas Krol - AGPL-3.0-or-later (see LICENSE).
 */

// Reusable side-panel shell: titled, closable, scrollable body.

import Icon from "./Icon.jsx";
import { panelSurface } from "./editorStyles.js";

const Panel = ({ title, icon, onClose, side = "left", width = 340, footer, children }) => (
  <div
    style={{
      ...panelSurface,
      position: "fixed",
      // Below the toolbar, however many rows it wrapped into (Toolbar.jsx
      // publishes its bottom edge); 64px is the single-row height.
      top: "var(--editor-toolbar-bottom, 64px)",
      [side]: 12,
      // Never wider than the screen (phones).
      width: `min(${width}px, calc(100vw - 24px))`,
      maxHeight: "calc(100vh - var(--editor-toolbar-bottom, 64px) - 86px)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      zIndex: 35,
    }}
  >
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      {icon && <Icon name={icon} size={16} />}
      <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{title}</span>
      {onClose && (
        <button
          onClick={onClose}
          title="Close"
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.7)",
            cursor: "pointer",
            display: "flex",
          }}
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </header>
    <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      {children}
    </div>
    {footer && (
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", padding: "10px 12px" }}>{footer}</div>
    )}
  </div>
);

export default Panel;
