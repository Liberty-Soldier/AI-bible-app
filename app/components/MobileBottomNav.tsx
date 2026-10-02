"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import EmetseesLogo from "@/app/components/branding/EmetseesLogo";
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
        <path d="M5 4.5h14v16H5z" />
        <path d="M8 4.5v16" />
        <path d="M11 8h5" />
        <path d="M11 12h5" />
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
  const shouldShow = !autoHide || visible;

  function activeFor(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const askActive = activeFor("/emet");
  const settingsActive = activeFor("/settings");

  function navItemClass(active: boolean) {
    return `premium-nav-item ${
      active
        ? "is-active bg-[var(--surface)] shadow-[var(--shadow-sm)]"
        : ""
    }`;
  }

  return (
    <nav
      aria-label="Primary navigation"
      className={`premium-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--background)]/96 px-2 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl transition-transform duration-200 ${shouldShow ? "translate-y-0" : "translate-y-full"}`}
    >
      <div className="mx-auto grid max-w-xl grid-cols-5 items-end gap-1">
        <Link
          href="/"
          aria-current={activeFor("/") ? "page" : undefined}
          className={navItemClass(activeFor("/"))}
        >
          <Icon name="home" />
          <span>Home</span>
        </Link>

        <Link
          href="/read"
          aria-current={activeFor("/read") ? "page" : undefined}
          className={navItemClass(activeFor("/read"))}
        >
          <Icon name="read" />
          <span>Read</span>
        </Link>

        <Link
          href="/emet"
          aria-label="Ask EMET"
          aria-current={askActive ? "page" : undefined}
          onClick={(event) => {
            event.preventDefault();
            window.dispatchEvent(
              new CustomEvent("emetsees:open-emet"),
            );
          }}
          className="premium-ask-nav"
        >
          <span className="premium-ask-nav-mark">
            <EmetseesLogo size={28} variant="gold" />
          </span>
          <span>Ask</span>
        </Link>

        <Link
          href="/library"
          aria-current={activeFor("/library") ? "page" : undefined}
          className={navItemClass(activeFor("/library"))}
        >
          <Icon name="library" />
          <span>Library</span>
        </Link>

        <Link
          href="/settings"
          aria-current={settingsActive ? "page" : undefined}
          className={navItemClass(settingsActive)}
        >
          <Icon name="settings" />
          <span>Settings</span>
        </Link>
      </div>
    </nav>
  );
}
