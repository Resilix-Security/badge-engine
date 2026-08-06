"use client";

import Icon from "~/components/icon";
import { useNotifications } from "~/providers/notification-provider";

export function ShareButton({ url, title }: { url: string; title: string }) {
  const { notify } = useNotifications();

  const handleShare = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
      } catch {
        // User cancelled the native share sheet — nothing to do.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      notify({ type: "success", message: "Link copied to clipboard" });
    } catch {
      notify({ type: "error", message: "Couldn't copy the link" });
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className="flex items-center gap-2 rounded-3xl border border-gray-3 px-5 py-3 font-bold text-gray-5 transition hover:bg-gray-1"
    >
      <Icon name="share" />
      Share
    </button>
  );
}
