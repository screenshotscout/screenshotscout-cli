import type { CaptureOptionsInputReader } from "./input.js";
import { parseCaptureCommandInput } from "./input.js";
import type { CaptureResultIo } from "./result.js";
import { writeCaptureResult } from "./result.js";
import {
  captureWithScreenshotScoutClient,
  createScreenshotScoutClient,
  type ScreenshotScoutSdkClient,
} from "./sdk.js";

export interface CaptureCommandDependencies {
  readonly client?: ScreenshotScoutSdkClient;
  readonly inputReader?: CaptureOptionsInputReader;
  readonly resultIo?: CaptureResultIo;
}

/** Run one capture command as a direct input -> SDK -> result adapter. */
export async function runCaptureCommand(
  args: readonly string[],
  dependencies: CaptureCommandDependencies = {},
): Promise<void> {
  const input =
    dependencies.inputReader === undefined
      ? await parseCaptureCommandInput(args)
      : await parseCaptureCommandInput(args, dependencies.inputReader);
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
