import { Devvit, SettingsClient, TriggerContext, ModAction } from '@devvit/public-api';

// Configure Devvit with required capabilities
Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true,
});

// ============================================================================
// App Settings - Configured per subreddit installation
// ============================================================================

Devvit.addSettings([
  {
    name: 'discordWebhookUrl',
    label: 'Discord Webhook URL',
    type: 'string',
    isSecret: true,
    scope: 'installation',
    helpText: 'The Discord webhook URL for ban notifications',
  },
  {
    name: 'giphyApiKey',
    label: 'Giphy API Key',
    type: 'string',
    isSecret: true,
    scope: 'installation',
    helpText: 'Your Giphy API key for fetching random GIFs',
  },
  {
    name: 'enableNotifications',
    label: 'Enable Discord Notifications',
    type: 'boolean',
    defaultValue: true,
    scope: 'installation',
    helpText: 'Toggle Discord ban notifications on/off',
  },
]);

// ============================================================================
// Types
// ============================================================================

interface BanLogData {
  banId: string;
  user: string;
  mod: string;
  reason: string;
  duration: string;
  subreddit: string;
  timestamp: string;
}

interface ModLogData {
  logId: string;
  action: string;
  targetUser: string;
  mod: string;
  details: string;
  subreddit: string;
  timestamp: string;
}

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  thumbnail?: { url: string };
  timestamp?: string;
}

// ============================================================================
// Redis Storage Functions
// ============================================================================

async function storeBanLog(context: TriggerContext, banData: BanLogData): Promise<void> {
  const { redis } = context;
  const banKey = `ban:${banData.banId}`;

  // Store ban details as hash
  await redis.hSet(banKey, {
    banId: banData.banId,
    user: banData.user,
    mod: banData.mod,
    reason: banData.reason,
    duration: banData.duration,
    subreddit: banData.subreddit,
    timestamp: banData.timestamp,
  });

  // Add to timeline sorted set for chronological queries
  await redis.zAdd('bans:timeline', {
    member: banData.banId,
    score: parseInt(banData.timestamp),
  });

  // Add to per-subreddit index
  await redis.zAdd(`bans:subreddit:${banData.subreddit}`, {
    member: banData.banId,
    score: parseInt(banData.timestamp),
  });

  console.log(`Stored ban log: ${banData.banId} for user ${banData.user}`);
}

async function storeModLog(context: TriggerContext, modData: ModLogData): Promise<void> {
  const { redis } = context;
  const logKey = `modlog:${modData.logId}`;

  // Store mod log details as hash
  await redis.hSet(logKey, {
    logId: modData.logId,
    action: modData.action,
    targetUser: modData.targetUser,
    mod: modData.mod,
    details: modData.details,
    subreddit: modData.subreddit,
    timestamp: modData.timestamp,
  });

  // Add to timeline sorted set
  await redis.zAdd('modlogs:timeline', {
    member: modData.logId,
    score: parseInt(modData.timestamp),
  });

  console.log(`Stored mod log: ${modData.logId} - ${modData.action}`);
}

// ============================================================================
// External API Functions
// ============================================================================

async function fetchGiphy(context: TriggerContext): Promise<string> {
  const defaultGif = 'https://media.giphy.com/media/qPD4yGsrc0pdm/giphy.gif';
  
  try {
    const settings = await context.settings.getAll();
    const apiKey = settings.giphyApiKey as string;

    if (!apiKey) {
      console.log('Giphy API key not configured, using default GIF');
      return defaultGif;
    }

    const response = await fetch(
      `https://api.giphy.com/v1/gifs/random?api_key=${apiKey}&tag=kicked+out&rating=pg`
    );

    if (!response.ok) {
      console.error(`Giphy API error: ${response.status}`);
      return defaultGif;
    }

    const data = await response.json();
    return data.data?.images?.original?.url || defaultGif;
  } catch (error) {
    console.error('Error fetching Giphy:', error);
    return defaultGif;
  }
}

async function sendDiscordNotification(
  context: TriggerContext,
  banData: BanLogData
): Promise<void> {
  try {
    const settings = await context.settings.getAll();
    const webhookUrl = settings.discordWebhookUrl as string;
    const notificationsEnabled = settings.enableNotifications as boolean;

    if (!notificationsEnabled) {
      console.log('Discord notifications are disabled');
      return;
    }

    if (!webhookUrl) {
      console.error('Discord webhook URL not configured');
      return;
    }

    // Fetch a random Giphy GIF
    const gifUrl = await fetchGiphy(context);

    // Determine if permanent ban
    const isPermanent = !banData.duration || banData.duration === 'permanent';
    const durationText = isPermanent ? 'Permanent' : `${banData.duration} days`;

    // Build the embed
    const embed: DiscordEmbed = {
      title: isPermanent
        ? `🐰 ${banData.user} has been permanently banned!`
        : `🐰 ${banData.user} has been banned.`,
      color: 0x9b59b6, // Dark magenta
      fields: [
        { name: 'Reason', value: banData.reason || 'No reason provided', inline: false },
        { name: 'Issuing Mod', value: banData.mod, inline: true },
        { name: 'Duration', value: durationText, inline: true },
        { name: 'Subreddit', value: `r/${banData.subreddit}`, inline: true },
      ],
      thumbnail: { url: gifUrl },
      timestamp: new Date(parseInt(banData.timestamp)).toISOString(),
    };

    // Send to Discord webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Ban Bunny',
        avatar_url: 'https://i.imgur.com/your-bunny-avatar.png', // Replace with actual avatar
        embeds: [embed],
      }),
    });

    if (!response.ok) {
      console.error(`Discord webhook error: ${response.status} ${response.statusText}`);
    } else {
      console.log(`Discord notification sent for ban: ${banData.user}`);
    }
  } catch (error) {
    console.error('Error sending Discord notification:', error);
  }
}

// ============================================================================
// App Install Trigger - Historical Backfill
// ============================================================================

Devvit.addTrigger({
  event: 'AppInstall',
  onEvent: async (event, context) => {
    console.log(`Ban Bunny installed on r/${event.subreddit?.name}`);

    const subredditName = event.subreddit?.name;
    if (!subredditName) {
      console.error('No subreddit name in install event');
      return;
    }

    try {
      // Pull historical bans from Reddit mod log
      console.log('Starting historical ban backfill...');

      const modLog = await context.reddit.getModerationLog({
        subredditName: subredditName,
        type: 'banuser',
        limit: 500,
      });

      let backfillCount = 0;

      for await (const action of modLog) {
        // Skip unbans
        if (action.action === 'unbanuser') continue;
        // Skip AutoModerator actions
        if (action.target?.author === 'AutoModerator') continue;

        const banData: BanLogData = {
          banId: action.id,
          user: action.target?.author || 'unknown',
          mod: action.moderator?.username || 'unknown',
          reason: action.details || '',
          duration: action.description || 'permanent',
          subreddit: subredditName,
          timestamp: action.createdAt.getTime().toString(),
        };

        // Store in Redis WITHOUT sending Discord notification
        await storeBanLog(context, banData);
        backfillCount++;
      }

      // Mark initialization complete
      await context.redis.set('app:initialized', Date.now().toString());
      await context.redis.set('app:backfillCount', backfillCount.toString());

      console.log(`Historical backfill complete: ${backfillCount} bans imported`);
    } catch (error) {
      console.error('Error during historical backfill:', error);
    }
  },
});

// ============================================================================
// ModAction Trigger - Real-time Ban Detection
// ============================================================================

Devvit.addTrigger({
  event: 'ModAction',
  onEvent: async (event, context) => {
    const action = event as ModAction;

    // Skip if not a ban action
    if (action.action !== 'banuser') {
      // Still store non-ban mod actions for logging
      if (action.action !== 'unbanuser') {
        const modData: ModLogData = {
          logId: action.actionId ?? `modlog-${Date.now()}`,
          action: action.action ?? 'unknown',
          targetUser: action.targetUser?.name ?? 'unknown',
          mod: action.moderator?.name ?? 'unknown',
          details: action.details ?? '',
          subreddit: action.subreddit?.name ?? 'unknown',
          timestamp: Date.now().toString(),
        };
        await storeModLog(context, modData);
      }
      return;
    }

    // Skip AutoModerator bans
    if (action.targetUser?.name === 'AutoModerator') {
      console.log('Skipping AutoModerator ban');
      return;
    }

    // Skip unbans
    if (action.action === 'unbanuser') {
      console.log('Skipping unban action');
      return;
    }

    console.log(`New ban detected: ${action.targetUser?.name} by ${action.moderator?.name}`);

    // Build ban data object
    const banData: BanLogData = {
      banId: action.actionId ?? `ban-${Date.now()}`,
      user: action.targetUser?.name ?? 'unknown',
      mod: action.moderator?.name ?? 'unknown',
      reason: action.details ?? '',
      duration: action.description ?? 'permanent',
      subreddit: action.subreddit?.name ?? 'unknown',
      timestamp: Date.now().toString(),
    };

    // Store to Redis
    await storeBanLog(context, banData);

    // Send Discord notification (only for new bans, not backfill)
    await sendDiscordNotification(context, banData);
  },
});

// ============================================================================
// App Upgrade Trigger
// ============================================================================

Devvit.addTrigger({
  event: 'AppUpgrade',
  onEvent: async (event, context) => {
    console.log(`Ban Bunny upgraded on r/${event.subreddit?.name}`);
    // Could add migration logic here for future versions
  },
});

export default Devvit;

