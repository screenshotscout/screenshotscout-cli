import assert from "node:assert/strict";
import test from "node:test";

import {
  CaptureHttpMethod,
  type BinaryCaptureResponse,
  type CaptureOptions,
  type CaptureRequestOptions,
} from "@screenshotscout/sdk";

import {
  captureWithScreenshotScoutClient,
  createScreenshotScoutClient,
  type ScreenshotScoutSdkClient,
} from "../../src/sdk.js";

// Keys set in the developer's own environment must not reach these tests.
delete process.env.SCREENSHOTSCOUT_ACCESS_KEY;
delete process.env.SCREENSHOTSCOUT_SECRET_KEY;

type RecordedCaptureCall = readonly [
  targetUrl: string,
  captureOptions?: CaptureOptions | null,
  captureRequestOptions?: CaptureRequestOptions | null,
];

const RESPONSE_BYTES = Uint8Array.of(1, 2, 3);
const CAPTURE_RESPONSE: BinaryCaptureResponse = {
  kind: "binary",
  bytes: RESPONSE_BYTES,
  rawResponse: {
    status: 200,
    statusText: "OK",
    headers: new Map(),
    contentType: "image/png",
    body: RESPONSE_BYTES,
  },
};

void test("constructs the client with the injected factory", () => {
  const client = createRecordingClient().client;

  assert.equal(
    createScreenshotScoutClient(() => client),
    client,
  );
});

void test("the default client takes both keys from the environment", () => {
  process.env.SCREENSHOTSCOUT_ACCESS_KEY = "placeholder-access-key";
  process.env.SCREENSHOTSCOUT_SECRET_KEY = "placeholder-secret-key";
  try {
    const captureUrl = new URL(
      createScreenshotScoutClient().buildCaptureUrl("https://example.com"),
    );

    assert.equal(
      captureUrl.searchParams.get("access_key"),
      "placeholder-access-key",
    );
    assert.equal(captureUrl.searchParams.has("signature"), true);
  } finally {
    delete process.env.SCREENSHOTSCOUT_ACCESS_KEY;
    delete process.env.SCREENSHOTSCOUT_SECRET_KEY;
  }
});

void test("the default client names the variable when the access key is missing", () => {
  assert.throws(() => createScreenshotScoutClient(), {
    name: "ScreenshotScoutConfigurationError",
    message:
      "A non-blank Screenshot Scout access key is required. Pass one, or set SCREENSHOTSCOUT_ACCESS_KEY.",
  });
});

void test("passes no capture request options when method is omitted", async () => {
  const recording = createRecordingClient();
  const captureOptions: CaptureOptions = { fullPage: false };

  const response = await captureWithScreenshotScoutClient(
    recording.client,
    "unmodified target",
    captureOptions,
    undefined,
  );

  assert.equal(response, CAPTURE_RESPONSE);
  assert.equal(recording.calls.length, 1);
  assert.equal(recording.calls[0]?.length, 2);
  assert.equal(recording.calls[0]?.[0], "unmodified target");
  assert.equal(recording.calls[0]?.[1], captureOptions);
});

void test("maps explicit lowercase get and post to the SDK request option", async () => {
  const cases = [
    ["get", CaptureHttpMethod.GET],
    ["post", CaptureHttpMethod.POST],
  ] as const;

  for (const [input, expected] of cases) {
    const recording = createRecordingClient();
    const captureOptions: CaptureOptions = { timeout: 0 };

    await captureWithScreenshotScoutClient(
      recording.client,
      "unmodified target",
      captureOptions,
      input,
    );

    assert.equal(recording.calls.length, 1);
    assert.deepEqual(recording.calls[0], [
      "unmodified target",
      captureOptions,
      { method: expected },
    ]);
  }
});

function createRecordingClient(): {
  readonly client: ScreenshotScoutSdkClient;
  readonly calls: RecordedCaptureCall[];
} {
  const calls: RecordedCaptureCall[] = [];
  const client: ScreenshotScoutSdkClient = {
    capture(...args: RecordedCaptureCall) {
      calls.push(args);
      return Promise.resolve(CAPTURE_RESPONSE);
    },
    buildCaptureUrl() {
      throw new Error("buildCaptureUrl should not be called in SDK tests.");
    },
  };

  return { client, calls };
}
