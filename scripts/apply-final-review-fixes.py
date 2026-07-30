from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new, label):
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one {label} match in {path}, found {count}")
    path.write_text(text.replace(old, new, 1))


i18n = ROOT / "public" / "noema-i18n.js"
text = i18n.read_text()
text = text.replace(r"(?<![\p{L}\p{N}])", r"(?<![\\p{L}\\p{N}])")
text = text.replace(r"(?![\p{L}\p{N}])", r"(?![\\p{L}\\p{N}])")
old_attrs = '''      for (const attribute of ["placeholder", "title", "aria-label", "alt"]) {
        if (!element.hasAttribute(attribute)) continue;
        const current = element.getAttribute(attribute);
        const translated = translate(current);
        if (translated !== current) element.setAttribute(attribute, translated);
      }'''
new_attrs = '''      const attributes = ["placeholder", "title", "aria-label", "alt"];
      if (element.matches('input[type="button"], input[type="submit"], input[type="reset"], button[value]')) attributes.push("value");
      for (const attribute of attributes) {
        if (!element.hasAttribute(attribute)) continue;
        const current = element.getAttribute(attribute);
        const translated = translate(current);
        if (translated !== current) element.setAttribute(attribute, translated);
      }'''
if text.count(old_attrs) != 1:
    raise RuntimeError("Could not find localization attribute block")
text = text.replace(old_attrs, new_attrs, 1)
i18n.write_text(text)

server = ROOT / "src" / "server.js"
helper = '''function localizeHtmlDocument(data) {
  let html = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
  html = html.replace(/<html\\b([^>]*)>/i, (_match, attributes) => {
    const clean = attributes.replace(/\\s+lang=(["']).*?\\1/i, "");
    return `<html${clean} lang="en">`;
  });
  if (!html.includes('/noema-i18n.js')) {
    html = html.replace(/<head\\b[^>]*>/i, (head) => `${head}\\n  <script src="/noema-i18n.js"></script>`);
  }
  return Buffer.from(html, "utf8");
}

'''
marker = "/** Servira statičke fajlove iz public/. Vraca true ako je servirano. */\n"
server_text = server.read_text()
if server_text.count(marker) != 1:
    raise RuntimeError("Could not find static serving marker")
server_text = server_text.replace(marker, helper + marker, 1)
old_inline = '''    if (ext === ".html") {
      let html = data.toString("utf8");
      html = html.replace(/<html\\b([^>]*)>/i, (_match, attributes) => {
        const clean = attributes.replace(/\\s+lang=(["\\']).*?\\1/i, "");
        return `<html${clean} lang="en">`;
      });
      if (!html.includes('/noema-i18n.js')) {
        html = html.replace(/<head\\b[^>]*>/i, (head) => `${head}\\n  <script src="/noema-i18n.js"></script>`);
      }
      data = Buffer.from(html, "utf8");
    }'''
if server_text.count(old_inline) != 1:
    raise RuntimeError("Could not find inline HTML localization")
server_text = server_text.replace(old_inline, '''    if (ext === ".html") data = localizeHtmlDocument(data);''', 1)
old_404 = '''          const data = await readFile(path.join(PUBLIC_DIR, "404.html"));
          res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
          res.end(data);'''
new_404 = '''          const data = localizeHtmlDocument(await readFile(path.join(PUBLIC_DIR, "404.html")));
          res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
          res.end(data);'''
if server_text.count(old_404) != 1:
    raise RuntimeError("Could not find 404 response block")
server.write_text(server_text.replace(old_404, new_404, 1))

test_file = ROOT / "test" / "server-audit-fixes.test.js"
test_text = test_file.read_text()
old_i18n = '''    const i18n = await fetch(base + "/noema-i18n.js");
    assert.equal(i18n.status, 200);
    assert.match(await i18n.text(), /USER_CONTENT_SELECTOR/);'''
new_i18n = '''    const i18n = await fetch(base + "/noema-i18n.js");
    assert.equal(i18n.status, 200);
    const i18nSource = await i18n.text();
    assert.match(i18nSource, /USER_CONTENT_SELECTOR/);
    assert.ok(i18nSource.includes("(?<![\\\\p{L}\\\\p{N}])"));'''
if test_text.count(old_i18n) != 1:
    raise RuntimeError("Could not find i18n test block")
test_text = test_text.replace(old_i18n, new_i18n, 1)
old_home = '''    assert.match(html, /<html[^>]*lang="en"/i);
    assert.match(html, /<script src="\\/noema-i18n\\.js"><\\/script>/);

    const authHeaders'''
new_home = '''    assert.match(html, /<html[^>]*lang="en"/i);
    assert.match(html, /<script src="\\/noema-i18n\\.js"><\\/script>/);

    const missing = await fetch(base + "/this-page-does-not-exist", {
      headers: { Authorization: "Bearer " + token, Accept: "text/html" },
    });
    assert.equal(missing.status, 404);
    const missingHtml = await missing.text();
    assert.match(missingHtml, /<html[^>]*lang="en"/i);
    assert.match(missingHtml, /<script src="\\/noema-i18n\\.js"><\\/script>/);

    const authHeaders'''
if test_text.count(old_home) != 1:
    raise RuntimeError("Could not find home localization test block")
test_file.write_text(test_text.replace(old_home, new_home, 1))

# Remove this one-use script and workflow from the final branch.
Path(__file__).unlink()
(ROOT / ".github" / "workflows" / "apply-final-review-fixes.yml").unlink()
