import assert from "node:assert/strict";
import test from "node:test";

import { CAPTURE_OPTION_DEFINITIONS } from "../../src/capture-options.js";

const EXPECTED_SDK_NAMES = [
  "format",
  "responseType",
  "country",
  "proxy",
  "geolocationLatitude",
  "geolocationLongitude",
  "geolocationAccuracy",
  "cookies",
  "headers",
  "timeout",
  "waitUntil",
  "navigationTimeout",
  "delay",
  "device",
  "deviceViewportWidth",
  "deviceViewportHeight",
  "deviceScaleFactor",
  "deviceIsMobile",
  "deviceHasTouch",
  "deviceUserAgent",
  "timezone",
  "mediaType",
  "colorScheme",
  "reducedMotion",
  "fullPage",
  "fullPagePreScroll",
  "fullPagePreScrollStep",
  "fullPagePreScrollStepDelay",
  "fullPageMaxHeight",
  "blockCookieBanners",
  "blockAds",
  "blockChatWidgets",
  "hideSelectors",
  "clickSelectors",
  "clickAllSelectors",
  "injectCss",
  "injectJs",
  "bypassCsp",
  "selector",
  "clipX",
  "clipY",
  "clipWidth",
  "clipHeight",
  "imageWidth",
  "imageHeight",
  "imageMode",
  "imageAnchor",
  "imageAllowUpscale",
  "imageBackground",
  "imageQuality",
  "pdfPaperFormat",
  "pdfLandscape",
  "pdfPrintBackground",
  "pdfMargin",
  "pdfMarginTop",
  "pdfMarginRight",
  "pdfMarginBottom",
  "pdfMarginLeft",
  "pdfScale",
  "pdfPageRanges",
  "cache",
  "cacheTtl",
  "cacheKey",
  "storageMode",
  "storageEndpoint",
  "storageBucket",
  "storageRegion",
  "storageObjectKey",
] as const;

const NUMBER_OPTIONS = new Set([
  "geolocationLatitude",
  "geolocationLongitude",
  "geolocationAccuracy",
  "timeout",
  "navigationTimeout",
  "delay",
  "deviceViewportWidth",
  "deviceViewportHeight",
  "deviceScaleFactor",
  "fullPagePreScrollStep",
  "fullPagePreScrollStepDelay",
  "fullPageMaxHeight",
  "clipX",
  "clipY",
  "clipWidth",
  "clipHeight",
  "imageWidth",
  "imageHeight",
  "imageQuality",
  "pdfScale",
  "cacheTtl",
]);

const BOOLEAN_OPTIONS = new Set([
  "deviceIsMobile",
  "deviceHasTouch",
  "reducedMotion",
  "fullPage",
  "fullPagePreScroll",
  "blockCookieBanners",
  "blockAds",
  "blockChatWidgets",
  "bypassCsp",
  "imageAllowUpscale",
  "pdfLandscape",
  "pdfPrintBackground",
  "cache",
]);

const REPEATED_OPTIONS = new Set([
  "cookies",
  "headers",
  "hideSelectors",
  "clickSelectors",
  "clickAllSelectors",
  "injectCss",
  "injectJs",
]);

void test("descriptor accounts for every SDK option and all three name forms", () => {
  assert.deepEqual(Object.keys(CAPTURE_OPTION_DEFINITIONS), EXPECTED_SDK_NAMES);

  const apiNames = new Set<string>();
  const cliNames = new Set<string>();

  for (const sdkName of EXPECTED_SDK_NAMES) {
    const definition = CAPTURE_OPTION_DEFINITIONS[sdkName];
    const expectedApiName = delimitCamelCase(sdkName, "_");
    const expectedCliName = delimitCamelCase(sdkName, "-");

    assert.equal(definition.sdkName, sdkName);
    assert.equal(definition.apiName, expectedApiName);
    assert.equal(definition.cliName, expectedCliName);
    assert.equal(definition.multiple, REPEATED_OPTIONS.has(sdkName));
    assert.equal(
      definition.kind,
      BOOLEAN_OPTIONS.has(sdkName)
        ? "boolean"
        : NUMBER_OPTIONS.has(sdkName)
          ? "number"
          : "string",
    );

    assert.equal(apiNames.has(definition.apiName), false);
    assert.equal(cliNames.has(definition.cliName), false);
    apiNames.add(definition.apiName);
    cliNames.add(definition.cliName);
  }
});

function delimitCamelCase(value: string, delimiter: "-" | "_"): string {
  return value.replaceAll(/[A-Z]/g, (character) => {
    return `${delimiter}${character.toLowerCase()}`;
  });
}
