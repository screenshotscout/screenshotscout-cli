import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const FIXTURE_PATH = fileURLToPath(
  new URL("./fixtures/capture-command.ts", import.meta.url),
);
const TSX_IMPORT = import.meta.resolve("tsx");

void test("process pipeline writes exact binary bytes and no other output", async () => {
  const bytes = Buffer.from([0, 255, 13, 10, 128, 1]);
  const result = await runCaptureProcess(
    ["unmodified target", "--output", "-"],
    {
      kind: "binary",
      bytes,
      contentType: "application/pdf",
    },
  );

  assert.equal(result.code, 0);
  assert.deepEqual(result.standardOutput, bytes);
  assert.deepEqual(result.standardError, Buffer.alloc(0));
});

void test("process display writes exact raw JSON bytes without a newline", async () => {
  const bytes = Buffer.from('{ "order": [2, 1], "unchanged": true }');
  const result = await runCaptureProcess(["unmodified target"], {
    kind: "json",
    bytes,
  });

  assert.equal(result.code, 0);
  assert.deepEqual(result.standardOutput, bytes);
  assert.equal(result.standardOutput.at(-1), "}".charCodeAt(0));
  assert.deepEqual(result.standardError, Buffer.alloc(0));
});

void test("process file output silently overwrites automatic and explicit paths", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "screenshotscout-process-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const automaticPath = join(directory, "screenshot.webp");
  const explicitPath = join(directory, "selected.bin");
  await writeFile(automaticPath, Buffer.from("old automatic"));
  await writeFile(explicitPath, Buffer.from("old explicit"));

  const automaticBytes = Buffer.from([1, 2, 3, 4]);
  const automatic = await runCaptureProcess(["target", "--format=pdf"], {
    kind: "binary",
    bytes: automaticBytes,
    contentType: "IMAGE/WEBP; quality=lossless",
    currentDirectory: directory,
  });
  assert.equal(automatic.code, 0);
  assert.deepEqual(automatic.standardOutput, Buffer.alloc(0));
  assert.deepEqual(automatic.standardError, Buffer.alloc(0));
  assert.deepEqual(await readFile(automaticPath), automaticBytes);

  const explicitBytes = Buffer.from('{"raw":true}');
  const explicit = await runCaptureProcess(["target", "-o", explicitPath], {
    kind: "json",
    bytes: explicitBytes,
    currentDirectory: directory,
  });
  assert.equal(explicit.code, 0);
  assert.deepEqual(explicit.standardOutput, Buffer.alloc(0));
  assert.deepEqual(explicit.standardError, Buffer.alloc(0));
  assert.deepEqual(await readFile(explicitPath), explicitBytes);
});

interface CaptureProcessFixture {
  readonly bytes: Uint8Array;
  readonly contentType?: string;
  readonly currentDirectory?: string;
  readonly kind: "binary" | "json";
}

interface CaptureProcessResult {
  readonly code: number | null;
  readonly standardError: Buffer;
  readonly standardOutput: Buffer;
}

function runCaptureProcess(
  args: readonly string[],
  fixture: CaptureProcessFixture,
): Promise<CaptureProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [`--import=${TSX_IMPORT}`, FIXTURE_PATH, ...args],
      {
        cwd: fixture.currentDirectory,
        env: {
          ...process.env,
          CLI_TEST_RESPONSE_BASE64: Buffer.from(fixture.bytes).toString(
            "base64",
          ),
          CLI_TEST_RESPONSE_KIND: fixture.kind,
          ...(fixture.contentType === undefined
            ? {}
            : { CLI_TEST_RESPONSE_CONTENT_TYPE: fixture.contentType }),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const standardOutput: Buffer[] = [];
    const standardError: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => standardOutput.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => standardError.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({
        code,
        standardError: Buffer.concat(standardError),
        standardOutput: Buffer.concat(standardOutput),
      });
    });
  });
}
