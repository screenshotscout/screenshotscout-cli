import assert from "node:assert/strict";
import test from "node:test";

import {
  CaptureHttpMethod,
  ScreenshotScoutConfigurationError,
  type BinaryCaptureResponse,
  type CaptureOptions,
  type CaptureRequestOptions,
  type ScreenshotScoutClientOptions,
} from "@screenshotscout/sdk";

import {
  captureWithScreenshotScoutClient,
  createScreenshotScoutClient,
  type ScreenshotScoutClientFactory,
  type ScreenshotScoutSdkClient,
} from "../../src/sdk.js";

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

void test("constructs the SDK client with exact environment credential values", () => {
  const client = createRecordingClient().client;
  const constructorCalls: ScreenshotScoutClientOptions[] = [];
  const clientFactory: ScreenshotScoutClientFactory = (options) => {
    constructorCalls.push(options);
    return client;
  };

  const created = createScreenshotScoutClient(
    {
      SCREENSHOTSCOUT_ACCESS_KEY: "placeholder-access-key+/=",
      SCREENSHOTSCOUT_SECRET_KEY: " placeholder secret retained unchanged ",
    },
    clientFactory,
  );

  assert.equal(created, client);
  assert.deepEqual(constructorCalls, [
    {
      accessKey: "placeholder-access-key+/=",
      secretKey: " placeholder secret retained unchanged ",
    },
  ]);
});

void test("omits an absent optional secret and leaves access-key validation to the SDK", () => {
  const client = createRecordingClient().client;
  const constructorCalls: ScreenshotScoutClientOptions[] = [];
  const clientFactory: ScreenshotScoutClientFactory = (options) => {
    constructorCalls.push(options);
    return client;
  };

  createScreenshotScoutClient(
    { SCREENSHOTSCOUT_ACCESS_KEY: "placeholder-access-key" },
    clientFactory,
  );
  createScreenshotScoutClient({}, clientFactory);

  assert.deepEqual(constructorCalls, [
    { accessKey: "placeholder-access-key" },
    { accessKey: undefined },
  ]);
  assert.equal(Object.hasOwn(constructorCalls[0] ?? {}, "secretKey"), false);
  assert.throws(
    () => createScreenshotScoutClient({}),
    ScreenshotScoutConfigurationError,
  );
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
