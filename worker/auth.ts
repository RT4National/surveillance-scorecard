export type Role = "editor" | "reviewer" | "publisher";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function decode(part: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    atob(part.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
}
export async function authenticate(
  request: Request,
  env: Pick<Env, "ACCESS_ISSUER" | "ACCESS_AUDIENCE" | "STAFF_ROLES">,
  fetcher: typeof fetch = fetch,
) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new HttpError(401, "Staff sign-in required");
  if (
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER) ||
    !env.ACCESS_AUDIENCE
  )
    throw new HttpError(503, "Staff authentication is not configured");
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || token.length > 16000) throw Error();
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    if (header.alg !== "RS256" || typeof header.kid !== "string") throw Error();
    const response = await fetcher(
      `${env.ACCESS_ISSUER}/cdn-cgi/access/certs`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) throw Error();
    const jwks = (await response.json()) as {
      keys: (JsonWebKey & { kid: string })[];
    };
    const jwk = jwks.keys.find((k) => k.kid === header.kid && k.kty === "RSA");
    if (!jwk) throw Error();
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    if (
      !(await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        decode(parts[2]),
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      ))
    )
      throw Error();
    const now = Date.now() / 1000;
    if (
      claims.iss !== env.ACCESS_ISSUER ||
      !Array.isArray(claims.aud) ||
      !claims.aud.includes(env.ACCESS_AUDIENCE) ||
      typeof claims.exp !== "number" ||
      claims.exp <= now ||
      typeof claims.iat !== "number" ||
      claims.iat > now + 30 ||
      (claims.nbf !== undefined && claims.nbf > now) ||
      typeof claims.email !== "string"
    )
      throw Error();
    const mapping = JSON.parse(env.STAFF_ROLES) as Record<string, Role>;
    const role = mapping[claims.email.toLowerCase()];
    if (!["editor", "reviewer", "publisher"].includes(role))
      throw new HttpError(403, "No staff role assigned");
    return { email: claims.email.toLowerCase() as string, role };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "Invalid staff identity");
  }
}
