import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import type { NextRequest } from "next/server";
import { env } from "~/env.mjs";

const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/discovery/v2.0/keys`,
});

const getKey = (header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) => {
  client.getSigningKey(header.kid, (err, key) => {
    const signingKey = key?.getPublicKey();
    callback(err, signingKey);
  });
};

// Entra ID signs tokens for every tenant with the same keys, so a valid
// signature alone doesn't prove the token was issued by our tenant for this
// app. Pin the issuer (v1 and v2 token formats) and the audience as well.
const issuers: [string, ...string[]] = [
  `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/v2.0`,
  `https://sts.windows.net/${env.AZURE_AD_TENANT_ID}/`,
];

const audiences: [string, ...string[]] = [
  env.AZURE_AD_CLIENT_ID,
  `api://${env.AZURE_AD_CLIENT_ID}`,
  ...(env.API_AUDIENCE?.split(",")
    .map((a) => a.trim())
    .filter(Boolean) ?? []),
];

const verifyToken = (token: string): Promise<jwt.JwtPayload | string> => {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      { algorithms: ["RS256"], issuer: issuers, audience: audiences },
      (err, decoded) => {
        if (err) {
          return reject(err);
        }

        resolve(decoded as jwt.JwtPayload);
      },
    );
  });
};

export const isAuthorized = async (req: NextRequest | Headers) => {
  const headers = req instanceof Headers ? req : req.headers
  const accessToken = headers.get("authorization")?.split(" ").at(1);

  if (undefined === accessToken) return false;

  try {
    const verify = await verifyToken(accessToken);

    return verify;
  } catch (_error) {
    return false;
  }
};
