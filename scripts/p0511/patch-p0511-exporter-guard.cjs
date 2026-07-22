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
  'const { verifyP0511CanonicalRoot } = require("./p0511/verify-p0511-safe-parallel.cjs");';

if (!source.includes(requireLine)) {
  const anchor =
    'const { verifyP0510CanonicalRoot } = require("./p0510/verify-p0510-canonical-source.cjs");';

  if (!source.includes(anchor)) {
    throw new Error(
      "P05.10 exporter verification anchor was not found."
    );
  }

  source = source.replace(
    anchor,
    `${anchor}\n${requireLine}`
  );
}

const guard = `  const p0511Verification = verifyP0511CanonicalRoot({
    root,
    canonicalRoot: inputRoot,
    label: ".private canonical source",
  });

  if (!p0511Verification.passed) {
    throw new Error(
      [
        "Refusing canonical export: the local .private source is missing approved P05.11 routes.",
        \`Approved P05.11 route mismatches: \${p0511Verification.mismatches.length}\`,
        "Run the P05.11 safe-parallel repair before exporting.",
      ].join("\\n")
    );
  }

  console.log(
    \`P05.11 canonical source verified: \${p0511Verification.exactRoutes} routes.\`
  );

`;

if (
  !source.includes(
    "P05.11 canonical source verified:"
  )
) {
  const anchor = "  cleanDir(outputRoot);";

  if (!source.includes(anchor)) {
    throw new Error(
      "Exporter cleanDir anchor was not found."
    );
  }

  source = source.replace(
    anchor,
    `${guard}${anchor}`
  );
}

fs.writeFileSync(file, source, "utf8");

console.log(
  "Patched exporter with the P05.11 pre-delete route guard."
);
