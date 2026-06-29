"use client";

import { useEffect } from "react";

type Theme = "dark" | "light";

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const saved = localStorage.getItem("bibleiq-theme");
    const theme: Theme = saved === "light" ? "light" : "dark";

    document.documentElement.setAttribute("data-theme", theme);
  }, []);

  return <>{children}</>;
}