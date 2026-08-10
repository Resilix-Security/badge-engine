"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

import type { Credential, AwardHistory as IAwardHistory } from "~/trpc/shared";
import Icon from "../icon";
import { Dialog } from "../dialog";
import { useNotifications } from "~/providers/notification-provider";

export const AwardHistory = ({ credential }: { credential: Credential }) => {
  const [query, setQuery] = useState<string>("");
  const { data: awards } = api.award.index.useQuery({
    credentialId: credential.docId,
    query,
  });

  return (
    <section className="flex flex-col gap-6">
      <form onSubmit={(e) => e.preventDefault()}>
        <label className="sr-only" htmlFor="recipient-search">
          Search in recipients
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 z-10 -translate-y-1/2">
            <Icon name="magnifier" className="text-gray-5" />
          </span>
          <input
            className="block w-[27rem] rounded py-3 pl-7 pr-4 text-base text-neutral-5 outline outline-1 outline-gray-5 transition placeholder:text-gray-5 focus:outline-2 focus:outline-blue-4"
            id="recipient-search"
            type="search"
            placeholder="Search in recipients"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </form>
      <table className="w-full table-auto border-y border-gray-2 text-gray-5">
        <thead className="font-bold">
          <tr>
            <td className="px-3 py-4">Recipient Name</td>
            <td className="px-3 py-4">Status</td>
            <td className="px-3 py-4">Awarded on</td>
            <td className="px-3 py-4"></td>
          </tr>
        </thead>
        <tbody>
          {awards?.map((award, index) => (
            <AwardListItem key={index} award={award} />
          ))}
        </tbody>
      </table>
    </section>
  );
};

const AwardListItem = ({ award }: { award: IAwardHistory[number] }) => {
  const {
    credentialSubject: { profile },
    awardedDate,
  } = award;

  const utils = api.useUtils();
  const { notify } = useNotifications();

  const revokeMutation = api.award.revoke.useMutation({
    onSuccess: () => {
      notify({ type: "success", message: "Award revoked" });
      void utils.award.index.invalidate();
    },
    onError: (error) => {
      notify({
        type: "error",
        message: error.message || "Failed to revoke award",
      });
    },
  });

  const name =
    profile?.name ??
    ([profile?.givenName, profile?.familyName]
      .filter((n) => n)
      .join(" ")
      .trim() ||
      "Anonymous User");

  return (
    <tr className="border-t border-gray-2">
      <td className="px-3 py-4">
        <p className="font-medium text-neutral-5">{name}</p>
        {profile?.email && <p>{profile.email}</p>}
      </td>

      <td className="px-3 py-4">
        <p
          data-status={award.claimed ? "claimed" : "pending"}
          className="font-semibold before:mr-2 before:content-['\2022'] data-[status=claimed]:text-green-5 data-[status=pending]:text-gray-4"
        >
          {award.claimed ? "Claimed" : "Awaiting Claim"}
        </p>
      </td>

      <td className="px-3 py-4">
        {awardedDate && (
          <p>
            {new Date(awardedDate).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
        )}
      </td>

      <td className="px-3 py-4">
        <Dialog
          trigger={
            <button
              type="button"
              className="flex items-center gap-1 font-semibold text-gray-5 hover:text-red-5"
            >
              <Icon name="delete" />
              <span className="underline">Revoke</span>
            </button>
          }
        >
          <div className="flex flex-col gap-4">
            <h3 className="heading">Revoke this award?</h3>
            <p>
              {name} will no longer be able to prove this credential, and it
              will be removed from this list. This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={revokeMutation.isLoading}
                className="btn disabled:border-2 disabled:border-gray-4 disabled:bg-gray-3"
                onClick={() => revokeMutation.mutate(award.docId)}
              >
                {revokeMutation.isLoading ? "Revoking…" : "Revoke Award"}
              </button>
            </div>
          </div>
        </Dialog>
      </td>
    </tr>
  );
};

export default AwardHistory;
