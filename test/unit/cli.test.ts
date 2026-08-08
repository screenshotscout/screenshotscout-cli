import assert from "node:assert/strict";
import test from "node:test";

import {
  ScreenshotScoutApiError,
  type RawResponse,
} from "@screenshotscout/sdk";

import { formatFailure, runCli, runCliExecutable } from "../../src/cli.js";
import { CliUsageError } from "../../src/cli-usage-error.js";
import { CAPTURE_OPTION_DEFINITIONS } from "../../src/capture-options.js";
import {
  captureCommandHelp,
  captureUrlCommandHelp,
  ROOT_HELP,
} from "../../src/help.js";

void test("strictly dispatches only the two approved commands", async () => {
  const captureCalls: string[][] = [];
  const captureUrlCalls: string[][] = [];

  await runCli(["capture", "target", "--full-page=false"], {
    runCapture: (args) => {
      captureCalls.push([...args]);
      return Promise.resolve();
    },
    runCaptureUrl: () =>
      Promise.reject(new Error("Unexpected capture-url dispatch")),
  });
  await runCli(["capture-url", "target", "--delay=0"], {
    runCapture: () => Promise.reject(new Error("Unexpected capture dispatch")),
    runCaptureUrl: (args) => {
      captureUrlCalls.push([...args]);
      return Promise.resolve();
    },
  });

  assert.deepEqual(captureCalls, [["target", "--full-page=false"]]);
  assert.deepEqual(captureUrlCalls, [["target", "--delay=0"]]);

  for (const args of [[], ["target"], ["shot", "target"], ["help"]]) {
    await assert.rejects(runCli(args), CliUsageError);
  }
});

void test("generates exhaustive command help from the capture option descriptor", () => {
  const captureHelp = captureCommandHelp();
  const captureUrlHelp = captureUrlCommandHelp();
  const definitions = Object.values(CAPTURE_OPTION_DEFINITIONS);

  for (const definition of definitions) {
    const valueShape =
      definition.kind === "boolean" ? "[=true|false]" : ` <${definition.kind}>`;
    const repetition = definition.multiple ? " (repeatable)" : "";
    const line = `  --${definition.cliName}${valueShape}${repetition}`;
    assert.equal(
      captureHelp.split("\n").filter((item) => item === line).length,
      1,
    );
    assert.equal(
      captureUrlHelp.split("\n").filter((item) => item === line).length,
      1,
    );
  }

  assert.match(ROOT_HELP, /screenshotscout capture <url>/u);
  assert.match(captureHelp, /--method <get\|post>/u);
  assert.match(captureHelp, /^ {2}-o, --output <path\|-> {4}Write/mu);
  assert.doesNotMatch(captureUrlHelp, /--method|--output/u);
});

void test("the executable boundary maps success, usage, and runtime failures", async () => {
  const successErrors: string[] = [];
  assert.equal(
    await runCliExecutable(["capture", "target"], {
      runCapture: () => Promise.resolve(),
      writeStandardError: (text) => {
        successErrors.push(text);
        return Promise.resolve();
      },
    }),
    0,
  );
  assert.deepEqual(successErrors, []);

  const usageFailure = new CliUsageError("invalid local input", {
    cause: new Error("hidden cause"),
  });
  const usageErrors: string[] = [];
  assert.equal(
    await runCliExecutable(["capture", "target"], {
      runCapture: () => Promise.reject(usageFailure),
      writeStandardError: (text) => {
        usageErrors.push(text);
        return Promise.resolve();
      },
    }),
    2,
  );
  assert.deepEqual(usageErrors, ["invalid local input\n"]);

  const runtimeFailure = new Error("unchanged runtime message", {
    cause: new Error("hidden cause"),
  });
  runtimeFailure.stack = "must not be written";
  const runtimeErrors: string[] = [];
  assert.equal(
    await runCliExecutable(["capture", "target"], {
      runCapture: () => Promise.reject(runtimeFailure),
      writeStandardError: (text) => {
        runtimeErrors.push(text);
        return Promise.resolve();
      },
    }),
    1,
  );
  assert.deepEqual(runtimeErrors, ["unchanged runtime message\n"]);
});

void test("formats complete API details and ordinary non-Error values", () => {
  const details = [
    {
      option: "format",
      message: "Unsupported.",
      metadata: { accepted: ["png", "jpeg"] },
    },
    { option: "timeout", message: "Too large.", limit: 30 },
  ];
  const apiError = new ScreenshotScoutApiError({
    rawResponse: rawResponse(),
    errorMessage: "Capture options failed.",
    errors: details,
  });

  assert.equal(
    formatFailure(apiError),
    `Capture options failed.\n${JSON.stringify(details)}\n`,
  );
  assert.equal(formatFailure("plain thrown value"), "plain thrown value\n");
  assert.equal(formatFailure(17), "17\n");
  assert.equal(formatFailure(null), "null\n");
});

void test("does not leak a stack if writing a failure message also fails", async () => {
  const writeFailure = new Error("standard error unavailable");

  assert.equal(
    await runCliExecutable(["capture", "target"], {
      runCapture: () => Promise.reject(new Error("original failure")),
      writeStandardError: () => Promise.reject(writeFailure),
    }),
    1,
  );
});

function rawResponse(): RawResponse {
  return {
    status: 400,
    statusText: "Bad Request",
    headers: new Map(),
    contentType: "application/json",
    body: Uint8Array.of(),
  };
}
