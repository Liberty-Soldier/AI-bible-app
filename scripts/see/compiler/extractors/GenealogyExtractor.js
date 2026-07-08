function extractGenealogyRelationships(verse) {

    const relationships = [];

    const tokens = verse.sourceTokens || [];

    for (let i = 0; i < tokens.length; i++) {

        const token = tokens[i];

        // ילד (to beget)
        if (token.strong === "H3205") {

            relationships.push({
                type: "genealogy.beget",
                tokenId: token.id,
                canonicalId: `canon:${verse.reference.replace(/:/g, ":")}`
            });

        }

        // בן (son)
        if (token.strong === "H1121") {

            relationships.push({
                type: "genealogy.son",
                tokenId: token.id,
                canonicalId: `canon:${verse.reference.replace(/:/g, ":")}`
            });

        }

        // אב (father)
        if (token.strong === "H1") {

            relationships.push({
                type: "genealogy.father",
                tokenId: token.id,
                canonicalId: `canon:${verse.reference.replace(/:/g, ":")}`
            });

        }

    }

    return relationships;

}

module.exports = {
    extractGenealogyRelationships
};