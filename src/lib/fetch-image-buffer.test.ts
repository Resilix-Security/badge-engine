/**
 * @jest-environment node
 */
import { fetchImageBuffer } from "~/lib/fetch-image-buffer";

describe("fetchImageBuffer", () => {
  it("decodes base64 data URIs", async () => {
    const buffer = await fetchImageBuffer("data:image/png;base64,aGVsbG8=");
    expect(buffer.toString()).toBe("hello");
  });

  it("decodes plain data URIs", async () => {
    const buffer = await fetchImageBuffer("data:image/svg+xml,%3Csvg%2F%3E");
    expect(buffer.toString()).toBe("<svg/>");
  });

  it.each([
    "http://127.0.0.1/image.png",
    "http://169.254.169.254/metadata/identity/oauth2/token",
    "http://10.0.0.5/image.png",
    "http://192.168.1.1/image.png",
    "http://[::1]/image.png",
    "http://[::ffff:127.0.0.1]/image.png",
    "http://localhost/image.png",
  ])("refuses internal host %s", async (url) => {
    await expect(fetchImageBuffer(url)).rejects.toThrow(/non-public host/);
  });

  it("refuses non-http protocols", async () => {
    await expect(fetchImageBuffer("file:///etc/passwd")).rejects.toThrow(
      /Unsupported image URL/,
    );
  });
});
