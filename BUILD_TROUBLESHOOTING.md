# Build Troubleshooting Guide

## macOS: Updater Signing Key Error

**Error:**
```
failed to decode secret key: incorrect updater private key password: Missing comment in secret key
```

**Solution:**

The Tauri updater private key must include a comment. To fix this:

1. **Generate a new key pair with a comment:**
   ```bash
   # Generate private key with comment
   openssl genpkey -algorithm RSA -out private_key.pem -pkeyopt rsa_keygen_bits:4096 -aes256
   
   # Extract public key
   openssl rsa -pubout -in private_key.pem -out public_key.pem
   ```

2. **Or use Tauri CLI to generate keys:**
   ```bash
   bunx tauri signer generate -w ~/.tauri/myapp.key
   ```

3. **Update GitHub Secrets:**
   - Go to: https://github.com/anamedi-ch/desktop_scribe/settings/secrets/actions
   - Update `TAURI_PRIVATE_KEY` with the private key (including the comment)
   - Update `TAURI_KEY_PASSWORD` with the password (if the key is encrypted)
   - Update `TAURI_PUBLIC_KEY` in your `tauri.conf.json` with the public key

4. **The public key format in `tauri.conf.json` should be:**
   ```json
   {
     "plugins": {
       "updater": {
         "pubkey": "YOUR_PUBLIC_KEY_HERE"
       }
     }
   }
   ```

**Note:** The private key must be in PEM format with a comment (the line starting with `-----BEGIN` should have a comment after it, or the key should include metadata).

## Windows: wget.exe Not Found

**Fixed:** The build script now uses PowerShell's `Invoke-WebRequest` as the primary method on Windows, with wget.exe as a fallback.

## Linux: Missing libxdo Library

**Fixed:** Added `libxdo-dev` to the Linux apt packages list. This is required by the `enigo` crate for Linux automation features.

