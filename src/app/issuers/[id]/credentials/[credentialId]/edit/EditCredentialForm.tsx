"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AchievementType } from "@prisma/client";
import BreadcrumbNavigation from "~/components/global/breadcrumb";
import { updateCredential } from "~/server/actions/update-credential";
import type { Credential } from "~/trpc/shared";

export default function EditCredentialForm({
  credential,
  issuerId,
}: {
  credential: Credential;
  issuerId: string;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();
  const assessmentExtension = credential.extensions.flatMap(
    (extension) => extension.assessmentExtensions,
  )[0];

  async function onSubmit(formData: FormData) {
    setIsSaving(true);
    setError(undefined);
    try {
      await updateCredential(formData);
      router.push(`/issuers/${issuerId}/credentials/${credential.docId}`);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The badge could not be saved.",
      );
      setIsSaving(false);
    }
  }

  return (
    <>
      <BreadcrumbNavigation
        items={[
          <Link key="issuer" href={`/issuers/${issuerId}`}>
            {credential.creator?.name ?? "Issuer"}
          </Link>,
          <Link
            key="credential"
            href={`/issuers/${issuerId}/credentials/${credential.docId}`}
          >
            {credential.name}
          </Link>,
          <span key="edit">Edit</span>,
        ]}
      />
      <main className="mx-auto min-h-screen max-w-[45rem] py-6">
        <h1 className="mb-6 border-b-2 border-gray-2 pb-5 text-xl font-bold">
          Edit {credential.name}
        </h1>
        <form action={onSubmit} className="dashboard-form">
          <input type="hidden" name="docId" value={credential.docId} />
          <input type="hidden" name="issuerId" value={issuerId} />

          <div className="field" aria-required>
            <label htmlFor="name">Achievement Name</label>
            <input
              id="name"
              name="name"
              defaultValue={credential.name}
              required
            />
          </div>
          <div className="field" aria-required>
            <label htmlFor="description">Achievement Description</label>
            <textarea
              id="description"
              name="description"
              defaultValue={credential.description}
              required
              rows={4}
            />
          </div>
          <div className="field" aria-required>
            <label htmlFor="achievementType">Achievement Type</label>
            <select
              id="achievementType"
              name="achievementType"
              defaultValue={credential.achievementType ?? AchievementType.Badge}
              required
              className="rounded border border-gray-5 px-4 py-3"
            >
              {Object.values(AchievementType)
                .sort()
                .map((type) => (
                  <option key={type} value={type}>
                    {type.replace(/([A-Z])/g, " $1").trim()}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="image">Replace Achievement Image</label>
            {credential.image?.id && (
              <Image
                src={credential.image.id}
                alt=""
                width={160}
                height={160}
                className="mb-2"
              />
            )}
            <input
              id="image"
              name="image"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
            />
            <p className="text-sm text-gray-5">
              Leave empty to keep the current image.
            </p>
          </div>
          <div className="checkbox">
            <input
              id="isPublic"
              name="isPublic"
              type="checkbox"
              defaultChecked={credential.isPublic}
            />
            <label htmlFor="isPublic">
              Display this achievement on the public issuer page
            </label>
          </div>
          <div className="field" aria-required>
            <label htmlFor="criteria">Criteria</label>
            <textarea
              id="criteria"
              name="criteria"
              defaultValue={
                credential.criteria.narrative ?? credential.criteria.id ?? ""
              }
              required
              rows={5}
            />
          </div>
          <div className="field">
            <label htmlFor="tag">Tags</label>
            <input
              id="tag"
              name="tag"
              defaultValue={credential.tag.join(", ")}
              placeholder="education, skills, certificate"
            />
            <p className="text-sm text-gray-5">Separate tags with commas.</p>
          </div>
          <div className="field" aria-required>
            <label htmlFor="supportingResearchAndRationale">
              Supporting Research and Rationale
            </label>
            <textarea
              id="supportingResearchAndRationale"
              name="supportingResearchAndRationale"
              defaultValue={
                assessmentExtension?.supportingResearchAndRationale ?? ""
              }
              required
              rows={5}
            />
          </div>
          <div className="field" aria-required>
            <label htmlFor="resources">Resources</label>
            <textarea
              id="resources"
              name="resources"
              defaultValue={assessmentExtension?.resources ?? ""}
              required
              rows={5}
            />
          </div>

          {error && (
            <p className="text-red-5" role="alert">
              {error}
            </p>
          )}
          <div className="flex items-center gap-4">
            <button type="submit" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save changes"}
            </button>
            <Link
              href={`/issuers/${issuerId}/credentials/${credential.docId}`}
              className="font-semibold text-blue-4 underline"
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </>
  );
}
