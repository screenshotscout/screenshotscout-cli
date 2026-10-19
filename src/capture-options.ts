import type { CaptureOptions } from "@screenshotscout/sdk";

export type CaptureOptionValueKind = "boolean" | "number" | "string";

type Present<T> = Exclude<T, null | undefined>;
type Scalar<T> = Present<T> extends readonly (infer Item)[] ? Item : Present<T>;
type ValueKind<T> =
  Scalar<T> extends boolean
    ? "boolean"
    : Scalar<T> extends number
      ? "number"
      : Scalar<T> extends string
        ? "string"
        : never;
type IsRepeated<T> = Present<T> extends readonly string[] ? true : false;

type DelimitedCase<
  Value extends string,
  Delimiter extends "-" | "_",
> = Value extends `${infer Character}${infer Rest}`
  ? Character extends Lowercase<Character>
    ? `${Character}${DelimitedCase<Rest, Delimiter>}`
    : `${Delimiter}${Lowercase<Character>}${DelimitedCase<Rest, Delimiter>}`
  : Value;

type CaptureOptionDefinitionMap = {
  readonly [SdkName in keyof CaptureOptions]-?: {
    readonly sdkName: SdkName;
    readonly apiName: DelimitedCase<SdkName & string, "_">;
    readonly cliName: DelimitedCase<SdkName & string, "-">;
    readonly kind: ValueKind<CaptureOptions[SdkName]>;
    readonly multiple: IsRepeated<CaptureOptions[SdkName]>;
  };
};

/**
 * The single runtime source of truth for translating capture-option names and
 * CLI-owned value shapes. The mapped type makes a changed SDK CaptureOptions
 * surface a compile-time failure until this descriptor is updated deliberately.
 */
export const CAPTURE_OPTION_DEFINITIONS = {
  format: {
    sdkName: "format",
    apiName: "format",
    cliName: "format",
    kind: "string",
    multiple: false,
  },
  responseType: {
    sdkName: "responseType",
    apiName: "response_type",
    cliName: "response-type",
    kind: "string",
    multiple: false,
  },
  country: {
    sdkName: "country",
    apiName: "country",
    cliName: "country",
    kind: "string",
    multiple: false,
  },
  proxy: {
    sdkName: "proxy",
    apiName: "proxy",
    cliName: "proxy",
    kind: "string",
    multiple: false,
  },
  geolocationLatitude: {
    sdkName: "geolocationLatitude",
    apiName: "geolocation_latitude",
    cliName: "geolocation-latitude",
    kind: "number",
    multiple: false,
  },
  geolocationLongitude: {
    sdkName: "geolocationLongitude",
    apiName: "geolocation_longitude",
    cliName: "geolocation-longitude",
    kind: "number",
    multiple: false,
  },
  geolocationAccuracy: {
    sdkName: "geolocationAccuracy",
    apiName: "geolocation_accuracy",
    cliName: "geolocation-accuracy",
    kind: "number",
    multiple: false,
  },
  cookies: {
    sdkName: "cookies",
    apiName: "cookies",
    cliName: "cookies",
    kind: "string",
    multiple: true,
  },
  headers: {
    sdkName: "headers",
    apiName: "headers",
    cliName: "headers",
    kind: "string",
    multiple: true,
  },
  timeout: {
    sdkName: "timeout",
    apiName: "timeout",
    cliName: "timeout",
    kind: "number",
    multiple: false,
  },
  waitUntil: {
    sdkName: "waitUntil",
    apiName: "wait_until",
    cliName: "wait-until",
    kind: "string",
    multiple: false,
  },
  navigationTimeout: {
    sdkName: "navigationTimeout",
    apiName: "navigation_timeout",
    cliName: "navigation-timeout",
    kind: "number",
    multiple: false,
  },
  delay: {
    sdkName: "delay",
    apiName: "delay",
    cliName: "delay",
    kind: "number",
    multiple: false,
  },
  device: {
    sdkName: "device",
    apiName: "device",
    cliName: "device",
    kind: "string",
    multiple: false,
  },
  deviceViewportWidth: {
    sdkName: "deviceViewportWidth",
    apiName: "device_viewport_width",
    cliName: "device-viewport-width",
    kind: "number",
    multiple: false,
  },
  deviceViewportHeight: {
    sdkName: "deviceViewportHeight",
    apiName: "device_viewport_height",
    cliName: "device-viewport-height",
    kind: "number",
    multiple: false,
  },
  deviceScaleFactor: {
    sdkName: "deviceScaleFactor",
    apiName: "device_scale_factor",
    cliName: "device-scale-factor",
    kind: "number",
    multiple: false,
  },
  deviceIsMobile: {
    sdkName: "deviceIsMobile",
    apiName: "device_is_mobile",
    cliName: "device-is-mobile",
    kind: "boolean",
    multiple: false,
  },
  deviceHasTouch: {
    sdkName: "deviceHasTouch",
    apiName: "device_has_touch",
    cliName: "device-has-touch",
    kind: "boolean",
    multiple: false,
  },
  deviceUserAgent: {
    sdkName: "deviceUserAgent",
    apiName: "device_user_agent",
    cliName: "device-user-agent",
    kind: "string",
    multiple: false,
  },
  timezone: {
    sdkName: "timezone",
    apiName: "timezone",
    cliName: "timezone",
    kind: "string",
    multiple: false,
  },
  mediaType: {
    sdkName: "mediaType",
    apiName: "media_type",
    cliName: "media-type",
    kind: "string",
    multiple: false,
  },
  colorScheme: {
    sdkName: "colorScheme",
    apiName: "color_scheme",
    cliName: "color-scheme",
    kind: "string",
    multiple: false,
  },
  reducedMotion: {
    sdkName: "reducedMotion",
    apiName: "reduced_motion",
    cliName: "reduced-motion",
    kind: "boolean",
    multiple: false,
  },
  fullPage: {
    sdkName: "fullPage",
    apiName: "full_page",
    cliName: "full-page",
    kind: "boolean",
    multiple: false,
  },
  fullPagePreScroll: {
    sdkName: "fullPagePreScroll",
    apiName: "full_page_pre_scroll",
    cliName: "full-page-pre-scroll",
    kind: "boolean",
    multiple: false,
  },
  fullPagePreScrollStep: {
    sdkName: "fullPagePreScrollStep",
    apiName: "full_page_pre_scroll_step",
    cliName: "full-page-pre-scroll-step",
    kind: "number",
    multiple: false,
  },
  fullPagePreScrollStepDelay: {
    sdkName: "fullPagePreScrollStepDelay",
    apiName: "full_page_pre_scroll_step_delay",
    cliName: "full-page-pre-scroll-step-delay",
    kind: "number",
    multiple: false,
  },
  fullPageMaxHeight: {
    sdkName: "fullPageMaxHeight",
    apiName: "full_page_max_height",
    cliName: "full-page-max-height",
    kind: "number",
    multiple: false,
  },
  blockCookieBanners: {
    sdkName: "blockCookieBanners",
    apiName: "block_cookie_banners",
    cliName: "block-cookie-banners",
    kind: "boolean",
    multiple: false,
  },
  blockAds: {
    sdkName: "blockAds",
    apiName: "block_ads",
    cliName: "block-ads",
    kind: "boolean",
    multiple: false,
  },
  blockChatWidgets: {
    sdkName: "blockChatWidgets",
    apiName: "block_chat_widgets",
    cliName: "block-chat-widgets",
    kind: "boolean",
    multiple: false,
  },
  hideSelectors: {
    sdkName: "hideSelectors",
    apiName: "hide_selectors",
    cliName: "hide-selectors",
    kind: "string",
    multiple: true,
  },
  clickSelectors: {
    sdkName: "clickSelectors",
    apiName: "click_selectors",
    cliName: "click-selectors",
    kind: "string",
    multiple: true,
  },
  clickAllSelectors: {
    sdkName: "clickAllSelectors",
    apiName: "click_all_selectors",
    cliName: "click-all-selectors",
    kind: "string",
    multiple: true,
  },
  injectCss: {
    sdkName: "injectCss",
    apiName: "inject_css",
    cliName: "inject-css",
    kind: "string",
    multiple: true,
  },
  injectJs: {
    sdkName: "injectJs",
    apiName: "inject_js",
    cliName: "inject-js",
    kind: "string",
    multiple: true,
  },
  bypassCsp: {
    sdkName: "bypassCsp",
    apiName: "bypass_csp",
    cliName: "bypass-csp",
    kind: "boolean",
    multiple: false,
  },
  selector: {
    sdkName: "selector",
    apiName: "selector",
    cliName: "selector",
    kind: "string",
    multiple: false,
  },
  clipX: {
    sdkName: "clipX",
    apiName: "clip_x",
    cliName: "clip-x",
    kind: "number",
    multiple: false,
  },
  clipY: {
    sdkName: "clipY",
    apiName: "clip_y",
    cliName: "clip-y",
    kind: "number",
    multiple: false,
  },
  clipWidth: {
    sdkName: "clipWidth",
    apiName: "clip_width",
    cliName: "clip-width",
    kind: "number",
    multiple: false,
  },
  clipHeight: {
    sdkName: "clipHeight",
    apiName: "clip_height",
    cliName: "clip-height",
    kind: "number",
    multiple: false,
  },
  imageWidth: {
    sdkName: "imageWidth",
    apiName: "image_width",
    cliName: "image-width",
    kind: "number",
    multiple: false,
  },
  imageHeight: {
    sdkName: "imageHeight",
    apiName: "image_height",
    cliName: "image-height",
    kind: "number",
    multiple: false,
  },
  imageMode: {
    sdkName: "imageMode",
    apiName: "image_mode",
    cliName: "image-mode",
    kind: "string",
    multiple: false,
  },
  imageAnchor: {
    sdkName: "imageAnchor",
    apiName: "image_anchor",
    cliName: "image-anchor",
    kind: "string",
    multiple: false,
  },
  imageAllowUpscale: {
    sdkName: "imageAllowUpscale",
    apiName: "image_allow_upscale",
    cliName: "image-allow-upscale",
    kind: "boolean",
    multiple: false,
  },
  imageBackground: {
    sdkName: "imageBackground",
    apiName: "image_background",
    cliName: "image-background",
    kind: "string",
    multiple: false,
  },
  imageQuality: {
    sdkName: "imageQuality",
    apiName: "image_quality",
    cliName: "image-quality",
    kind: "number",
    multiple: false,
  },
  pdfPaperFormat: {
    sdkName: "pdfPaperFormat",
    apiName: "pdf_paper_format",
    cliName: "pdf-paper-format",
    kind: "string",
    multiple: false,
  },
  pdfLandscape: {
    sdkName: "pdfLandscape",
    apiName: "pdf_landscape",
    cliName: "pdf-landscape",
    kind: "boolean",
    multiple: false,
  },
  pdfPrintBackground: {
    sdkName: "pdfPrintBackground",
    apiName: "pdf_print_background",
    cliName: "pdf-print-background",
    kind: "boolean",
    multiple: false,
  },
  pdfMargin: {
    sdkName: "pdfMargin",
    apiName: "pdf_margin",
    cliName: "pdf-margin",
    kind: "string",
    multiple: false,
  },
  pdfMarginTop: {
    sdkName: "pdfMarginTop",
    apiName: "pdf_margin_top",
    cliName: "pdf-margin-top",
    kind: "string",
    multiple: false,
  },
  pdfMarginRight: {
    sdkName: "pdfMarginRight",
    apiName: "pdf_margin_right",
    cliName: "pdf-margin-right",
    kind: "string",
    multiple: false,
  },
  pdfMarginBottom: {
    sdkName: "pdfMarginBottom",
    apiName: "pdf_margin_bottom",
    cliName: "pdf-margin-bottom",
    kind: "string",
    multiple: false,
  },
  pdfMarginLeft: {
    sdkName: "pdfMarginLeft",
    apiName: "pdf_margin_left",
    cliName: "pdf-margin-left",
    kind: "string",
    multiple: false,
  },
  pdfScale: {
    sdkName: "pdfScale",
    apiName: "pdf_scale",
    cliName: "pdf-scale",
    kind: "number",
    multiple: false,
  },
  pdfPageRanges: {
    sdkName: "pdfPageRanges",
    apiName: "pdf_page_ranges",
    cliName: "pdf-page-ranges",
    kind: "string",
    multiple: false,
  },
  cache: {
    sdkName: "cache",
    apiName: "cache",
    cliName: "cache",
    kind: "boolean",
    multiple: false,
  },
  cacheTtl: {
    sdkName: "cacheTtl",
    apiName: "cache_ttl",
    cliName: "cache-ttl",
    kind: "number",
    multiple: false,
  },
  cacheKey: {
    sdkName: "cacheKey",
    apiName: "cache_key",
    cliName: "cache-key",
    kind: "string",
    multiple: false,
  },
  storageMode: {
    sdkName: "storageMode",
    apiName: "storage_mode",
    cliName: "storage-mode",
    kind: "string",
    multiple: false,
  },
  storageEndpoint: {
    sdkName: "storageEndpoint",
    apiName: "storage_endpoint",
    cliName: "storage-endpoint",
    kind: "string",
    multiple: false,
  },
  storageBucket: {
    sdkName: "storageBucket",
    apiName: "storage_bucket",
    cliName: "storage-bucket",
    kind: "string",
    multiple: false,
  },
  storageRegion: {
    sdkName: "storageRegion",
    apiName: "storage_region",
    cliName: "storage-region",
    kind: "string",
    multiple: false,
  },
  storageObjectKey: {
    sdkName: "storageObjectKey",
    apiName: "storage_object_key",
    cliName: "storage-object-key",
    kind: "string",
    multiple: false,
  },
} as const satisfies CaptureOptionDefinitionMap;

export type CaptureOptionDefinition =
  (typeof CAPTURE_OPTION_DEFINITIONS)[keyof typeof CAPTURE_OPTION_DEFINITIONS];
