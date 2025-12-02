# Ban Bunny - Devvit App

A Reddit Devvit application that monitors subreddit bans and posts notifications to Discord with Giphy GIFs.

## Features

- **Real-time Ban Detection**: Triggers instantly when moderators issue bans
- **Historical Backfill**: On installation, imports existing ban history into Redis storage
- **Discord Notifications**: Posts formatted embeds to Discord via webhook
- **Giphy Integration**: Includes random GIFs in ban announcements
- **Mod Log Storage**: Maintains a Redis-based log of all moderation actions

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [Devvit CLI](https://developers.reddit.com/docs/) installed globally
- A Reddit account with moderator access to a subreddit
- Discord webhook URL
- Giphy API key

## Installation

### 1. Install Devvit CLI

```bash
npm install -g devvit
```

### 2. Login to Reddit

```bash
devvit login
```

### 3. Install Dependencies

```bash
cd banbunny-devvit
npm install
```

### 4. Upload to Reddit

```bash
devvit upload
```

### 5. Install on Your Subreddit

After uploading, install the app on your subreddit through the Reddit mod tools or via:

```bash
devvit install <your-subreddit-name>
```

## Configuration

After installation, configure the app settings in your subreddit's mod tools:

| Setting | Description |
|---------|-------------|
| **Discord Webhook URL** | Your Discord channel's webhook URL for ban notifications |
| **Giphy API Key** | Your Giphy API key for fetching random GIFs |
| **Enable Notifications** | Toggle to enable/disable Discord notifications |

### Getting a Discord Webhook URL

1. Go to your Discord server settings
2. Navigate to Integrations → Webhooks
3. Create a new webhook or copy an existing one's URL

### Getting a Giphy API Key

1. Visit [Giphy Developers](https://developers.giphy.com/)
2. Create an app to get your API key

## Development

### Local Testing (Playtest)

```bash
devvit playtest <your-test-subreddit>
```

This allows you to test changes in real-time on a test subreddit.

### View Logs

```bash
devvit logs <your-subreddit-name>
```

### Upload New Version

```bash
devvit upload
```

## Data Storage

The app uses Redis for persistent storage with the following structure:

### Ban Logs
- `ban:{banId}` - Hash containing ban details
- `bans:timeline` - Sorted set of all bans by timestamp
- `bans:subreddit:{name}` - Sorted set of bans per subreddit

### Mod Logs
- `modlog:{logId}` - Hash containing mod action details
- `modlogs:timeline` - Sorted set of all mod actions by timestamp

### App State
- `app:initialized` - Timestamp of initial installation
- `app:backfillCount` - Number of historical bans imported

## Permissions

This app requires the following Devvit capabilities:

- `redditAPI` - Access to Reddit's API for fetching mod logs
- `redis` - Persistent data storage
- `http` - External API calls to Discord and Giphy

## Troubleshooting

### Discord notifications not sending
1. Verify the webhook URL is correct in app settings
2. Check that "Enable Notifications" is turned on
3. View logs with `devvit logs` for error messages

### Historical backfill incomplete
- Reddit's mod log API may have pagination limits
- Very old data might not be accessible
- Check logs for any errors during backfill

### Giphy GIFs not loading
1. Verify your Giphy API key is correct
2. The app falls back to a default GIF if the API fails

## Related Projects

- [BanBunny (.NET)](../BanBunny/) - The original .NET implementation

## License

See [LICENSE](../BanBunny/LICENSE) for details.

