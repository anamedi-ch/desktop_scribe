<p align="center">
  <a target="blank" href="https://github.com/thewh1teagle/vibe">
    <img
        width="96px"
        alt="Anamedi logo"
        src="./design/logo.png"
    />
  </a>
</p>

<h1 align="center">Anamedi - Transcribe on Your Own</h1>

<p align="center">
  <strong>Experience seamless language transcription with Anamedi - your all-in-one solution for effortless audio and video transcription</strong>
  <br/>
</p>

<p align="center">
  <a target="_blank" href="">
    🔗 Download Anamedi
  </a>
    &nbsp; | &nbsp; Give it a Star ⭐ | &nbsp;
    <a target="_blank" href="">Support the project 🤝</a>
</p>

<hr />

## Screenshots

<p align="center">
	<a target="_blank" href="">
    	<img width=600 src="">
	</a>
</p>

# Features 🌟

- 🌍 Transcribe almost every language - Anamedi supports up to 100 languages!
- 🔒 Ultimate privacy: fully offline transcription, no data ever leaves your device
- 🎨 User friendly design
- 🎙️ Transcribe audio / video - Supports audio and video formats like MP4, MKV, MP3, WAV and more
- 🎶 Option to transcribe audio from popular websites (YouTube, Vimeo, Facebook, Twitter and more!)
- 📂 Batch transcribe multiple files!
- 📝 Support `SRT`, `VTT`, `TXT`, `HTML`, `PDF`, `JSON`, `DOCX` formats
- 👀 Real-time transcription preview - Watch your transcription happen in real-time
- ✨ Summarize transcripts: Get quick, multilingual summaries using the Claude API
- 🧠 Ollama support: Do local AI analysis and batch summaries with Ollama
- 🌐 Translate to English from any language
- 🖨️ Print transcript directly to any printer
- 🔄 Automatic updates
- 💻 Optimized for `GPU` (`macOS`, `Windows`, `Linux`)
- 🎮 Optimized for `Nvidia` / `AMD` / `Intel` GPUs! (`Vulkan`/`CoreML`)
- 🔧 Total Freedom: Customize models effortlessly in settings for a tailored experience
- ⚙️ Model arguments for advanced users
- ⏳ Transcribe system audio
- 🎤 Transcribe from microphone or speakers
- 🖥️ CLI support: Use Anamedi directly from the command line interface! (see `--help`)
- 👥 Speaker diarization
- 📱 ~iOS & Android support~ (coming soon)
- 📥 Integrate custom models from your own site: Use `://download/?url=<model url>`
- 📹 Choose caption length optimized for videos / reels
- ⚡ HTTP API with Swagger docs! (use `--server` and open `http://<host>:3022/docs` for docs)

# Supported platforms 🖥️

`MacOS`
`Windows`
`Linux`

# Contribute 🤝

PRs are welcomed!
In addition, you're welcome to add translations.

We would like to express our sincere gratitude to all the contributors.

<a href="">
  <img src="" />
</a>

# Community

[![Discord](https://img.shields.io/badge/chat-discord-7289da.svg)](https://discord.gg/EcxWSstQN8)

# Roadmap 🛣️

You can see the roadmap in [Anamedi-Roadmap]()

# Add translation 🌐

1. Copy `en` from `desktop/src-tauri/locales` folder to new directory eg `pt-BR` (use [bcp47 language code]())
2. Change every value in the files there, to the new language and keep the keys as is
3. create PR / issue in Github

In addition you can add translation to [Anamedi website]() by creating new files in the `landing/static/locales`.

# Docs 📄

see [Anamedi Docs]()

# Creating a Release 🚀

To create a new release and distribute the application:

1. **Update the version** in `desktop/src-tauri/tauri.conf.json`
2. **Commit and push** the changes
3. **Create a git tag**: `git tag -a v<version> -m "Release v<version>" && git push --tags`
4. **GitHub Actions** will automatically build for all platforms (Windows, macOS Intel/ARM, Linux) and create a release

The workflow creates installers for:

- Windows: `.exe` installer (NSIS)
- macOS: `.dmg` (both Intel and Apple Silicon)
- Linux: `.deb` and `.rpm` packages

For detailed instructions, see [RELEASE_GUIDE.md](./RELEASE_GUIDE.md)

# I want to know more!

Medium [post]()

# Issue report

You can open [new issue]() and it's recommend to check [debug.md](docs/debug.md) first.

# Privacy Policy 🔒

Your privacy is important to us. Please review our [Privacy Policy]() to understand how we handle your data.
