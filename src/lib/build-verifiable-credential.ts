import "server-only";
import type { Prisma } from "@prisma/client";
import { createVerifiableAchievementCredentialSchema } from "~/server/api/schemas/open-badges/credential.schema";
import { type protectedAchievementCredentialInclude } from "~/server/db/queries";

export type FullAchievementCredential = Prisma.AchievementCredentialGetPayload<{
  include: typeof protectedAchievementCredentialInclude;
}>;

/**
 * Normalizes a full Prisma AchievementCredential record into the spec-shaped
 * Verifiable Credential JSON it represents (context defaulted, type prefixed
 * with "VerifiableCredential", proof serialized). Shared by every endpoint
 * that hands the credential to someone outside the app — JSON download, baked
 * badge image, etc.
 */
export function buildVerifiableCredentialJson(
  credential: FullAchievementCredential,
) {
  const { context, proof, ...rest } = credential;

  const parsed = createVerifiableAchievementCredentialSchema.parse({
    context: context.length >= 2 ? context : undefined,
    ...rest,
    type: ["VerifiableCredential", ...rest.type],
  });

  const { docId: _docId, context: finalContext, ...verifiableCredential } =
    parsed;

  // JSON-LD requires the literal key "@context" — "context" (what Prisma's
  // field is called, since Mongo/Prisma field names can't start with "@") is
  // not a recognized term and silently breaks independent re-verification of
  // the exported document: a verifier hashing "context" instead of
  // "@context" gets a different canonicalized RDF graph than what was
  // actually signed, and the signature won't validate.
  return {
    "@context": finalContext,
    ...verifiableCredential,
    proof: proof.map((p) => ({
      type: p.type,
      cryptosuite: p.cryptosuite,
      created: p.created?.toISOString(),
      verificationMethod: p.verificationMethod,
      proofPurpose: p.proofPurpose,
      proofValue: p.proofValue,
    })),
  };
}
