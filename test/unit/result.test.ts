import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type {
  BinaryCaptureResponse,
  CaptureOptions,
  JsonCaptureResponse,
  RawResponse,
} from "@screenshotscout/sdk";

import {
  captureFileExtension,
  type CaptureResultIo,
  writeCaptureResult,
} from "../../src/result.js";

void test("writes exact binary bytes to standard output only for output -", async () => {
  const bytes = Uint8Array.of(0, 255, 13, 10, 128, 1);
  const recording = createRecordingIo();

  await writeCaptureResult(
    binaryResponse(bytes, "image/png"),
    "-",
    recording.io,
  );

  assert.deepEqual(recording.standardOutput, [bytes]);
  assert.deepEqual(recording.files, []);
});

void test("displays and pipes the exact raw JSON response without a newline", async () => {
  const bytes = new TextEncoder().encode('{ "screenshot_url": "unchanged" }');

  for (const outputPath of [undefined, "-"] as const) {
    const recording = createRecordingIo();
    await writeCaptureResult(jsonResponse(bytes), outputPath, recording.io);

    assert.deepEqual(recording.standardOutput, [bytes]);
    assert.equal(recording.standardOutput[0]?.at(-1), "}".charCodeAt(0));
    assert.deepEqual(recording.files, []);
  }
});

void test("writes raw JSON bytes to an explicit output path", async () => {
  const bytes = new TextEncoder().encode('{"order":[2,1],"space": true}');
  const recording = createRecordingIo();

  await writeCaptureResult(
    jsonResponse(bytes),
    "relative/result.json",
    recording.io,
  );

  assert.deepEqual(recording.files, [{ path: "relative/result.json", bytes }]);
  assert.deepEqual(recording.standardOutput, []);
});

void test("maps every approved Content-Type and uses .bin for missing or unknown values", async () => {
  const cases = [
    ["image/png", ".png"],
    ["IMAGE/JPEG; charset=binary", ".jpg"],
    [" image/webp ; quality=lossless", ".webp"],
    ["image/gif", ".gif"],
    ["Image/Tiff; boundary=something", ".tiff"],
    ["APPLICATION/PDF ; version=1.7", ".pdf"],
    [null, ".bin"],
    ["", ".bin"],
    ["application/octet-stream", ".bin"],
    ["image/png-extra", ".bin"],
  ] as const;

  for (const [contentType, expectedExtension] of cases) {
    assert.equal(captureFileExtension(contentType), expectedExtension);

    const recording = createRecordingIo("chosen-working-directory");
    await writeCaptureResult(
      binaryResponse(Uint8Array.of(1), contentType),
      undefined,
      recording.io,
    );
    assert.deepEqual(recording.files, [
      {
        path: join(
          "chosen-working-directory",
          `screenshot${expectedExtension}`,
        ),
        bytes: Uint8Array.of(1),
      },
    ]);
  }
});

void test("uses returned Content-Type when the requested format differs", async () => {
  const requestedCaptureOptions: CaptureOptions = { format: "pdf" };
  const recording = createRecordingIo("working-directory");

  // Capture options are deliberately not an adapter input; only the response is.
  assert.equal(requestedCaptureOptions.format, "pdf");
  await writeCaptureResult(
    binaryResponse(Uint8Array.of(4, 5, 6), "image/jpeg"),
    undefined,
    recording.io,
  );

  assert.equal(
    recording.files[0]?.path,
    join("working-directory", "screenshot.jpg"),
  );
});

void test("uses binary response bytes for explicit and automatic file paths", async () => {
  const returnedBytes = Uint8Array.of(7, 8, 9);
  const rawBytes = Uint8Array.of(90, 91, 92);
  const response = binaryResponse(returnedBytes, "application/pdf", rawBytes);

  const explicit = createRecordingIo("unused-working-directory");
  await writeCaptureResult(response, "selected-output.any", explicit.io);
  assert.deepEqual(explicit.files, [
    { path: "selected-output.any", bytes: returnedBytes },
  ]);
  assert.deepEqual(explicit.standardOutput, []);

  const automatic = createRecordingIo("working-directory");
  await writeCaptureResult(response, undefined, automatic.io);
  assert.deepEqual(automatic.files, [
    {
      path: join("working-directory", "screenshot.pdf"),
      bytes: returnedBytes,
    },
  ]);
  assert.deepEqual(automatic.standardOutput, []);
});

void test("ordinary writes overwrite explicit and automatic destinations", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "screenshotscout-result-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const io = fileSystemIo(directory);
  const explicitPath = join(directory, "result.json");
  const automaticPath = join(directory, "screenshot.png");

  await writeFile(explicitPath, Uint8Array.of(1, 1, 1));
  await writeCaptureResult(jsonResponse(Uint8Array.of(2, 2)), explicitPath, io);
  assert.deepEqual(
    Uint8Array.from(await readFile(explicitPath)),
    Uint8Array.of(2, 2),
  );

  await writeFile(automaticPath, Uint8Array.of(3, 3, 3));
  await writeCaptureResult(
    binaryResponse(Uint8Array.of(4, 4), "image/png"),
    undefined,
    io,
  );
  assert.deepEqual(
    Uint8Array.from(await readFile(automaticPath)),
    Uint8Array.of(4, 4),
  );
});

void test("propagates an ordinary filesystem write failure unchanged", async () => {
  const failure = Object.assign(new Error("ordinary write failure"), {
    code: "ENOENT",
  });
  const io: CaptureResultIo = {
    currentDirectory: () => "working-directory",
    writeFile: () => Promise.reject(failure),
    writeStandardOutput: () =>
      Promise.reject(new Error("Unexpected standard-output write")),
  };

  await assert.rejects(
    writeCaptureResult(
      jsonResponse(Uint8Array.of(1)),
      "missing/result.json",
      io,
    ),
    (error: unknown) => error === failure,
  );
});

void test("surfaces Node's ordinary missing-directory write failure", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "screenshotscout-result-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const destination = join(directory, "missing", "result.json");

  await assert.rejects(
    writeCaptureResult(jsonResponse(Uint8Array.of(1)), destination),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as NodeJS.ErrnoException).code, "ENOENT");
      assert.equal((error as NodeJS.ErrnoException).path, destination);
      return true;
    },
  );
});

function binaryResponse(
  bytes: Uint8Array,
  contentType: string | null,
  rawBody: Uint8Array = bytes,
): BinaryCaptureResponse {
  return {
    kind: "binary",
    bytes,
    screenshotUrl: "https://example.com/must-not-be-printed",
    rawResponse: rawResponse(rawBody, contentType),
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
  readonly io: CaptureResultIo;
  readonly files: Array<{ path: string; bytes: Uint8Array }>;
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

  return { io, files, standardOutput };
}

function fileSystemIo(currentDirectory: string): CaptureResultIo {
  return {
    currentDirectory: () => currentDirectory,
    writeFile: (path, bytes) => writeFile(path, bytes),
    writeStandardOutput: () =>
      Promise.reject(new Error("Unexpected standard-output write")),
  };
}
