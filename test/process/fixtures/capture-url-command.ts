import { runCaptureUrlCommand } from "../../../src/capture-url.js";
import type { ScreenshotScoutSdkClient } from "../../../src/sdk.js";

const returnedUrl = requiredEnvironment("CLI_TEST_CAPTURE_URL");
let buildCaptureUrlCalls = 0;
let captureCalls = 0;

const client: ScreenshotScoutSdkClient = {
  capture() {
    captureCalls += 1;
    throw new Error("capture must not be called by capture-url.");
  },
  buildCaptureUrl() {
    buildCaptureUrlCalls += 1;
    return returnedUrl;
  },
};

await runCaptureUrlCommand(process.argv.slice(2), { client });

if (buildCaptureUrlCalls !== 1) {
  throw new Error(
    `Expected one buildCaptureUrl call, received ${buildCaptureUrlCalls}.`,
  );
}
if (captureCalls !== 0) {
  throw new Error(`Expected no capture calls, received ${captureCalls}.`);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Missing fixture environment '${name}'.`);
  }
  return value;
}
