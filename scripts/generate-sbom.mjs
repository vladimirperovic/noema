import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const output = path.resolve(process.argv[2] || path.join(repoRoot, "sbom.spdx.json"));
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const roots = ["src", "public", "scripts", "test"].filter((entry) => existsSync(path.join(repoRoot, entry)));

function collectFiles(relative) {
  const absolute = path.join(repoRoot, relative);
  const files = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(child));
    else if (entry.isFile()) files.push(child.split(path.sep).join("/"));
  }
  return files;
}

const files = roots.flatMap(collectFiles).sort();
const spdxFiles = files.map((filename, index) => {
  const data = readFileSync(path.join(repoRoot, filename));
  return {
    SPDXID: `SPDXRef-File-${index + 1}`,
    fileName: `./${filename}`,
    checksums: [{ algorithm: "SHA256", checksumValue: createHash("sha256").update(data).digest("hex") }],
    licenseConcluded: "NOASSERTION",
    copyrightText: "NOASSERTION",
  };
});

const aggregate = createHash("sha256")
  .update(spdxFiles.map((file) => file.checksums[0].checksumValue).join("\n"))
  .digest("hex");
const document = {
  spdxVersion: "SPDX-2.3",
  dataLicense: "CC0-1.0",
  SPDXID: "SPDXRef-DOCUMENT",
  name: `${packageJson.name}-${packageJson.version}`,
  documentNamespace: `https://github.com/vladimirperovic/noema/sbom/${packageJson.version}/${aggregate}`,
  creationInfo: { created: "1970-01-01T00:00:00Z", creators: ["Tool: noema-sbom-generator"] },
  packages: [{
    SPDXID: "SPDXRef-Package-Noema",
    name: packageJson.name,
    versionInfo: packageJson.version,
    downloadLocation: "NOASSERTION",
    filesAnalyzed: true,
    licenseConcluded: "NOASSERTION",
    licenseDeclared: packageJson.license || "NOASSERTION",
    copyrightText: "NOASSERTION",
    checksums: [{ algorithm: "SHA256", checksumValue: aggregate }],
  }],
  files: spdxFiles,
  relationships: spdxFiles.map((file) => ({
    spdxElementId: "SPDXRef-Package-Noema",
    relationshipType: "CONTAINS",
    relatedSpdxElement: file.SPDXID,
  })),
};

writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(`[noema] SPDX SBOM: ${output} (${spdxFiles.length} files)`);
