"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import EmetseesLogo from "@/app/components/branding/EmetseesLogo";
import { usePremiumAccess } from "@/app/components/premium/PremiumAccessProvider";
import { useReaderChromeVisibility } from "@/app/components/useReaderChromeVisibility";

function Icon({
  name,
}: {
  name: "home" | "read" | "library" | "settings";
}) {
  const paths = {
    home: (
      <>
        <path d="M3 10.8 12 3l9 7.8" />
        <path d="M5.5 9.5V21h13V9.5" />
      </>
    ),
    read: (
      <>
        <path d="M4 5.5c2.7-.8 5.4-.3 8 1.5v14c-2.6-1.8-5.3-2.3-8-1.5z" />
        <path d="M20 5.5c-2.7-.8-5.4-.3-8 1.5v14c2.6-1.8 5.3-2.3 8-1.5z" />
      </>
    ),
    library: (
      <>
        <path d="M4 4h4v16H4z" />
        <path d="M10 4h4v16h-4z" />
        <path d="m16 5 4-1 2.5 15-4 1z" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

export default function MobileBottomNav({
  autoHide = false,
}: {
  autoHide?: boolean;
}) {
  const pathname = usePathname();
  const visible = useReaderChromeVisibility();
  const { requestUpgrade } = usePremiumAccess();
  const shouldShow = !autoHide || visible;

  const items = [
    { href: "/", label: "Home", icon: "home" as const },
    { href: "/read", label: "Read", icon: "read" as const },
    { href: "/library", label: "Library", icon: "library" as const },
    { href: "/settings", label: "Settings", icon: "settings" as const },
  ];

  function activeFor(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav
      aria-label="Primary navigation"
      className={`premium-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--background)]/96 px-2 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl transition-transform duration-200 ${shouldShow ? "translate-y-0" : "translate-y-full"}`}
    >
      <div className="mx-auto grid max-w-xl grid-cols-5 items-end">
        <Link
          href={items[0].href}
          className={`premium-nav-item ${activeFor(items[0].href) ? "is-active" : ""}`}
        >
          <Icon name={items[0].icon} />
          <span>{items[0].label}</span>
        </Link>

        <Link
          href={items[1].href}
          className={`premium-nav-item ${activeFor(items[1].href) ? "is-active" : ""}`}
        >
          <Icon name={items[1].icon} />
          <span>{items[1].label}</span>
        </Link>

        <button
          type="button"
          aria-label="Ask EMET"
          onClick={() =>
            requestUpgrade("ask-emet", "Ask contextual questions about Scripture")
          }
          className="premium-ask-nav"
        >
          <span className="premium-ask-nav-mark">
            <EmetseesLogo size={28} variant="gold" />
          </span>
          <span>Ask</span>
        </button>

        <Link
          href={items[2].href}
          className={`premium-nav-item ${activeFor(items[2].href) ? "is-active" : ""}`}
        >
          <Icon name={items[2].icon} />
          <span>{items[2].label}</span>
        </Link>

        <Link
          href={items[3].href}
          className={`premium-nav-item ${activeFor(items[3].href) ? "is-active" : ""}`}
        >
          <Icon name={items[3].icon} />
          <span>{items[3].label}</span>
        </Link>
      </div>
    </nav>
  );
}
