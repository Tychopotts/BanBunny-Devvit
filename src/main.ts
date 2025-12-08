import { Devvit, TriggerContext } from '@devvit/public-api';

// Configure Devvit with required capabilities
Devvit.configure({
  redditAPI: true,
  redis: true,
  http: {
    // Whitelist external domains for HTTP fetch
    domains: ['api.giphy.com', 'discord.com', 'discordapp.com'],
  },
});

// ============================================================================
// App Settings - Configured per subreddit installation
// ============================================================================

Devvit.addSettings([
  {
    name: 'discordWebhookUrl',
    label: 'Discord Webhook URL',
    type: 'string',
    scope: 'installation',
    helpText: 'The Discord webhook URL for ban notifications (only visible to mods)',
  },
  {
    name: 'giphyApiKey',
    label: 'Giphy API Key',
    type: 'string',
    scope: 'installation',
    helpText: 'Your Giphy API key for fetching random GIFs (only visible to mods)',
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
        // Skip unbans (we're filtering by 'banuser' type, but double-check)
        if (action.type === 'unbanuser') continue;
        // Skip AutoModerator actions
        if (action.target?.author === 'AutoModerator') continue;

        const banData: BanLogData = {
          banId: action.id,
          user: action.target?.author || 'unknown',
          mod: action.moderatorName || 'unknown',
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
// Helper: Fetch ban details from mod log
// ============================================================================

async function fetchBanDetails(
  context: TriggerContext,
  subredditName: string,
  targetUsername: string
): Promise<{ reason: string; duration: string }> {
  try {
    // Query recent bans from mod log to get full details
    const modLog = await context.reddit.getModerationLog({
      subredditName: subredditName,
      type: 'banuser',
      limit: 10, // Check recent bans
    });

    // Find the matching ban for this user
    for await (const action of modLog) {
      if (action.target?.author === targetUsername) {
        return {
          reason: action.details || '',
          duration: action.description || 'permanent',
        };
      }
    }

    console.log(`Could not find ban details for ${targetUsername} in mod log`);
    return { reason: '', duration: 'permanent' };
  } catch (error) {
    console.error('Error fetching ban details from mod log:', error);
    return { reason: '', duration: 'permanent' };
  }
}

// ============================================================================
// ModAction Trigger - Real-time Ban Detection
// ============================================================================

Devvit.addTrigger({
  event: 'ModAction',
  onEvent: async (event, context) => {
    // The trigger event uses proto ModAction type with: action, id, targetUser, moderator, subreddit
    const actionType = event.action;

    // Skip if not a ban action
    if (actionType !== 'banuser') {
      // Still store non-ban mod actions for logging
      if (actionType !== 'unbanuser') {
        const modData: ModLogData = {
          logId: event.id ?? `modlog-${Date.now()}`,
          action: actionType ?? 'unknown',
          targetUser: event.targetUser?.name ?? 'unknown',
          mod: event.moderator?.name ?? 'unknown',
          details: '',
          subreddit: event.subreddit?.name ?? 'unknown',
          timestamp: Date.now().toString(),
        };
        await storeModLog(context, modData);
      }
      return;
    }

    const targetUser = event.targetUser?.name ?? 'unknown';
    const subredditName = event.subreddit?.name ?? 'unknown';

    // Skip AutoModerator bans
    if (targetUser === 'AutoModerator') {
      console.log('Skipping AutoModerator ban');
      return;
    }

    console.log(`New ban detected: ${targetUser} by ${event.moderator?.name}`);

    // Fetch ban details (reason, duration) from mod log
    const banDetails = await fetchBanDetails(context, subredditName, targetUser);

    // Build ban data object with full details
    const banData: BanLogData = {
      banId: event.id ?? `ban-${Date.now()}`,
      user: targetUser,
      mod: event.moderator?.name ?? 'unknown',
      reason: banDetails.reason,
      duration: banDetails.duration,
      subreddit: subredditName,
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

