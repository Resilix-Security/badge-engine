"use client";

import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { useNotifications } from "~/providers/notification-provider";
import { Dialog } from "~/components/dialog";
import Icon from "~/components/icon";

export function DeleteIssuerButton({
  docId,
  name,
}: {
  docId: string;
  name: string;
}) {
  const router = useRouter();
  const { notify } = useNotifications();

  const deleteMutation = api.issuer.delete.useMutation({
    onSuccess: () => {
      notify({ type: "success", message: `Deleted "${name}"` });
      router.push("/issuers");
    },
    onError: (error) => {
      notify({
        type: "error",
        message: error.message || "Failed to delete this organization",
      });
    },
  });

  return (
    <Dialog
      trigger={
        <button
          type="button"
          className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-gray-5 hover:text-red-5"
        >
          <Icon name="delete" />
          <span className="whitespace-nowrap underline">Delete Organization</span>
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <h3 className="heading">Delete &quot;{name}&quot;?</h3>
        <p>
          This permanently deletes this organization, every badge it created,
          and every certificate ever awarded from those badges. This cannot
          be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            disabled={deleteMutation.isLoading}
            className="btn disabled:border-2 disabled:border-gray-4 disabled:bg-gray-3"
            onClick={() => deleteMutation.mutate(docId)}
          >
            {deleteMutation.isLoading ? "Deleting…" : "Delete Organization"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
