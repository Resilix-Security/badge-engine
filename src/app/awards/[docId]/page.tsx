import { notFound } from "next/navigation";
import Image from "next/image";
import { api } from "~/trpc/server";
import { isTRPCClientError } from "~/lib/error";
import { buildVerifiableCredentialJson } from "~/lib/build-verifiable-credential";
import { verifyCredential } from "~/lib/verify-credential";
import Icon from "~/components/icon";
import { ShareButton } from "~/components/ShareButton";
import { LinkedInIcon } from "~/components/icons/linkedin-icon";

function linkedInAddToProfileUrl({
  name,
  organizationName,
  issueDate,
  certUrl,
  certId,
}: {
  name: string;
  organizationName: string;
  issueDate: Date | null;
  certUrl: string;
  certId: string;
}) {
  const params = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name,
    organizationName,
    certUrl,
    certId,
  });
  if (issueDate) {
    params.set("issueYear", String(issueDate.getFullYear()));
    params.set("issueMonth", String(issueDate.getMonth() + 1));
  }
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}

export default async function AwardedCredential({
  params,
}: {
  params: { docId: string };
}) {
  try {
    const credential = await api.award.findPublic.query(params.docId);
    const recipientName = credential.credentialSubject.profile?.name;
    const isSigned = credential.proof.length > 0;
    const hasImage = Boolean(credential.image?.id);
    const issuerName = credential.issuer.name ?? "an unknown issuer";
    const awardedDate = credential.awardedDate
      ? new Date(credential.awardedDate)
      : null;
    const awardedDateLabel = awardedDate
      ? awardedDate.toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;

    const verification = isSigned
      ? await verifyCredential(buildVerifiableCredentialJson(credential))
      : null;

    return (
      <main className="mx-auto flex w-[36rem] max-w-full flex-col items-center gap-7 px-4 py-8 text-center">
        {credential.image?.id ? (
          <Image
            alt={credential.name}
            src={credential.image.id}
            height={220}
            width={220}
            className="rounded-2xl border border-gray-2 shadow-sm"
            priority
          />
        ) : (
          <div className="flex h-[220px] w-[220px] items-center justify-center rounded-2xl border border-gray-2 bg-gray-1 text-gray-3">
            <Icon name="badge" className="text-3xl" />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold">{credential.name}</h1>
          <p className="text-gray-4">
            Issued by <span className="font-medium text-gray-5">{issuerName}</span>
            {recipientName && (
              <>
                {" "}
                to <span className="font-medium text-gray-5">{recipientName}</span>
              </>
            )}
            {awardedDateLabel && <> on {awardedDateLabel}</>}
          </p>
        </div>

        {credential.description && (
          <p className="max-w-md text-gray-5">{credential.description}</p>
        )}

        {verification && (
          <details className="group w-full max-w-xs rounded-lg border border-gray-2 open:bg-gray-1">
            <summary className="flex cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 font-bold">
              <Icon
                name={verification.valid ? "success" : "warning"}
                className={verification.valid ? "text-green-4" : "text-red-4"}
              />
              {verification.valid ? "Verified" : "Could not be verified"}
              <Icon
                name="arrow-line-down"
                className="text-sm text-gray-3 group-open:hidden"
              />
            </summary>
            <div className="px-4 pb-4 text-left text-sm text-gray-4">
              {verification.valid ? (
                <ul className="flex flex-col gap-1">
                  <li>
                    <span className="font-medium text-gray-5">Signature:</span>{" "}
                    {verification.cryptosuite}
                  </li>
                  <li className="break-all">
                    <span className="font-medium text-gray-5">
                      Verification method:
                    </span>{" "}
                    {verification.verificationMethod}
                  </li>
                  {verification.signedAt && (
                    <li>
                      <span className="font-medium text-gray-5">Signed:</span>{" "}
                      {new Date(verification.signedAt).toLocaleString()}
                    </li>
                  )}
                </ul>
              ) : (
                <p>{verification.reason}</p>
              )}
            </div>
          </details>
        )}

        {isSigned ? (
          <div className="flex w-full flex-col items-center gap-5">
            <div className="flex flex-wrap items-center justify-center gap-4">
              {hasImage && (
                <a
                  className="btn flex items-center gap-2"
                  href={`/api/awards/${params.docId}/badge`}
                  download={`${credential.name}.png`}
                >
                  <Icon name="download" />
                  Download Badge
                </a>
              )}
              <a
                href={linkedInAddToProfileUrl({
                  name: credential.name,
                  organizationName: issuerName,
                  issueDate: awardedDate,
                  certUrl: credential.id,
                  certId: params.docId,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-3xl px-5 py-3 font-bold text-neutral-1 transition"
                style={{ backgroundColor: "#0A66C2" }}
              >
                <LinkedInIcon />
                Add to LinkedIn
              </a>
              <ShareButton
                url={credential.id}
                title={`${credential.name} — ${issuerName}`}
              />
            </div>
            <a
              className="flex items-center gap-1 text-sm text-gray-4 underline"
              href={`/api/awards/${params.docId}`}
              download={`${credential.name}.json`}
            >
              <Icon name="copy" />
              Download Credential (JSON-LD)
            </a>
          </div>
        ) : (
          <p className="text-gray-5">
            This credential is still being signed. Refresh this page in a
            moment.
          </p>
        )}

        {hasImage && (
          <p className="text-sm text-gray-4">
            Your badge image has the verifiable credential embedded in it
            (&ldquo;baked in&rdquo;), so it stays independently verifiable
            even if you share just the image file.
          </p>
        )}
      </main>
    );
  } catch (cause) {
    if (isTRPCClientError(cause)) {
      if (cause.message === "Record not found") return notFound();

      throw cause;
    }

    throw cause;
  }
}
