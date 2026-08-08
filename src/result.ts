import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CaptureResponse } from "@screenshotscout/sdk";

export interface CaptureResultIo {
  readonly currentDirectory: () => string;
  readonly writeFile: (path: string, bytes: Uint8Array) => Promise<void>;
  readonly writeStandardOutput: (bytes: Uint8Array) => Promise<void>;
}

const DEFAULT_CAPTURE_RESULT_IO: CaptureResultIo = {
  currentDirectory: () => process.cwd(),
  writeFile: (path, bytes) => writeFile(path, bytes),
  writeStandardOutput,
};

/** Save or display one successful SDK capture response without transforming it. */
export async function writeCaptureResult(
  response: CaptureResponse,
  outputPath: string | undefined,
  io: CaptureResultIo = DEFAULT_CAPTURE_RESULT_IO,
): Promise<void> {
  const bytes =
    response.kind === "binary" ? response.bytes : response.rawResponse.body;

  if (
    outputPath === "-" ||
    (outputPath === undefined && response.kind === "json")
  ) {
    await io.writeStandardOutput(bytes);
    return;
  }

  const destination =
    outputPath ??
    join(
      io.currentDirectory(),
      `screenshot${captureFileExtension(response.rawResponse.contentType)}`,
    );
  await io.writeFile(destination, bytes);
}

/** Map only a returned response Content-Type to an automatic file extension. */
export function captureFileExtension(contentType: string | null): string {
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();

  switch (mediaType) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/tiff":
      return ".tiff";
    case "application/pdf":
      return ".pdf";
    default:
      return ".bin";
  }
}

function writeStandardOutput(bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdout.write(bytes, (error) => {
      if (error === null || error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}
