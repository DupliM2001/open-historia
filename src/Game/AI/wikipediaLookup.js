/*! Open Historia — Wikipedia lookups © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// Wikipedia as a lookup function (the same { tools, execute } shape as
// lookupTools.js), so any provider can look things up mid-request: the game
// makes the request, not the provider, and no key is needed. Any language
// edition can be asked, which is where native names are spelled right.

const LANGUAGE = /^[a-z]{2,3}(-[a-z]{2,8})?$/;
const MAX_EXTRACT = 9000;

const clean = (value) => String(value ?? "").trim();
// Only a language code reaches the host name; anything else asks English.
const language = (value) => (LANGUAGE.test(clean(value).toLowerCase()) ? clean(value).toLowerCase() : "en");
const api = (lang, params) =>
  `https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams({ ...params, format: "json", origin: "*" })}`;

const languageField = { type: "string", description: "Wikipedia language code: en (default), or the polity's own (hr, de, fr...) for native names." };

export const WIKIPEDIA_TOOLS = Object.freeze([
  {
    name: "search_wikipedia",
    description: "Search Wikipedia. Returns article titles with a snippet each. Then read the useful ones with read_wikipedia.",
    schema: {
      type: "object",
      properties: { query: { type: "string", description: "What to search for, e.g. \"political parties Kingdom of Yugoslavia 1930s\"." }, language: languageField },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "read_wikipedia",
    description: "Read a Wikipedia article's text by its exact title (from search_wikipedia). Long articles are cut short.",
    schema: {
      type: "object",
      properties: { title: { type: "string", description: "Exact article title." }, language: languageField },
      required: ["title"],
      additionalProperties: false,
    },
  },
]);

export const WIKIPEDIA_DIRECTIVE = [
  "[Wikipedia]",
  "You can search and read Wikipedia (search_wikipedia, read_wikipedia) before you answer: the real parties of this country and era, their leaders, and their names and abbreviations in the polity's own language (read that language's edition for native spellings).",
  "Wikipedia describes real history. Where this campaign's rules, dossier or events differ from it, the campaign wins; use Wikipedia for what the campaign leaves open. A few searches are enough; then call the output function.",
].join("\n");

export const executeWikipediaLookup = async (name, args = {}, { fetchImpl = fetch, signal } = {}) => {
  const lang = language(args?.language);
  const get = async (params) => {
    const response = await fetchImpl(api(lang, params), { signal });
    if (!response.ok) throw new Error(`Wikipedia returned ${response.status}.`);
    return response.json();
  };
  try {
    if (name === "search_wikipedia") {
      const query = clean(args?.query);
      if (!query) return { error: "query is required." };
      const data = await get({ action: "query", list: "search", srsearch: query, srlimit: "8" });
      const results = (data?.query?.search ?? []).map((hit) => ({
        title: hit.title,
        snippet: clean(hit.snippet).replace(/<[^>]+>/g, "").replace(/&quot;/g, "\"").replace(/&amp;/g, "&"),
      }));
      return { language: lang, results };
    }
    if (name === "read_wikipedia") {
      const title = clean(args?.title);
      if (!title) return { error: "title is required." };
      const data = await get({ action: "query", prop: "extracts", explaintext: "1", redirects: "1", titles: title });
      const page = Object.values(data?.query?.pages ?? {})[0];
      if (!page || page.missing !== undefined || !clean(page.extract)) return { error: `No ${lang} Wikipedia article titled "${title}". Search first.` };
      const text = clean(page.extract);
      return { language: lang, title: page.title, text: text.slice(0, MAX_EXTRACT), ...(text.length > MAX_EXTRACT ? { truncated: true } : {}) };
    }
    return { error: `Unknown function ${name}.` };
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return { error: `Wikipedia could not be reached: ${error?.message || error}` };
  }
};
