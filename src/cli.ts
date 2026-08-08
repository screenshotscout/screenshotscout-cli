import { readFileSync } from "node:fs";

import { ScreenshotScoutApiError } from "@screenshotscout/sdk";

import { runCaptureUrlCommand } from "./capture-url.js";
import { runCaptureCommand } from "./capture.js";
import { CliUsageError } from "./cli-usage-error.js";
import {
  captureCommandHelp,
  captureUrlCommandHelp,
  ROOT_HELP,
} from "./help.js";

export type CliExitCode = 0 | 1 | 2;

type CliCommandRunner = (args: readonly string[]) => Promise<void>;
type CliTextWriter = (text: string) => Promise<void>;

export interface CliDependencies {
  readonly runCapture?: CliCommandRunner;
  readonly runCaptureUrl?: CliCommandRunner;
  readonly writeStandardOutput?: CliTextWriter;
}

export interface CliExecutableDependencies extends CliDependencies {
  readonly writeStandardError?: CliTextWriter;
}

/** Strictly dispatch one root CLI invocation. Command failures propagate. */
export async function runCli(
  args: readonly string[],
  dependencies: CliDependencies = {},
): Promise<void> {
  const writeStandardOutput =
    dependencies.writeStandardOutput ?? defaultWriteStandardOutput;

  if (args.length === 0) {
    throw new CliUsageError("A command is required.");
  }

  if (args.length === 1 && args[0] === "--help") {
    await writeStandardOutput(ROOT_HELP);
    return;
  }

  if (args.length === 1 && args[0] === "--version") {
    await writeStandardOutput(`${readPackageVersion()}\n`);
    return;
  }

  const command = args[0]!;
  const commandArgs = args.slice(1);

  if (command === "capture") {
    if (commandArgs.length === 1 && commandArgs[0] === "--help") {
      await writeStandardOutput(captureCommandHelp());
      return;
    }

    await (dependencies.runCapture ?? runCaptureCommand)(commandArgs);
    return;
  }

  if (command === "capture-url") {
    if (commandArgs.length === 1 && commandArgs[0] === "--help") {
      await writeStandardOutput(captureUrlCommandHelp());
      return;
    }

    await (dependencies.runCaptureUrl ?? runCaptureUrlCommand)(commandArgs);
    return;
  }

  throw new CliUsageError(`Unknown command '${command}'.`);
}

/** Run the executable behind one concise failure and exit-code boundary. */
export async function runCliExecutable(
  args: readonly string[],
  dependencies: CliExecutableDependencies = {},
): Promise<CliExitCode> {
  try {
    await runCli(args, dependencies);
    return 0;
  } catch (error) {
    const exitCode = error instanceof CliUsageError ? 2 : 1;

    try {
      const writeStandardError =
        dependencies.writeStandardError ?? defaultWriteStandardError;
      await writeStandardError(formatFailure(error));
    } catch {
      // A failed failure-message write has no additional safe output channel.
    }

    return exitCode;
  }
}

/** Format only the approved human-readable message and API details. */
export function formatFailure(error: unknown): string {
  let output = `${error instanceof Error ? error.message : String(error)}\n`;

  if (
    error instanceof ScreenshotScoutApiError &&
    error.errors !== undefined &&
    error.errors.length > 0
  ) {
    output += `${JSON.stringify(error.errors)}\n`;
  }

  return output;
}

function readPackageVersion(): string {
  const packageJson: unknown = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );

  if (
    packageJson === null ||
    typeof packageJson !== "object" ||
    !("version" in packageJson) ||
    typeof packageJson.version !== "string"
  ) {
    throw new Error("The CLI package version is unavailable.");
  }

  return packageJson.version;
}

function defaultWriteStandardOutput(text: string): Promise<void> {
  return writeProcessStream(process.stdout, text);
}

function defaultWriteStandardError(text: string): Promise<void> {
  return writeProcessStream(process.stderr, text);
}

function writeProcessStream(
  stream: NodeJS.WriteStream,
  text: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(text, (error) => {
      if (error === null || error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}
