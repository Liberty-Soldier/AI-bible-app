const fs = require("fs");
const path = require("path");

const root = process.cwd();
const file = path.join(
  root,
  "scripts",
  "export-bibleiq-canonical-runtime.js"
);

let source = fs.readFileSync(file, "utf8");

const requireLine =
  'const { verifyP0510CanonicalRoot } = require("./p0510/verify-p0510-canonical-source.cjs");';

if (!source.includes(requireLine)) {
  const anchor = 'const path = require("path");';

  if (!source.includes(anchor)) {
    throw new Error("Exporter require anchor not found.");
  }

  source = source.replace(
    anchor,
    `${anchor}\n\n${requireLine}`
  );
}

const guard = `  const p0510Verification = verifyP0510CanonicalRoot({
    root,
    canonicalRoot: inputRoot,
    label: ".private canonical source",
  });

  if (!p0510Verification.passed) {
    throw new Error(
      [
        "Refusing canonical export: the local .private canonical source is stale or incomplete.",
        \`Clean WEB text mismatches: \${p0510Verification.webTextMismatches.length}\`,
        \`WEB token mismatches: \${p0510Verification.webTokenMismatches.length}\`,
        \`Approved block mismatches: \${p0510Verification.approvedBlockMismatches.length}\`,
        \`Approved route mismatches: \${p0510Verification.approvedRouteMismatches.length}\`,
        "Run the P05.10 canonical source repair before exporting.",
      ].join("\\n")
    );
  }

  console.log(
    \`P05.10 canonical source verified: \${p0510Verification.approvedBlocksExact} blocks, \${p0510Verification.approvedRoutesExact} routes.\`
  );

`;

if (!source.includes("P05.10 canonical source verified:")) {
  const anchor = "  cleanDir(outputRoot);";

  if (!source.includes(anchor)) {
    throw new Error("Exporter cleanDir anchor not found.");
  }

  source = source.replace(anchor, `${guard}${anchor}`);
}

fs.writeFileSync(file, source, "utf8");

console.log("Patched canonical exporter with a pre-delete P05.10 source guard.");
