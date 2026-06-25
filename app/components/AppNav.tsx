import Link from "next/link";

export default function AppNav() {
  return (
    <nav className="mb-6 flex items-center justify-between">
      <Link href="/" className="text-lg font-bold text-white">
        Scripture
      </Link>

      <Link href="/read" className="text-sm text-neutral-400 hover:text-white">
        Read
      </Link>
    </nav>
  );
}