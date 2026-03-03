"use client";

import { MessageCircle } from "lucide-react";

export function GlobalChatWidget() {
  return (
    <button
      type="button"
      aria-label="Open global chat"
      className="fixed bottom-4 right-4 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-lg shadow-black/40 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
    >
      <MessageCircle className="h-6 w-6" aria-hidden="true" />
    </button>
  );
}
