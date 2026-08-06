import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { api } from "~/trpc/server";
import { buildVerifiableCredentialJson } from "~/lib/build-verifiable-credential";
import { fetchImageBuffer } from "~/lib/fetch-image-buffer";
import { bakeOpenBadgesPng } from "~/lib/png-bake";

const toSafeFilename = (name: string) =>
  (name.replace(/[^a-zA-Z0-9-_. ]/g, "_").trim() || "credential") + ".png";

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

    if (!credential.image?.id) {
      return NextResponse.json(
        { error: "This credential has no badge image" },
        { status: 404 },
      );
    }

    const verifiableCredential = buildVerifiableCredentialJson(credential);

    const sourceImage = await fetchImageBuffer(credential.image.id);
    // Normalize to PNG regardless of source format (JPEG, WebP, SVG, ...) —
    // PNG baking (iTXt) is the most broadly supported Open Badges baking
    // target.
    const pngImage = await sharp(sourceImage).png().toBuffer();
    const baked = bakeOpenBadgesPng(
      pngImage,
      JSON.stringify(verifiableCredential),
    );

    return new NextResponse(baked, {
      headers: {
        "Content-Type": "image/png",
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
