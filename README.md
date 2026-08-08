# Screenshot Scout CLI

Official command-line interface for the [Screenshot Scout](https://screenshotscout.com/) screenshot API.

Screenshot Scout CLI captures one webpage or builds one capture URL from a terminal command. It sends the capture options you supply and preserves the returned binary, JSON, or URL data.

## Requirements

You need:

- Node.js 22 or newer;
- a Screenshot Scout [access key](https://screenshotscout.com/app/api-keys); and
- the matching secret key only when you want automatic signing or the API key requires signed requests.

## Install

Install the command globally with npm:

```sh
npm install --global @screenshotscout/cli
screenshotscout --help
```

After installation, invoke the CLI as `screenshotscout`. npm creates the platform-appropriate command shim on your `PATH`, including on Windows; you do not need to locate or call an executable file directly.

### Run without installing

To run a specific version without a global installation, replace `<version>` with the version you want:

```sh
npx @screenshotscout/cli@<version> --help
```

The explicit equivalent is:

```sh
npx --package=@screenshotscout/cli@<version> screenshotscout --help
```

## Configure credentials

The CLI reads credentials from the current process environment. It does not load `.env` files automatically.

In a POSIX shell such as Bash or Zsh:

```sh
export SCREENSHOTSCOUT_ACCESS_KEY="YOUR_ACCESS_KEY"
export SCREENSHOTSCOUT_SECRET_KEY="YOUR_SECRET_KEY"
```

In PowerShell:

```powershell
$env:SCREENSHOTSCOUT_ACCESS_KEY = "YOUR_ACCESS_KEY"
$env:SCREENSHOTSCOUT_SECRET_KEY = "YOUR_SECRET_KEY"
```

`SCREENSHOTSCOUT_ACCESS_KEY` is required. `SCREENSHOTSCOUT_SECRET_KEY` is optional; omit its assignment for unsigned requests. When the secret key is configured, capture requests and generated capture URLs are signed automatically, while the secret key stays local.

## Commands

### Capture a URL

Capture one webpage:

```sh
screenshotscout capture "https://example.com"
```

Add capture options and select an output path:

```sh
screenshotscout capture "https://example.com" \
  --format webp \
  --full-page \
  --block-cookie-banners \
  --output screenshot.webp
```

`capture` accepts `--method get` or `--method post`. You can omit `--method` unless you need to select one explicitly.

```sh
screenshotscout capture "https://example.com" --method post --format webp --output screenshot.webp
```

`--method` and `--output` (or `-o`) are `capture` controls and are not accepted by `capture-url`.

### Build a capture URL

Build one GET capture URL locally without making a capture request:

```sh
screenshotscout capture-url "https://example.com" \
  --format webp \
  --full-page \
  --block-cookie-banners
```

The generated URL is written unchanged followed by one line break. Every generated URL includes the access key, may include selected capture options and an automatically generated signature, and never includes the secret key itself. Treat generated URLs as credentials-bearing data.

## Capture options

When translating an option between the Node SDK, API or options file, and CLI, use the corresponding naming style:

| Surface               | Example       |
| --------------------- | ------------- |
| Node SDK              | `fullPage`    |
| API and options files | `full_page`   |
| CLI                   | `--full-page` |

Use command help for the exhaustive current flag list and value shapes:

```sh
screenshotscout capture --help
screenshotscout capture-url --help
```

The [screenshot option reference](https://screenshotscout.com/docs/screenshot-options) describes option meanings and accepted service values. If you omit an option, Screenshot Scout determines its behavior.

Boolean capture options accept a bare positive flag or an inline `true` or `false` value:

```sh
screenshotscout capture "https://example.com" --full-page
screenshotscout capture "https://example.com" --full-page=true
screenshotscout capture "https://example.com" --full-page=false
```

The space-separated forms `--full-page true` and `--full-page false` are not accepted. Omitting `--full-page` is distinct from supplying `--full-page=false`.

Each non-repeatable capture option may be supplied once. Options marked as repeatable in command help use one flag per value and preserve order and duplicates:

```sh
screenshotscout capture "https://example.com" \
  --headers "Accept-Language: en-US" \
  --headers "X-Example: cli"
```

Repeated values are not comma-split. Each CLI control (`--options`, `--method`, and `--output`) may also be supplied only once.

### Options files

Both commands accept `--options <path>` or `--options -` for standard input. The input must be one JSON object containing only exact API `snake_case` capture-option names:

```json
{
  "format": "webp",
  "full_page": true,
  "block_cookie_banners": true
}
```

Save that object as `capture-options.json`, then use the file directly:

```sh
screenshotscout capture "https://example.com" \
  --options capture-options.json \
  --output screenshot.webp
```

Or pipe the JSON object through standard input:

```sh
printf '%s' '{"format":"webp","full_page":true,"block_cookie_banners":true}' |
  screenshotscout capture "https://example.com" --options - --output screenshot.webp
```

Options files are JSON data only; they do not support YAML, templates, environment interpolation, or nested includes. JSON `null` values and empty repeated arrays are omitted. Empty strings, `false`, and zero are retained.

Values from explicit capture flags override values from the options file. An explicit repeated flag replaces the corresponding options-file array instead of appending to it.

## Output

The CLI writes response data unchanged, without adding labels or summaries.

| API response        | No `--output`                                   | `--output <path>`                       | `--output -`                                    |
| ------------------- | ----------------------------------------------- | --------------------------------------- | ----------------------------------------------- |
| Binary image or PDF | Saves `screenshot.<extension>`                  | Saves exact response bytes to the path  | Writes exact response bytes to standard output  |
| JSON                | Writes the raw JSON response to standard output | Saves the raw JSON response to the path | Writes the raw JSON response to standard output |

Binary and JSON writes to standard output add no line break.

For an automatically named binary response, the extension comes only from the actual response `Content-Type`: `.png`, `.jpg`, `.webp`, `.gif`, `.tiff`, or `.pdf`. A missing or unrecognized content type uses `.bin`; a requested format does not determine the automatic filename.

An explicit path may be absolute or relative. Existing files are overwritten, parent directories are not created, and a successful file write is silent.

`-o` is the short form of `--output`.

Use `--output -` when another command or redirection should receive the response bytes:

```sh
screenshotscout capture "https://example.com" --format webp --output - > screenshot.webp
screenshotscout capture "https://example.com" --response-type json --output - > response.json
```

## Scripting and CI

Configure the two credential environment variables through your CI system's protected secret settings. Because CI runners often start from a clean environment, install a specific CLI version during the setup stage for reproducible builds. Replace `<version>` with the version you want:

```sh
npm install --global @screenshotscout/cli@<version>
```

After setup, invoke `screenshotscout` normally. The destination directory must already exist:

```sh
mkdir -p artifacts
screenshotscout capture "https://example.com" \
  --format webp \
  --full-page \
  --block-cookie-banners \
  --output artifacts/homepage.webp
```

If the CLI was installed during an earlier runner-setup stage, skip the installation command and use the same `screenshotscout capture` invocation.

Successful commands, help, and version checks exit with status `0`. CLI usage and input errors exit with status `2`. Credential, API, transport, response, and filesystem failures exit with status `1`.

Failures write a concise message without a programming stack trace to standard error, so piped screenshot or JSON bytes on standard output remain separate. When Screenshot Scout returns validation details, the CLI prints them in full after the message.

Each `capture` invocation makes one Screenshot Scout request and is subject to the account's quota and rate limits. `capture-url` makes no request while building the URL; requesting the generated URL later performs the capture. Quota and rate-limit failures are described in the [API error reference](https://screenshotscout.com/docs/errors).

More inline-flag, options-file, POSIX shell, PowerShell, and CI examples are in [`examples/`](examples/README.md).

## Troubleshooting

- Run `screenshotscout --help` or `screenshotscout <command> --help` to check command syntax and current capture-option value shapes.
- If the CLI reports that an access key is required, set `SCREENSHOTSCOUT_ACCESS_KEY` in the same process environment that runs the command.
- If the API reports `signature_required`, set the matching `SCREENSHOTSCOUT_SECRET_KEY`; the CLI will sign the request automatically. See [Signed requests](https://screenshotscout.com/docs/signed-requests).
- If an option is rejected with exit status `2`, check whether it uses CLI `kebab-case`, whether a boolean uses bare or inline syntax, and whether a singleton flag was repeated.
- If an options file is rejected, confirm that it is a JSON object using exact API `snake_case` names and JSON value types.
- If a file write fails, confirm that its parent directory exists and is writable.
- For service validation, authentication, quota, and rate-limit failures, see the [API error reference](https://screenshotscout.com/docs/errors).

## Reporting vulnerabilities

Report suspected vulnerabilities privately by following [`SECURITY.md`](SECURITY.md). Do not place credentials, generated capture URLs, or captured customer data in a public issue.
