"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";

type Props = {
  previousChapterHref: string | null;
  nextChapterHref: string | null;
  children: React.ReactNode;
};

export default function ChapterSwipe({
  previousChapterHref,
  nextChapterHref,
  children,
}: Props) {
  const router = useRouter();

  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  function onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    if (startX.current === null || startY.current === null) return;

    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;

    const deltaX = endX - startX.current;
    const deltaY = endY - startY.current;

    const minSwipeDistance = 80;
    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);
    const isLongEnoughSwipe = Math.abs(deltaX) > minSwipeDistance;

    if (!isHorizontalSwipe || !isLongEnoughSwipe) {
      startX.current = null;
      startY.current = null;
      return;
    }

    if (deltaX < 0 && nextChapterHref) {
      navigator.vibrate?.(20);
      router.push(nextChapterHref);
    }

    if (deltaX > 0 && previousChapterHref) {
      navigator.vibrate?.(20);
      router.push(previousChapterHref);
    }

    startX.current = null;
    startY.current = null;
  }

  return (
    <div
      className="w-full touch-pan-y"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {children}
    </div>
  );
}