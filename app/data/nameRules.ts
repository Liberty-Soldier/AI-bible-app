export type NameRule = {
  id: string;
  source: string;
  replacement: string;
  wholeWord?: boolean;
};

export const nameRules: NameRule[] = [
  {
    id: "the-lord-god",
    source: "the LORD God",
    replacement: "Yahweh Elohim",
    wholeWord: true,
  },
  {
    id: "lord-god",
    source: "LORD God",
    replacement: "Yahweh Elohim",
    wholeWord: true,
  },
  {
    id: "the-lord",
    source: "the LORD",
    replacement: "Yahweh",
    wholeWord: true,
  },
  {
    id: "lord-all-caps",
    source: "LORD",
    replacement: "Yahweh",
    wholeWord: true,
  },
  {
    id: "jesus-christ",
    source: "Jesus Christ",
    replacement: "Yahshua Messiah",
    wholeWord: true,
  },
  {
    id: "christ-jesus",
    source: "Christ Jesus",
    replacement: "Messiah Yahshua",
    wholeWord: true,
  },
  {
    id: "jesus",
    source: "Jesus",
    replacement: "Yahshua",
    wholeWord: true,
  },
  {
    id: "christ",
    source: "Christ",
    replacement: "Messiah",
    wholeWord: true,
  },
  {
  id: "god",
  source: "God",
  replacement: "Elohim",
  wholeWord: true,
},
{
  id: "theos",
  source: "Theos",
  replacement: "Elohim",
  wholeWord: true,
},
  {
    id: "lord-title",
    source: "Lord",
    replacement: "Master",
    wholeWord: true,
  },
];