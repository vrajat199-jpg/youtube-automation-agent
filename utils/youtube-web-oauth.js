const crypto = require('crypto');
const { google } = require('googleapis');
const { encryptJson, decryptJson } = require('./secret-crypto');

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl'
];

function hashState(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

class YouTubeWebOAuthService {
  constructor({ db, logger, env = process.env }) {
    if (!db) throw new Error('A database instance is required');
    this.db = db;
    this.logger = logger || { warn: () => {}, error: () => {} };
    this.env = env;
  }

  isConfigured() {
    return Boolean(
      this.env.YOUTUBE_OAUTH_CLIENT_ID &&
      this.env.YOUTUBE_OAUTH_CLIENT_SECRET &&
      this.env.YOUTUBE_OAUTH_REDIRECT_URI &&
      this.env.TOKEN_ENCRYPTION_KEY
    );
  }

  createOAuthClient() {
    if (!this.isConfigured()) {
      throw new Error('Configure the YouTube OAuth web client and TOKEN_ENCRYPTION_KEY first');
    }
    return new google.auth.OAuth2(
      this.env.YOUTUBE_OAUTH_CLIENT_ID,
      this.env.YOUTUBE_OAUTH_CLIENT_SECRET,
      this.env.YOUTUBE_OAUTH_REDIRECT_URI
    );
  }

  async startConnect() {
    const state = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await this.db.createOAuthState(hashState(state), expiresAt);
    const url = this.createOAuthClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent select_account',
      include_granted_scopes: true,
      scope: YOUTUBE_SCOPES,
      state
    });
    return url;
  }

  async completeCallback({ code, state }) {
    if (!code || !state) throw new Error('Google did not return the required OAuth code and state');
    const consumed = await this.db.consumeOAuthState(hashState(state));
    if (!consumed) throw new Error('OAuth state is invalid, expired, or already used');

    const oauth = this.createOAuthClient();
    const response = await oauth.getToken(code);
    const receivedTokens = response.tokens || {};
    if (!receivedTokens.access_token) throw new Error('Google OAuth did not return an access token');

    oauth.setCredentials(receivedTokens);
    const youtube = google.youtube({ version: 'v3', auth: oauth });
    const channelResponse = await youtube.channels.list({ part: 'snippet', mine: true, maxResults: 1 });
    const item = channelResponse.data.items?.[0];
    const snippet = item?.snippet;
    const youtubeChannelId = item?.id;
    if (!youtubeChannelId || !snippet) {
      throw new Error('The authorized Google account does not expose a YouTube channel');
    }

    const existing = await this.db.getChannelByYoutubeId(youtubeChannelId);
    const existingTokens = existing ? await this.getChannelTokens(existing.id) : null;
    const tokens = { ...(existingTokens || {}), ...receivedTokens };
    if (!tokens.refresh_token) {
      throw new Error('Google did not issue a refresh token. Revoke this app in your Google Account and connect again.');
    }

    const channels = await this.db.listChannels();
    const hasConnectedDefault = channels.some(channel => channel.status === 'connected' && channel.isDefault);
    const channel = await this.db.saveChannel({
      id: existing?.id,
      youtubeChannelId,
      displayName: snippet.title || 'YouTube channel',
      handle: snippet.customUrl || null,
      avatarUrl: snippet.thumbnails?.default?.url || null,
      status: 'connected',
      defaultPrivacyStatus: existing?.defaultPrivacyStatus || 'private',
      formats: existing?.formats || ['long_form', 'shorts'],
      approvalRequired: true,
      isDefault: existing?.isDefault || !hasConnectedDefault
    });

    await this.db.saveChannelCredentials(channel.id, encryptJson(tokens, this.env));
    return {
      id: channel.id,
      displayName: channel.displayName,
      youtubeChannelId: channel.youtubeChannelId,
      status: channel.status,
      isDefault: channel.isDefault
    };
  }

  async getChannelTokens(channelId) {
    const record = await this.db.getChannelCredentials(channelId);
    if (!record) return null;
    return decryptJson(record.encrypted_tokens, this.env);
  }

  async getAuthClient(channelId) {
    const channel = await this.db.getChannel(channelId);
    if (!channel || channel.status !== 'connected') throw new Error('Channel is not connected');
    const tokens = await this.getChannelTokens(channelId);
    if (!tokens) throw new Error('Channel credentials are missing; reconnect this channel');
    const oauth = this.createOAuthClient();
    let currentTokens = { ...tokens };
    oauth.setCredentials(currentTokens);
    oauth.on('tokens', async updated => {
      try {
        currentTokens = { ...currentTokens, ...updated };
        await this.db.saveChannelCredentials(channelId, encryptJson(currentTokens, this.env));
      } catch (error) {
        this.logger.error('Failed to persist refreshed YouTube credentials for channel ' + channelId + ': ' + error.message);
      }
    });
    return oauth;
  }

  async disconnect(channelId) {
    const channel = await this.db.getChannel(channelId);
    if (!channel) throw new Error('Channel not found');
    const tokens = await this.getChannelTokens(channelId);
    if (tokens?.refresh_token) {
      try {
        const oauth = this.createOAuthClient();
        oauth.setCredentials(tokens);
        await oauth.revokeCredentials();
      } catch (error) {
        this.logger.warn('Google token revocation failed for channel ' + channelId + ': ' + error.message);
      }
    }
    await this.db.deleteChannelCredentials(channelId);
    await this.db.updateChannelStatus(channelId, 'disconnected');

    if (channel.isDefault) {
      const replacement = (await this.db.listChannels()).find(item =>
        item.id !== channelId && item.status === 'connected'
      );
      if (replacement) await this.db.setDefaultChannel(replacement.id);
    }
    return this.db.getChannel(channelId);
  }
}

module.exports = { YouTubeWebOAuthService, YOUTUBE_SCOPES, hashState };
