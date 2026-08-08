import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const FIXTURE_PATH = fileURLToPath(
  new URL("./fixtures/capture-url-command.ts", import.meta.url),
);
const TSX_IMPORT = import.meta.resolve("tsx");

void test("process writes the exact returned URL, one newline, and nothing else", async () => {
  const returnedUrl =
    "https://api.screenshotscout.com/v1/capture?access_key=visible%2Fplaceholder&url=https%3A%2F%2Fexample.com&signature=a%2Bb%3D";
  const result = await runCaptureUrlProcess(
    ["unmodified target", "--full-page=false"],
    returnedUrl,
  );

  assert.equal(result.code, 0);
  assert.deepEqual(result.standardOutput, Buffer.from(`${returnedUrl}\n`));
  assert.deepEqual(result.standardError, Buffer.alloc(0));
});

interface CaptureUrlProcessResult {
  readonly code: number | null;
  readonly standardError: Buffer;
  readonly standardOutput: Buffer;
}

function runCaptureUrlProcess(
  args: readonly string[],
  returnedUrl: string,
): Promise<CaptureUrlProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [`--import=${TSX_IMPORT}`, FIXTURE_PATH, ...args],
      {
        env: {
          ...process.env,
          CLI_TEST_CAPTURE_URL: returnedUrl,
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
