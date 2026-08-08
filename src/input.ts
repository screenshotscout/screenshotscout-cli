import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import type { CaptureOptions } from "@screenshotscout/sdk";

import {
  CAPTURE_OPTION_DEFINITIONS,
  type CaptureOptionDefinition,
} from "./capture-options.js";
import { CliUsageError } from "./cli-usage-error.js";

const OPTIONS_INPUT_NAME = "options";
const OMIT_VALUE = Symbol("omit-value");

interface ParseOptionConfiguration {
  readonly type: "boolean" | "string";
  readonly multiple?: boolean;
}

export interface CaptureOptionsInputReader {
  readonly readFile: (path: string) => Promise<string>;
  readonly readStdin: () => Promise<string>;
}

export interface ParsedCaptureInput {
  readonly captureOptions: CaptureOptions;
  readonly positionals: readonly string[];
}

interface ParsedCliInput extends ParsedCaptureInput {
  readonly optionsPath?: string;
}

interface NormalizedArguments {
  readonly args: readonly string[];
  readonly booleanValues: ReadonlyMap<number, boolean>;
}

type ParsedOptionToken = Extract<
  ReturnType<typeof parseNormalizedArguments>["tokens"][number],
  { kind: "option" }
>;

const DEFINITIONS = Object.values(CAPTURE_OPTION_DEFINITIONS);
const DEFINITIONS_BY_CLI_NAME: ReadonlyMap<string, CaptureOptionDefinition> =
  new Map(
    DEFINITIONS.map((definition) => [definition.cliName, definition] as const),
  );
const DEFINITIONS_BY_API_NAME: ReadonlyMap<string, CaptureOptionDefinition> =
  new Map(
    DEFINITIONS.map((definition) => [definition.apiName, definition] as const),
  );

const PARSE_OPTIONS = createParseOptions();

const DEFAULT_INPUT_READER: CaptureOptionsInputReader = {
  readFile: (path) => readFile(path, "utf8"),
  readStdin: readStandardInput,
};

/** Parse capture flags and merge an optional snake_case JSON options object. */
export async function parseCaptureInput(
  args: readonly string[],
  inputReader: CaptureOptionsInputReader = DEFAULT_INPUT_READER,
): Promise<ParsedCaptureInput> {
  const parsedCliInput = parseCliInput(args);
  let fileOptions: CaptureOptions = {};

  if (parsedCliInput.optionsPath !== undefined) {
    const text =
      parsedCliInput.optionsPath === "-"
        ? await inputReader.readStdin()
        : await inputReader.readFile(parsedCliInput.optionsPath);
    fileOptions = parseOptionsObject(text);
  }

  return {
    captureOptions: {
      ...fileOptions,
      ...parsedCliInput.captureOptions,
    },
    positionals: parsedCliInput.positionals,
  };
}

function createParseOptions(): Readonly<
  Record<string, ParseOptionConfiguration>
> {
  const options: Record<string, ParseOptionConfiguration> = {};

  for (const definition of DEFINITIONS) {
    options[definition.cliName] = definition.multiple
      ? { type: "string", multiple: true }
      : { type: definition.kind === "boolean" ? "boolean" : "string" };
  }

  options[OPTIONS_INPUT_NAME] = { type: "string" };
  return options;
}

function parseCliInput(args: readonly string[]): ParsedCliInput {
  const normalized = normalizeArguments(args);
  let parsed: ReturnType<typeof parseNormalizedArguments>;

  try {
    parsed = parseNormalizedArguments(normalized.args);
  } catch (error) {
    throw usageErrorFrom(error);
  }

  const captureOptions: Record<string, unknown> = {};
  const occurrences = new Map<string, number>();
  let optionsPath: string | undefined;

  for (const token of parsed.tokens) {
    if (token.kind !== "option") continue;

    const count = (occurrences.get(token.name) ?? 0) + 1;
    occurrences.set(token.name, count);

    if (token.name === OPTIONS_INPUT_NAME) {
      if (count > 1) throw duplicateOption(token.rawName);
      optionsPath = requiredTokenValue(token);
      continue;
    }

    const definition = DEFINITIONS_BY_CLI_NAME.get(token.name);
    if (definition === undefined) {
      throw new Error(
        `Parser returned an unconfigured option '${token.name}'.`,
      );
    }

    if (!definition.multiple && count > 1) {
      throw duplicateOption(token.rawName);
    }

    applyCliValue(captureOptions, definition, token, normalized.booleanValues);
  }

  const result: ParsedCliInput = {
    captureOptions,
    positionals: [...parsed.positionals],
  };

  return optionsPath === undefined ? result : { ...result, optionsPath };
}

function parseNormalizedArguments(args: readonly string[]) {
  return parseArgs({
    args,
    allowPositionals: true,
    options: PARSE_OPTIONS,
    strict: true,
    tokens: true,
  });
}

function normalizeArguments(args: readonly string[]): NormalizedArguments {
  const normalized: string[] = [];
  const booleanValues = new Map<number, boolean>();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) continue;
    if (argument === "--") {
      normalized.push(...args.slice(index));
      break;
    }
    if (!argument.startsWith("--")) {
      normalized.push(argument);
      continue;
    }

    const separatorIndex = argument.indexOf("=");
    const cliName = argument.slice(
      2,
      separatorIndex === -1 ? undefined : separatorIndex,
    );
    const definition = DEFINITIONS_BY_CLI_NAME.get(cliName);
    if (definition?.kind !== "boolean") {
      const nextArgument = args[index + 1];
      if (
        definition !== undefined &&
        separatorIndex === -1 &&
        nextArgument !== undefined &&
        nextArgument.startsWith("-") &&
        !nextArgument.startsWith("--")
      ) {
        normalized.push(`${argument}=${nextArgument}`);
        index += 1;
      } else {
        normalized.push(argument);
      }
      continue;
    }

    const normalizedIndex = normalized.length;

    if (separatorIndex === -1) {
      const nextArgument = args[index + 1];
      if (nextArgument === "true" || nextArgument === "false") {
        throw new CliUsageError(
          `Option '--${cliName}' does not accept a space-separated boolean value.`,
        );
      }

      normalized.push(argument);
      booleanValues.set(normalizedIndex, true);
      continue;
    }

    const value = argument.slice(separatorIndex + 1);
    if (value !== "true" && value !== "false") {
      throw new CliUsageError(
        `Option '--${cliName}' accepts only 'true' or 'false' as an inline value.`,
      );
    }

    normalized.push(`--${cliName}`);
    booleanValues.set(normalizedIndex, value === "true");
  }

  return { args: normalized, booleanValues };
}

function applyCliValue(
  output: Record<string, unknown>,
  definition: CaptureOptionDefinition,
  token: ParsedOptionToken,
  booleanValues: ReadonlyMap<number, boolean>,
): void {
  if (definition.kind === "boolean") {
    const value = booleanValues.get(token.index);
    if (value === undefined) {
      throw new Error(`Boolean option '${token.rawName}' was not normalized.`);
    }

    output[definition.sdkName] = value;
    return;
  }

  const rawValue = requiredTokenValue(token);
  if (definition.multiple) {
    const current = output[definition.sdkName];
    if (current === undefined) {
      output[definition.sdkName] = [rawValue];
      return;
    }

    if (!Array.isArray(current)) {
      throw new Error(`Repeated option '${token.rawName}' has invalid state.`);
    }

    current.push(rawValue);
    return;
  }

  output[definition.sdkName] =
    definition.kind === "number"
      ? parseFiniteNumber(rawValue, token.rawName)
      : rawValue;
}

function requiredTokenValue(token: ParsedOptionToken): string {
  if (token.value === undefined) {
    throw new Error(`String option '${token.rawName}' has no parsed value.`);
  }

  return token.value;
}

function parseFiniteNumber(value: string, optionName: string): number {
  const parsed = Number(value);
  if (value.trim() === "" || !Number.isFinite(parsed)) {
    throw new CliUsageError(`Option '${optionName}' requires a finite number.`);
  }

  return parsed;
}

function parseOptionsObject(text: string): CaptureOptions {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    throw new CliUsageError(`Options input is not valid JSON.${detail}`, {
      cause: error,
    });
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliUsageError("Options input must be a JSON object.");
  }

  const output: Record<string, unknown> = {};
  for (const [apiName, value] of Object.entries(parsed)) {
    const definition = DEFINITIONS_BY_API_NAME.get(apiName);
    if (definition === undefined) throw unknownOption(apiName);

    const parsedValue = parseOptionsObjectValue(definition, value);
    if (parsedValue !== OMIT_VALUE) {
      output[definition.sdkName] = parsedValue;
    }
  }

  return output;
}

function parseOptionsObjectValue(
  definition: CaptureOptionDefinition,
  value: unknown,
): unknown {
  if (value === null) return OMIT_VALUE;

  if (definition.multiple) {
    if (
      !Array.isArray(value) ||
      !value.every((item) => typeof item === "string")
    ) {
      throw invalidOptionsType(definition.apiName, "an array of strings");
    }

    return value.length === 0 ? OMIT_VALUE : [...value];
  }

  if (definition.kind === "string") {
    if (typeof value !== "string") {
      throw invalidOptionsType(definition.apiName, "a string");
    }

    return value;
  }

  if (definition.kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw invalidOptionsType(definition.apiName, "a finite number");
    }

    return value;
  }

  if (typeof value !== "boolean") {
    throw invalidOptionsType(definition.apiName, "a boolean");
  }

  return value;
}

function invalidOptionsType(apiName: string, expected: string): CliUsageError {
  return new CliUsageError(
    `Option '${apiName}' in the options input must be ${expected}.`,
  );
}

function unknownOption(name: string): CliUsageError {
  return new CliUsageError(`Unknown option '${name}'.`);
}

function duplicateOption(name: string): CliUsageError {
  return new CliUsageError(`Option '${name}' may only be specified once.`);
}

function usageErrorFrom(error: unknown): CliUsageError {
  return new CliUsageError(
    error instanceof Error ? error.message : String(error),
    { cause: error },
  );
}

async function readStandardInput(): Promise<string> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of process.stdin as AsyncIterable<unknown>) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else if (chunk instanceof Uint8Array) {
      chunks.push(chunk);
    } else {
      throw new TypeError("Standard input produced a non-byte chunk.");
    }
  }

  return Buffer.concat(chunks).toString("utf8");
}
