function resolveRelationships(verse) {

    const edges = [];

    const tokens = (verse.sourceTokens || []).map(token => ({
        id: token.id,
        entityId: token.entityId,
        strong: token.strong,
        morph: token.morph,
        pos: getPartOfSpeech(token.morph)
    }));

    const verb = tokens.find(t => t.pos === "verb");

    if (!verb) {
        return [];
    }

    const nouns = tokens.filter(t => {

    if (t.pos !== "noun") return false;

    if (t.morph.startsWith("HR")) return false;

    return true;

});

    if (nouns.length >= 2) {

        const subject =
    nouns.find(n => n.morph.includes("3ms")) ||
    nouns.find(n => n.entityId === "hebrew:H430") ||
    nouns[0];

        for (const object of nouns) {

    if (object.id === subject.id) continue;

            edges.push({

                subject: subject.entityId,

                predicate: verb.entityId,

                object: object.entityId,

                reference: verse.reference,

                confidence: "low"

            });

        }

    }

    return edges;

}

function getPartOfSpeech(morph = "") {

    if (morph.startsWith("HV")) return "verb";

    if (
        morph.startsWith("HN") ||
        morph.includes("/N")
    ) return "noun";

    if (
        morph.startsWith("HR") ||
        morph.includes("/R")
    ) return "preposition";

    if (
        morph.startsWith("HC") ||
        morph.includes("/C")
    ) return "conjunction";

    if (
        morph.startsWith("HT") ||
        morph.includes("/T")
    ) return "particle";

    return "unknown";
}

module.exports = {
    resolveRelationships
};