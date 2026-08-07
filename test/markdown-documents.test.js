import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

async function loadHooks() {
  const source = await readFile(new URL("../public/markdown-documents.js", import.meta.url), "utf8");
  const context = { console, location: { pathname: "/noop" } };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "markdown-documents.js" });
  return context.__NOEMA_MARKDOWN_TEST__;
}

test("Markdown renderer escapes raw HTML and blocks unsafe links", async () => {
  const { renderMarkdown } = await loadHooks();
  const html = renderMarkdown("# Safe\n\n[bad](javascript:alert(1))\n\n<script>alert(1)</script>");

  assert.match(html, /<h1>Safe<\/h1>/);
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /href=\"javascript:/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("Markdown renderer supports common document syntax", async () => {
  const { renderMarkdown } = await loadHooks();
  const html = renderMarkdown([
    "## Plan",
    "",
    "- [x] done",
    "- [ ] next",
    "",
    "**bold** and `code`",
    "",
    "| A | B |",
    "|---|---|",
    "| 1 | 2 |",
    "",
    "```js",
    "const ok = true;",
    "```",
  ].join("\n"));

  assert.match(html, /<h2>Plan<\/h2>/);
  assert.match(html, /type=\"checkbox\" disabled checked/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<table>/);
  assert.match(html, /class=\"language-js\"/);
});

test("Markdown document implementation writes through encrypted Files API", async () => {
  const source = await readFile(new URL("../public/markdown-documents.js", import.meta.url), "utf8");
  assert.match(source, /\/api\/files/);
  assert.match(source, /\/replace/);
  assert.match(source, /noema-markdown-file:/);
  assert.match(source, /stopImmediatePropagation\(\)/);
});
