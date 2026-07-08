const { writeRepresentation } = require("./RepresentationWriter");
const { writeReport } = require("./ReportWriter");

function runPass(config, pass) {

    console.log(pass.title);

    const started = Date.now();

    const result = pass.execute();

    result.durationMs = Date.now() - started;

    const output = writeRepresentation(
        config,
        pass.output,
        result.data
    );

    writeReport(config, pass.id, {
        pass: pass.id,
        representation: pass.output,
        compilerVersion: config.compilerVersion,
        checksum: output.checksum,
        durationMs: result.durationMs,
        stats: result.stats,
        warnings: result.warnings,
        errors: result.errors
    });

    if (pass.after) {
        pass.after(result);
    }

    console.log("");

    return result;
}

module.exports = {
    runPass
};