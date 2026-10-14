import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./libraryBar.jsx", import.meta.url), "utf8");

// "Restyle this ui so the tabs that are currently on top appear as semi square
// buttons on a menu on the left side of the screen. restyle all 4 main menu
// pages to fit better like this." (the owner, 2026-10-14)
test("on a wide screen the main menu's pages are rounded squares on a rail down the left", () => {
  assert.match(source, /const MENU_TABS = Object\.freeze\(\[\s+Object\.freeze\(\{ id: "games", label: "Games" \}\),\s+Object\.freeze\(\{ id: "scenarios", label: "Scenarios" \}\),\s+Object\.freeze\(\{ id: "community", label: "Community" \}\),\s+\]\);/);
  const rail = source.slice(source.indexOf("const railButtonStyle = "), source.indexOf("// On a touch screen .oh-tap"));
  // Semi-square: rounded corners, square proportions, the icon over the name.
  assert.match(rail, /borderRadius: "16px",/);
  assert.match(rail, /flexDirection: "column",/);
  assert.match(rail, /height: "5\.1rem",/);
  assert.match(rail, /width: "5\.4rem",/);
  assert.doesNotMatch(rail.slice(0, rail.indexOf("const MenuRail = ")), /999px/, "no pill among the rail's buttons");
  // One per page, each with its own icon, the open one marked as the current page.
  assert.match(rail, /\{MENU_TABS\.map\(\(tab\) => \(\s+<button\s+key=\{tab\.id\}\s+aria-current=\{activeTab === tab\.id \? "page" : undefined\}/);
  assert.match(rail, /<MenuIcon kind=\{tab\.id\} \/>/);
  for (const kind of ["games", "scenarios", "community", "settings"]) assert.match(source, new RegExp(`case "${kind}":`));
  // The mark and the name at its head, Settings at its foot.
  assert.ok(rail.indexOf("Open Historia") < rail.indexOf("MENU_TABS.map"));
  assert.ok(rail.indexOf("<div style={{ flex: 1, minHeight: \"0.6rem\" }} />") < rail.indexOf("<span>Settings</span>"));
  assert.match(rail, /<MenuIcon kind="settings" \/>\s*<span>Settings<\/span>/);
  // Grey, as every control on these screens.
  assert.doesNotMatch(rail, /#2bc1f3|rgba\(43, ?193, ?243/i);
});

test("the rail's Settings opens the settings", () => {
  assert.match(source, /const LibraryTopBar = \(\{ onOpenSettings \} = \{\}\) => \{/);
  const main = fs.readFileSync(new URL("./main.jsx", import.meta.url), "utf8");
  // On General, in the full settings: the quick menu (no section) is drawn
  // under the main menu, so nothing would be seen.
  assert.match(main, /<LibraryTopBar onOpenSettings=\{\(\) => \{\s+setSettingsInitialSection\("general"\);\s+setIsSettingsOpen\(true\);\s+\}\} \/>/);
});

test("each page has a header of its own on a wide screen: its name and its actions; a phone keeps the row of pages", () => {
  const menu = source.slice(source.indexOf("{/* The Main Menu: a full page over everything in-game."), source.indexOf("<EditorDrawer"));
  assert.match(menu, /flexDirection: isMobile \? "column" : "row",/);
  assert.match(menu, /<MenuRail activeTab=\{activeTab\} onOpenSettings=\{onOpenSettings\} onTab=\{setActiveTab\} \/>/);
  assert.match(menu, /<h1 style=\{\{[^}]*\}\}>\s+\{MENU_TABS\.find\(\(tab\) => tab\.id === activeTab\)\?\.label \?\? ""\}\s+<\/h1>/);
  assert.match(menu, /\{tabActions\.map\(\(\{ label, run \}\) => \(/);
  // A phone: the pages across the top, the actions heading the page by name.
  assert.match(menu, /\{isMobile \? \(\s+<div style=\{\{ borderBottom: "1px solid rgba\(255,255,255,0\.08\)", flexShrink: 0 \}\}>/);
  assert.match(menu, /\{isMobile && tabActions\.length > 0 && \(/);
  // The Community page's controls stay together on the right of its help.
  const hub = fs.readFileSync(new URL("./communityHub.jsx", import.meta.url), "utf8");
  assert.match(hub, /flex: "1 1 20rem", fontSize: "0\.78rem", lineHeight: 1\.5, minWidth: 0/);
  assert.match(hub, /justifyContent: "flex-end", marginLeft: "auto" \}\}>\s+<input/);
});

test("scrollbars are thin and dark everywhere, and a hidden one stays hidden", () => {
  const styles = fs.readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  assert.match(styles, /:root \{\s+scrollbar-color: rgba\(255, 255, 255, 0\.16\) transparent;\s+\}/);
  assert.match(styles, /\* \{\s+scrollbar-width: thin;\s+\}/);
  assert.match(styles, /\*:hover \{\s+scrollbar-color: rgba\(255, 255, 255, 0\.28\) transparent;\s+\}/);
  assert.match(styles, /@supports not \(scrollbar-color: auto\) \{\s+::-webkit-scrollbar \{/);
  // No white thumb anywhere in the stylesheet.
  assert.doesNotMatch(styles, /scrollbar-color: (?:#fff|white|rgba\(255, ?255, ?255, ?(?:0\.[5-9]|1)\))/i);
});
