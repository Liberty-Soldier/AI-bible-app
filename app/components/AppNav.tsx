import Link from "next/link";

export default function AppNav() {
  return (
    <nav className="mb-8 border-b border-neutral-800 pb-4">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="text-xl font-bold text-white"
        >
          The Word
        </Link>

        <div className="flex items-center gap-6 text-sm">
          <Link
            href="/read"
            className="text-neutral-400 hover:text-white"
          >
            Read
          </Link>

          <Link
            href="/"
            className="text-neutral-400 hover:text-white"
          >
            Search
          </Link>

          <Link
            href="/ask"
            className="text-neutral-400 hover:text-white"
          >
            Ask Scripture
          </Link>
        </div>
      </div>
    </nav>
  );
}