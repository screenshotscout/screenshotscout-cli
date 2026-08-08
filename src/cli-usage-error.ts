/** A locally detected command syntax or input-shape failure. */
export class CliUsageError extends Error {
  readonly exitCode = 2 as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CliUsageError";
  }
}
