# Release Secrets

Configure these GitHub repository secrets before running the macOS release workflow.

## Required for release creation

- `GITHUB_TOKEN`
  - Provided automatically by GitHub Actions
  - Must have `contents: write` permission in the workflow

## Required for macOS signing and notarization

- `APPLE_CERTIFICATE`
  - Base64-encoded `.p12` export of your `Developer ID Application` certificate
- `APPLE_CERTIFICATE_PASSWORD`
  - Password used when exporting the `.p12`
- `APPLE_SIGNING_IDENTITY`
  - Example: `Developer ID Application: Your Name (TEAMID)`
- `APPLE_ID`
  - Apple Developer account email
- `APPLE_PASSWORD`
  - App-specific password used for notarization
- `APPLE_TEAM_ID`
  - Apple Developer Team ID

## Local signing notes

The macOS release flow imports the `Developer ID Application` certificate
into a temporary keychain before the build starts so nested vendor binaries can
be re-signed consistently both locally and on GitHub Actions.

Keep signing credentials out of source control and back them up securely.
