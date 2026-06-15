/**
 * Request context for tRPC procedures. PFM is single-user and PIN-gated at the
 * edge, so the actor is fixed; this is where request-scoped values (db handle,
 * actor identity) will live as the API grows.
 */
export interface Context {
  /** Who is acting — single-user PFM, but Actions audit by actor. */
  actor: string;
}

/** Build the context for an incoming request. */
export function createContext(): Context {
  return { actor: "bob" };
}
