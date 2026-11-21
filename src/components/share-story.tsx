"use client";

import { useEffect, useState } from "react";

/**
 * "Share to story": shares a 1080x1920 PNG of the vibe (from /api/story) via the native share sheet,
 * or downloads it where file sharing isn't supported (desktop, http on phones).
 * The image is prefetched on mount: iOS only allows navigator.share() right after the tap.
 */
export function ShareStory({ version, title }: { version: string; title: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/story?v=${encodeURIComponent(version)}`)
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => !cancelled && setFile(new File([blob], "layla-vibe.png", { type: "image/png" })))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [version]);

  async function share() {
    if (!file) return;
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `My Layla vibe: ${title}` });
      } catch {
        // user closed the share sheet
      }
      return;
    }
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement("a"), { href: url, download: file.name });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={share}
      disabled={!file}
      className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
    >
      {error ? "Story unavailable" : file ? "Share to story ↗" : "Preparing story…"}
    </button>
  );
}
