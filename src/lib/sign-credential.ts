import "server-only";
import jsonld from "jsonld";
import n3 from "n3";
import { RDFC10, type Quads, type InputQuads } from "rdfjs-c14n";
import { ed25519 as ed } from "@noble/curves/ed25519";
import { base58btc } from "multiformats/bases/base58";
import documentLoader from "~/lib/document-loader";
import { getSigningKey } from "~/lib/get-signing-key";

export type ProofConfig = {
  type: "DataIntegrityProof";
  cryptosuite: "eddsa-rdfc-2022";
  created: string;
  verificationMethod: string;
  proofPurpose: "assertionMethod";
  "@context"?: string[];
};

export type Proof = ProofConfig & {
  proofValue: string;
};

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

/**
 * Produces an eddsa-rdfc-2022 Data Integrity proof for the given unsecured credential document.
 * Pure computation only — callers are responsible for persisting/attaching the result.
 *
 * @link https://www.w3.org/TR/vc-di-eddsa/#eddsa-rdfc-2022
 */
export async function computeProof(
  credentialWithoutProof: { "@context"?: string[] } & Record<string, unknown>,
): Promise<Proof> {
  const { publicKeyMultibase, secretKeyMultibase } = await (
    await getSigningKey()
  ).export({ publicKey: true, secretKey: true, seed: true });

  const sign = (hexString: string) => {
    const privateKey = base58btc.decode(secretKeyMultibase).slice(2, 34);
    return base58btc.encode(ed.sign(hexString, privateKey));
  };

  const verificationMethod = `did:key:${publicKeyMultibase}`;

  const proof: ProofConfig = {
    type: "DataIntegrityProof",
    cryptosuite: "eddsa-rdfc-2022",
    created: new Date().toISOString(),
    verificationMethod,
    proofPurpose: "assertionMethod",
    "@context": credentialWithoutProof["@context"],
  };

  const proofHex = (
    await Promise.all(
      [proof, credentialWithoutProof].map((i) => transformAndHash(i)),
    )
  ).join("");

  const proofValue = sign(proofHex);

  (proof as Proof).proofValue = proofValue;
  delete proof["@context"];

  return proof as Proof;
}
