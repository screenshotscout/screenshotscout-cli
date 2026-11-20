import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import type { CaptureOptions } from "@screenshotscout/sdk";

import {
  CAPTURE_OPTION_DEFINITIONS,
  type CaptureOptionDefinition,
} from "./capture-options.js";
import { CliUsageError } from "./cli-usage-error.js";
import type { CaptureMethod } from "./sdk.js";

const OPTIONS_INPUT_NAME = "options";
const HTML_INPUT_NAME = "html";
const METHOD_INPUT_NAME = "method";
const OUTPUT_INPUT_NAME = "output";
const OMIT_VALUE = Symbol("omit-value");

interface ParseOptionConfiguration {
  readonly type: "boolean" | "string";
  readonly multiple?: boolean;
  readonly short?: string;
}

/** Reads the bytes of an --options or --html input from a file or standard input. */
export interface CaptureOptionsInputReader {
  readonly readFile: (path: string) => Promise<Uint8Array>;
  readonly readStdin: () => Promise<Uint8Array>;
}

export interface ParsedCaptureInput {
  readonly captureOptions: CaptureOptions;
  readonly positionals: readonly string[];
}

interface ParsedCaptureCommandControls {
  readonly captureOptions: CaptureOptions;
  readonly method: CaptureMethod | undefined;
  readonly outputPath: string | undefined;
}

/** The capture command's input: one URL, or the HTML document that --html read. */
export type ParsedCaptureCommandInput = ParsedCaptureCommandControls &
  (
    | { readonly html?: undefined; readonly targetUrl: string }
    | { readonly html: string; readonly targetUrl?: undefined }
  );

export interface ParsedCaptureUrlCommandInput {
  readonly captureOptions: CaptureOptions;
  readonly targetUrl: string;
}

interface ParsedCliInput extends ParsedCaptureInput {
  readonly htmlPath?: string;
  readonly method?: CaptureMethod;
  readonly optionsPath?: string;
  readonly outputPath?: string;
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

const CAPTURE_PARSE_OPTIONS = createParseOptions(false);
const CAPTURE_COMMAND_PARSE_OPTIONS = createParseOptions(true);

const DEFAULT_INPUT_READER: CaptureOptionsInputReader = {
  readFile: (path) => readFile(path),
  readStdin: readStandardInput,
};

/** Parse capture flags and merge an optional snake_case JSON options object. */
export async function parseCaptureInput(
  args: readonly string[],
  inputReader: CaptureOptionsInputReader = DEFAULT_INPUT_READER,
): Promise<ParsedCaptureInput> {
  const parsed = parseCliInput(args, false);
  return {
    captureOptions: await readCaptureOptions(parsed, inputReader),
    positionals: parsed.positionals,
  };
}

/** Parse the capture command's URL or --html document, capture options, and CLI controls. */
export async function parseCaptureCommandInput(
  args: readonly string[],
  inputReader: CaptureOptionsInputReader = DEFAULT_INPUT_READER,
): Promise<ParsedCaptureCommandInput> {
  const parsed = parseCliInput(args, true);
  const { htmlPath, method, optionsPath, outputPath, positionals } = parsed;

  // Usage errors come before anything is read.
  if (positionals.length !== (htmlPath === undefined ? 1 : 0)) {
    throw new CliUsageError(
      "Command 'capture' requires exactly one URL, or the --html option.",
    );
  }
  if (htmlPath === "-" && optionsPath === "-") {
    throw new CliUsageError(
      "Options '--html' and '--options' can't both read from standard input.",
    );
  }
  if (htmlPath !== undefined && method === "get") {
    throw new CliUsageError(
      "Option '--html' can't be used with '--method get': HTML is sent in a POST request.",
    );
  }

  const controls: ParsedCaptureCommandControls = {
    captureOptions: await readCaptureOptions(parsed, inputReader),
    method,
    outputPath,
  };

  if (htmlPath === undefined) {
    return { ...controls, targetUrl: positionals[0]! };
  }

  return { ...controls, html: await readHtml(htmlPath, inputReader) };
}

/** Parse the capture-url command's URL and capture options. */
export async function parseCaptureUrlCommandInput(
  args: readonly string[],
  inputReader: CaptureOptionsInputReader = DEFAULT_INPUT_READER,
): Promise<ParsedCaptureUrlCommandInput> {
  const parsed = parseCliInput(args, false);
  if (parsed.positionals.length !== 1) {
    throw new CliUsageError("Command 'capture-url' requires exactly one URL.");
  }

  return {
    captureOptions: await readCaptureOptions(parsed, inputReader),
    targetUrl: parsed.positionals[0]!,
  };
}

/** Read the --options object, if any, and let the capture flags override it. */
async function readCaptureOptions(
  parsedCliInput: ParsedCliInput,
  inputReader: CaptureOptionsInputReader,
): Promise<CaptureOptions> {
  let fileOptions: CaptureOptions = {};

  if (parsedCliInput.optionsPath !== undefined) {
    const bytes = await readInput(parsedCliInput.optionsPath, inputReader);
    fileOptions = parseOptionsObject(Buffer.from(bytes).toString("utf8"));
  }

  return {
    ...fileOptions,
    ...parsedCliInput.captureOptions,
  };
}

/** Read and decode the --html document, which must contain more than whitespace. */
async function readHtml(
  path: string,
  inputReader: CaptureOptionsInputReader,
): Promise<string> {
  const html = decodeHtml(await readInput(path, inputReader));
  if (html.trim() === "") {
    throw new CliUsageError("Option '--html' received an empty document.");
  }

  return html;
}

function readInput(
  path: string,
  inputReader: CaptureOptionsInputReader,
): Promise<Uint8Array> {
  return path === "-" ? inputReader.readStdin() : inputReader.readFile(path);
}

/**
 * Decode UTF-16 by its byte-order mark (Windows PowerShell 5.1 writes UTF-16 by
 * default), and anything else as UTF-8. The decoder drops the byte-order mark.
 */
function decodeHtml(bytes: Uint8Array): string {
  let encoding = "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = "utf-16le";
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = "utf-16be";
  }

  return new TextDecoder(encoding).decode(bytes);
}

function createParseOptions(
  includeCaptureControls: boolean,
): Readonly<Record<string, ParseOptionConfiguration>> {
  const options: Record<string, ParseOptionConfiguration> = {};

  for (const definition of DEFINITIONS) {
    options[definition.cliName] = definition.multiple
      ? { type: "string", multiple: true }
      : { type: definition.kind === "boolean" ? "boolean" : "string" };
  }

  options[OPTIONS_INPUT_NAME] = { type: "string" };
  if (includeCaptureControls) {
    options[HTML_INPUT_NAME] = { type: "string" };
    options[METHOD_INPUT_NAME] = { type: "string" };
    options[OUTPUT_INPUT_NAME] = { type: "string", short: "o" };
  }
  return options;
}

function parseCliInput(
  args: readonly string[],
  includeCaptureControls: boolean,
): ParsedCliInput {
  const normalized = normalizeArguments(args);
  let parsed: ReturnType<typeof parseNormalizedArguments>;

  try {
    parsed = parseNormalizedArguments(
      normalized.args,
      includeCaptureControls
        ? CAPTURE_COMMAND_PARSE_OPTIONS
        : CAPTURE_PARSE_OPTIONS,
    );
  } catch (error) {
    throw usageErrorFrom(error);
  }

  const captureOptions: Record<string, unknown> = {};
  const occurrences = new Map<string, number>();
  let htmlPath: string | undefined;
  let method: CaptureMethod | undefined;
  let optionsPath: string | undefined;
  let outputPath: string | undefined;

  for (const token of parsed.tokens) {
    if (token.kind !== "option") continue;

    const count = (occurrences.get(token.name) ?? 0) + 1;
    occurrences.set(token.name, count);

    if (token.name === OPTIONS_INPUT_NAME) {
      if (count > 1) throw duplicateOption(token.rawName);
      optionsPath = requiredTokenValue(token);
      continue;
    }

    if (token.name === HTML_INPUT_NAME) {
      if (count > 1) throw duplicateOption(token.rawName);
      htmlPath = requiredTokenValue(token);
      continue;
    }

    if (token.name === METHOD_INPUT_NAME) {
      if (count > 1) throw duplicateOption(token.rawName);
      method = parseCaptureMethod(requiredTokenValue(token));
      continue;
    }

    if (token.name === OUTPUT_INPUT_NAME) {
      if (count > 1) throw duplicateOption(token.rawName);
      outputPath = requiredTokenValue(token);
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

  return {
    ...result,
    ...(htmlPath === undefined ? {} : { htmlPath }),
    ...(method === undefined ? {} : { method }),
    ...(optionsPath === undefined ? {} : { optionsPath }),
    ...(outputPath === undefined ? {} : { outputPath }),
  };
}

function parseNormalizedArguments(
  args: readonly string[],
  options: Readonly<
    Record<string, ParseOptionConfiguration>
  > = CAPTURE_PARSE_OPTIONS,
) {
  return parseArgs({
    args,
    allowPositionals: true,
    options,
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

function parseCaptureMethod(value: string): CaptureMethod {
  if (value !== "get" && value !== "post") {
    throw new CliUsageError("Option '--method' must be 'get' or 'post'.");
  }

  return value;
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

async function readStandardInput(): Promise<Uint8Array> {
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

  return Buffer.concat(chunks);
}
