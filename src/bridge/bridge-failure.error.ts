/** Thrown when the frame answered with a failure, or the bridge closed before it answered. */
export class BridgeFailureError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'BridgeFailureError';
  }
}
