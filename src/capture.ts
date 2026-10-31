import { CliUsageError } from "./cli-usage-error.js";
import type { CaptureOptionsInputReader } from "./input.js";
import { parseCaptureCommandInput } from "./input.js";
import type { CaptureResultIo } from "./result.js";
import { writeCaptureResult } from "./result.js";
import {
  captureWithScreenshotScoutClient,
  createScreenshotScoutClient,
  isSecretKeyConfigured,
  type ScreenshotScoutSdkClient,
} from "./sdk.js";

export interface CaptureCommandDependencies {
  readonly client?: ScreenshotScoutSdkClient;
  /** Whether an injected client has a secret key; without one, the environment decides, as for the client. */
  readonly secretKeyConfigured?: boolean;
  readonly inputReader?: CaptureOptionsInputReader;
  readonly resultIo?: CaptureResultIo;
}

const SIGNED_POST_MESSAGE =
  "SCREENSHOTSCOUT_SECRET_KEY is set, and POST requests can't be signed. Add --method get, or unset SCREENSHOTSCOUT_SECRET_KEY to send an unsigned POST request.";

/** Run one capture command as a direct input -> SDK -> result adapter. */
export async function runCaptureCommand(
  args: readonly string[],
  dependencies: CaptureCommandDependencies = {},
): Promise<void> {
  const input =
    dependencies.inputReader === undefined
      ? await parseCaptureCommandInput(args)
      : await parseCaptureCommandInput(args, dependencies.inputReader);
  const secretKeyConfigured =
    dependencies.client === undefined
      ? isSecretKeyConfigured()
      : dependencies.secretKeyConfigured === true;
  // Only GET requests can be signed, and an omitted --method means POST
  if (secretKeyConfigured && input.method !== "get") {
    throw new CliUsageError(SIGNED_POST_MESSAGE);
  }
  const client = dependencies.client ?? createScreenshotScoutClient();
  const response = await captureWithScreenshotScoutClient(
    client,
    input.targetUrl,
    input.captureOptions,
    input.method,
  );

  if (dependencies.resultIo === undefined) {
    await writeCaptureResult(response, input.outputPath);
  } else {
    await writeCaptureResult(response, input.outputPath, dependencies.resultIo);
  }
}
