/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { logOut } from "@/app/actions";

export function AppHeader({ name, image, back }: { name?: string | null; image?: string | null; back?: boolean }) {
  return (
    <header className="flex items-center gap-3">
      {back && (
        <Link href="/" className="-ml-1 px-1 text-2xl leading-none opacity-70" aria-label="Back">
          ‹
        </Link>
      )}
      {image ? (
        <img src={image} alt="" className="h-11 w-11 rounded-full object-cover" />
      ) : (
        <div className="h-11 w-11 rounded-full bg-current/10" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs opacity-60">Layla</p>
        <p className="truncate text-lg font-semibold">{name ?? "Spotify user"}</p>
      </div>
      <form action={logOut}>
        <button type="submit" className="rounded-full border border-current/30 px-3 py-1.5 text-xs opacity-70">
          Sign out
        </button>
      </form>
    </header>
  );
}
