import { NextResponse, type NextRequest } from "next/server";
import { api } from "~/trpc/server";
import { buildVerifiableCredentialJson } from "~/lib/build-verifiable-credential";

const toSafeFilename = (name: string) =>
  (name.replace(/[^a-zA-Z0-9-_. ]/g, "_").trim() || "credential") + ".json";

const GET = async function GET(
  _req: NextRequest,
  { params: { docId } }: { params: { docId: string } },
) {
  try {
    const credential = await api.award.findPublic.query(docId);

    if (credential.proof.length === 0) {
      return NextResponse.json(
        { error: "Credential has not been signed yet" },
        { status: 404 },
      );
    }

    return NextResponse.json(buildVerifiableCredentialJson(credential), {
      headers: {
        "Content-Type": "application/ld+json",
        "Content-Disposition": `attachment; filename="${toSafeFilename(credential.name)}"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 404 },
    );
  }
};

export { GET };
