import {
  ScreenshotScoutConfigurationError,
  type CaptureOptions,
  type CaptureResponse,
} from "@screenshotscout/sdk";

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

const UNSET_SECRET_KEY_FOR_HTML =
  "Unset SCREENSHOTSCOUT_SECRET_KEY to send HTML.";

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
  const response =
    input.html === undefined
      ? await captureWithScreenshotScoutClient(
          client,
          input.targetUrl,
          input.captureOptions,
          input.method,
        )
      : await captureHtml(client, input.html, input.captureOptions);

  if (dependencies.resultIo === undefined) {
    await writeCaptureResult(response, input.outputPath);
  } else {
    await writeCaptureResult(response, input.outputPath, dependencies.resultIo);
  }
}

/** Capture the --html document, explaining the SDK's refusal of a secret key. Other failures propagate unchanged. */
async function captureHtml(
  client: ScreenshotScoutSdkClient,
  html: string,
  captureOptions: CaptureOptions,
): Promise<CaptureResponse> {
  try {
    return await client.captureFromHtml(html, captureOptions);
  } catch (error) {
    // The client has a secret key from the environment, so the SDK refuses to send HTML.
    if (error instanceof ScreenshotScoutConfigurationError) {
      throw new Error(`${error.message}\n${UNSET_SECRET_KEY_FOR_HTML}`, {
        cause: error,
      });
    }
    throw error;
  }
}
