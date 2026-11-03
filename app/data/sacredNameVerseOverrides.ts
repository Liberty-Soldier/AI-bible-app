export type SacredNameVerseOverride = {
  reference: string;
  replaceLordWithYahweh?: boolean;
  sourceReference: string;
  hebrewCanonicalReference: string;
  reason: string;
};

// Display only. Each entry is reviewed individually: the presence of YHWH in
// an OT source alone does not settle an ambiguous NT referent (e.g. Romans 10:13).
// Canonical references name the existing locked Hebrew projection, not a new
// versification or source-word alignment.
export const sacredNameVerseOverrides: Record<string, SacredNameVerseOverride> = {
  "Acts 2:21": {
    reference: "Acts 2:21",
    replaceLordWithYahweh: true,
    sourceReference: "Joel 2:32",
    hebrewCanonicalReference: "Joel:3:5",
    reason: "Quotes Joel 2:32; the locked Hebrew source identifies יהוה (H3068).",
  },
  "Hebrews 8:8": {
    reference: "Hebrews 8:8",
    replaceLordWithYahweh: true,
    sourceReference: "Jeremiah 31:31",
    hebrewCanonicalReference: "Jer:31:31",
    reason: "Quotes Jeremiah 31:31; the locked Hebrew source identifies יהוה (H3068).",
  },
  "Hebrews 8:9": {
    reference: "Hebrews 8:9",
    replaceLordWithYahweh: true,
    sourceReference: "Jeremiah 31:32",
    hebrewCanonicalReference: "Jer:31:32",
    reason: "Quotes Jeremiah 31:32; the locked Hebrew source identifies יהוה (H3068).",
  },
  "Hebrews 8:10": {
    reference: "Hebrews 8:10",
    replaceLordWithYahweh: true,
    sourceReference: "Jeremiah 31:33",
    hebrewCanonicalReference: "Jer:31:33",
    reason: "Quotes Jeremiah 31:33; the locked Hebrew source identifies יהוה (H3068).",
  },
  "Hebrews 8:11": {
    reference: "Hebrews 8:11",
    replaceLordWithYahweh: true,
    sourceReference: "Jeremiah 31:34",
    hebrewCanonicalReference: "Jer:31:34",
    reason: "Quotes Jeremiah 31:34; the locked Hebrew source identifies יהוה (H3068).",
  },
  "Matthew 4:7": {
    reference: "Matthew 4:7",
    replaceLordWithYahweh: true,
    sourceReference: "Deuteronomy 6:16",
    hebrewCanonicalReference: "Deut:6:16",
    reason: "Quotes Deuteronomy 6:16; the locked Hebrew source identifies יהוה (H3068).",
  },
  "Luke 4:12": {
    reference: "Luke 4:12",
    replaceLordWithYahweh: true,
    sourceReference: "Deuteronomy 6:16",
    hebrewCanonicalReference: "Deut:6:16",
    reason: "Quotes Deuteronomy 6:16; the locked Hebrew source identifies יהוה (H3068).",
  },
  "Matthew 4:10": {
    reference: "Matthew 4:10",
    replaceLordWithYahweh: true,
    sourceReference: "Deuteronomy 6:13",
    hebrewCanonicalReference: "Deut:6:13",
    reason: "Quotes Deuteronomy 6:13; the locked Hebrew source identifies יהוה (H3068).",
  },
  "Luke 4:8": {
    reference: "Luke 4:8",
    replaceLordWithYahweh: true,
    sourceReference: "Deuteronomy 6:13",
    hebrewCanonicalReference: "Deut:6:13",
    reason: "Quotes Deuteronomy 6:13; the locked Hebrew source identifies יהוה (H3068).",
  },
  "Matthew 22:37": {
    reference: "Matthew 22:37",
    replaceLordWithYahweh: true,
    sourceReference: "Deuteronomy 6:5",
    hebrewCanonicalReference: "Deut:6:5",
    reason: "Quotes Deuteronomy 6:5; the locked Hebrew source identifies יהוה (H3068).",
  },
  "Mark 12:29": {
    reference: "Mark 12:29",
    replaceLordWithYahweh: true,
    sourceReference: "Deuteronomy 6:4",
    hebrewCanonicalReference: "Deut:6:4",
    reason: "Quotes Deuteronomy 6:4; the locked Hebrew source identifies יהוה (H3068).",
  },
  "Mark 12:30": {
    reference: "Mark 12:30",
    replaceLordWithYahweh: true,
    sourceReference: "Deuteronomy 6:5",
    hebrewCanonicalReference: "Deut:6:5",
    reason: "Quotes Deuteronomy 6:5; the locked Hebrew source identifies יהוה (H3068).",
  },
  "Luke 10:27": {
    reference: "Luke 10:27",
    replaceLordWithYahweh: true,
    sourceReference: "Deuteronomy 6:5",
    hebrewCanonicalReference: "Deut:6:5",
    reason: "Quotes Deuteronomy 6:5; the locked Hebrew source identifies יהוה (H3068).",
  },
  "Acts 3:22": {
    reference: "Acts 3:22",
    replaceLordWithYahweh: true,
    sourceReference: "Deuteronomy 18:15",
    hebrewCanonicalReference: "Deut:18:15",
    reason: "Quotes Deuteronomy 18:15; the locked Hebrew source identifies יהוה (H3068).",
  },
};

// Capitalization in an NT inscription is not a Hebrew divine-name signal.
// Preserve the original title rather than assigning the Father's personal name.
export const sacredNameTitlePreservations: Record<string, string> = {
  "Revelation 19:16": "Uppercase LORD is part of the KING OF KINGS / LORD OF LORDS inscription, not a quotation of the Hebrew divine name.",
};
