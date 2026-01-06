# Binary Distribution Guide

You **don't need a landing page** - you just need to distribute the actual application files (.exe, .dmg, .deb).

## How It Currently Works

When you create a release, your GitHub Actions workflow automatically:

1. ✅ Builds installers for all platforms (Windows, macOS Intel/ARM, Linux)
2. ✅ Uploads them to **GitHub Releases**
3. ✅ Makes them available as direct download links

## Users Can Download From:

### Option 1: GitHub Releases Page (Recommended)

Direct link format:

```
https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest
```

Example:

```
https://github.com/anamedi-ch/desktop_scribe/releases/latest
```

Users see all available installers and can download the one for their platform.

### Option 2: Direct Download Links

You can share direct links that always point to the latest version:

**Windows:**

```
https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest/download/Anamedi_X.X.X_x64-setup.exe
```

**macOS (Intel):**

```
https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest/download/Anamedi_X.X.X_x64.dmg
```

**macOS (Apple Silicon):**

```
https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest/download/Anamedi_X.X.X_aarch64.dmg
```

**Linux (.deb):**

```
https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest/download/Anamedi_X.X.X_amd64.deb
```

**Linux (.rpm):**

```
https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest/download/Anamedi_X.X.X_amd64.rpm
```

**Note:** The version number (`X.X.X`) will change with each release. You can also use `/latest/download/` which will redirect to the actual file.

## How to Share with Users

### Simple Approach:

Just share the GitHub Releases page URL:

```
Check out the latest release: https://github.com/anamedi-ch/desktop_scribe/releases/latest
```

### Professional Approach:

Create download buttons/links on your existing landing page that point to the GitHub Releases download URLs.

## Auto-Updater

Your app already has auto-updates configured! When users have the app installed, it will:

- ✅ Check GitHub Releases for updates
- ✅ Download and install updates automatically
- ✅ Notify users when updates are available

This uses the `latest.json` file that's automatically created in each release.

## What You Need to Do

**Nothing!** It's already set up. Just:

1. **Create a release** (as described in RELEASE_GUIDE.md):
    - Update version in `tauri.conf.json`
    - Create git tag
    - Push tag
    - GitHub Actions builds and uploads binaries automatically

2. **Share the download link** with users:
    - Link to GitHub Releases page, OR
    - Direct download links on your existing landing page

## Disable Landing Page Workflow (Optional)

Since you don't need the landing page, you can disable that workflow to save CI/CD minutes:

1. Go to `.github/workflows/landing.yml`
2. Either delete it, or comment out the trigger:

```yaml
on:
    # push:
    #     branches:
    #         - main
    #     paths:
    #         - "landing/**"
    #         - "scripts/landing_links.js"
    workflow_dispatch: # Keep this if you want to manually trigger it
```

Or simply delete the file if you're sure you'll never use it.

## Summary

✅ **Binaries are distributed via GitHub Releases** (already working)  
✅ **Users download directly from GitHub** (no landing page needed)  
✅ **Auto-updates work automatically** (configured in your app)  
✅ **Direct download links available** (share these on your existing landing page)

You're all set! Just create releases and share the GitHub Releases URL with users.
