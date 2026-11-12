import {
  CaptureHttpMethod,
  ScreenshotScoutClient,
  type CaptureOptions,
  type CaptureRequestOptions,
  type CaptureResponse,
} from "@screenshotscout/sdk";

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

export type ScreenshotScoutClientFactory = () => ScreenshotScoutSdkClient;

export type CaptureMethod = "get" | "post";

// The SDK reads SCREENSHOTSCOUT_ACCESS_KEY and SCREENSHOTSCOUT_SECRET_KEY itself.
const DEFAULT_CLIENT_FACTORY: ScreenshotScoutClientFactory = () =>
  new ScreenshotScoutClient();

/** Construct the official SDK client, which takes its keys from the environment. */
export function createScreenshotScoutClient(
  clientFactory: ScreenshotScoutClientFactory = DEFAULT_CLIENT_FACTORY,
): ScreenshotScoutSdkClient {
  return clientFactory();
}

/** Make one capture call with only an explicitly selected request method; the SDK picks the default. */
export function captureWithScreenshotScoutClient(
  client: ScreenshotScoutSdkClient,
  targetUrl: string,
  captureOptions: CaptureOptions,
  method: CaptureMethod | undefined,
): Promise<CaptureResponse> {
  if (method === undefined) {
    return client.capture(targetUrl, captureOptions);
  }

  const captureRequestOptions: CaptureRequestOptions = {
    method: method === "get" ? CaptureHttpMethod.GET : CaptureHttpMethod.POST,
  };

  return client.capture(targetUrl, captureOptions, captureRequestOptions);
}
