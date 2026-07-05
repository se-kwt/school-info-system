import { verifySessionToken, type SessionClaims } from "./jwt";

export class AuthError extends Error {
  status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
  }
}

export function requireRole(
  authHeader: string | null,
  allowedRoles: SessionClaims["role"][]
): SessionClaims {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError(401, "Missing or malformed Authorization header");
  }

  const token = authHeader.slice("Bearer ".length);

  let claims: SessionClaims;
  try {
    claims = verifySessionToken(token);
  } catch {
    throw new AuthError(401, "Invalid or expired token");
  }

  if (!allowedRoles.includes(claims.role)) {
    throw new AuthError(403, "Role not permitted for this resource");
  }

  return claims;
}
