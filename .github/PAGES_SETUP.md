# GitHub Pages Setup Guide

If you're seeing errors about GitHub Pages not being found, follow these steps:

## Enable GitHub Pages

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Pages**
3. Under **Source**, select **GitHub Actions** (not "Deploy from a branch")
4. Save the changes

## Create GitHub Pages Environment (if needed)

The workflow uses an environment called `github-pages`. This should be created automatically, but if you encounter issues:

1. Go to **Settings** → **Environments**
2. If `github-pages` doesn't exist, create it:
    - Click **New environment**
    - Name it: `github-pages`
    - No protection rules needed for basic setup
    - Click **Configure environment**

## Verify Permissions

Make sure your workflow has the required permissions:

- `contents: read` - To read repository contents
- `pages: write` - To deploy to GitHub Pages
- `id-token: write` - For authentication (required for Pages deployment)

These are already set in the workflow file.

## Troubleshooting

### Error: "Get Pages site failed"

- Ensure GitHub Pages is enabled in Settings → Pages
- Make sure the source is set to "GitHub Actions" (not a branch)

### Error: "Not Found" when accessing Pages API

- The repository must have GitHub Pages enabled first
- Try running the workflow after enabling Pages

### Build artifacts not found

- Check that the build output path matches: `landing/build`
- Verify your SvelteKit build outputs to the `build` directory
- Check the build logs to see where files are actually being created
