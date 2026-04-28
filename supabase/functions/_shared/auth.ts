// Constant-time comparison for shared-secret tokens. Prevents timing-attack
// inference of the operator token.
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Verifies the X-Operator-Token header matches the OPERATOR_TOKEN secret.
// Returns null on success, an error Response on failure.
export function requireOperatorToken(req: Request): Response | null {
  const expected = Deno.env.get("OPERATOR_TOKEN");
  if (!expected) {
    return new Response(
      JSON.stringify({ error: "OPERATOR_TOKEN secret not configured" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
  const provided = req.headers.get("x-operator-token") ?? "";
  if (!constantTimeEquals(provided, expected)) {
    return new Response(
      JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }
  return null;
}
