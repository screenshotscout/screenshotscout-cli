# Examples

These examples use `https://example.com` and placeholder credentials. They assume the CLI has been installed globally:

```sh
npm install --global @screenshotscout/cli
```

After installation, invoke it as `screenshotscout` in POSIX shells and PowerShell.

## POSIX shell

```sh
export SCREENSHOTSCOUT_ACCESS_KEY="YOUR_ACCESS_KEY"
export SCREENSHOTSCOUT_SECRET_KEY="YOUR_SECRET_KEY"

screenshotscout capture "https://example.com" \
  --format webp \
  --full-page \
  --block-cookie-banners \
  --output screenshot.webp
```

Omit the `SCREENSHOTSCOUT_SECRET_KEY` assignment when you do not want signing and the API key does not require signed requests.

Build a capture URL without making a capture request:

```sh
screenshotscout capture-url "https://example.com" \
  --format webp \
  --full-page \
  --block-cookie-banners
```

## PowerShell

```powershell
$env:SCREENSHOTSCOUT_ACCESS_KEY = "YOUR_ACCESS_KEY"
$env:SCREENSHOTSCOUT_SECRET_KEY = "YOUR_SECRET_KEY"

screenshotscout capture "https://example.com" `
  --format webp `
  --full-page `
  --block-cookie-banners `
  --output screenshot.webp
```

Omit the `SCREENSHOTSCOUT_SECRET_KEY` assignment when you do not want signing and the API key does not require signed requests.

Build a capture URL without making a capture request:

```powershell
screenshotscout capture-url "https://example.com" `
  --format webp `
  --full-page `
  --block-cookie-banners
```

## CI setup and invocation

Store the access key and optional secret key in your CI system's protected secret settings and expose them under the exact `SCREENSHOTSCOUT_ACCESS_KEY` and `SCREENSHOTSCOUT_SECRET_KEY` names.

For a clean runner, install a specific CLI version during setup. Replace `<version>` with the version you want:

```sh
npm install --global @screenshotscout/cli@<version>
```

Then invoke the installed `screenshotscout` command and collect `screenshot.webp` as a build artifact after the capture succeeds:

```sh
screenshotscout capture "https://example.com" \
  --format webp \
  --full-page \
  --block-cookie-banners \
  --output screenshot.webp
```

If the CLI was installed during an earlier runner-setup stage, skip the installation command and use the same capture invocation.

The command exits `0` on success, `2` for CLI usage or input errors, and `1` for every other failure.

## Reuse options from a file

Use `--options` when you want to reuse capture options stored as JSON instead of writing each flag in the command:

```sh
screenshotscout capture "https://example.com" \
  --options examples/capture-options.json \
  --output screenshot.webp
```

The options file uses exact API `snake_case` names. Explicit capture flags can be added to the same command and override corresponding values from the file:

```sh
screenshotscout capture "https://example.com" \
  --options examples/capture-options.json \
  --full-page=false \
  --output screenshot.webp
```
