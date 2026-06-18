"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";

type Props = {
  previousChapterHref: string | null;
  nextChapterHref: string | null;
};

export default function ChapterSwipe({
  previousChapterHref,
  nextChapterHref,
}: Props) {
  const router = useRouter();
  const startX = useRef<number | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (startX.current === null) return;

    const endX = e.changedTouches[0].clientX;
    const distance = endX - startX.current;

    if (distance < -100 && nextChapterHref) {
      router.push(nextChapterHref);
    }

    if (distance > 100 && previousChapterHref) {
      router.push(previousChapterHref);
    }

    startX.current = null;
  }

  return (
    <div
      className="contents"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    />
  );
}