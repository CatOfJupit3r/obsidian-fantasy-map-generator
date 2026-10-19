/** Thrown when the frame did not answer in time; the frame may still be busy or may have stopped. */
export class BridgeTimeoutError extends Error {
  public constructor(what: string, timeoutMs: number) {
    super(`${what} got no answer within ${Math.round(timeoutMs / 1000)} s.`);
    this.name = 'BridgeTimeoutError';
  }
}
