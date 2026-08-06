import "server-only";

/**
 * Resolves an Image.id value — a data URI or a remote URL, per the Open
 * Badges spec — to raw image bytes.
 */
export async function fetchImageBuffer(idOrDataUri: string): Promise<Buffer> {
  if (idOrDataUri.startsWith("data:")) {
    const commaIndex = idOrDataUri.indexOf(",");
    if (commaIndex === -1) {
      throw new Error("Malformed data URI");
    }

    const meta = idOrDataUri.slice(5, commaIndex);
    const payload = idOrDataUri.slice(commaIndex + 1);

    return meta.includes("base64")
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf-8");
  }

  const response = await fetch(idOrDataUri);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch image (${response.status}): ${idOrDataUri}`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
}
