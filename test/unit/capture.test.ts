import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CaptureHttpMethod,
  type BinaryCaptureResponse,
  type CaptureOptions,
  type CaptureRequestOptions,
  type CaptureResponse,
  type JsonCaptureResponse,
  type RawResponse,
} from "@screenshotscout/sdk";

import { runCaptureCommand } from "../../src/capture.js";
import { CliUsageError } from "../../src/cli-usage-error.js";
import type { CaptureOptionsInputReader } from "../../src/input.js";
import type { CaptureResultIo } from "../../src/result.js";
import type { ScreenshotScoutSdkClient } from "../../src/sdk.js";

type RecordedCaptureCall = readonly [
  targetUrl: string,
  captureOptions?: CaptureOptions | null,
  captureRequestOptions?: CaptureRequestOptions | null,
];

const UNEXPECTED_READER: CaptureOptionsInputReader = {
  readFile: (path) =>
    Promise.reject(new Error(`Unexpected options-file read: ${path}`)),
  readStdin: () => Promise.reject(new Error("Unexpected standard-input read")),
};

void test("passes the exact URL, merged options, and GET method to one SDK call", async () => {
  const returnedBytes = Uint8Array.of(0, 255, 1, 2);
  const recordingClient = createRecordingClient(
    binaryResponse(returnedBytes, "image/png"),
  );
  const recordingIo = createRecordingIo();
  let readPath: string | undefined;
  const inputReader: CaptureOptionsInputReader = {
    readFile: (path) => {
      readPath = path;
      return Promise.resolve(
        JSON.stringify({
          format: "jpeg",
          timeout: 10,
          full_page: true,
          headers: ["file: first", "file: second"],
          cache_key: "retained-from-file",
        }),
      );
    },
    readStdin: () =>
      Promise.reject(new Error("Unexpected standard-input read")),
  };

  await runCaptureCommand(
    [
      " unmodified target?x=1&y=2 ",
      "--options",
      "capture-options.json",
      "--format=unvalidated-format",
      "--timeout",
      "0",
      "--full-page=false",
      "--headers=flag: only",
      "--method",
      "get",
      "--output",
      "selected-output.any",
    ],
    {
      client: recordingClient.client,
      inputReader,
      resultIo: recordingIo.io,
    },
  );

  assert.equal(readPath, "capture-options.json");
  assert.deepEqual(recordingClient.calls, [
    [
      " unmodified target?x=1&y=2 ",
      {
        format: "unvalidated-format",
        timeout: 0,
        fullPage: false,
        headers: ["flag: only"],
        cacheKey: "retained-from-file",
      },
      { method: CaptureHttpMethod.GET },
    ],
  ]);
  assert.deepEqual(recordingIo.files, [
    { path: "selected-output.any", bytes: returnedBytes },
  ]);
  assert.deepEqual(recordingIo.standardOutput, []);
});

void test("keeps every omitted option and method absent and displays raw JSON", async () => {
  const rawJson = new TextEncoder().encode(
    '{ "screenshot_url": "unchanged", "order": [2, 1] }',
  );
  const recordingClient = createRecordingClient(jsonResponse(rawJson));
  const recordingIo = createRecordingIo();

  await runCaptureCommand(["exact target"], {
    client: recordingClient.client,
    inputReader: UNEXPECTED_READER,
    resultIo: recordingIo.io,
  });

  assert.equal(recordingClient.calls.length, 1);
  assert.equal(recordingClient.calls[0]?.length, 2);
  assert.equal(recordingClient.calls[0]?.[0], "exact target");
  assert.deepEqual(recordingClient.calls[0]?.[1], {});
  assert.equal(Object.keys(recordingClient.calls[0]?.[1] ?? {}).length, 0);
  assert.deepEqual(recordingIo.standardOutput, [rawJson]);
  assert.deepEqual(recordingIo.files, []);
});

void test("passes POST and pipes exact binary bytes through the short output control", async () => {
  const returnedBytes = Uint8Array.of(0, 13, 10, 128, 255);
  const recordingClient = createRecordingClient(
    binaryResponse(returnedBytes, "application/pdf"),
  );
  const recordingIo = createRecordingIo();

  await runCaptureCommand(
    ["target", "--method=post", "-o", "-", "--cache=false"],
    {
      client: recordingClient.client,
      inputReader: UNEXPECTED_READER,
      resultIo: recordingIo.io,
    },
  );

  assert.deepEqual(recordingClient.calls, [
    ["target", { cache: false }, { method: CaptureHttpMethod.POST }],
  ]);
  assert.deepEqual(recordingIo.standardOutput, [returnedBytes]);
  assert.deepEqual(recordingIo.files, []);
});

void test("automatically names and ordinarily overwrites a binary destination", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "screenshotscout-capture-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const destination = join(directory, "screenshot.webp");
  const returnedBytes = Uint8Array.of(7, 7, 8, 9);
  await writeFile(destination, Uint8Array.of(1, 1, 1));

  const recordingClient = createRecordingClient(
    binaryResponse(returnedBytes, "IMAGE/WEBP; quality=lossless"),
  );
  await runCaptureCommand(["target"], {
    client: recordingClient.client,
    inputReader: UNEXPECTED_READER,
    resultIo: fileSystemIo(directory),
  });

  assert.equal(recordingClient.calls.length, 1);
  assert.deepEqual(Uint8Array.from(await readFile(destination)), returnedBytes);
});

void test("propagates SDK and filesystem failures unchanged", async () => {
  const sdkFailure = new Error("unchanged SDK failure");
  const sdkClient = createRejectingClient(sdkFailure);
  const untouchedIo = createRecordingIo();

  await assert.rejects(
    runCaptureCommand(["target"], {
      client: sdkClient.client,
      inputReader: UNEXPECTED_READER,
      resultIo: untouchedIo.io,
    }),
    (error: unknown) => error === sdkFailure,
  );
  assert.equal(sdkClient.calls.length, 1);
  assert.deepEqual(untouchedIo.files, []);
  assert.deepEqual(untouchedIo.standardOutput, []);

  const fileFailure = Object.assign(new Error("unchanged filesystem failure"), {
    code: "ENOENT",
  });
  const successfulClient = createRecordingClient(
    binaryResponse(Uint8Array.of(1), "image/png"),
  );
  const failingIo: CaptureResultIo = {
    currentDirectory: () => "working-directory",
    writeFile: () => Promise.reject(fileFailure),
    writeStandardOutput: () =>
      Promise.reject(new Error("Unexpected standard-output write")),
  };

  await assert.rejects(
    runCaptureCommand(["target", "--output", "missing/result.png"], {
      client: successfulClient.client,
      inputReader: UNEXPECTED_READER,
      resultIo: failingIo,
    }),
    (error: unknown) => error === fileFailure,
  );
  assert.equal(successfulClient.calls.length, 1);
});

void test("rejects URL-shape and singleton-control usage errors before an SDK call", async () => {
  const cases = [
    [],
    ["one", "two"],
    ["target", "--method=get", "--method", "post"],
    ["target", "-o", "one", "--output", "two"],
    ["target", "--method=GET"],
  ] as const;

  for (const args of cases) {
    const recordingClient = createRecordingClient(
      binaryResponse(Uint8Array.of(1), "image/png"),
    );

    await assert.rejects(
      runCaptureCommand(args, {
        client: recordingClient.client,
        inputReader: UNEXPECTED_READER,
        resultIo: createRecordingIo().io,
      }),
      (error: unknown) => {
        assert.ok(error instanceof CliUsageError);
        assert.equal(error.exitCode, 2);
        return true;
      },
    );
    assert.equal(recordingClient.calls.length, 0);
  }
});

function createRecordingClient(response: CaptureResponse): {
  readonly calls: RecordedCaptureCall[];
  readonly client: ScreenshotScoutSdkClient;
} {
  const calls: RecordedCaptureCall[] = [];
  const client: ScreenshotScoutSdkClient = {
    capture(...args: RecordedCaptureCall) {
      calls.push(args);
      return Promise.resolve(response);
    },
    buildCaptureUrl() {
      throw new Error("buildCaptureUrl must not be called by capture.");
    },
  };

  return { calls, client };
}

function createRejectingClient(failure: Error): {
  readonly calls: RecordedCaptureCall[];
  readonly client: ScreenshotScoutSdkClient;
} {
  const calls: RecordedCaptureCall[] = [];
  const client: ScreenshotScoutSdkClient = {
    capture(...args: RecordedCaptureCall) {
      calls.push(args);
      return Promise.reject(failure);
    },
    buildCaptureUrl() {
      throw new Error("buildCaptureUrl must not be called by capture.");
    },
  };

  return { calls, client };
}

function binaryResponse(
  bytes: Uint8Array,
  contentType: string | null,
): BinaryCaptureResponse {
  return {
    kind: "binary",
    bytes,
    screenshotUrl: "https://example.com/must-not-be-used",
    rawResponse: rawResponse(bytes, contentType),
  };
}

function jsonResponse(bytes: Uint8Array): JsonCaptureResponse {
  return {
    kind: "json",
    result: {
      screenshotUrl: "decoded value must not be serialized",
      additionalFields: { decoded: "value must not be serialized" },
    },
    rawResponse: rawResponse(bytes, "application/json"),
  };
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

function createRecordingIo(currentDirectory = "working-directory"): {
  readonly files: Array<{ path: string; bytes: Uint8Array }>;
  readonly io: CaptureResultIo;
  readonly standardOutput: Uint8Array[];
} {
  const files: Array<{ path: string; bytes: Uint8Array }> = [];
  const standardOutput: Uint8Array[] = [];
  const io: CaptureResultIo = {
    currentDirectory: () => currentDirectory,
    writeFile: (path, bytes) => {
      files.push({ path, bytes: Uint8Array.from(bytes) });
      return Promise.resolve();
    },
    writeStandardOutput: (bytes) => {
      standardOutput.push(Uint8Array.from(bytes));
      return Promise.resolve();
    },
  };

  return { files, io, standardOutput };
}

function fileSystemIo(currentDirectory: string): CaptureResultIo {
  return {
    currentDirectory: () => currentDirectory,
    writeFile: (path, bytes) => writeFile(path, bytes),
    writeStandardOutput: () =>
      Promise.reject(new Error("Unexpected standard-output write")),
  };
}
