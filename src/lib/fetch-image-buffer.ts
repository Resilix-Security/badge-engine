import "server-only";
import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 10_000;

// Loopback, private, link-local (incl. cloud metadata), CGNAT, multicast and
// other non-routable ranges. Image URLs are user-influenced data, so the
// server must never be steered into its own network.
const blockedRanges = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedRanges.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  // BlockList already matches IPv4-mapped addresses (::ffff:a.b.c.d) against
  // the IPv4 rules; NAT64 isn't covered by that, so block it explicitly.
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockedRanges.addSubnet(net, prefix, "ipv6");
}

const isPublicAddress = (address: string): boolean => {
  const family = isIP(address);
  if (family === 0) return false;
  return !blockedRanges.check(address, family === 4 ? "ipv4" : "ipv6");
};

// Validates the resolved address at connect time, so DNS rebinding and
// redirects to internal hosts are caught too.
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);

    const blocked = addresses.find((a) => !isPublicAddress(a.address));
    if (blocked !== undefined || addresses.length === 0) {
      return callback(
        new Error(`Refusing to fetch image from non-public host: ${hostname}`),
        "",
        0,
      );
    }

    if (options.all) return callback(null, addresses);
    callback(null, addresses[0]!.address, addresses[0]!.family);
  });
};

const fetchRemote = (url: URL, redirectsLeft: number): Promise<Buffer> => {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return Promise.reject(new Error(`Unsupported image URL: ${url.href}`));
  }

  // Node skips the lookup hook for IP literals, so check those directly.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host)) {
    return Promise.reject(
      new Error(`Refusing to fetch image from non-public host: ${host}`),
    );
  }

  const client = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.get(
      url,
      {
        lookup: publicOnlyLookup,
        timeout: TIMEOUT_MS,
        // Raw bytes go straight to sharp; never ask for compressed bodies.
        headers: { "accept-encoding": "identity" },
      },
      (res) => {
        const status = res.statusCode ?? 0;

        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft === 0) {
            return reject(new Error(`Too many redirects: ${url.href}`));
          }
          return resolve(
            fetchRemote(new URL(res.headers.location, url), redirectsLeft - 1),
          );
        }

        if (status < 200 || status >= 300) {
          res.resume();
          return reject(
            new Error(`Failed to fetch image (${status}): ${url.href}`),
          );
        }

        const chunks: Buffer[] = [];
        let received = 0;
        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_IMAGE_BYTES) {
            req.destroy(new Error(`Image exceeds size limit: ${url.href}`));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      },
    );

    req.on("timeout", () =>
      req.destroy(new Error(`Timed out fetching image: ${url.href}`)),
    );
    req.on("error", reject);
  });
};

/**
 * Resolves an Image.id value — a data URI or a remote URL, per the Open
 * Badges spec — to raw image bytes. Remote URLs are only fetched from public
 * hosts, with a size limit and timeout.
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

  return fetchRemote(new URL(idOrDataUri), MAX_REDIRECTS);
}
