export type SacredNameVerseOverride = {
  reference: string;
  replaceLordWithYahweh?: boolean;
  reason: string;
};

export const sacredNameVerseOverrides: Record<string, SacredNameVerseOverride> = {
  "Acts 2:21": {
    reference: "Acts 2:21",
    replaceLordWithYahweh: true,
    reason: "Quotes Joel 2:32",
  },
  "Romans 10:13": {
    reference: "Romans 10:13",
    replaceLordWithYahweh: true,
    reason: "Quotes Joel 2:32",
  },
  "Hebrews 8:8": {
    reference: "Hebrews 8:8",
    replaceLordWithYahweh: true,
    reason: "Quotes Jeremiah 31:31",
  },
  "Hebrews 8:9": {
    reference: "Hebrews 8:9",
    replaceLordWithYahweh: true,
    reason: "Quotes Jeremiah 31:32",
  },
  "Hebrews 8:10": {
    reference: "Hebrews 8:10",
    replaceLordWithYahweh: true,
    reason: "Quotes Jeremiah 31:33",
  },
  "Hebrews 8:11": {
    reference: "Hebrews 8:11",
    replaceLordWithYahweh: true,
    reason: "Quotes Jeremiah 31:34",
  },
};