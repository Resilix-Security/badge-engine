"use client";

import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { useNotifications } from "~/providers/notification-provider";
import { Dialog } from "../dialog";
import Icon from "../icon";

export default function DeleteCredentialButton({
  docId,
  name,
  issuerId,
}: {
  docId: string;
  name: string;
  issuerId: string;
}) {
  const router = useRouter();
  const { notify } = useNotifications();

  const deleteMutation = api.credential.delete.useMutation({
    onSuccess: () => {
      notify({ type: "success", message: `Deleted "${name}"` });
      router.push(`/issuers/${issuerId}`);
    },
    onError: (error) => {
      notify({
        type: "error",
        message: error.message || "Failed to delete this badge",
      });
    },
  });

  return (
    <Dialog
      trigger={
        <button
          type="button"
          className="flex items-center gap-1 font-semibold text-gray-5 hover:text-red-5"
        >
          <Icon name="delete" />
          <span className="underline">Delete Badge</span>
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <h3 className="heading">Delete &quot;{name}&quot;?</h3>
        <p>
          This permanently deletes this badge and every certificate ever
          awarded from it. This cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            disabled={deleteMutation.isLoading}
            className="btn disabled:border-2 disabled:border-gray-4 disabled:bg-gray-3"
            onClick={() => deleteMutation.mutate({ docId })}
          >
            {deleteMutation.isLoading ? "Deleting…" : "Delete Badge"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
