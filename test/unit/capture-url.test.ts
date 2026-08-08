import assert from "node:assert/strict";
import test from "node:test";

import {
  ScreenshotScoutClient,
  type CaptureOptions,
} from "@screenshotscout/sdk";

import { runCaptureUrlCommand } from "../../src/capture-url.js";
import { CliUsageError } from "../../src/cli-usage-error.js";
import type { CaptureOptionsInputReader } from "../../src/input.js";
import type { ScreenshotScoutSdkClient } from "../../src/sdk.js";

type RecordedBuildCaptureUrlCall = readonly [
  targetUrl: string,
  captureOptions?: CaptureOptions | null,
];

const UNEXPECTED_READER: CaptureOptionsInputReader = {
  readFile: (path) =>
    Promise.reject(new Error(`Unexpected options-file read: ${path}`)),
  readStdin: () => Promise.reject(new Error("Unexpected standard-input read")),
};

void test("passes the exact URL and merged options to one SDK call and writes its exact result", async () => {
  const returnedUrl =
    "https://api.screenshotscout.com/v1/capture?access_key=visible%2Fplaceholder&url=unchanged&signature=a%2Bb%3D";
  const recordingClient = createRecordingClient(returnedUrl);
  const standardOutput: string[] = [];
  let readPath: string | undefined;
  const inputReader: CaptureOptionsInputReader = {
    readFile: (path) => {
      readPath = path;
      return Promise.resolve(
        JSON.stringify({
          format: "jpeg",
          delay: 10,
          full_page: true,
          headers: ["file: first", "file: second"],
          cache_key: "retained-from-file",
        }),
      );
    },
    readStdin: () =>
      Promise.reject(new Error("Unexpected standard-input read")),
  };

  await runCaptureUrlCommand(
    [
      " unmodified target?x=1&y=2 ",
      "--options",
      "capture-options.json",
      "--format=unvalidated-format",
      "--delay",
      "0",
      "--full-page=false",
      "--headers=flag: only",
    ],
    {
      client: recordingClient.client,
      inputReader,
      writeStandardOutput: (text) => {
        standardOutput.push(text);
        return Promise.resolve();
      },
    },
  );

  assert.equal(readPath, "capture-options.json");
  assert.deepEqual(recordingClient.buildCaptureUrlCalls, [
    [
      " unmodified target?x=1&y=2 ",
      {
        format: "unvalidated-format",
        delay: 0,
        fullPage: false,
        headers: ["flag: only"],
        cacheKey: "retained-from-file",
      },
    ],
  ]);
  assert.equal(recordingClient.captureCalls, 0);
  assert.deepEqual(standardOutput, [`${returnedUrl}\n`]);
});

void test("uses the official SDK locally without calling its transport", async () => {
  let transportCalls = 0;
  const officialClient = new ScreenshotScoutClient({
    accessKey: "placeholder-access-key",
    fetch: () => {
      transportCalls += 1;
      return Promise.reject(new Error("Unexpected SDK transport call"));
    },
  });
  let buildCaptureUrlCalls = 0;
  const client: ScreenshotScoutSdkClient = {
    capture() {
      throw new Error("capture must not be called by capture-url.");
    },
    buildCaptureUrl(targetUrl, captureOptions) {
      buildCaptureUrlCalls += 1;
      return officialClient.buildCaptureUrl(targetUrl, captureOptions);
    },
  };
  const standardOutput: string[] = [];

  await runCaptureUrlCommand(
    ["https://example.com/a path", "--delay=0", "--full-page=false"],
    {
      client,
      inputReader: UNEXPECTED_READER,
      writeStandardOutput: (text) => {
        standardOutput.push(text);
        return Promise.resolve();
      },
    },
  );

  assert.equal(buildCaptureUrlCalls, 1);
  assert.equal(transportCalls, 0);
  assert.deepEqual(standardOutput, [
    "https://api.screenshotscout.com/v1/capture?access_key=placeholder-access-key&url=https%3A%2F%2Fexample.com%2Fa+path&delay=0&full_page=false\n",
  ]);
});

void test("rejects invalid command shape and capture-only controls before an SDK call", async () => {
  const cases = [
    [],
    ["one", "two"],
    ["target", "--method=get"],
    ["target", "--output", "result.png"],
    ["target", "-o", "result.png"],
  ] as const;

  for (const args of cases) {
    const recordingClient = createRecordingClient("unused");
    const standardOutput: string[] = [];

    await assert.rejects(
      runCaptureUrlCommand(args, {
        client: recordingClient.client,
        inputReader: UNEXPECTED_READER,
        writeStandardOutput: (text) => {
          standardOutput.push(text);
          return Promise.resolve();
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof CliUsageError);
        assert.equal(error.exitCode, 2);
        return true;
      },
    );
    assert.equal(recordingClient.buildCaptureUrlCalls.length, 0);
    assert.equal(recordingClient.captureCalls, 0);
    assert.deepEqual(standardOutput, []);
  }
});

void test("propagates an SDK failure unchanged and writes nothing", async () => {
  const failure = new Error("unchanged SDK serialization failure");
  let buildCaptureUrlCalls = 0;
  const client: ScreenshotScoutSdkClient = {
    capture() {
      throw new Error("capture must not be called by capture-url.");
    },
    buildCaptureUrl() {
      buildCaptureUrlCalls += 1;
      throw failure;
    },
  };
  const standardOutput: string[] = [];

  await assert.rejects(
    runCaptureUrlCommand(["target"], {
      client,
      inputReader: UNEXPECTED_READER,
      writeStandardOutput: (text) => {
        standardOutput.push(text);
        return Promise.resolve();
      },
    }),
    (error: unknown) => error === failure,
  );

  assert.equal(buildCaptureUrlCalls, 1);
  assert.deepEqual(standardOutput, []);
});

function createRecordingClient(returnedUrl: string): {
  readonly buildCaptureUrlCalls: RecordedBuildCaptureUrlCall[];
  readonly captureCalls: number;
  readonly client: ScreenshotScoutSdkClient;
} {
  const buildCaptureUrlCalls: RecordedBuildCaptureUrlCall[] = [];
  let captureCalls = 0;
  const client: ScreenshotScoutSdkClient = {
    capture() {
      captureCalls += 1;
      throw new Error("capture must not be called by capture-url.");
    },
    buildCaptureUrl(...args: RecordedBuildCaptureUrlCall) {
      buildCaptureUrlCalls.push(args);
      return returnedUrl;
    },
  };

  return {
    buildCaptureUrlCalls,
    get captureCalls() {
      return captureCalls;
    },
    client,
  };
}
