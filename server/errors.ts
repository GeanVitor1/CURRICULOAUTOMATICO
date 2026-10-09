/** A deliberate, safe message for a rejected user request. */
export class RequestError extends Error {
  readonly statusCode = 400;
}

export class DailyLimitError extends RequestError {
  constructor() {
    super("Limite diário atingido.");
  }
}

/** A recovered task belongs to another worker; the stale worker must not publish. */
export class StaleDiscoveryClaimError extends RequestError {
  constructor() {
    super("Execução substituída; resultados não foram publicados.");
  }
}
