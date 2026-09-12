/*! Open Historia — log redaction rules © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// The one set of rules for what a log must never carry, shared by everything that
// writes one: the page's Diagnostics log (src/runtime/debugLog.js), the server's
// Desktop log (server/logStore.js) and the desktop app's Electron process
// (electron/main.cjs). Two lists that each caught things the other missed is how
// a key reached disk before, so there is one list.
//
// Pure and import-free on purpose: the page, the server and the Electron process
// all load it, and a Node import here would break the page.
//
// Deliberately blunt. Over-redacting costs a reader a little context;
// under-redacting publishes a player's key or their name.

// Shapes that are a credential wherever they appear. The page adds a literal pass
// over the keys this device has stored (debugLog.js), which is the only thing
// that can catch a self-hosted gateway key: those can be any string at all.
const SECRET_PATTERNS = [
    // Vendor-prefixed keys: OpenAI sk-…, Anthropic sk-ant-…, OpenRouter sk-or-…,
    // Stripe-style pk-/rk-, Google AIza…, HuggingFace hf_…, Groq gsk_…, xAI xai-….
    [/\bsk-[A-Za-z0-9_-]{12,}/g, "[redacted key]"],
    [/\b(?:pk|rk)-[A-Za-z0-9_-]{12,}/g, "[redacted key]"],
    [/\bAIza[A-Za-z0-9_-]{20,}/g, "[redacted key]"],
    [/\b(?:hf_|gsk_|xai-)[A-Za-z0-9_-]{12,}/g, "[redacted key]"],
    // GitHub tokens, which the hub and the updater can carry.
    [/\bgh[pousr]_[A-Za-z0-9]{16,}/g, "[redacted token]"],
    // Authorization headers, however they were stringified.
    [/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "[redacted authorization]"],
    // key=… / api_key: "…" / "authorization": "…" in a URL or a dumped object.
    [/((?:api[-_]?key|access[-_]?token|auth[-_]?token|authorization|password|secret)["'\s]*[:=]["'\s]*)([^"'\s,&}]{6,})/gi, "$1[redacted]"],
    // Credentials in a URL's userinfo (http://user:pass@host).
    [/(\b[a-z][a-z0-9+.-]*:\/\/)[^/@\s:]+:[^/@\s]+@/gi, "$1[redacted]@"],
    // A JWT, whatever it is carrying.
    [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, "[redacted token]"],
];

// The player's home folder, which names them: C:\Users\<name>, /Users/<name>,
// /home/<name>. Replaced by `~`, keeping everything after it — which build, and
// where its data lives, is diagnostic. A Windows path may arrive with its
// backslashes doubled, because stack traces are stored as JSON text. The name
// runs to the next separator, so a name with a space in it goes whole.
const HOME_FOLDER_PATTERNS = [
    [/\b[A-Za-z]:(\\\\|\\|\/)(?:Users|Documents and Settings)\1[^\\/"'\n\r]+?(?=\1|["'\n\r]|$)/g, "~"],
    [/(^|[^\w.~])\/(?:Users|home)\/[^/"'\n\r]+?(?=\/|["'\n\r]|$)/g, "$1~"],
];

const escapeForRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Every spelling a literal home folder can take in a log: as written, with its
// backslashes doubled by JSON, and with forward slashes (file:// URLs).
const homeFolderSpellings = (homeDir) => {
    const home = String(homeDir || "").replace(/[\\/]+$/, "");
    if (home.length < 3) return [];
    return [...new Set([home, home.replace(/\\/g, "\\\\"), home.replace(/\\/g, "/")])];
};

// `homeDir` is the literal home folder where it is known (the server and the
// Electron process pass os.homedir()), which catches a home the patterns cannot
// recognise, such as a roaming profile on another drive.
export const redactLogText = (value, { homeDir } = {}) => {
    let text = String(value ?? "");
    if (!text) return text;
    for (const spelling of homeFolderSpellings(homeDir)) {
        text = text.replace(new RegExp(escapeForRegExp(spelling), "gi"), "~");
    }
    for (const [pattern, replacement] of HOME_FOLDER_PATTERNS) {
        text = text.replace(pattern, replacement);
    }
    for (const [pattern, replacement] of SECRET_PATTERNS) {
        text = text.replace(pattern, replacement);
    }
    return text;
};
