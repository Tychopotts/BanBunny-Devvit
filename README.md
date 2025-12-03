# BanBunny-Devvit

A Reddit Devvit application that monitors subreddit bans and sends celebratory notifications to Discord with random Giphy GIFs.

## Overview

BanBunny-Devvit is a native Reddit application built on the [Devvit platform](https://developers.reddit.com/docs/) that brings joy to moderation actions. When moderators issue bans, the app posts a fun notification to Discord complete with a random GIF to celebrate keeping the community safe.

This project is a reimplementation of [BanBunny](https://github.com/GoddessOfTest/BanBunny) (originally a .NET application) as a Devvit app, eliminating the need for self-hosting while gaining native Reddit API access.

## Features

- **Real-time Detection** — Triggers instantly when moderators issue bans
- **Historical Backfill** — Imports existing ban history on installation
- **Discord Notifications** — Sends rich embed messages to configured webhook
- **Giphy Integration** — Includes random celebratory GIFs in announcements
- **Mod Log Storage** — Maintains Redis-based log of all moderation actions
- **Zero Hosting** — Runs entirely on Reddit's infrastructure

## Documentation

- [Devvit Docs](https://developers.reddit.com/docs/) — Official platform documentation

## Project Status

🚧 **In Development**

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Devvit CLI](https://developers.reddit.com/docs/quickstart)
- A subreddit where you have moderator permissions
- A Discord server with webhook access
- A [Giphy API key](https://developers.giphy.com/)

### Installation

```bash
# Install Devvit CLI
npm install -g devvit

# Login to Reddit
devvit login

# Clone and enter project
cd BanBunny-Devvit

# Install dependencies
npm install

# Upload app to Reddit (required before first playtest)
devvit upload

# Start development/testing on your subreddit
devvit playtest <your-subreddit>
```

> **Note:** You must run `devvit upload` at least once to register your app with Reddit's servers before you can playtest. The upload command creates the app on Reddit's platform.

### Configuration

After installing the app on your subreddit, configure it through Reddit's mod tools:

1. Go to your subreddit's Mod Tools
2. Find BanBunny-Devvit in installed apps
3. Configure the following settings:
   - **Discord Webhook URL** (required)
   - **Giphy API Key** (required)
   - **Enable Notifications** toggle

### Getting API Keys

**Discord Webhook:**
1. Go to your Discord server settings
2. Navigate to Integrations → Webhooks
3. Create a new webhook and copy the URL

**Giphy API Key:**
1. Visit [Giphy Developers](https://developers.giphy.com/)
2. Create an app to get your API key

## Data Storage

The app uses Redis for persistent storage:

| Key Pattern | Description |
|-------------|-------------|
| `ban:{banId}` | Hash containing ban details |
| `bans:timeline` | Sorted set of all bans by timestamp |
| `bans:subreddit:{name}` | Sorted set of bans per subreddit |
| `modlog:{logId}` | Hash containing mod action details |
| `app:initialized` | Timestamp of initial installation |

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Reddit    │────▶│  BanBunny   │────▶│   Discord   │
│  Ban Event  │     │   (main.ts) │     │   Webhook   │
└─────────────┘     └─────────────┘     └─────────────┘
                          │
                    ┌─────┴─────┐
                    ▼           ▼
              ┌──────────┐ ┌──────────┐
              │  Giphy   │ │  Redis   │
              │   API    │ │ Storage  │
              └──────────┘ └──────────┘
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Discord not sending | Verify webhook URL and enable notifications |
| Backfill incomplete | Check logs; Reddit API may limit old data |
| GIFs not loading | Verify Giphy API key; app uses fallback GIF |

## License

See [LICENSE](LICENSE) for details.

## Related

- [Original BanBunny (.NET)](https://github.com/GoddessOfTest/BanBunny) — The original implementation
- [Devvit Docs](https://developers.reddit.com/docs/) — Official platform documentation
