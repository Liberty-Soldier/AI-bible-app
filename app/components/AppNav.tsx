import Link from "next/link";
import EmetseesWordmark from "@/app/components/branding/EmetseesWordmark";

export default function AppNav() {
  return (
    <nav className="mb-6 flex items-center justify-between">
      <Link href="/" aria-label="EMETSEES home">
        <EmetseesWordmark compact />
      </Link>

      <Link
        href="/read"
        className="text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        Read
      </Link>
    </nav>
  );
}
