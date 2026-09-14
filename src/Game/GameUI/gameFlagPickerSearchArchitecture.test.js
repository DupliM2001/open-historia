import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./GameFlagPicker.jsx", import.meta.url), "utf8");

test("in-game flag picker exposes one local search box", () => {
    assert.match(source, /const \[query, setQuery\] = useState\(""\)/);
    assert.match(source, /type="search"/);
    assert.match(source, /placeholder=\{communityPack \? "Search this pack…" : "Search flags…"\}/);
});

test("search filters game flags, community posts and opened scenario packs without refetching", () => {
    assert.match(source, /const filteredExisting = useMemo/);
    assert.match(source, /const filteredCommunity = useMemo/);
    assert.match(source, /const filteredCommunityPackFlags = useMemo/);
    assert.match(source, /searchText\(post\?\.title, post\?\.author, post\?\.code\)/);
    assert.match(source, /searchText\(flag\?\.code\)/);
    assert.doesNotMatch(source, /fetchCommunityFlags\(\{[^}]*query/);
});

test("pack navigation clears a root-only query so pack contents are not accidentally hidden", () => {
    assert.match(source, /const closeCommunityPack = \(\) => \{[\s\S]*?setQuery\(""\)/);
    assert.match(source, /const openCommunityPack = async \(post\) => \{[\s\S]*?setQuery\(""\)/);
});
