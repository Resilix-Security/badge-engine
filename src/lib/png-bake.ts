import "server-only";

/**
 * Open Badges "baking": embeds the credential JSON directly inside a PNG file
 * as an iTXt text chunk (keyword "openbadgecredential"), so the image itself
 * is a self-contained, portable, independently verifiable credential.
 *
 * @link https://www.imsglobal.org/spec/ob/v3p0/baking (PNG baking, keyword "openbadgecredential")
 */

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const OPENBADGES_KEYWORD = "openbadgecredential";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/**
 * Inserts an "openbadgecredential" iTXt chunk (uncompressed, UTF-8) containing
 * `json` right after the PNG's IHDR chunk. Returns a new buffer — the input
 * is not mutated.
 */
export function bakeOpenBadgesPng(png: Buffer, json: string): Buffer {
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Not a valid PNG file");
  }

  const itxtData = Buffer.concat([
    Buffer.from(OPENBADGES_KEYWORD, "ascii"),
    Buffer.from([0]), // null separator after keyword
    Buffer.from([0]), // compression flag: 0 = uncompressed
    Buffer.from([0]), // compression method (unused when flag is 0)
    Buffer.from([0]), // empty language tag, null-terminated
    Buffer.from([0]), // empty translated keyword, null-terminated
    Buffer.from(json, "utf-8"),
  ]);
  const itxtChunk = buildChunk("iTXt", itxtData);

  let offset = 8;
  while (offset < png.length) {
    const len = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const chunkEnd = offset + 12 + len; // length(4) + type(4) + data(len) + crc(4)

    if (type === "IHDR") {
      return Buffer.concat([
        png.subarray(0, chunkEnd),
        itxtChunk,
        png.subarray(chunkEnd),
      ]);
    }

    offset = chunkEnd;
  }

  throw new Error("IHDR chunk not found — malformed PNG");
}
