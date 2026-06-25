"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function MobileBottomNav() {
  const pathname = usePathname();

  const items = [
    { href: "/", label: "Home" },
    { href: "/read", label: "Read" },
    { href: "/study", label: "Study" },
    { href: "/settings", label: "Settings" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur">
      <div className="grid grid-cols-4">
        {items.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`py-3 text-center text-xs font-medium transition ${
                active ? "text-white" : "text-neutral-500"
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