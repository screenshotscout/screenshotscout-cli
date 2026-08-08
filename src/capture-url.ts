import type { CaptureOptionsInputReader } from "./input.js";
import { parseCaptureUrlCommandInput } from "./input.js";
import {
  createScreenshotScoutClient,
  type ScreenshotScoutSdkClient,
} from "./sdk.js";

export interface CaptureUrlCommandDependencies {
  readonly client?: ScreenshotScoutSdkClient;
  readonly inputReader?: CaptureOptionsInputReader;
  readonly writeStandardOutput?: (text: string) => Promise<void>;
}

/** Run one capture-url command as a direct input -> SDK -> output adapter. */
export async function runCaptureUrlCommand(
  args: readonly string[],
  dependencies: CaptureUrlCommandDependencies = {},
): Promise<void> {
  const input =
    dependencies.inputReader === undefined
      ? await parseCaptureUrlCommandInput(args)
      : await parseCaptureUrlCommandInput(args, dependencies.inputReader);
  const client = dependencies.client ?? createScreenshotScoutClient();
  const captureUrl = client.buildCaptureUrl(
    input.targetUrl,
    input.captureOptions,
  );

  await (dependencies.writeStandardOutput ?? writeStandardOutput)(
    `${captureUrl}\n`,
  );
}

function writeStandardOutput(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdout.write(text, (error) => {
      if (error === null || error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}
