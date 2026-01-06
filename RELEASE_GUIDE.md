# Release Guide - How to Distribute Your Application

## Quick Start: Create a Release

Your application already has GitHub Actions configured to automatically build and release for Windows, macOS (Intel & ARM), and Linux.

### Step 1: Update Version Number

Edit `desktop/src-tauri/tauri.conf.json` and increment the version:

```json
{
  "version": "3.0.6",  // Change from 3.0.5 to your new version
  ...
}
```

### Step 2: Commit and Push Changes

```bash
git add desktop/src-tauri/tauri.conf.json
git commit -m "Release v3.0.6"
git push
```

### Step 3: Create and Push Git Tag

This triggers the GitHub Actions release workflow:

```bash
git tag -a v3.0.6 -m "Release v3.0.6"
git push --tags
```

### Step 4: Monitor the Release

1. Go to your GitHub repository: https://github.com/thewh1teagle/vibe
2. Click on "Actions" tab
3. Watch the "Release" workflow build for all platforms:
    - macOS (ARM - M1/M2/M3)
    - macOS (Intel)
    - Windows (x86_64)
    - Linux (Ubuntu/Debian/RPM)

### Step 5: Finalize the Release (Optional)

The workflow currently creates **prereleases**. To make it a stable release:

1. Go to the Releases page: https://github.com/thewh1teagle/vibe/releases
2. Find your new release (e.g., "v3.0.6")
3. Click "Edit release"
4. Uncheck "Set as a pre-release"
5. Optionally update the release notes
6. Click "Update release"

## What Happens Automatically

✅ **Builds are created for:**

- Windows: `.exe` installer (NSIS)
- macOS: `.dmg` (both Intel and Apple Silicon)
- Linux: `.deb` and `.rpm` packages

✅ **Release artifacts:**

- All installers are uploaded to GitHub Releases
- `latest.json` is created for auto-updater
- Landing page download links are automatically updated

✅ **Code signing:**

- Windows: Uses certificate from GitHub Secrets
- macOS: Automatically signed (if certificates are configured)
- Linux: Packages are properly formatted

## Manual Build (For Testing)

If you want to build locally before releasing:

```bash
cd desktop
bun install
bunx tauri build
```

Build outputs will be in `desktop/src-tauri/target/release/bundle/`

## Distribution Options

### Option 1: GitHub Releases (Recommended - Already Set Up)

Your users can download from:

- GitHub Releases page: `https://github.com/thewh1teagle/vibe/releases`
- Your landing page: `https://thewh1teagle.github.io/vibe/` (links auto-update)

### Option 2: Direct Download Links

Share direct download links from GitHub Releases:

- Windows: `https://github.com/thewh1teagle/vibe/releases/latest/download/Anamedi_3.0.6_x64-setup.exe`
- macOS (Intel): `https://github.com/thewh1teagle/vibe/releases/latest/download/Anamedi_3.0.6_x64.dmg`
- macOS (ARM): `https://github.com/thewh1teagle/vibe/releases/latest/download/Anamedi_3.0.6_aarch64.dmg`
- Linux (Debian): `https://github.com/thewh1teagle/vibe/releases/latest/download/Anamedi_3.0.6_amd64.deb`
- Linux (RPM): `https://github.com/thewh1teagle/vibe/releases/latest/download/Anamedi_3.0.6_amd64.rpm`

### Option 3: Auto-Updater

Your app already has auto-update configured! Users will be notified when new versions are available.

## Important Notes

🔒 **Code Signing:**

- Windows: Certificate must be set in GitHub Secrets (`WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`)
- macOS: Requires Apple Developer account and certificates
- Without signing, users may see security warnings

📝 **Release Notes:**
The workflow uses a default message: "What's new? 🎉📣"
To customize, edit `.github/workflows/release.yml` line 91:

```yaml
releaseBody: 'Custom release notes here'
```

🔔 **Notify Users:**

- Announce on your landing page
- Post on social media
- Send email if you have a mailing list
- Update Discord/community channels

## Troubleshooting

**Build fails:**

- Check GitHub Actions logs for errors
- Ensure all secrets are configured (Windows certificate, signing keys)
- Verify version number format (must be semver: X.Y.Z)

**Users can't download:**

- Verify the release is published (not draft)
- Check that build artifacts completed successfully
- Ensure landing page workflow completed

**Auto-updater not working:**

- Verify `latest.json` was created in the release
- Check that `TAURI_SIGNING_PRIVATE_KEY` secret is set
- Confirm updater endpoints in `tauri.conf.json` are correct
