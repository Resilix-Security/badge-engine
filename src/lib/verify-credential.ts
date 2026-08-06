import "server-only";
import jsonld from "jsonld";
import n3 from "n3";
import { RDFC10, type Quads, type InputQuads } from "rdfjs-c14n";
import { ed25519 as ed } from "@noble/curves/ed25519";
import { base58btc } from "multiformats/bases/base58";
import documentLoader from "~/lib/document-loader";

const rdfc10 = new RDFC10(n3.DataFactory);

const toQuads = async (input: object) =>
  jsonld.toRDF(input, {
    format: "application/n-quads",
    documentLoader,
  }) as unknown as InputQuads;

const normalize = async (input: InputQuads) =>
  (await rdfc10.c14n(input)).canonicalized_dataset;

const hash = async (input: Quads) => rdfc10.hash(input);

const transformAndHash = async (input: object) => {
  const quads = await toQuads(input);
  const normalizedQuads = await normalize(quads);
  return hash(normalizedQuads);
};

export type VerificationResult =
  | {
      valid: true;
      verificationMethod: string;
      cryptosuite: string;
      signedAt: string | undefined;
    }
  | { valid: false; reason: string };

/**
 * Independently re-verifies a signed credential's Data Integrity proof
 * (eddsa-rdfc-2022) the same way an external verifier would: using only the
 * document itself. The did:key in verificationMethod is self-certifying, so
 * no call back into badge-engine's own signing key is needed.
 */
export async function verifyCredential(
  credentialJson: Record<string, unknown>,
): Promise<VerificationResult> {
  const { proof: proofArray, ...credentialWithoutProof } = credentialJson;

  if (!Array.isArray(proofArray) || proofArray.length === 0) {
    return { valid: false, reason: "No proof present" };
  }

  const proof = proofArray[proofArray.length - 1] as Record<string, unknown>;
  const { proofValue, ...proofConfig } = proof;

  if (typeof proofValue !== "string") {
    return { valid: false, reason: "Proof has no proofValue" };
  }

  const verificationMethod = proof.verificationMethod;
  if (
    typeof verificationMethod !== "string" ||
    !verificationMethod.startsWith("did:key:")
  ) {
    return { valid: false, reason: "Unsupported verification method" };
  }

  try {
    const publicKeyMultibase = verificationMethod.replace("did:key:", "");
    const publicKey = base58btc.decode(publicKeyMultibase).slice(2, 34);
    const signature = base58btc.decode(proofValue);

    const proofConfigForHash = {
      ...proofConfig,
      "@context": (credentialWithoutProof as Record<string, unknown>)[
        "@context"
      ],
    };

    const proofHex = (
      await Promise.all(
        [proofConfigForHash, credentialWithoutProof].map((i) =>
          transformAndHash(i),
        ),
      )
    ).join("");

    if (!ed.verify(signature, proofHex, publicKey)) {
      return { valid: false, reason: "Signature does not match content" };
    }

    return {
      valid: true,
      verificationMethod,
      cryptosuite: String(proof.cryptosuite ?? ""),
      signedAt: typeof proof.created === "string" ? proof.created : undefined,
    };
  } catch (e) {
    return { valid: false, reason: (e as Error).message };
  }
}
