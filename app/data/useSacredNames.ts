"use client";

import { useEffect, useState } from "react";

export function useSacredNames() {
  const [sacredNames, setSacredNamesState] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sacredNames");
    setSacredNamesState(saved === "true");

    function handleStorageChange() {
      const updated = localStorage.getItem("sacredNames");
      setSacredNamesState(updated === "true");
    }

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("sacredNamesChanged", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("sacredNamesChanged", handleStorageChange);
    };
  }, []);

  function setSacredNames(value: boolean) {
    setSacredNamesState(value);
    localStorage.setItem("sacredNames", String(value));
    window.dispatchEvent(new Event("sacredNamesChanged"));
  }

  return { sacredNames, setSacredNames };
}