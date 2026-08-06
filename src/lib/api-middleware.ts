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

const verifyToken = (token: string): Promise<jwt.JwtPayload | string> => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, {}, (err, decoded) => {
      if (err) {
        return reject(err);
      }

      resolve(decoded as jwt.JwtPayload);
    });
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
