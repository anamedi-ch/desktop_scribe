# Build Troubleshooting Guide

## macOS: Updater Signing Key Error

**Error:**

```
failed to decode secret key: incorrect updater private key password: Missing comment in secret key
```

**Solution:**

The Tauri updater private key must be in the correct format. The easiest way is to use Tauri's built-in signer tool:

### Recommended: Use Tauri CLI Signer

1. **Generate keys using Tauri CLI:**

    ```bash
    cd desktop
    bunx tauri signer generate -w ~/.tauri/anamedi.key
    ```

    This will:
    - Generate a private key at `~/.tauri/anamedi.key`
    - Display the public key (base64 encoded)
    - Ask for a password to encrypt the private key

2. **Copy the public key** that's displayed and update `tauri.conf.json`:

    ```json
    {
    	"plugins": {
    		"updater": {
    			"pubkey": "PASTE_THE_BASE64_PUBLIC_KEY_HERE"
    		}
    	}
    }
    ```

3. **Update GitHub Secrets:**
    - Go to: https://github.com/anamedi-ch/desktop_scribe/settings/secrets/actions
    - Update `TAURI_PRIVATE_KEY`: Copy the entire contents of `~/.tauri/anamedi.key` (including the `-----BEGIN` and `-----END` lines)
    - Update `TAURI_KEY_PASSWORD`: The password you entered when generating the key

### Alternative: Using OpenSSL (if you prefer)

If you're already using OpenSSL and it's asking for a pass phrase:

1. **Enter a secure password** when prompted (remember this - you'll need it for GitHub Secrets)

2. **After the key is generated, extract the public key:**

    ```bash
    openssl rsa -pubout -in private_key.pem -out public_key.pem
    ```

3. **Convert public key to base64 format for Tauri:**

    ```bash
    # Read the public key and convert to base64 (single line)
    cat public_key.pem | base64 | tr -d '\n'
    ```

4. **Update `tauri.conf.json`** with the base64 public key

5. **Update GitHub Secrets:**
    - `TAURI_PRIVATE_KEY`: Contents of `private_key.pem` (entire file)
    - `TAURI_KEY_PASSWORD`: The password you entered

**Note:** The Tauri CLI method is recommended as it generates keys in the exact format Tauri expects.

## Windows: wget.exe Not Found

**Fixed:** The build script now uses PowerShell's `Invoke-WebRequest` as the primary method on Windows, with wget.exe as a fallback.

## Linux: Missing libxdo Library

**Fixed:** Added `libxdo-dev` to the Linux apt packages list. This is required by the `enigo` crate for Linux automation features.
