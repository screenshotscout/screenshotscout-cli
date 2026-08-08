import assert from "node:assert/strict";
import test from "node:test";

import { CAPTURE_OPTION_DEFINITIONS } from "../../src/capture-options.js";
import { CliUsageError } from "../../src/cli-usage-error.js";
import {
  parseCaptureInput,
  type CaptureOptionsInputReader,
} from "../../src/input.js";

const UNEXPECTED_READER: CaptureOptionsInputReader = {
  readFile: (path) =>
    Promise.reject(new Error(`Unexpected options-file read: ${path}`)),
  readStdin: () => Promise.reject(new Error("Unexpected standard-input read")),
};

void test("parses separated and inline string, number, and repeated flags", async () => {
  const parsed = await parseCaptureInput(
    [
      "--format=unvalidated-format",
      "--country",
      "",
      "--timeout=0",
      "--delay",
      "-1.5",
      "--full-page=false",
      "--selector",
      "-custom-selector",
      "--cookies=a=b,c=d",
      "--cookies",
      "a=b,c=d",
    ],
    UNEXPECTED_READER,
  );

  assert.deepEqual(parsed, {
    captureOptions: {
      format: "unvalidated-format",
      country: "",
      timeout: 0,
      delay: -1.5,
      fullPage: false,
      selector: "-custom-selector",
      cookies: ["a=b,c=d", "a=b,c=d"],
    },
    positionals: [],
  });
});

void test("maps every descriptor entry from its CLI name to its SDK name", async () => {
  const args: string[] = [];
  const expected: Record<string, unknown> = {};

  for (const definition of Object.values(CAPTURE_OPTION_DEFINITIONS)) {
    if (definition.kind === "boolean") {
      args.push(`--${definition.cliName}=false`);
      expected[definition.sdkName] = false;
    } else if (definition.kind === "number") {
      args.push(`--${definition.cliName}=0`);
      expected[definition.sdkName] = 0;
    } else if (definition.multiple) {
      args.push(
        `--${definition.cliName}=first`,
        `--${definition.cliName}=first`,
      );
      expected[definition.sdkName] = ["first", "first"];
    } else {
      args.push(`--${definition.cliName}=`);
      expected[definition.sdkName] = "";
    }
  }

  const parsed = await parseCaptureInput(args, UNEXPECTED_READER);
  assert.deepEqual(parsed.captureOptions, expected);
});

void test("accepts only the three approved boolean forms", async () => {
  const cases = [
    { args: ["--full-page"], expected: true },
    { args: ["--full-page=true"], expected: true },
    { args: ["--full-page=false"], expected: false },
  ] as const;

  for (const { args, expected } of cases) {
    const parsed = await parseCaptureInput(args, UNEXPECTED_READER);
    assert.deepEqual(parsed.captureOptions, { fullPage: expected });
  }
});

void test("rejects space-separated boolean values", async () => {
  await expectUsageError(
    parseCaptureInput(["--full-page", "true"], UNEXPECTED_READER),
    /space-separated/u,
  );
  await expectUsageError(
    parseCaptureInput(["--full-page", "false"], UNEXPECTED_READER),
    /space-separated/u,
  );
});

void test("rejects every unsupported inline boolean spelling", async () => {
  for (const value of ["", "yes", "no", "1", "0", "TRUE", "False"]) {
    await expectUsageError(
      parseCaptureInput([`--full-page=${value}`], UNEXPECTED_READER),
      /only 'true' or 'false'/u,
    );
  }
});

void test("treats a bare boolean as true without consuming an ordinary positional", async () => {
  const parsed = await parseCaptureInput(
    ["--full-page", "target"],
    UNEXPECTED_READER,
  );

  assert.deepEqual(parsed, {
    captureOptions: { fullPage: true },
    positionals: ["target"],
  });
});

void test("stops recognizing every option at the option terminator", async () => {
  const parsed = await parseCaptureInput(
    ["--", "--full-page=false", "--format", "png", "false"],
    UNEXPECTED_READER,
  );

  assert.deepEqual(parsed, {
    captureOptions: {},
    positionals: ["--full-page=false", "--format", "png", "false"],
  });
});

void test("keeps omission distinct from explicit false", async () => {
  const omitted = await parseCaptureInput([], UNEXPECTED_READER);
  const explicitFalse = await parseCaptureInput(
    ["--cache=false"],
    UNEXPECTED_READER,
  );

  assert.deepEqual(omitted.captureOptions, {});
  assert.equal(Object.hasOwn(omitted.captureOptions, "cache"), false);
  assert.deepEqual(explicitFalse.captureOptions, { cache: false });
  assert.equal(Object.hasOwn(explicitFalse.captureOptions, "cache"), true);
});

void test("preserves repeated-flag order, duplicates, empty strings, and commas", async () => {
  const parsed = await parseCaptureInput(
    ["--headers", "x: 1", "--headers=x: 1", "--headers=", "--headers=a,b"],
    UNEXPECTED_READER,
  );

  assert.deepEqual(parsed.captureOptions, {
    headers: ["x: 1", "x: 1", "", "a,b"],
  });
});

void test("rejects non-finite and malformed numeric flag values", async () => {
  for (const value of [
    "",
    " ",
    "NaN",
    "Infinity",
    "-Infinity",
    "1px",
    "1e400",
  ]) {
    await expectUsageError(
      parseCaptureInput([`--timeout=${value}`], UNEXPECTED_READER),
      /finite number/u,
    );
  }
});

void test("rejects duplicate scalar, boolean, and options-input flags", async () => {
  const cases = [
    ["--format=png", "--format", "pdf"],
    ["--full-page", "--full-page=false"],
    ["--options=one.json", "--options", "two.json"],
  ] as const;

  for (const args of cases) {
    await expectUsageError(
      parseCaptureInput(args, UNEXPECTED_READER),
      /only be specified once/u,
    );
  }
});

void test("parses a snake_case JSON object and omits nulls and empty arrays", async () => {
  let receivedPath: string | undefined;
  const reader: CaptureOptionsInputReader = {
    readFile: (path) => {
      receivedPath = path;
      return Promise.resolve(
        JSON.stringify({
          format: "",
          timeout: 0,
          full_page: false,
          cookies: ["a=1", "a=1", ""],
          headers: [],
          country: null,
        }),
      );
    },
    readStdin: () =>
      Promise.reject(new Error("Unexpected standard-input read")),
  };

  const parsed = await parseCaptureInput(
    ["--options", "capture-options.json"],
    reader,
  );

  assert.equal(receivedPath, "capture-options.json");
  assert.deepEqual(parsed.captureOptions, {
    format: "",
    timeout: 0,
    fullPage: false,
    cookies: ["a=1", "a=1", ""],
  });
});

void test("maps every descriptor entry from its API name to its SDK name", async () => {
  const optionsObject: Record<string, unknown> = {};
  const expected: Record<string, unknown> = {};

  for (const definition of Object.values(CAPTURE_OPTION_DEFINITIONS)) {
    const value = definition.multiple
      ? ["first", "first"]
      : definition.kind === "boolean"
        ? false
        : definition.kind === "number"
          ? 0
          : "";
    optionsObject[definition.apiName] = value;
    expected[definition.sdkName] = value;
  }

  const parsed = await parseCaptureInput(
    ["--options=file.json"],
    fileReader(JSON.stringify(optionsObject)),
  );

  assert.deepEqual(parsed.captureOptions, expected);
});

void test("reads --options - from standard input", async () => {
  let stdinReads = 0;
  const reader: CaptureOptionsInputReader = {
    readFile: (path) =>
      Promise.reject(new Error(`Unexpected options-file read: ${path}`)),
    readStdin: () => {
      stdinReads += 1;
      return Promise.resolve('{"response_type":"json"}');
    },
  };

  const parsed = await parseCaptureInput(["--options=-"], reader);

  assert.equal(stdinReads, 1);
  assert.deepEqual(parsed.captureOptions, { responseType: "json" });
});

void test("flags override file scalars and replace file repeated arrays", async () => {
  const reader = fileReader(
    JSON.stringify({
      format: "jpeg",
      timeout: 10,
      full_page: true,
      headers: ["file: first", "file: second"],
      cookies: ["file=retained"],
    }),
  );

  const parsed = await parseCaptureInput(
    [
      "--options=file.json",
      "--format=png",
      "--timeout=0",
      "--full-page=false",
      "--headers=flag: only",
    ],
    reader,
  );

  assert.deepEqual(parsed.captureOptions, {
    format: "png",
    timeout: 0,
    fullPage: false,
    headers: ["flag: only"],
    cookies: ["file=retained"],
  });
});

void test("classifies malformed JSON and non-object JSON as usage errors", async () => {
  for (const text of ["{", "null", "[]", '"value"', "true", "1"]) {
    await expectUsageError(
      parseCaptureInput(["--options=file.json"], fileReader(text)),
      /Options input/u,
    );
  }
});

void test("classifies every options-object type mismatch as a usage error", async () => {
  const invalidObjects = [
    { format: false },
    { timeout: "1" },
    { full_page: "false" },
    { headers: "x: 1" },
    { headers: ["x: 1", 2] },
  ];

  for (const value of invalidObjects) {
    await expectUsageError(
      parseCaptureInput(
        ["--options=file.json"],
        fileReader(JSON.stringify(value)),
      ),
    );
  }

  await expectUsageError(
    parseCaptureInput(["--options=file.json"], fileReader('{"timeout":1e400}')),
    /finite number/u,
  );
});

void test("uses ordinary usage errors for unknown flags and options-file keys", async () => {
  await expectUsageError(
    parseCaptureInput(["--not-a-capture-option"], UNEXPECTED_READER),
    /Unknown option/u,
  );
  await expectUsageError(
    parseCaptureInput(
      ["--options=file.json"],
      fileReader('{"not_a_capture_option":true}'),
    ),
    /Unknown option/u,
  );
  await expectUsageError(
    parseCaptureInput(["--no-full-page"], UNEXPECTED_READER),
    /Unknown option/u,
  );
});

void test("classifies missing flag values as usage errors", async () => {
  await expectUsageError(
    parseCaptureInput(["--format"], UNEXPECTED_READER),
    /argument missing/u,
  );
  await expectUsageError(
    parseCaptureInput(["--options"], UNEXPECTED_READER),
    /argument missing/u,
  );
});

void test("does not reclassify an options-file read failure as a usage error", async () => {
  const failure = new Error("read failed");
  const reader: CaptureOptionsInputReader = {
    readFile: () => Promise.reject(failure),
    readStdin: () =>
      Promise.reject(new Error("Unexpected standard-input read")),
  };

  await assert.rejects(
    parseCaptureInput(["--options=file.json"], reader),
    (error: unknown) => error === failure,
  );
});

function fileReader(text: string): CaptureOptionsInputReader {
  return {
    readFile: () => Promise.resolve(text),
    readStdin: () =>
      Promise.reject(new Error("Unexpected standard-input read")),
  };
}

async function expectUsageError(
  promise: Promise<unknown>,
  messagePattern?: RegExp,
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof CliUsageError);
    assert.equal(error.exitCode, 2);
    if (messagePattern !== undefined) {
      assert.match(error.message, messagePattern);
    }
    return true;
  });
}
