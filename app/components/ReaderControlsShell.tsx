"use client";

import { useEffect, useState } from "react";

export default function ReaderControlsShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let lastY = window.scrollY;

    function handleScroll() {
      const currentY = window.scrollY;
      const scrollingDown = currentY > lastY;
      const nearTop = currentY < 80;

      if (nearTop) {
        setVisible(true);
      } else if (scrollingDown) {
        setVisible(false);
      } else {
        setVisible(true);
      }

      lastY = currentY;
    }

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      className={`sticky top-0 z-50 mb-8 transition-transform duration-300 ${
        visible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      {children}
    </div>
  );
}