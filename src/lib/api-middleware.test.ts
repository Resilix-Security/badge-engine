/**
 * @jest-environment node
 */
import { generateKeyPairSync } from "crypto";
import jwt from "jsonwebtoken";
import { isAuthorized } from "~/lib/api-middleware";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CLIENT_ID = "22222222-2222-2222-2222-222222222222";

jest.mock("~/env.mjs", () => ({
  env: {
    AZURE_AD_TENANT_ID: "11111111-1111-1111-1111-111111111111",
    AZURE_AD_CLIENT_ID: "22222222-2222-2222-2222-222222222222",
    API_AUDIENCE: "https://badges.example.org",
  },
}));

jest.mock("jwks-rsa", () => ({
  __esModule: true,
  default: () => ({
    getSigningKey: (
      _kid: string,
      cb: (err: Error | null, key: { getPublicKey: () => string }) => void,
    ) => cb(null, { getPublicKey: () => mockKeys.publicKey }),
  }),
}));

const mockKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const sign = (claims: object) =>
  jwt.sign(claims, mockKeys.privateKey, {
    algorithm: "RS256",
    keyid: "test",
    expiresIn: "5m",
  });

const bearer = (token: string) =>
  new Headers({ authorization: `Bearer ${token}` });

describe("isAuthorized", () => {
  it("accepts a v2 token from our tenant for our app", async () => {
    const token = sign({
      iss: `https://login.microsoftonline.com/${TENANT}/v2.0`,
      aud: CLIENT_ID,
    });
    expect(await isAuthorized(bearer(token))).toBeTruthy();
  });

  it("accepts a v1 token with the api:// audience", async () => {
    const token = sign({
      iss: `https://sts.windows.net/${TENANT}/`,
      aud: `api://${CLIENT_ID}`,
    });
    expect(await isAuthorized(bearer(token))).toBeTruthy();
  });

  it("accepts an audience configured through API_AUDIENCE", async () => {
    const token = sign({
      iss: `https://login.microsoftonline.com/${TENANT}/v2.0`,
      aud: "https://badges.example.org",
    });
    expect(await isAuthorized(bearer(token))).toBeTruthy();
  });

  it("rejects a token issued by another tenant", async () => {
    const token = sign({
      iss: "https://login.microsoftonline.com/33333333-3333-3333-3333-333333333333/v2.0",
      aud: CLIENT_ID,
    });
    expect(await isAuthorized(bearer(token))).toBe(false);
  });

  it("rejects a token for another app", async () => {
    const token = sign({
      iss: `https://login.microsoftonline.com/${TENANT}/v2.0`,
      aud: "44444444-4444-4444-4444-444444444444",
    });
    expect(await isAuthorized(bearer(token))).toBe(false);
  });

  it("rejects a token without issuer or audience", async () => {
    expect(await isAuthorized(bearer(sign({ sub: "x" })))).toBe(false);
  });

  it("rejects a missing authorization header", async () => {
    expect(await isAuthorized(new Headers())).toBe(false);
  });
});
