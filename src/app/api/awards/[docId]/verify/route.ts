import { NextResponse, type NextRequest } from "next/server";
import { api } from "~/trpc/server";
import { buildVerifiableCredentialJson } from "~/lib/build-verifiable-credential";
import { verifyCredential } from "~/lib/verify-credential";

const GET = async function GET(
  _req: NextRequest,
  { params: { docId } }: { params: { docId: string } },
) {
  try {
    const credential = await api.award.findPublic.query(docId);

    if (credential.proof.length === 0) {
      return NextResponse.json(
        { valid: false, reason: "Credential has not been signed yet" },
        { status: 404 },
      );
    }

    const verifiableCredential = buildVerifiableCredentialJson(credential);
    const result = await verifyCredential(verifiableCredential);

    return NextResponse.json(result, { status: result.valid ? 200 : 422 });
  } catch (e) {
    return NextResponse.json(
      { valid: false, reason: (e as Error).message },
      { status: 404 },
    );
  }
};

export { GET };
