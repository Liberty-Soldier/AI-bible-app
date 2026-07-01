"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useReaderChromeVisibility } from "@/app/components/useReaderChromeVisibility";

export default function MobileBottomNav({
  autoHide = false,
}: {
  autoHide?: boolean;
}) {
  const pathname = usePathname();
  const visible = useReaderChromeVisibility();

  const shouldShow = !autoHide || visible;

  const items = [
    { href: "/", label: "Home" },
    { href: "/read", label: "Read" },
    { href: "/study", label: "Study" },
    { href: "/settings", label: "Settings" },
  ];

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border)] bg-[var(--background)]/95 text-[var(--foreground)] backdrop-blur transition-transform duration-200 ${
        shouldShow ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="grid grid-cols-4">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`py-3 text-center text-xs font-medium transition ${
                active ? "text-[var(--foreground)]" : "text-[var(--muted)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}