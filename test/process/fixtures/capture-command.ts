import type {
  BinaryCaptureResponse,
  CaptureResponse,
  JsonCaptureResponse,
  RawResponse,
} from "@screenshotscout/sdk";

import { runCaptureCommand } from "../../../src/capture.js";
import type { ScreenshotScoutSdkClient } from "../../../src/sdk.js";

const bytes = Buffer.from(
  requiredEnvironment("CLI_TEST_RESPONSE_BASE64"),
  "base64",
);
const response = createResponse(
  requiredEnvironment("CLI_TEST_RESPONSE_KIND"),
  bytes,
  process.env.CLI_TEST_RESPONSE_CONTENT_TYPE,
);
let captureCalls = 0;

const client: ScreenshotScoutSdkClient = {
  capture() {
    captureCalls += 1;
    return Promise.resolve(response);
  },
  buildCaptureUrl() {
    throw new Error("buildCaptureUrl must not be called by capture.");
  },
};

await runCaptureCommand(process.argv.slice(2), { client });

if (captureCalls !== 1) {
  throw new Error(`Expected one capture call, received ${captureCalls}.`);
}

function createResponse(
  kind: string,
  responseBytes: Uint8Array,
  contentType: string | undefined,
): CaptureResponse {
  if (kind === "binary") {
    const response: BinaryCaptureResponse = {
      kind: "binary",
      bytes: responseBytes,
      rawResponse: rawResponse(responseBytes, contentType ?? null),
    };
    return response;
  }

  if (kind === "json") {
    const response: JsonCaptureResponse = {
      kind: "json",
      result: {
        screenshotUrl: "decoded value must not be serialized",
        additionalFields: { decoded: "value must not be serialized" },
      },
      rawResponse: rawResponse(
        responseBytes,
        contentType ?? "application/json",
      ),
    };
    return response;
  }

  throw new Error(`Unknown fixture response kind '${kind}'.`);
}

function rawResponse(
  body: Uint8Array,
  contentType: string | null,
): RawResponse {
  return {
    status: 200,
    statusText: "OK",
    headers: new Map(),
    contentType,
    body,
  };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Missing fixture environment '${name}'.`);
  }
  return value;
}
