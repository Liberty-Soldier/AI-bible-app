function extractFamilyRelationships(verse) {

    const relationships = [];

    const tokens = verse.sourceTokens || [];

    for (let i = 0; i < tokens.length - 1; i++) {

        const token = tokens[i];

        if (token.strong === "H1121") {

            relationships.push({
                type: "family.child",
                tokenId: token.id
            });

        }

        if (token.strong === "H1") {

            relationships.push({
                type: "family.father",
                tokenId: token.id
            });

        }

    }

    return relationships;

}

module.exports = {
    extractFamilyRelationships
};