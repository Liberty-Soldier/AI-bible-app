"use client";

import { useEffect, useState } from "react";

export function useReaderChromeVisibility() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;

    function update() {
      const currentY = window.scrollY;
      const diff = currentY - lastY;

      if (currentY < 40) {
        setVisible(true);
        lastY = currentY;
        ticking = false;
        return;
      }

      if (Math.abs(diff) > 8) {
        setVisible(diff < 0);
        lastY = currentY;
      }

      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return visible;
}