import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  captureCommandHelp,
  captureUrlCommandHelp,
  ROOT_HELP,
} from "../../src/help.js";

const EXECUTABLE_PATH = fileURLToPath(
  new URL("../../dist/index.js", import.meta.url),
);
const MOCK_FETCH_IMPORT = new URL("./fixtures/mock-fetch.ts", import.meta.url)
  .href;
const TSX_IMPORT = import.meta.resolve("tsx");

void test("compiled executable prints root help, command help, and version", async () => {
  const cases = [
    { args: ["--help"], output: ROOT_HELP },
    { args: ["capture", "--help"], output: captureCommandHelp() },
    { args: ["capture-url", "--help"], output: captureUrlCommandHelp() },
    { args: ["--version"], output: "0.5.0\n" },
  ] as const;

  for (const { args, output } of cases) {
    const result = await runCliProcess(args);
    assert.equal(result.code, 0);
    assert.equal(result.standardOutput.toString("utf8"), output);
    assert.deepEqual(result.standardError, Buffer.alloc(0));
  }
});

void test("compiled capture writes exact binary pipeline bytes for representative flags", async () => {
  const bytes = Buffer.from([0, 255, 13, 10, 128, 1]);
  const result = await runCliProcess(
    [
      "capture",
      "unmodified target",
      "--method=post",
      "--full-page=false",
      "--headers=x: 1",
      "--headers=x: 1",
      "--output=-",
    ],
    {
      accessKey: "placeholder-access-key",
      mockResponse: {
        body: bytes,
        contentType: "application/pdf",
      },
    },
  );

  assert.equal(result.code, 0);
  assert.deepEqual(result.standardOutput, bytes);
  assert.deepEqual(result.standardError, Buffer.alloc(0));
});

void test("compiled capture displays exact raw JSON bytes without a newline", async () => {
  const bytes = Buffer.from('{ "order": [2, 1], "unchanged": true }');
  const result = await runCliProcess(
    ["capture", "unmodified target", "--response-type=json", "--output=-"],
    {
      accessKey: "placeholder-access-key",
      mockResponse: {
        body: bytes,
        contentType: "application/json; charset=utf-8",
      },
    },
  );

  assert.equal(result.code, 0);
  assert.deepEqual(result.standardOutput, bytes);
  assert.equal(result.standardOutput.at(-1), "}".charCodeAt(0));
  assert.deepEqual(result.standardError, Buffer.alloc(0));
});

void test("compiled capture silently saves a binary file", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "screenshotscout-cli-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const bytes = Buffer.from([7, 8, 9, 10]);

  const result = await runCliProcess(
    ["capture", "target", "--format=unvalidated-format"],
    {
      accessKey: "placeholder-access-key",
      currentDirectory: directory,
      mockResponse: { body: bytes, contentType: "IMAGE/PNG; charset=binary" },
    },
  );

  assert.equal(result.code, 0);
  assert.deepEqual(result.standardOutput, Buffer.alloc(0));
  assert.deepEqual(result.standardError, Buffer.alloc(0));
  assert.deepEqual(await readFile(join(directory, "screenshot.png")), bytes);
});

void test("compiled capture-url returns the unchanged SDK URL plus one newline", async () => {
  const result = await runCliProcess(
    [
      "capture-url",
      "https://example.com/a path",
      "--delay=0",
      "--full-page=false",
    ],
    { accessKey: "placeholder-access-key" },
  );

  assert.equal(result.code, 0);
  assert.equal(
    result.standardOutput.toString("utf8"),
    "https://api.screenshotscout.com/v1/capture?access_key=placeholder-access-key&url=https%3A%2F%2Fexample.com%2Fa%20path&delay=0&full_page=false\n",
  );
  assert.deepEqual(result.standardError, Buffer.alloc(0));
});

void test("compiled capture-url builds the URL on SCREENSHOTSCOUT_BASE_URL", async () => {
  const result = await runCliProcess(["capture-url", "https://example.com/"], {
    accessKey: "placeholder-access-key",
    baseUrl: "http://localhost:8787/",
  });

  assert.equal(result.code, 0);
  assert.equal(
    result.standardOutput.toString("utf8"),
    "http://localhost:8787/v1/capture?access_key=placeholder-access-key&url=https%3A%2F%2Fexample.com%2F\n",
  );
  assert.deepEqual(result.standardError, Buffer.alloc(0));
});

void test("compiled capture sends the request to SCREENSHOTSCOUT_BASE_URL", async () => {
  const result = await runCliProcess(
    ["capture", "https://example.com/", "--output=-"],
    {
      accessKey: "placeholder-access-key",
      baseUrl: "http://localhost:8787",
      echoRequest: true,
    },
  );

  assert.equal(result.code, 0);
  assert.equal(
    result.standardOutput.toString("utf8"),
    "POST http://localhost:8787/v1/capture",
  );
  assert.deepEqual(result.standardError, Buffer.alloc(0));
});

void test("compiled capture names SCREENSHOTSCOUT_BASE_URL in a transport failure", async () => {
  const result = await runCliProcess(["capture", "target", "--output=-"], {
    accessKey: "placeholder-access-key",
    baseUrl: "http://localhost:8787",
    transportFailure: "inner transport detail must stay hidden",
  });

  assert.equal(result.code, 1);
  assert.deepEqual(result.standardOutput, Buffer.alloc(0));
  assert.equal(
    result.standardError.toString("utf8"),
    "Screenshot Scout request failed before an HTTP response body was received. The base URL comes from SCREENSHOTSCOUT_BASE_URL.\n",
  );
  assertNoProgrammingDump(result.standardError);
});

void test("compiled executable uses exit 2 for missing, unknown, alias, and malformed input", async () => {
  const cases = [
    { args: [], message: "A command is required.\n" },
    { args: ["target"], message: "Unknown command 'target'.\n" },
    { args: ["shot", "target"], message: "Unknown command 'shot'.\n" },
    {
      args: ["capture", "target", "--full-page=yes"],
      message:
        "Option '--full-page' accepts only 'true' or 'false' as an inline value.\n",
    },
  ] as const;

  for (const { args, message } of cases) {
    const result = await runCliProcess(args);
    assert.equal(result.code, 2);
    assert.deepEqual(result.standardOutput, Buffer.alloc(0));
    assert.equal(result.standardError.toString("utf8"), message);
    assertNoProgrammingDump(result.standardError);
  }
});

void test("compiled executable validates --method before SDK credentials", async () => {
  const result = await runCliProcess(["capture", "target", "--method=put"]);

  assert.equal(result.code, 2);
  assert.deepEqual(result.standardOutput, Buffer.alloc(0));
  assert.equal(
    result.standardError.toString("utf8"),
    "Option '--method' must be 'get' or 'post'.\n",
  );
  assertNoProgrammingDump(result.standardError);
});

void test("compiled capture sends a signed GET when a secret key is set and --method is omitted", async () => {
  const result = await runCliProcess(
    ["capture", "https://example.com/", "--output=-"],
    {
      accessKey: "placeholder-access-key",
      secretKey: "placeholder-secret-key",
      echoRequest: true,
    },
  );

  assert.equal(result.code, 0);
  const [method, url] = result.standardOutput.toString("utf8").split(" ");
  assert.equal(method, "GET");
  assert.equal(new URL(url ?? "").searchParams.has("signature"), true);
  assert.deepEqual(result.standardError, Buffer.alloc(0));
});

void test("compiled capture refuses an explicit POST when a secret key is set", async () => {
  const result = await runCliProcess(["capture", "target", "--method=post"], {
    accessKey: "placeholder-access-key",
    secretKey: "placeholder-secret-key",
  });

  assert.equal(result.code, 1);
  assert.deepEqual(result.standardOutput, Buffer.alloc(0));
  assert.equal(
    result.standardError.toString("utf8"),
    "POST requests can't be signed. This client has a secret key from SCREENSHOTSCOUT_SECRET_KEY: send this capture with method GET, or use a client without a secret key and an API key that doesn't require signed requests.\n",
  );
  assertNoProgrammingDump(result.standardError);
});

void test("compiled capture-url treats an empty secret key as unset", async () => {
  const result = await runCliProcess(["capture-url", "https://example.com/"], {
    accessKey: "placeholder-access-key",
    secretKey: "",
  });

  assert.equal(result.code, 0);
  const captureUrl = new URL(result.standardOutput.toString("utf8").trim());
  assert.equal(captureUrl.searchParams.has("signature"), false);
});

void test("compiled executable classifies malformed options JSON as usage", async () => {
  const result = await runCliProcess(["capture", "target", "--options=-"], {
    standardInput: "{",
  });

  assert.equal(result.code, 2);
  assert.deepEqual(result.standardOutput, Buffer.alloc(0));
  assert.match(
    result.standardError.toString("utf8"),
    /^Options input is not valid JSON\./u,
  );
  assertNoProgrammingDump(result.standardError);
});

void test("compiled executable prints only a concise SDK credential failure", async () => {
  const result = await runCliProcess(["capture-url", "target"]);

  assert.equal(result.code, 1);
  assert.deepEqual(result.standardOutput, Buffer.alloc(0));
  assert.equal(
    result.standardError.toString("utf8"),
    "A non-blank Screenshot Scout access key is required. Pass one, or set SCREENSHOTSCOUT_ACCESS_KEY.\n",
  );
  assertNoProgrammingDump(result.standardError);
});

void test("compiled executable omits the nested transport cause and stack", async () => {
  const result = await runCliProcess(["capture", "target", "--output=-"], {
    accessKey: "placeholder-access-key",
    transportFailure: "inner transport detail must stay hidden",
  });

  assert.equal(result.code, 1);
  assert.deepEqual(result.standardOutput, Buffer.alloc(0));
  assert.equal(
    result.standardError.toString("utf8"),
    "Screenshot Scout request failed before an HTTP response body was received.\n",
  );
  assert.doesNotMatch(
    result.standardError.toString("utf8"),
    /inner transport/u,
  );
  assertNoProgrammingDump(result.standardError);
});

void test("compiled executable prints the complete API validation array", async () => {
  const errors = [
    {
      option: "format",
      message: "Unsupported.",
      metadata: { accepted: ["png", "jpeg"] },
    },
    { option: "timeout", message: "Too large.", limit: 30 },
  ];
  const body = Buffer.from(
    JSON.stringify({
      error_code: "validation_error",
      error_message: "Capture options failed.",
      errors,
    }),
  );
  const result = await runCliProcess(["capture", "target", "--output=-"], {
    accessKey: "placeholder-access-key",
    mockResponse: {
      body,
      contentType: "application/json",
      status: 400,
      statusText: "Bad Request",
    },
  });

  assert.equal(result.code, 1);
  assert.deepEqual(result.standardOutput, Buffer.alloc(0));
  assert.equal(
    result.standardError.toString("utf8"),
    `Capture options failed.\n${JSON.stringify(errors)}\n`,
  );
  assertNoProgrammingDump(result.standardError);
});

void test("compiled executable classifies an ordinary filesystem failure as exit 1", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "screenshotscout-cli-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const outputPath = join(directory, "missing", "result.png");
  const result = await runCliProcess(
    ["capture", "target", "--output", outputPath],
    {
      accessKey: "placeholder-access-key",
      currentDirectory: directory,
      mockResponse: {
        body: Buffer.from([1, 2, 3]),
        contentType: "image/png",
      },
    },
  );

  assert.equal(result.code, 1);
  assert.deepEqual(result.standardOutput, Buffer.alloc(0));
  assert.match(result.standardError.toString("utf8"), /ENOENT/u);
  assertNoProgrammingDump(result.standardError);
});

interface MockResponse {
  readonly body: Uint8Array;
  readonly contentType?: string;
  readonly status?: number;
  readonly statusText?: string;
}

interface CliProcessOptions {
  readonly accessKey?: string;
  readonly secretKey?: string;
  readonly baseUrl?: string;
  readonly currentDirectory?: string;
  readonly echoRequest?: boolean;
  readonly mockResponse?: MockResponse;
  readonly standardInput?: string | Uint8Array;
  readonly transportFailure?: string;
}

interface CliProcessResult {
  readonly code: number | null;
  readonly standardError: Buffer;
  readonly standardOutput: Buffer;
}

function runCliProcess(
  args: readonly string[],
  options: CliProcessOptions = {},
): Promise<CliProcessResult> {
  return new Promise((resolve, reject) => {
    const usesMockFetch =
      options.mockResponse !== undefined ||
      options.transportFailure !== undefined ||
      options.echoRequest === true;
    const nodeArguments = [
      ...(usesMockFetch
        ? [`--import=${TSX_IMPORT}`, `--import=${MOCK_FETCH_IMPORT}`]
        : []),
      EXECUTABLE_PATH,
      ...args,
    ];
    const environment: NodeJS.ProcessEnv = { ...process.env };
    delete environment.SCREENSHOTSCOUT_ACCESS_KEY;
    delete environment.SCREENSHOTSCOUT_SECRET_KEY;
    delete environment.SCREENSHOTSCOUT_BASE_URL;

    if (options.accessKey !== undefined) {
      environment.SCREENSHOTSCOUT_ACCESS_KEY = options.accessKey;
    }
    if (options.secretKey !== undefined) {
      environment.SCREENSHOTSCOUT_SECRET_KEY = options.secretKey;
    }
    if (options.baseUrl !== undefined) {
      environment.SCREENSHOTSCOUT_BASE_URL = options.baseUrl;
    }
    if (options.echoRequest === true) {
      environment.CLI_TEST_ECHO_REQUEST = "1";
    }
    if (options.mockResponse !== undefined) {
      environment.CLI_TEST_RESPONSE_BASE64 = Buffer.from(
        options.mockResponse.body,
      ).toString("base64");
      if (options.mockResponse.contentType !== undefined) {
        environment.CLI_TEST_RESPONSE_CONTENT_TYPE =
          options.mockResponse.contentType;
      }
      if (options.mockResponse.status !== undefined) {
        environment.CLI_TEST_RESPONSE_STATUS = String(
          options.mockResponse.status,
        );
      }
      if (options.mockResponse.statusText !== undefined) {
        environment.CLI_TEST_RESPONSE_STATUS_TEXT =
          options.mockResponse.statusText;
      }
    }
    if (options.transportFailure !== undefined) {
      environment.CLI_TEST_TRANSPORT_FAILURE = options.transportFailure;
    }

    const child = spawn(process.execPath, nodeArguments, {
      cwd: options.currentDirectory,
      env: environment,
      stdio: ["pipe", "pipe", "pipe"],
    });
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
    child.stdin.end(options.standardInput);
  });
}

function assertNoProgrammingDump(standardError: Buffer): void {
  const text = standardError.toString("utf8");
  assert.doesNotMatch(text, /\n\s+at\s/u);
  assert.doesNotMatch(text, /CliUsageError|ScreenshotScout\w+Error|cause:/u);
}
