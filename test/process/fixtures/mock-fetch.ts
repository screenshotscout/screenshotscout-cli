const responseBody = Uint8Array.from(
  Buffer.from(process.env.CLI_TEST_RESPONSE_BASE64 ?? "", "base64"),
);
const responseStatus = Number(process.env.CLI_TEST_RESPONSE_STATUS ?? "200");
const responseStatusText =
  process.env.CLI_TEST_RESPONSE_STATUS_TEXT ??
  (responseStatus >= 400 ? "Bad Request" : "OK");
const responseHeaders = new Headers();
const contentType = process.env.CLI_TEST_RESPONSE_CONTENT_TYPE;

if (contentType !== undefined) {
  responseHeaders.set("Content-Type", contentType);
}

const mockFetch: typeof globalThis.fetch = (input, init) => {
  const transportFailure = process.env.CLI_TEST_TRANSPORT_FAILURE;
  if (transportFailure !== undefined) {
    return Promise.reject(new Error(transportFailure));
  }

  // Echo the request line, so a test can check the method and URL the CLI sent.
  if (process.env.CLI_TEST_ECHO_REQUEST !== undefined) {
    const url = input instanceof Request ? input.url : input.toString();
    return Promise.resolve(
      new Response(`${init?.method ?? "GET"} ${url}`, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
  }

  return Promise.resolve(
    new Response(responseBody, {
      status: responseStatus,
      statusText: responseStatusText,
      headers: responseHeaders,
    }),
  );
};

globalThis.fetch = mockFetch;
