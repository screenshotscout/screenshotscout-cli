import {
  CaptureHttpMethod,
  ScreenshotScoutClient,
  type CaptureOptions,
  type CaptureRequestOptions,
  type CaptureResponse,
  type ScreenshotScoutClientOptions,
} from "@screenshotscout/sdk";

import { CliUsageError } from "./cli-usage-error.js";

export interface ScreenshotScoutEnvironment {
  readonly SCREENSHOTSCOUT_ACCESS_KEY?: string;
  readonly SCREENSHOTSCOUT_SECRET_KEY?: string;
}

/** The public SDK methods used by the two CLI commands. */
export interface ScreenshotScoutSdkClient {
  capture(
    targetUrl: string,
    captureOptions?: CaptureOptions | null,
    captureRequestOptions?: CaptureRequestOptions | null,
  ): Promise<CaptureResponse>;
  buildCaptureUrl(
    targetUrl: string,
    captureOptions?: CaptureOptions | null,
  ): string;
}

export type ScreenshotScoutClientFactory = (
  options: ScreenshotScoutClientOptions,
) => ScreenshotScoutSdkClient;

const DEFAULT_CLIENT_FACTORY: ScreenshotScoutClientFactory = (options) =>
  new ScreenshotScoutClient(options);

/** Construct the official SDK client from the two approved environment names. */
export function createScreenshotScoutClient(
  environment: ScreenshotScoutEnvironment = process.env,
  clientFactory: ScreenshotScoutClientFactory = DEFAULT_CLIENT_FACTORY,
): ScreenshotScoutSdkClient {
  const accessKey = environment.SCREENSHOTSCOUT_ACCESS_KEY;
  const secretKey = environment.SCREENSHOTSCOUT_SECRET_KEY;
  const options: ScreenshotScoutClientOptions = {
    // Missing and invalid values deliberately reach the SDK's own validation.
    accessKey: accessKey!,
    ...(secretKey === undefined ? {} : { secretKey }),
  };

  return clientFactory(options);
}

/** Make one capture call with only an explicitly selected request method. */
export function captureWithScreenshotScoutClient(
  client: ScreenshotScoutSdkClient,
  targetUrl: string,
  captureOptions: CaptureOptions,
  method: string | undefined,
): Promise<CaptureResponse> {
  if (method === undefined) {
    return client.capture(targetUrl, captureOptions);
  }

  const captureRequestOptions: CaptureRequestOptions = {
    method:
      method === "get"
        ? CaptureHttpMethod.GET
        : method === "post"
          ? CaptureHttpMethod.POST
          : throwInvalidMethod(),
  };

  return client.capture(targetUrl, captureOptions, captureRequestOptions);
}

function throwInvalidMethod(): never {
  throw new CliUsageError("Option '--method' must be 'get' or 'post'.");
}
