# Steps to Make Binaries Available After Going Public

## Overview

Once your repository is public, creating a release will automatically build and upload binaries that remain accessible even if you make the repo private again.

## Step-by-Step Process

### 1. Make Repository Public

1. Go to: https://github.com/anamedi-ch/desktop_scribe/settings
2. Scroll to **"Danger Zone"** section
3. Click **"Change visibility"**
4. Select **"Make public"**
5. Type your repository name to confirm
6. Click **"I understand, change repository visibility"**

### 2. Update Version Number

Edit `desktop/src-tauri/tauri.conf.json`:

```json
{
  "version": "0.0.1",  // Change to your desired version (e.g., "1.0.0")
  ...
}
```

### 3. Commit and Push Version Change

```bash
git add desktop/src-tauri/tauri.conf.json
git commit -m "Release v1.0.0"
git push
```

### 4. Create Git Tag (Triggers Build)

This automatically triggers your GitHub Actions workflow to build binaries:

```bash
git tag -a v1.0.0 -m "Release v1.0.0"
git push --tags
```

**Alternative:** You can also trigger the workflow manually:

- Go to: https://github.com/anamedi-ch/desktop_scribe/actions/workflows/release.yml
- Click **"Run workflow"**
- Select branch and click **"Run workflow"**

### 5. Monitor the Build

1. Go to: https://github.com/anamedi-ch/desktop_scribe/actions
2. Watch the **"Release"** workflow build binaries for:
    - macOS (ARM - M1/M2/M3)
    - macOS (Intel)
    - Windows (x86_64)
    - Linux (Ubuntu/Debian/RPM)

**Build time:** Usually 15-30 minutes depending on platform

### 6. Verify Binaries Are Available

Once the workflow completes:

1. Go to: https://github.com/anamedi-ch/desktop_scribe/releases
2. You should see your release (e.g., "v1.0.0")
3. Under **"Assets"**, you should see:
    - `Anamedi_1.0.0_x64-setup.exe` (Windows)
    - `Anamedi_1.0.0_x64.dmg` (macOS Intel)
    - `Anamedi_1.0.0_aarch64.dmg` (macOS ARM)
    - `Anamedi_1.0.0_amd64.deb` (Linux Debian)
    - `Anamedi_1.0.0_amd64.rpm` (Linux RPM)
    - `latest.json` (for auto-updater)

### 7. (Optional) Make Repository Private Again

**Important:** The binaries created while public will remain accessible even after making the repo private!

1. Go to: https://github.com/anamedi-ch/desktop_scribe/settings
2. Scroll to **"Danger Zone"**
3. Click **"Change visibility"**
4. Select **"Make private"**
5. Confirm

**What happens:**

- ✅ Existing release binaries remain publicly accessible
- ✅ Users can still download from release URLs
- ✅ Auto-updater continues to work
- ❌ New releases created while private won't be publicly accessible

## Download Links

Once released, users can download from:

**Releases Page:**

```
https://github.com/anamedi-ch/desktop_scribe/releases/latest
```

**Direct Download Links:**

- Windows: `https://github.com/anamedi-ch/desktop_scribe/releases/latest/download/Anamedi_X.X.X_x64-setup.exe`
- macOS Intel: `https://github.com/anamedi-ch/desktop_scribe/releases/latest/download/Anamedi_X.X.X_x64.dmg`
- macOS ARM: `https://github.com/anamedi-ch/desktop_scribe/releases/latest/download/Anamedi_X.X.X_aarch64.dmg`
- Linux Debian: `https://github.com/anamedi-ch/desktop_scribe/releases/latest/download/Anamedi_X.X.X_amd64.deb`
- Linux RPM: `https://github.com/anamedi-ch/desktop_scribe/releases/latest/download/Anamedi_X.X.X_amd64.rpm`

Replace `X.X.X` with your actual version number, or use `/latest/download/` which redirects automatically.

## Future Releases

For future releases while keeping the repo private:

**Option A: Temporary Public (Recommended)**

- Make repo public → Create release → Make repo private
- Binaries remain accessible

**Option B: Keep Public**

- Leave repo public permanently
- Simplest for ongoing distribution

**Option C: Alternative Hosting**

- Use S3, Cloudflare R2, or Backblaze B2
- Keep repo private permanently
- Requires updating auto-updater configuration

## Troubleshooting

**Build fails:**

- Check GitHub Actions logs
- Ensure secrets are configured (`GH_TOKEN`, `TAURI_PRIVATE_KEY`, `WINDOWS_CERTIFICATE`)
- Verify version format (must be semver: X.Y.Z)

**Binaries not appearing:**

- Wait for workflow to complete (check Actions tab)
- Verify release was created (check Releases page)
- Ensure workflow has `contents: write` permission (already configured)

**Can't download after making private:**

- Binaries created while public should remain accessible
- If issues occur, make repo public again temporarily
