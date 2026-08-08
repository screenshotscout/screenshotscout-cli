import {
  CAPTURE_OPTION_DEFINITIONS,
  type CaptureOptionDefinition,
} from "./capture-options.js";

export const ROOT_HELP = `Screenshot Scout CLI

Usage:
  screenshotscout capture <url> [capture options] [CLI controls]
  screenshotscout capture-url <url> [capture options]
  screenshotscout --help
  screenshotscout --version

Commands:
  capture      Capture one URL.
  capture-url  Build one capture URL locally.

Options:
  --help       Show root help.
  --version    Show the CLI version.

Run "screenshotscout <command> --help" for command options.
`;

const CAPTURE_OPTION_HELP = Object.values(CAPTURE_OPTION_DEFINITIONS)
  .map(formatCaptureOption)
  .join("\n");

export function captureCommandHelp(): string {
  return `Usage:
  screenshotscout capture <url> [capture options] [CLI controls]

CLI controls:
  --options <path|->       Read a snake_case JSON options object from a file or standard input.
  --method <get|post>      Select the SDK capture request method.
  -o, --output <path|->   Write the response to a file or standard output.
  --help                   Show this help.

Capture options:
${CAPTURE_OPTION_HELP}

Boolean capture options accept a bare flag or an inline true/false value.
Repeatable capture options preserve order and duplicates.
`;
}

export function captureUrlCommandHelp(): string {
  return `Usage:
  screenshotscout capture-url <url> [capture options]

CLI controls:
  --options <path|->   Read a snake_case JSON options object from a file or standard input.
  --help               Show this help.

Capture options:
${CAPTURE_OPTION_HELP}

Boolean capture options accept a bare flag or an inline true/false value.
Repeatable capture options preserve order and duplicates.
`;
}

function formatCaptureOption(definition: CaptureOptionDefinition): string {
  const valueShape =
    definition.kind === "boolean" ? "[=true|false]" : ` <${definition.kind}>`;
  const repetition = definition.multiple ? " (repeatable)" : "";
  return `  --${definition.cliName}${valueShape}${repetition}`;
}
