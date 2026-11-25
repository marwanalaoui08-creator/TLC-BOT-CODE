import crypto from 'crypto';
import {
  ActionRowBuilder,
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  GuildMember,
  Interaction,
  Message,
  ModalBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  BotConfig,
  getPositionCategory,
  ManagerProfile,
  PLAYER_POSITIONS,
  PlayerPosition,
  PlayerProfile,
  RegistrationRequest,
  RejectedRequestItem,
  SANCTION_TYPES,
  SanctionRecord,
  SanctionType,
  TransferOffer,
  TransferRecord,
} from '../src/shared/types.ts';
import { tlcStore } from '../server/store.ts';
import { tlcSlashCommands } from './commands/definitions.ts';
import {
  buildAppealModal,
  buildAppealReviewPayload,
  buildAppealSanctionPickerPayload,
  buildAuditEmbed,
  buildClubProfileEmbed,
  buildClubRegistrationReviewPayload,
  buildCompetitionRegistrationReviewPayload,
  buildCorrectionReviewPayload,
  buildCreateTeamBuilderPayload,
  buildCreateTeamModal,
  buildDeleteManagerConfirmPayload,
  buildDeleteManagerPickerPayload,
  buildDeleteManagerSearchModal,
  buildDeletePlayerConfirmPayload,
  buildDeletePlayerPickerPayload,
  buildDeletePlayerSearchModal,
  buildDeleteTeamConfirmPayload,
  buildDeleteTeamPickerPayload,
  buildDemandePickerPayload,
  buildDemandeReviewPayload,
  buildEditSanctionModal,
  buildFinePaymentModal,
  buildFixtureEmbed,
  buildFreeAgentSignPickerPayload,
  buildManagerProfileEmbed,
  buildMatchResultReviewPayload,
  buildPlayerPositionSelectPayload,
  buildPlayerProfileEmbed,
  buildPlayerRatingCardEmbed,
  buildRegistrationAnnouncementEmbed,
  buildRegistrationModal,
  buildRegistrationReviewEmbed,
  buildRegistrationTypeSelectPayload,
  buildRejectedRequestsEmbed,
  buildRejectionReasonModal,
  buildReleaseConfirmPayload,
  buildReleaseRosterPayload,
  buildRemoveSanctionConfirmPayload,
  buildRestoreManagerConfirmPayload,
  buildRestoreManagerPickerPayload,
  buildRestoreManagerSearchModal,
  buildRestorePlayerConfirmPayload,
  buildRestorePlayerPickerPayload,
  buildRestorePlayerSearchModal,
  buildResultAnnouncementEmbed,
  buildSanctionBuilderPayload,
  buildSanctionCurrencyModal,
  buildSanctionDetailsModal,
  buildSanctionHistoryEmbed,
  buildSanctionHistoryPickerPayload,
  buildSanctionListPayload,
  buildSanctionLogEmbed,
  buildSanctionManagePayload,
  buildSanctionNoticeEmbed,
  buildSanctionPreviewPayload,
  buildSanctionSetupPayload,
  buildSetupPanelPayload,
  buildSignPlayerOfferModal,
  buildSignSearchFilterModal,
  buildStandingsEmbed,
  buildTeamProfilePayload,
  buildTeamsListPayload,
  buildTransferAnnouncementEmbed,
  buildTransferHistoryEmbed,
  buildTransferOfferPlayerPayload,
  buildTransferStaffReviewPayload,
  buildVerifyPanelPayload,
  CreateTeamDraft,
  formatRejectionDmMessage,
  RejectionModalTargetType,
  SanctionDraft,
  SetupSection,
} from './embeds.ts';
import {
  buildTicketSetupPayload,
  TicketSetupSection,
} from './ticketEmbeds.ts';
import {
  handleTicketInteraction,
  handleTicketMessageCreate,
  publishTicketPanelToConfiguredChannel,
  runTicketEscalationScan,
} from './ticketHandlers.ts';

let activeClient: Client | null = null;
let lastBotError: string | null = null;
let commandsDeployedCount = 0;
let deployInFlight: Promise<number> | null = null;
let ticketScanTimer: NodeJS.Timeout | null = null;
const activeInteractions = new Set<string>();
const createTeamDrafts = new Map<string, CreateTeamDraft>();
const sanctionDrafts = new Map<string, SanctionDraft>();
const roleSyncBypass = new Set<string>();

async function withRoleSyncBypass(guildId: string, userId: string, fn: () => Promise<void>) {
  const key = `${guildId}:${userId}`;
  roleSyncBypass.add(key);
  try {
    await fn();
  } finally {
    setTimeout(() => {
      roleSyncBypass.delete(key);
    }, 2000);
  }
}

export function getDiscordBotStatus() {
  const tokenConfigured = Boolean(process.env.DISCORD_BOT_TOKEN?.trim());
  return {
    tokenConfigured,
    connected: Boolean(activeClient?.isReady()),
    botTag: activeClient?.user?.tag || null,
    guildCount: activeClient?.guilds.cache.size || 0,
    lastError: lastBotError,
    commandsDeployedCount,
  };
}

function isStaffMember(member: GuildMember | null): boolean {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const staffRoles = tlcStore.getState().config.roles.staffRoleIds;
  return staffRoles.some((rid) => member.roles.cache.has(rid));
}

function isDisciplinaryStaff(member: GuildMember | null): boolean {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const discRoles = tlcStore.getState().config.roles.disciplinaryRoleIds ?? [];
  if (discRoles.length > 0) {
    return discRoles.some((rid) => member.roles.cache.has(rid));
  }
  return isStaffMember(member);
}

async function sendToConfiguredChannel(
  client: Client,
  channelId: string,
  payload: Parameters<TextChannel['send']>[0]
) {
  if (!channelId) return;
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch && ch.isTextBased() && 'send' in ch) {
      await (ch as TextChannel).send(payload);
    }
  } catch (err) {
    console.warn(`Could not send message to channel ${channelId}:`, err);
  }
}

async function sendToConfiguredChannelReturningMessage(
  client: Client,
  channelId: string,
  payload: Parameters<TextChannel['send']>[0]
): Promise<Message | null> {
  if (!channelId) return null;
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch && ch.isTextBased() && 'send' in ch) {
      return await (ch as TextChannel).send(payload);
    }
  } catch (err) {
    console.warn(`Could not send message to channel ${channelId}:`, err);
  }
  return null;
}

async function sendToSanctionsLog(
  client: Client,
  payload: Parameters<TextChannel['send']>[0]
) {
  const chId = tlcStore.getState().config.channels.sanctionsLogId;
  if (chId) {
    await sendToConfiguredChannel(client, chId, payload);
  }
}

async function updatePublishedSanctionNotice(client: Client, sanction: SanctionRecord) {
  if (!sanction.announcementChannelId || !sanction.announcementMessageId) return;
  try {
    const ch = await client.channels.fetch(sanction.announcementChannelId);
    if (ch && ch.isTextBased() && 'messages' in ch) {
      const msg = await (ch as TextChannel).messages
        .fetch(sanction.announcementMessageId)
        .catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [buildSanctionNoticeEmbed(sanction)] });
      }
    }
  } catch (err) {
    console.warn(`Could not update sanction notice ${sanction.referenceNumber}:`, err);
  }
}

async function sendCompletedSuspensionAlerts(client: Client) {
  const alerts = tlcStore.consumeCompletedSuspensionAlerts();
  if (alerts.length === 0) return;
  const state = tlcStore.getState();

  for (const alert of alerts) {
    if (state.config.notifications.sendDirectMessages) {
      try {
        const user = await client.users.fetch(alert.discordUserId);
        await user.send(
          `✅ **Match Suspension Completed (${alert.referenceNumber})**\n\nYour match suspension has ended following Match #${alert.fixtureMatchNumber}. Your profile status is now **${alert.restoredStatus}** and you are eligible to play again.`
        );
      } catch {
        // Ignore closed DMs
      }
    }
    const sanction = (state.sanctions ?? []).find(
      (s) => s.referenceNumber === alert.referenceNumber
    );
    if (sanction) {
      await updatePublishedSanctionNotice(client, sanction);
      await sendToSanctionsLog(client, {
        embeds: [
          buildSanctionLogEmbed(
            'Match Suspension Completed',
            sanction,
            'Match Result Engine',
            `Suspension completed automatically after Match #${alert.fixtureMatchNumber}. Status restored to ${alert.restoredStatus}.`
          ),
        ],
      });
    }
  }
  await sendLatestAuditLog(client);
}

function resolveDiscordPlayerSummary(
  discordUserId: string,
  fallbackUsername?: string,
  fallbackDisplayName?: string,
  fallbackAvatarUrl?: string
) {
  const state = tlcStore.getState();
  const player = state.players.find((p) => p.discordUserId === discordUserId);
  const activeMem = (state.teamMemberships ?? []).find(
    (m) => m.discordUserId === discordUserId && m.status === 'Active'
  );
  const clubId = player?.currentClubId ?? activeMem?.clubId ?? null;
  const club = clubId ? state.clubs.find((c) => c.clubId === clubId) : undefined;
  const prevSanction = (state.sanctions ?? []).find((s) => s.playerDiscordUserId === discordUserId);

  return {
    player,
    tlcId: player?.tlcId || prevSanction?.playerTlcId || null,
    playerName:
      player?.playerName ||
      fallbackDisplayName ||
      prevSanction?.playerName ||
      fallbackUsername ||
      discordUserId,
    discordUsername:
      player?.discordUsername ||
      fallbackUsername ||
      prevSanction?.playerDiscordUsername ||
      discordUserId,
    avatarUrl:
      player?.robloxAvatarUrl ||
      fallbackAvatarUrl ||
      prevSanction?.playerAvatarUrl ||
      '/src/assets/images/tlc_league_crest_1795467599044.jpg',
    teamName: club
      ? `${club.logoEmoji ? `${club.logoEmoji} ` : ''}${club.name}`
      : prevSanction?.clubName || 'Free Agent',
    isDeletedProfile: player?.status === 'Deleted',
  };
}

function buildSanctionHistoryPayloadForDiscordUser(
  discordUserId: string,
  fallbackUsername?: string,
  fallbackDisplayName?: string,
  fallbackAvatarUrl?: string
) {
  const state = tlcStore.getState();
  const resolved = resolveDiscordPlayerSummary(
    discordUserId,
    fallbackUsername,
    fallbackDisplayName,
    fallbackAvatarUrl
  );
  const summary = tlcStore.getPlayerDisciplinarySummary(discordUserId);
  const currency = state.config.sanctions?.defaultCurrency || 'TLC Coins';

  const disciplinaryStatus = summary.hasDisciplinaryBan
    ? 'Disciplinary Ban (Active)'
    : summary.suspendedMatchesRemaining > 0
    ? `Suspended (${summary.suspendedMatchesRemaining} official match(es) remaining)`
    : summary.unpaidFineTotal > 0
    ? `Outstanding Fines (${summary.unpaidFineTotal} ${currency})`
    : summary.allSanctions.length > 0
    ? 'In Good Standing (History on File)'
    : 'Clean Record';

  return buildSanctionHistoryEmbed({
    name: resolved.playerName,
    discordUserId,
    discordUsername: resolved.discordUsername,
    avatarUrl: resolved.avatarUrl,
    teamName: resolved.teamName,
    tlcId: resolved.tlcId,
    isDeletedProfile: resolved.isDeletedProfile,
    disciplinaryStatus,
    unpaidFineTotal: summary.unpaidFineTotal,
    currency,
    sanctions: summary.allSanctions,
  });
}

function resolveSanctionTypeInput(raw: string): SanctionType | null {
  const q = raw.trim().toLowerCase();
  const match = SANCTION_TYPES.find((t) => t.toLowerCase() === q);
  if (match) return match;
  return SANCTION_TYPES.find((t) => t.toLowerCase().includes(q)) || null;
}

function getSanctionSearchChoices(focused: string) {
  const q = focused.trim().toLowerCase();
  return (tlcStore.getState().sanctions ?? [])
    .filter((s) => s.status !== 'Removed')
    .filter((s) => {
      if (!q) return true;
      return (
        s.referenceNumber.toLowerCase().includes(q) ||
        s.playerName.toLowerCase().includes(q) ||
        s.playerDiscordUsername.toLowerCase().includes(q) ||
        s.sanctionType.toLowerCase().includes(q) ||
        s.reason.toLowerCase().includes(q)
      );
    })
    .slice(0, 25);
}

function getPositionRoleId(cfg: BotConfig, position?: PlayerPosition): string {
  if (!position) return '';
  const cat = getPositionCategory(position);
  return cat === 'Goalkeeper'
    ? cfg.roles.goalkeeperRoleId
    : cat === 'Defender'
    ? cfg.roles.defenderRoleId
    : cat === 'Midfielder'
    ? cfg.roles.midfielderRoleId
    : cfg.roles.attackerRoleId;
}

async function sendLatestAuditLog(client: Client) {
  const state = tlcStore.getState();
  const latestAudit = state.auditLogs[0];
  if (latestAudit && state.config.channels.auditLogsId) {
    await sendToConfiguredChannel(client, state.config.channels.auditLogsId, {
      embeds: [buildAuditEmbed(latestAudit)],
    });
  }
}

async function sendRejectionDm(client: Client, discordUserId: string | undefined, reason: string) {
  const cfg = tlcStore.getState().config;
  if (!discordUserId || !cfg.notifications.sendDirectMessages) return;
  try {
    const user = await client.users.fetch(discordUserId);
    await user.send(formatRejectionDmMessage(reason));
  } catch {
    // Ignore closed DMs
  }
}

function filterActivePlayersForPicker(query?: string): { player: PlayerProfile; clubName: string }[] {
  const state = tlcStore.getState();
  const q = query?.trim().toLowerCase() || '';
  return tlcStore
    .getActivePlayers()
    .map((player) => {
      const club = player.currentClubId
        ? state.clubs.find((c) => c.clubId === player.currentClubId)
        : undefined;
      return {
        player,
        clubName: club ? `${club.logoEmoji ? `${club.logoEmoji} ` : ''}${club.name}` : 'Free Agent',
      };
    })
    .filter(({ player, clubName }) => {
      if (!q) return true;
      return (
        player.playerName.toLowerCase().includes(q) ||
        player.discordUsername.toLowerCase().includes(q) ||
        player.tlcId.toLowerCase().includes(q) ||
        clubName.toLowerCase().includes(q)
      );
    });
}

function filterDeletedPlayersForPicker(
  query?: string
): { player: PlayerProfile; prevClubName: string }[] {
  const state = tlcStore.getState();
  const q = query?.trim().toLowerCase() || '';
  return tlcStore
    .getDeletedPlayers()
    .map((player) => {
      const club = player.previousClubId
        ? state.clubs.find((c) => c.clubId === player.previousClubId)
        : undefined;
      return {
        player,
        prevClubName: club ? `${club.logoEmoji ? `${club.logoEmoji} ` : ''}${club.name}` : 'Free Agent',
      };
    })
    .filter(({ player, prevClubName }) => {
      if (!q) return true;
      return (
        player.playerName.toLowerCase().includes(q) ||
        player.discordUsername.toLowerCase().includes(q) ||
        player.tlcId.toLowerCase().includes(q) ||
        prevClubName.toLowerCase().includes(q)
      );
    });
}

function filterActiveManagersForPicker(
  query?: string
): { manager: ManagerProfile; clubName: string }[] {
  const state = tlcStore.getState();
  const q = query?.trim().toLowerCase() || '';
  return tlcStore
    .getActiveManagers()
    .map((manager) => {
      const club = manager.currentClubId
        ? state.clubs.find((c) => c.clubId === manager.currentClubId)
        : undefined;
      return {
        manager,
        clubName: club ? `${club.logoEmoji ? `${club.logoEmoji} ` : ''}${club.name}` : 'Free Agent',
      };
    })
    .filter(({ manager, clubName }) => {
      if (!q) return true;
      return (
        manager.managerName.toLowerCase().includes(q) ||
        manager.discordUsername.toLowerCase().includes(q) ||
        manager.tlcId.toLowerCase().includes(q) ||
        clubName.toLowerCase().includes(q)
      );
    });
}

function filterDeletedManagersForPicker(
  query?: string
): { manager: ManagerProfile; prevClubName: string }[] {
  const state = tlcStore.getState();
  const q = query?.trim().toLowerCase() || '';
  return tlcStore
    .getDeletedManagers()
    .map((manager) => {
      const club = manager.previousClubId
        ? state.clubs.find((c) => c.clubId === manager.previousClubId)
        : undefined;
      return {
        manager,
        prevClubName: club ? `${club.logoEmoji ? `${club.logoEmoji} ` : ''}${club.name}` : 'Free Agent',
      };
    })
    .filter(({ manager, prevClubName }) => {
      if (!q) return true;
      return (
        manager.managerName.toLowerCase().includes(q) ||
        manager.discordUsername.toLowerCase().includes(q) ||
        manager.tlcId.toLowerCase().includes(q) ||
        prevClubName.toLowerCase().includes(q)
      );
    });
}

async function applyApprovalDiscordEffects(
  client: Client,
  discordUserId: string,
  playerName: string,
  registrationType: 'Player' | 'Manager',
  position?: PlayerPosition,
  fallbackGuildId?: string | null
) {
  const guildId = process.env.DISCORD_GUILD_ID?.trim() || fallbackGuildId || client.guilds.cache.first()?.id;
  const cfg = tlcStore.getState().config;
  if (!guildId) return;

  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(discordUserId);
    if (!member) return;

    if (member.manageable) {
      await member.setNickname(playerName.slice(0, 32)).catch(() => {});
    }

    const rolesToAdd: string[] = [];
    if (cfg.roles.verifiedRoleId) rolesToAdd.push(cfg.roles.verifiedRoleId);
    if (registrationType === 'Player' && cfg.roles.playerRoleId) {
      rolesToAdd.push(cfg.roles.playerRoleId);
      if (position) {
        const cat = getPositionCategory(position);
        const posRole =
          cat === 'Goalkeeper'
            ? cfg.roles.goalkeeperRoleId
            : cat === 'Defender'
            ? cfg.roles.defenderRoleId
            : cat === 'Midfielder'
            ? cfg.roles.midfielderRoleId
            : cfg.roles.attackerRoleId;
        if (posRole) rolesToAdd.push(posRole);
      }
    } else if (registrationType === 'Manager' && cfg.roles.managerRoleId) {
      rolesToAdd.push(cfg.roles.managerRoleId);
    }

    for (const rid of rolesToAdd) {
      await member.roles.add(rid).catch(() => {});
    }
    if (cfg.roles.unverifiedRoleId && member.roles.cache.has(cfg.roles.unverifiedRoleId)) {
      await member.roles.remove(cfg.roles.unverifiedRoleId).catch(() => {});
    }
  } catch (err) {
    console.warn('Could not sync Discord roles/nickname:', err);
  }
}

async function notifyApprovedRegistration(client: Client, req: RegistrationRequest) {
  const cfg = tlcStore.getState().config;
  if (cfg.notifications.sendDirectMessages) {
    try {
      const user = await client.users.fetch(req.discordUserId);
      await user.send(
        `Your official Touchline (**TLC**) **${req.registrationType}** registration has been **APPROVED**!\n` +
          `• **Official Name:** ${req.playerName}\n` +
          `• **Permanent TLC ID:** \`${req.tlcId}\`\n` +
          (req.position ? `• **Position:** ${req.position}\n` : '') +
          `• **Status:** Free Agent\n\nUse \`/profile\` in the server anytime to view your TLC career card.`
      );
    } catch {
      // User has DMs disabled
    }
  }
  if (cfg.notifications.publishRegistrationAnnouncements && cfg.channels.announcementsId) {
    await sendToConfiguredChannel(client, cfg.channels.announcementsId, {
      embeds: [buildRegistrationAnnouncementEmbed(req)],
    });
  }
}

async function notifyRejectedRegistration(client: Client, req: RegistrationRequest) {
  const cfg = tlcStore.getState().config;
  if (!cfg.notifications.sendDirectMessages) return;
  try {
    const user = await client.users.fetch(req.discordUserId);
    await user.send(
      `${formatRejectionDmMessage(req.rejectionReason || 'Verification declined by staff.')}\n\n` +
        (req.allowResubmit
          ? 'You may correct your details and submit a new application with `/register` or in `#verify-yourself`.'
          : 'Please contact TLC Staff if you believe this was an error.')
    );
  } catch {
    // User has DMs disabled
  }
}

export async function applyTransferDiscordEffects(
  playerDiscordUserId: string | undefined,
  fromClubId: string | null,
  toClubId: string | null,
  transferRecord?: TransferRecord
): Promise<void> {
  const client = activeClient;
  if (!client || !client.isReady()) return;

  const state = tlcStore.getState();
  const guildId = process.env.DISCORD_GUILD_ID || client.guilds.cache.first()?.id;

  if (guildId && playerDiscordUserId) {
    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(playerDiscordUserId);
      if (member) {
        await withRoleSyncBypass(guild.id, member.id, async () => {
          if (fromClubId) {
            const prevClub = state.clubs.find((c) => c.clubId === fromClubId);
            if (prevClub?.discordRoleId && member.roles.cache.has(prevClub.discordRoleId)) {
              await member.roles.remove(prevClub.discordRoleId).catch(() => {});
            }
          }
          if (toClubId) {
            const nextClub = state.clubs.find((c) => c.clubId === toClubId);
            if (nextClub?.discordRoleId) {
              await member.roles.add(nextClub.discordRoleId).catch(() => {});
            }
          }
        });
      }
    } catch (err) {
      console.warn('[TLC Bot] Could not sync club role on Discord member:', err);
    }
  }

  if (transferRecord && state.config.channels.transferMarketId) {
    await sendToConfiguredChannel(client, state.config.channels.transferMarketId, {
      embeds: [buildTransferAnnouncementEmbed(transferRecord)],
    });
  }
}

export async function dispatchTransferOfferToDiscord(offer: TransferOffer): Promise<void> {
  const client = activeClient;
  if (!client || !client.isReady()) return;

  const state = tlcStore.getState();
  const player = state.players.find((p) => p.tlcId === offer.playerTlcId);
  if (!player) return;

  try {
    const targetUser = await client.users.fetch(player.discordUserId);
    await targetUser.send(buildTransferOfferPlayerPayload(offer));
  } catch {
    await sendToConfiguredChannel(
      client,
      state.config.channels.transferMarketId,
      buildTransferOfferPlayerPayload(offer)
    );
  }
}

export async function deploySlashCommands(): Promise<number> {
  if (deployInFlight) return deployInFlight;

  deployInFlight = (async () => {
    const token = process.env.DISCORD_BOT_TOKEN?.trim();
    const clientId = process.env.DISCORD_CLIENT_ID?.trim() || activeClient?.application?.id;
    const configuredGuildId = process.env.DISCORD_GUILD_ID?.trim();
    const targetGuildId = configuredGuildId || activeClient?.guilds.cache.first()?.id;
    if (!token || !clientId) return 0;

    const rest = new REST({ version: '10' }).setToken(token);
    if (targetGuildId) {
      // Clear global commands first so Discord never displays duplicate Global + Guild commands
      await rest.put(Routes.applicationCommands(clientId), { body: [] }).catch(() => {});
      await rest.put(Routes.applicationGuildCommands(clientId, targetGuildId), {
        body: tlcSlashCommands,
      });
    } else {
      await rest.put(Routes.applicationCommands(clientId), {
        body: tlcSlashCommands,
      });
    }
    commandsDeployedCount = tlcSlashCommands.length;
    return commandsDeployedCount;
  })();

  try {
    return await deployInFlight;
  } finally {
    deployInFlight = null;
  }
}

export async function stopDiscordBot(): Promise<void> {
  if (ticketScanTimer) {
    clearInterval(ticketScanTimer);
    ticketScanTimer = null;
  }
  if (activeClient) {
    activeClient.destroy();
    activeClient = null;
  }
  lastBotError = null;
}

export async function startDiscordBot(): Promise<{ ok: boolean; message: string }> {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) {
    lastBotError = 'DISCORD_BOT_TOKEN is not configured in environment Secrets.';
    console.log('[TLC Bot] No DISCORD_BOT_TOKEN set; running in Web Management & Simulator mode.');
    return { ok: false, message: lastBotError };
  }

  if (activeClient?.isReady()) {
    activeClient.user.setPresence({
      status: 'online',
      activities: [{ name: 'Touchline (TLC) Football', type: ActivityType.Watching }],
    });
    lastBotError = null;
    return { ok: true, message: `Bot is already online as ${activeClient.user.tag}` };
  }

  if (activeClient) {
    activeClient.destroy();
    activeClient = null;
  }

  const createBotClient = (includePrivilegedIntents: boolean) =>
    new Client({
      intents: includePrivilegedIntents
        ? [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
          ]
        : [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    });

  let client = createBotClient(true);

  const wireClientEvents = (botClient: Client) => {
    botClient.once(Events.ClientReady, async (readyClient) => {
      activeClient = readyClient;
      lastBotError = null;
      readyClient.user.setPresence({
        status: 'online',
        activities: [{ name: 'Touchline (TLC) Football', type: ActivityType.Watching }],
      });
      console.log(`[TLC Bot] Online as ${readyClient.user.tag}`);

      try {
        await deploySlashCommands();
        console.log(`[TLC Bot] Deployed ${commandsDeployedCount} unique slash commands.`);
      } catch (err) {
        console.warn('[TLC Bot] Could not auto-deploy slash commands:', err);
      }

      // Post permanent Verify panel ONLY into the manually configured Registration Channel (never auto-create or guess)
      const verifyChannelId = tlcStore.getState().config.channels.verifyYourselfId;
      if (verifyChannelId) {
        try {
          const ch = await readyClient.channels.fetch(verifyChannelId);
          if (ch && ch.isTextBased() && 'messages' in ch) {
            const textCh = ch as TextChannel;
            const msgs = await textCh.messages.fetch({ limit: 10 });
            const alreadyPosted = msgs.some(
              (m) =>
                m.author.id === readyClient.user.id &&
                m.embeds.some((e) => e.title?.includes('Official Registration'))
            );
            if (!alreadyPosted) {
              await textCh.send(buildVerifyPanelPayload());
            }
          }
        } catch (err) {
          console.warn('[TLC Bot] Could not post verify panel in configured channel:', err);
        }
      }

      // Auto-publish / verify Unified Support Panel ONLY into manually configured Ticket Panel Channel
      if (tlcStore.getState().config.channels.ticketPanelId) {
        try {
          await publishTicketPanelToConfiguredChannel(readyClient);
        } catch (err) {
          console.warn('[TLC Bot] Could not verify/publish ticket panel in configured channel:', err);
        }
      }

      if (ticketScanTimer) {
        clearInterval(ticketScanTimer);
      }
      ticketScanTimer = setInterval(() => {
        void runTicketEscalationScan(readyClient).catch((err) =>
          console.warn('[TLC Tickets] Background escalation scan error:', err)
        );
      }, 120_000);
    });

    botClient.on(Events.GuildMemberRemove, async (member) => {
      try {
        await tlcStore.handleMemberLeave(member.id);
      } catch (err) {
        console.warn('[TLC Bot] GuildMemberRemove DB sync error:', err);
      }
    });

    botClient.on(Events.GuildMemberAdd, async (member) => {
      try {
        await tlcStore.handleMemberRejoin(member.id);
      } catch (err) {
        console.warn('[TLC Bot] GuildMemberAdd DB sync error:', err);
      }
    });

    botClient.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
      try {
        if (roleSyncBypass.has(`${newMember.guild.id}:${newMember.id}`)) return;
        const activeTeams = tlcStore.getActiveTeams().filter((t) => Boolean(t.discordRoleId));
        if (activeTeams.length === 0) return;

        const addedClubIds: string[] = [];
        const removedClubIds: string[] = [];
        for (const team of activeTeams) {
          const had = oldMember.roles.cache.has(team.discordRoleId);
          const has = newMember.roles.cache.has(team.discordRoleId);
          if (!had && has) addedClubIds.push(team.clubId);
          if (had && !has) removedClubIds.push(team.clubId);
        }

        if (addedClubIds.length === 0 && removedClubIds.length === 0) return;

        const { rolesToRemove } = await tlcStore.syncMemberTeamRoleChange(
          newMember.id,
          newMember.user.username,
          newMember.displayName,
          addedClubIds,
          removedClubIds,
          'Discord Role Sync'
        );

        if (rolesToRemove.length > 0) {
          await withRoleSyncBypass(newMember.guild.id, newMember.id, async () => {
            for (const rid of rolesToRemove) {
              if (newMember.roles.cache.has(rid)) {
                await newMember.roles.remove(rid).catch(() => {});
              }
            }
          });
        }
      } catch (err) {
        console.warn('[TLC Bot] GuildMemberUpdate role sync error:', err);
      }
    });

    botClient.on(Events.MessageCreate, async (message: Message) => {
      try {
        await handleTicketMessageCreate(message, botClient);
      } catch (err) {
        console.warn('[TLC Tickets] MessageCreate listener error:', err);
      }
    });

    botClient.on(Events.InteractionCreate, async (interaction: Interaction) => {
    const lockKey = `${interaction.user.id}:${interaction.id}`;
    if (activeInteractions.has(lockKey)) return;
    activeInteractions.add(lockKey);

    try {
      if (await handleTicketInteraction(interaction, botClient)) {
        return;
      }

      const state = tlcStore.getState();

      // ==================== AUTOCOMPLETE ====================
      if (interaction.isAutocomplete()) {
        const member = interaction.member as GuildMember | null;
        const focused = interaction.options.getFocused().trim();
        const cmdName = interaction.commandName;

        if (
          cmdName === 'sanction-history' ||
          cmdName === 'edit-sanction' ||
          cmdName === 'remove-sanction'
        ) {
          if (!isDisciplinaryStaff(member)) {
            await interaction.respond([]);
            return;
          }
          if (cmdName === 'sanction-history') {
            const q = focused.toLowerCase();
            const map = new Map<string, { name: string; value: string }>();
            for (const p of state.players) {
              if (
                !q ||
                p.playerName.toLowerCase().includes(q) ||
                p.discordUsername.toLowerCase().includes(q) ||
                p.tlcId.toLowerCase().includes(q)
              ) {
                map.set(p.discordUserId, {
                  name: `${p.playerName} (${p.tlcId}) · @${p.discordUsername}${
                    p.status === 'Deleted' ? ' [Deleted]' : ''
                  }`.slice(0, 100),
                  value: p.discordUserId,
                });
              }
            }
            for (const s of state.sanctions ?? []) {
              if (map.has(s.playerDiscordUserId)) continue;
              if (
                !q ||
                s.playerName.toLowerCase().includes(q) ||
                s.playerDiscordUsername.toLowerCase().includes(q)
              ) {
                map.set(s.playerDiscordUserId, {
                  name: `${s.playerName} · @${s.playerDiscordUsername} · (${s.referenceNumber})`.slice(
                    0,
                    100
                  ),
                  value: s.playerDiscordUserId,
                });
              }
            }
            await interaction.respond(Array.from(map.values()).slice(0, 25));
            return;
          }

          const matches = getSanctionSearchChoices(focused);
          await interaction.respond(
            matches.map((s) => ({
              name: `${s.referenceNumber} · ${s.playerName} (${s.sanctionType}) · ${s.fineStatus}`.slice(
                0,
                100
              ),
              value: s.id,
            }))
          );
          return;
        }

        if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.respond([]);
          return;
        }
        if (cmdName === 'delete-player') {
          const matches = filterActivePlayersForPicker(focused).slice(0, 25);
          await interaction.respond(
            matches.map(({ player, clubName }) => ({
              name: `${player.playerName} (${player.position}) · @${player.discordUsername} · ${clubName}`.slice(
                0,
                100
              ),
              value: player.tlcId,
            }))
          );
          return;
        }
        if (cmdName === 'restore-player') {
          const matches = filterDeletedPlayersForPicker(focused).slice(0, 25);
          await interaction.respond(
            matches.map(({ player, prevClubName }) => ({
              name: `${player.playerName} (${player.position}) · @${player.discordUsername} · Prev: ${prevClubName}`.slice(
                0,
                100
              ),
              value: player.tlcId,
            }))
          );
          return;
        }
        if (cmdName === 'delete-manager') {
          const matches = filterActiveManagersForPicker(focused).slice(0, 25);
          await interaction.respond(
            matches.map(({ manager, clubName }) => ({
              name: `${manager.managerName} · @${manager.discordUsername} · ${clubName}`.slice(0, 100),
              value: manager.tlcId,
            }))
          );
          return;
        }
        if (cmdName === 'restore-manager') {
          const matches = filterDeletedManagersForPicker(focused).slice(0, 25);
          await interaction.respond(
            matches.map(({ manager, prevClubName }) => ({
              name: `${manager.managerName} · @${manager.discordUsername} · Prev: ${prevClubName}`.slice(
                0,
                100
              ),
              value: manager.tlcId,
            }))
          );
          return;
        }
        await interaction.respond([]);
        return;
      }

      // ==================== SLASH COMMANDS ====================
      if (interaction.isChatInputCommand()) {
        const cmd = interaction.commandName;

        if (cmd === 'setup') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator) && !isStaffMember(member)) {
            await interaction.reply({
              content: 'Administrator permission is required to run `/setup`.',
              ephemeral: true,
            });
            return;
          }
          const sub = interaction.options.getSubcommand(false);
          const initialSection: SetupSection = sub === 'teams' ? 'teams' : 'channels_core';
          await interaction.reply(buildSetupPanelPayload(state, initialSection));
          return;
        }

        if (cmd === 'register') {
          const existingPlayer = state.players.find((p) => p.discordUserId === interaction.user.id);
          const existingManager = state.managers.find((m) => m.discordUserId === interaction.user.id);
          if (existingPlayer?.status === 'Deleted') {
            await interaction.reply({
              content: `Your previous TLC player profile (\`${existingPlayer.tlcId}\`) is currently deactivated. An administrator can restore it using \`/restore-player\`.`,
              ephemeral: true,
            });
            return;
          }
          if (existingManager?.status === 'Deleted') {
            await interaction.reply({
              content: `Your previous TLC manager profile (\`${existingManager.tlcId}\`) is currently deactivated. An administrator can restore it using \`/restore-manager\`.`,
              ephemeral: true,
            });
            return;
          }
          if (existingPlayer || existingManager) {
            const id = existingPlayer?.tlcId || existingManager?.tlcId;
            await interaction.reply({
              content: `You already have an approved TLC profile (\`${id}\`). Use \`/profile\` to view it or click **Request Profile Correction** in the Registration Channel.`,
              ephemeral: true,
            });
            return;
          }
          const pendingReq = state.registrations.find(
            (r) => r.discordUserId === interaction.user.id && r.status === 'Pending'
          );
          if (pendingReq) {
            await interaction.reply({
              content: `Your **${pendingReq.registrationType}** registration for **${pendingReq.playerName}** is already pending staff review.`,
              ephemeral: true,
            });
            return;
          }
          await interaction.reply(buildRegistrationTypeSelectPayload());
          return;
        }

        if (cmd === 'post-verify-panel') {
          if (!isStaffMember(interaction.member as GuildMember)) {
            await interaction.reply({ content: 'Staff permission required.', ephemeral: true });
            return;
          }
          const targetChannelId = state.config.channels.verifyYourselfId;
          if (!targetChannelId) {
            await interaction.reply({
              content:
                'Registration Channel is not configured yet. Please run `/setup` and select an existing channel first (the bot will not auto-create channels).',
              ephemeral: true,
            });
            return;
          }
          if (!state.config.channels.registrationRequestsId) {
            await interaction.reply({
              content:
                'Registration Review Channel is not configured yet. Please run `/setup` to select your review channel before posting the Verify panel.',
              ephemeral: true,
            });
            return;
          }
          const ch = await client.channels.fetch(targetChannelId).catch(() => null);
          if (!ch || !ch.isTextBased() || !('send' in ch)) {
            await interaction.reply({
              content: `Configured Registration Channel (<#${targetChannelId}>) could not be accessed. Update it using \`/setup\`.`,
              ephemeral: true,
            });
            return;
          }
          await (ch as TextChannel).send(buildVerifyPanelPayload());
          await interaction.reply({
            content: `Permanent Verification panel posted in <#${targetChannelId}>.`,
            ephemeral: true,
          });
          return;
        }

        if (cmd === 'profile') {
          const p = state.players.find((x) => x.discordUserId === interaction.user.id);
          if (p) {
            if (p.status === 'Deleted') {
              await interaction.reply({
                content: `Your TLC player profile (\`${p.tlcId}\`) has been deactivated by an administrator. Your historical stats remain preserved; contact an admin to restore your profile.`,
                ephemeral: true,
              });
              return;
            }
            const club = state.clubs.find((c) => c.clubId === p.currentClubId);
            const disc = tlcStore.getPlayerDisciplinarySummary(p.discordUserId);
            await interaction.reply(
              buildPlayerProfileEmbed(p, club?.name || 'Free Agent', {
                suspendedMatchesRemaining: disc.suspendedMatchesRemaining,
                hasDisciplinaryBan: disc.hasDisciplinaryBan,
                unpaidFineTotal: disc.unpaidFineTotal,
                currency: state.config.sanctions?.defaultCurrency || 'TLC Coins',
              })
            );
            return;
          }
          const m = state.managers.find((x) => x.discordUserId === interaction.user.id);
          if (m) {
            if (m.status === 'Deleted') {
              await interaction.reply({
                content: `Your TLC manager profile (\`${m.tlcId}\`) has been deactivated by an administrator. Your historical stats remain preserved; contact an admin to restore your profile.`,
                ephemeral: true,
              });
              return;
            }
            const club = state.clubs.find((c) => c.clubId === m.currentClubId);
            await interaction.reply({ embeds: [buildManagerProfileEmbed(m, club?.name || 'Free Agent')] });
            return;
          }
          await interaction.reply({ content: 'You do not have an approved TLC profile yet. Visit #verify-yourself.', ephemeral: true });
          return;
        }

        if (cmd === 'player') {
          const q = interaction.options.getString('name', true).toLowerCase();
          const p = tlcStore
            .getActivePlayers()
            .find((x) => x.playerName.toLowerCase().includes(q) || x.tlcId.toLowerCase() === q);
          if (!p) {
            await interaction.reply({ content: 'No active verified player matched that query.', ephemeral: true });
            return;
          }
          const club = state.clubs.find((c) => c.clubId === p.currentClubId);
          const disc = tlcStore.getPlayerDisciplinarySummary(p.discordUserId);
          await interaction.reply(
            buildPlayerProfileEmbed(p, club?.name || 'Free Agent', {
              suspendedMatchesRemaining: disc.suspendedMatchesRemaining,
              hasDisciplinaryBan: disc.hasDisciplinaryBan,
              unpaidFineTotal: disc.unpaidFineTotal,
              currency: state.config.sanctions?.defaultCurrency || 'TLC Coins',
            })
          );
          return;
        }

        if (cmd === 'players' || cmd === 'free-agents' || cmd === 'search-player') {
          let list = tlcStore.getActivePlayers();
          if (cmd === 'free-agents') {
            list = list.filter((p) => !p.currentClubId && (p.status === 'Free Agent' || p.status === 'Active'));
          }
          if (cmd === 'search-player') {
            const q = interaction.options.getString('query')?.toLowerCase();
            const pos = interaction.options.getString('position');
            if (q) list = list.filter((p) => p.playerName.toLowerCase().includes(q) || p.tlcId.toLowerCase() === q);
            if (pos) list = list.filter((p) => p.position === pos);
          }
          const lines = list
            .slice(0, 15)
            .map((p) => `\`${p.tlcId}\` **${p.playerName}** (${p.position}) — ${p.status} · ${p.goals}G ${p.assists}A`);
          await interaction.reply({
            content: lines.length > 0 ? lines.join('\n') : 'No players matched your criteria.',
          });
          return;
        }

        if (cmd === 'manager') {
          const q = interaction.options.getString('name', true).toLowerCase();
          const m = tlcStore
            .getActiveManagers()
            .find((x) => x.managerName.toLowerCase().includes(q) || x.tlcId.toLowerCase() === q);
          if (!m) {
            await interaction.reply({ content: 'Active manager not found.', ephemeral: true });
            return;
          }
          const club = state.clubs.find((c) => c.clubId === m.currentClubId);
          await interaction.reply({ embeds: [buildManagerProfileEmbed(m, club?.name || 'Free Agent')] });
          return;
        }

        if (cmd === 'managers') {
          const lines = tlcStore
            .getActiveManagers()
            .map(
              (m) => `\`${m.tlcId}\` **${m.managerName}** — ${m.wins}W-${m.draws}D-${m.losses}L (${m.winRate}%)`
            );
          await interaction.reply({ content: lines.join('\n') || 'No active managers registered.' });
          return;
        }

        if (cmd === 'create-team') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({
              content: 'Administrator permission is required to run `/create-team`.',
              ephemeral: true,
            });
            return;
          }
          const draftKey = `${interaction.guildId || 'dm'}:${interaction.user.id}`;
          const draft: CreateTeamDraft = {};
          createTeamDrafts.set(draftKey, draft);
          await interaction.reply(buildCreateTeamBuilderPayload(draft));
          return;
        }

        if (cmd === 'delete-team') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({
              content: 'Administrator permission is required to run `/delete-team`.',
              ephemeral: true,
            });
            return;
          }
          await interaction.reply(buildDeleteTeamPickerPayload(tlcStore.getActiveTeams()));
          return;
        }

        if (cmd === 'delete-player') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({
              content: 'Administrator permission is required to run `/delete-player`.',
              ephemeral: true,
            });
            return;
          }
          const search = interaction.options.getString('search')?.trim();
          if (search) {
            const exact = tlcStore.getActivePlayers().find((p) => p.tlcId === search);
            if (exact) {
              const club = exact.currentClubId
                ? state.clubs.find((c) => c.clubId === exact.currentClubId)
                : undefined;
              const clubName = club ? `${club.logoEmoji ? `${club.logoEmoji} ` : ''}${club.name}` : 'Free Agent';
              await interaction.reply(buildDeletePlayerConfirmPayload(exact, clubName));
              return;
            }
          }
          await interaction.reply(
            buildDeletePlayerPickerPayload(filterActivePlayersForPicker(search), search)
          );
          return;
        }

        if (cmd === 'restore-player') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({
              content: 'Administrator permission is required to run `/restore-player`.',
              ephemeral: true,
            });
            return;
          }
          const search = interaction.options.getString('search')?.trim();
          if (search) {
            const exact = tlcStore.getDeletedPlayers().find((p) => p.tlcId === search);
            if (exact) {
              const club = exact.previousClubId
                ? state.clubs.find((c) => c.clubId === exact.previousClubId)
                : undefined;
              const prevClubName = club
                ? `${club.logoEmoji ? `${club.logoEmoji} ` : ''}${club.name}`
                : 'Free Agent';
              await interaction.reply(buildRestorePlayerConfirmPayload(exact, prevClubName));
              return;
            }
          }
          await interaction.reply(
            buildRestorePlayerPickerPayload(filterDeletedPlayersForPicker(search), search)
          );
          return;
        }

        if (cmd === 'delete-manager') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({
              content: 'Administrator permission is required to run `/delete-manager`.',
              ephemeral: true,
            });
            return;
          }
          const search = interaction.options.getString('search')?.trim();
          if (search) {
            const exact = tlcStore.getActiveManagers().find((m) => m.tlcId === search);
            if (exact) {
              const club = exact.currentClubId
                ? state.clubs.find((c) => c.clubId === exact.currentClubId)
                : undefined;
              const clubName = club ? `${club.logoEmoji ? `${club.logoEmoji} ` : ''}${club.name}` : 'Free Agent';
              await interaction.reply(buildDeleteManagerConfirmPayload(exact, clubName));
              return;
            }
          }
          await interaction.reply(
            buildDeleteManagerPickerPayload(filterActiveManagersForPicker(search), search)
          );
          return;
        }

        if (cmd === 'restore-manager') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({
              content: 'Administrator permission is required to run `/restore-manager`.',
              ephemeral: true,
            });
            return;
          }
          const search = interaction.options.getString('search')?.trim();
          if (search) {
            const exact = tlcStore.getDeletedManagers().find((m) => m.tlcId === search);
            if (exact) {
              const club = exact.previousClubId
                ? state.clubs.find((c) => c.clubId === exact.previousClubId)
                : undefined;
              const prevClubName = club
                ? `${club.logoEmoji ? `${club.logoEmoji} ` : ''}${club.name}`
                : 'Free Agent';
              await interaction.reply(buildRestoreManagerConfirmPayload(exact, prevClubName));
              return;
            }
          }
          await interaction.reply(
            buildRestoreManagerPickerPayload(filterDeletedManagersForPicker(search), search)
          );
          return;
        }

        if (cmd === 'rejected-requests') {
          if (!isStaffMember(interaction.member as GuildMember)) {
            await interaction.reply({ content: 'Staff permission required.', ephemeral: true });
            return;
          }
          const category = (interaction.options.getString('category') || 'all') as
            | RejectedRequestItem['category']
            | 'all';
          const items = tlcStore.getRejectedRequests(category);
          await interaction.reply({
            embeds: [
              buildRejectedRequestsEmbed(
                items,
                category === 'all' ? 'All Categories' : category
              ),
            ],
            ephemeral: true,
          });
          return;
        }

        if (cmd === 'teams') {
          const activeTeams = tlcStore.getActiveTeams();
          const counts: Record<string, number> = {};
          for (const t of activeTeams) {
            counts[t.clubId] = tlcStore.getTeamRosterMembers(t.clubId).length;
          }
          await interaction.reply(buildTeamsListPayload(activeTeams, counts));
          return;
        }

        if (cmd === 'team') {
          const q = interaction.options.getString('name')?.trim().toLowerCase();
          const activeTeams = tlcStore.getActiveTeams();
          const team = q
            ? activeTeams.find(
                (c) =>
                  c.name.toLowerCase().includes(q) ||
                  c.shortCode.toLowerCase() === q ||
                  c.clubId.toLowerCase() === q
              )
            : tlcStore.resolveUserTeam(interaction.user.id);

          if (!team) {
            await interaction.reply({
              content: q
                ? `No active team matched **${q}**. Use \`/teams\` to browse registered teams.`
                : 'You are not currently assigned to an active team. Use `/teams` or `/demande` to join one.',
              ephemeral: true,
            });
            return;
          }
          const rosterMembers = tlcStore.getTeamRosterMembers(team.clubId);
          const teamTransfers = state.transfers.filter(
            (t) => t.toClubId === team.clubId || t.fromClubId === team.clubId
          );
          await interaction.reply(buildTeamProfilePayload(team, rosterMembers, teamTransfers));
          return;
        }

        if (cmd === 'demande') {
          const pending = (state.signingRequests ?? []).find(
            (r) => r.playerDiscordUserId === interaction.user.id && r.status === 'Pending'
          );
          if (pending) {
            await interaction.reply({
              content: `You already have a pending signing request for **${pending.requestedClubLogoEmoji || '⚽'} ${pending.requestedClubName}**. Please wait for staff to approve or cancel it.`,
              ephemeral: true,
            });
            return;
          }
          const signingChannelId = state.config.channels.signingRequestsId;
          if (!signingChannelId) {
            await interaction.reply({
              content:
                'Signing Request Channel is not configured yet. Please ask an administrator to run `/setup teams` and select an existing channel.',
              ephemeral: true,
            });
            return;
          }
          const activeTeams = tlcStore.getActiveTeams();
          const counts: Record<string, number> = {};
          for (const t of activeTeams) {
            counts[t.clubId] = tlcStore.getTeamRosterMembers(t.clubId).length;
          }
          await interaction.reply(buildDemandePickerPayload(activeTeams, counts));
          return;
        }

        if (cmd === 'release') {
          const member = interaction.member as GuildMember | null;
          const isAdminOrStaff = isStaffMember(member);
          const activeTeams = tlcStore.getActiveTeams();
          const teamArg = interaction.options.getString('team')?.trim().toLowerCase();

          let targetTeam = teamArg
            ? activeTeams.find(
                (c) => c.name.toLowerCase().includes(teamArg) || c.clubId.toLowerCase() === teamArg
              )
            : activeTeams.find((c) => c.ownerDiscordUserId === interaction.user.id) ||
              (isAdminOrStaff ? tlcStore.resolveUserTeam(interaction.user.id) : undefined);

          if (!targetTeam) {
            await interaction.reply({
              content: isAdminOrStaff
                ? 'Could not resolve an active team. Specify the `team` option or check `/teams`.'
                : 'You are not the Team Owner of an active team.',
              ephemeral: true,
            });
            return;
          }

          if (!isAdminOrStaff && targetTeam.ownerDiscordUserId !== interaction.user.id) {
            await interaction.reply({
              content: `Only the Team Owner of **${targetTeam.name}** or an Administrator can release players from this roster.`,
              ephemeral: true,
            });
            return;
          }

          const members = tlcStore.getTeamRosterMembers(targetTeam.clubId);
          await interaction.reply(buildReleaseRosterPayload(targetTeam, members));
          return;
        }

        if (cmd === 'transfer-history') {
          const targetUser = interaction.options.getUser('player') || interaction.user;
          const member = interaction.member as GuildMember | null;
          if (targetUser.id !== interaction.user.id) {
            const isStaff = isStaffMember(member);
            const callerOwnedTeams = tlcStore
              .getActiveTeams()
              .filter((c) => c.ownerDiscordUserId === interaction.user.id);
            const targetHistory = tlcStore.getTransferHistoryForUser(targetUser.id);
            const isOwnerRelated = callerOwnedTeams.some(
              (team) =>
                tlcStore.getTeamRosterMembers(team.clubId).some((m) => m.discordUserId === targetUser.id) ||
                targetHistory.some((tr) => tr.toClubId === team.clubId || tr.fromClubId === team.clubId)
            );
            if (!isStaff && !isOwnerRelated) {
              await interaction.reply({
                content:
                  'You can only view your own transfer history, or that of players on a team you own (or as Staff).',
                ephemeral: true,
              });
              return;
            }
          }
          const records = tlcStore.getTransferHistoryForUser(targetUser.id);
          await interaction.reply({
            embeds: [
              buildTransferHistoryEmbed(
                `Transfer History · ${targetUser.username}`,
                records
              ),
            ],
            ephemeral: targetUser.id !== interaction.user.id,
          });
          return;
        }

        if (cmd === 'club') {
          const q = interaction.options.getString('name', true).toLowerCase();
          const club = tlcStore.getActiveTeams().find(
            (c) => c.name.toLowerCase().includes(q) || c.clubId.toLowerCase() === q
          );
          if (!club) {
            await interaction.reply({ content: 'Club not found.', ephemeral: true });
            return;
          }
          const mgr = state.managers.find((m) => m.tlcId === club.currentManagerTlcId);
          const roster = tlcStore.getTeamRosterMembers(club.clubId);
          await interaction.reply({
            embeds: [buildClubProfileEmbed(club, mgr?.managerName || 'Vacant', roster.length)],
          });
          return;
        }

        if (cmd === 'clubs') {
          const lines = tlcStore.getActiveTeams().map(
            (c) =>
              `${c.logoEmoji ? `${c.logoEmoji} ` : ''}\`${c.clubId}\` **${c.name}** (${c.shortCode}) — ${c.wins}W ${c.draws}D ${c.losses}L`
          );
          await interaction.reply({ content: lines.join('\n') || 'No clubs registered.' });
          return;
        }

        if (cmd === 'roster') {
          const q = (
            interaction.options.getString('team') || interaction.options.getString('club')
          )?.trim().toLowerCase();
          const activeTeams = tlcStore.getActiveTeams();
          const club = q
            ? activeTeams.find(
                (c) => c.name.toLowerCase().includes(q) || c.clubId.toLowerCase() === q
              )
            : tlcStore.resolveUserTeam(interaction.user.id);
          if (!club) {
            await interaction.reply({
              content: q
                ? 'Team not found.'
                : 'You are not currently on an active team. Specify a team name with `/roster`.',
              ephemeral: true,
            });
            return;
          }
          const roster = tlcStore.getTeamRosterMembers(club.clubId);
          const lines = roster.map(
            (m) =>
              `• <@${m.discordUserId}> (**${m.displayName}**)${m.position ? ` — ${m.position}` : ''}${
                m.playerTlcId ? ` (\`${m.playerTlcId}\`)` : ''
              }`
          );
          await interaction.reply({
            content: `**${club.logoEmoji || '⚽'} ${club.name} Roster (${roster.length})**\n${
              lines.join('\n') || 'No players currently signed.'
            }`,
          });
          return;
        }

        if (cmd === 'sign-player') {
          const mgr = tlcStore.getActiveManagers().find((m) => m.discordUserId === interaction.user.id);
          const clubArg = interaction.options.getString('club')?.toLowerCase();
          if (!mgr && !isStaffMember(interaction.member as GuildMember)) {
            await interaction.reply({
              content: 'Only active verified TLC Managers can initiate `/sign-player` free-agent signings.',
              ephemeral: true,
            });
            return;
          }

          const club =
            (clubArg
              ? state.clubs.find(
                  (c) => c.clubId.toLowerCase() === clubArg || c.name.toLowerCase().includes(clubArg)
                )
              : undefined) ||
            (mgr?.currentClubId ? state.clubs.find((c) => c.clubId === mgr.currentClubId) : undefined) ||
            (mgr ? state.clubs.find((c) => c.currentManagerTlcId === mgr.tlcId) : undefined);

          if (!club) {
            await interaction.reply({
              content: 'No destination club found for your manager profile. Specify the `club` option or get assigned to a club first.',
              ephemeral: true,
            });
            return;
          }

          const q = interaction.options.getString('query')?.trim().toLowerCase() || '';
          const pos = interaction.options.getString('position')?.trim() || '';
          const freeAgents = tlcStore.getActivePlayers().filter((p) => {
            if (p.currentClubId || (p.status !== 'Free Agent' && p.status !== 'Active')) return false;
            if (pos && p.position !== pos) return false;
            if (q && !p.playerName.toLowerCase().includes(q) && !p.tlcId.toLowerCase().includes(q)) {
              return false;
            }
            return true;
          });

          await interaction.reply(buildFreeAgentSignPickerPayload(club, freeAgents, q, pos));
          return;
        }

        if (cmd === 'sign') {
          const mgr = tlcStore.getActiveManagers().find((m) => m.discordUserId === interaction.user.id);
          if (!mgr) {
            await interaction.reply({ content: 'Only active verified TLC Managers can submit transfer offers.', ephemeral: true });
            return;
          }
          const pQuery = interaction.options.getString('player', true).toLowerCase();
          const cQuery = interaction.options.getString('club', true).toLowerCase();
          const type = interaction.options.getString('type', true) as 'Signing' | 'Permanent Transfer' | 'Loan';
          const details = interaction.options.getString('details') || '';

          const player = tlcStore
            .getActivePlayers()
            .find((p) => p.tlcId.toLowerCase() === pQuery || p.playerName.toLowerCase().includes(pQuery));
          const club = tlcStore
            .getActiveTeams()
            .find((c) => c.clubId.toLowerCase() === cQuery || c.name.toLowerCase().includes(cQuery));
          if (!player || !club) {
            await interaction.reply({ content: 'Player or destination club not found.', ephemeral: true });
            return;
          }

          const offer = await tlcStore.submitTransferOffer(
            {
              playerTlcId: player.tlcId,
              toClubId: club.clubId,
              managerTlcId: mgr.tlcId,
              transferType: type,
              details,
            },
            interaction.user.username
          );

          // Try sending DM to player
          try {
            const targetUser = await client.users.fetch(player.discordUserId);
            await targetUser.send(buildTransferOfferPlayerPayload(offer));
          } catch {
            // Fallback: post in transfer channel if DMs closed
            await sendToConfiguredChannel(
              client,
              state.config.channels.transferMarketId,
              buildTransferOfferPlayerPayload(offer)
            );
          }

          await interaction.reply({
            content: `Transfer offer sent to **${player.playerName}** (${player.tlcId}) for **${club.name}**.`,
            ephemeral: true,
          });
          return;
        }

        if (cmd === 'register-club') {
          const reviewChannelId = state.config.channels.registrationRequestsId;
          if (!reviewChannelId) {
            await interaction.reply({
              content: 'Registration Review Channel is not configured. Ask an administrator to run `/setup`.',
              ephemeral: true,
            });
            return;
          }
          const name = interaction.options.getString('name', true);
          const code = interaction.options.getString('code', true);
          const logoUrl = interaction.options.getString('logo_url') || undefined;
          const mgr = tlcStore.getActiveManagers().find((m) => m.discordUserId === interaction.user.id);

          const clubReq = await tlcStore.submitClubRegistration({
            name,
            shortCode: code,
            logoUrl,
            requestedByDiscordId: interaction.user.id,
            requestedByUsername: interaction.user.username,
            managerTlcId: mgr?.tlcId || null,
          });

          await sendToConfiguredChannel(client, reviewChannelId, buildClubRegistrationReviewPayload(clubReq));
          await interaction.reply({
            content: `Club registration request for **${clubReq.name} (${clubReq.shortCode})** sent to <#${reviewChannelId}> for staff APPROVE / CANCEL review.`,
            ephemeral: true,
          });
          return;
        }

        if (cmd === 'competition') {
          const sub = interaction.options.getSubcommand();
          if (sub === 'list') {
            const lines = state.competitions.map(
              (c) => `• **${c.name}** (${c.season} · ${c.type}) — ${c.participatingClubIds.length} Clubs`
            );
            await interaction.reply({
              content: lines.join('\n') || 'No competitions configured yet.',
            });
            return;
          }
          if (sub === 'create') {
            if (!isStaffMember(interaction.member as GuildMember)) {
              await interaction.reply({ content: 'Staff permission required.', ephemeral: true });
              return;
            }
            const name = interaction.options.getString('name', true);
            const type = interaction.options.getString('type', true) as
              | 'League'
              | 'Knockout Tournament'
              | 'Group Stage'
              | 'Group Stage + Knockout'
              | 'Friendly Matches';
            const season = interaction.options.getString('season', true);
            const startDate = new Date().toISOString().slice(0, 10);
            const endDate = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
            const comp = await tlcStore.createCompetition(
              {
                name,
                type,
                season,
                participatingClubIds: [],
                matchFormat: 'Single Leg',
                startDate,
                endDate,
              },
              interaction.user.username
            );
            await interaction.reply({
              content: `Created competition **${comp.name}** (${comp.season} · ${comp.type}).`,
            });
            return;
          }
          if (sub === 'register') {
            const reviewChannelId = state.config.channels.registrationRequestsId;
            if (!reviewChannelId) {
              await interaction.reply({
                content: 'Registration Review Channel is not configured. Ask an administrator to run `/setup`.',
                ephemeral: true,
              });
              return;
            }
            const compQ = interaction.options.getString('competition', true).toLowerCase();
            const clubArg = interaction.options.getString('club')?.toLowerCase();
            const mgr = tlcStore.getActiveManagers().find((m) => m.discordUserId === interaction.user.id);
            if (!mgr) {
              await interaction.reply({
                content: 'Only active verified TLC Managers can register a club into a competition.',
                ephemeral: true,
              });
              return;
            }
            const comp = state.competitions.find((c) => c.name.toLowerCase().includes(compQ));
            const club =
              (clubArg
                ? state.clubs.find(
                    (c) => c.clubId.toLowerCase() === clubArg || c.name.toLowerCase().includes(clubArg)
                  )
                : undefined) ||
              (mgr.currentClubId ? state.clubs.find((c) => c.clubId === mgr.currentClubId) : undefined);
            if (!comp || !club) {
              await interaction.reply({
                content: 'Competition or club not found.',
                ephemeral: true,
              });
              return;
            }
            const rosterIds = state.players.filter((p) => p.currentClubId === club.clubId).map((p) => p.tlcId);
            const reg = await tlcStore.registerTeamForCompetition(
              {
                competitionId: comp.id,
                clubId: club.clubId,
                managerTlcId: mgr.tlcId,
                rosterTlcIds: rosterIds,
              },
              interaction.user.username
            );
            await sendToConfiguredChannel(
              client,
              reviewChannelId,
              buildCompetitionRegistrationReviewPayload(reg, comp.name)
            );
            await interaction.reply({
              content: `Competition entry for **${club.name}** in **${comp.name}** sent to <#${reviewChannelId}> for staff APPROVE / CANCEL review.`,
              ephemeral: true,
            });
            return;
          }
        }

        if (cmd === 'table') {
          const q = interaction.options.getString('competition', true).toLowerCase();
          const comp = state.competitions.find((c) => c.name.toLowerCase().includes(q));
          if (!comp) {
            await interaction.reply({ content: 'Competition not found.', ephemeral: true });
            return;
          }
          const rows = tlcStore.computeStandings(comp.id);
          await interaction.reply({ embeds: [buildStandingsEmbed(comp.name, rows)] });
          return;
        }

        if (cmd === 'fixture' || cmd === 'fixtures' || cmd === 'schedule') {
          let list = state.fixtures.filter((f) => f.status !== 'Completed');
          if (cmd === 'fixtures') {
            const q = interaction.options.getString('competition')?.toLowerCase();
            if (q) {
              list = state.fixtures.filter((f) => f.competitionName.toLowerCase().includes(q));
            }
          } else if (cmd === 'schedule') {
            const q = interaction.options.getString('club', true).toLowerCase();
            const club = state.clubs.find((c) => c.name.toLowerCase().includes(q));
            if (club) {
              list = list.filter((f) => f.homeClubId === club.clubId || f.awayClubId === club.clubId);
            }
          }
          const lines = list.slice(0, 12).map((f) => {
            const h = state.clubs.find((c) => c.clubId === f.homeClubId)?.name || 'TBD';
            const a = state.clubs.find((c) => c.clubId === f.awayClubId)?.name || 'TBD';
            return `#${f.matchNumber} [${f.competitionName} · ${f.roundLabel}] **${h}** vs **${a}** — ${f.matchDate} ${f.matchTime} (${f.status})`;
          });
          await interaction.reply({ content: lines.join('\n') || 'No fixtures found.' });
          return;
        }

        if (cmd === 'leaderboard') {
          const cat = interaction.options.getString('category', true) as
            | 'goals'
            | 'assists'
            | 'ratings'
            | 'trophies'
            | 'managers';
          const rows = tlcStore.getLeaderboard(cat).slice(0, 10);
          const lines = rows.map(
            (r) => `\`#${r.rank}\` **${r.name}** (${r.clubName}) — **${r.primaryValue}** (${r.secondaryLabel})`
          );
          await interaction.reply({ content: `**TLC Leaderboard (${cat})**\n${lines.join('\n') || 'No data yet.'}` });
          return;
        }

        if (cmd === 'ratings') {
          const pos = interaction.options.getString('position');
          let list = [...state.players].filter((p) => p.ratingCount > 0 || p.matchesPlayed > 0);
          if (pos) list = list.filter((p) => p.position === pos);
          list.sort((a, b) => b.averageRating - a.averageRating);
          const lines = list
            .slice(0, 12)
            .map(
              (p, i) =>
                `\`#${i + 1}\` **${p.playerName}** (${p.position}) — **${p.averageRating.toFixed(2)}** avg · ${p.matchesPlayed} GP · ${p.manOfTheMatchAwards} MOTM`
            );
          await interaction.reply({
            content: `**TLC Player Ratings${pos ? ` (${pos})` : ''}**\n${
              lines.join('\n') || 'No match ratings recorded yet.'
            }`,
          });
          return;
        }

        // ==================== DISCIPLINARY SYSTEM COMMANDS ====================

        if (cmd === 'setup-sanctions') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({
              content: 'Administrator permission is required to run `/setup-sanctions`.',
              ephemeral: true,
            });
            return;
          }
          await interaction.reply(buildSanctionSetupPayload(state));
          return;
        }

        if (cmd === 'sanction') {
          if (!isDisciplinaryStaff(interaction.member as GuildMember)) {
            await interaction.reply({
              content: 'You lack Disciplinary Staff permissions to issue sanctions.',
              ephemeral: true,
            });
            return;
          }
          const draftId = crypto.randomUUID().slice(0, 8);
          const draft: SanctionDraft = {
            draftId,
            issuerDiscordId: interaction.user.id,
            fineAmount: 0,
            suspensionMatches: 0,
          };
          sanctionDrafts.set(draftId, draft);
          const currency = state.config.sanctions?.defaultCurrency || 'TLC Coins';
          await interaction.reply(buildSanctionBuilderPayload(draft, currency));
          return;
        }

        if (cmd === 'sanction-history') {
          if (!isDisciplinaryStaff(interaction.member as GuildMember)) {
            await interaction.reply({
              content: 'You lack Disciplinary Staff permissions to inspect sanction history.',
              ephemeral: true,
            });
            return;
          }
          const pickedUser = interaction.options.getUser('user');
          const searchOpt = interaction.options.getString('player')?.trim();

          if (pickedUser) {
            await interaction.reply(
              buildSanctionHistoryPayloadForDiscordUser(
                pickedUser.id,
                pickedUser.username,
                pickedUser.displayName,
                pickedUser.displayAvatarURL()
              )
            );
            return;
          }

          if (searchOpt) {
            const q = searchOpt.toLowerCase();
            const matchedPlayer = state.players.find(
              (p) =>
                p.discordUserId === searchOpt ||
                p.tlcId.toLowerCase() === q ||
                p.playerName.toLowerCase().includes(q) ||
                p.discordUsername.toLowerCase().includes(q)
            );
            const matchedSanction = (state.sanctions ?? []).find(
              (s) =>
                s.playerDiscordUserId === searchOpt ||
                s.playerName.toLowerCase().includes(q) ||
                s.playerDiscordUsername.toLowerCase().includes(q)
            );
            const targetDiscordId =
              matchedPlayer?.discordUserId || matchedSanction?.playerDiscordUserId;
            if (targetDiscordId) {
              await interaction.reply(buildSanctionHistoryPayloadForDiscordUser(targetDiscordId));
              return;
            }
            await interaction.reply({
              content: `No player or sanction history matched **"${searchOpt}"**. Select directly below:`,
              ...buildSanctionHistoryPickerPayload([]),
            });
            return;
          }

          const byDiscord = new Map<
            string,
            {
              discordUserId: string;
              name: string;
              username: string;
              tlcId?: string | null;
              activeCount: number;
              totalCount: number;
            }
          >();
          for (const s of state.sanctions ?? []) {
            const prev = byDiscord.get(s.playerDiscordUserId) || {
              discordUserId: s.playerDiscordUserId,
              name: s.playerName,
              username: s.playerDiscordUsername,
              tlcId: s.playerTlcId,
              activeCount: 0,
              totalCount: 0,
            };
            prev.totalCount += 1;
            if (s.status === 'Active') prev.activeCount += 1;
            byDiscord.set(s.playerDiscordUserId, prev);
          }
          await interaction.reply(buildSanctionHistoryPickerPayload(Array.from(byDiscord.values())));
          return;
        }

        if (cmd === 'sanction-list') {
          if (!isDisciplinaryStaff(interaction.member as GuildMember)) {
            await interaction.reply({
              content: 'You lack Disciplinary Staff permissions to view the sanctions list.',
              ephemeral: true,
            });
            return;
          }
          const filter = (interaction.options.getString('filter') || 'all') as
            | 'all'
            | 'suspensions'
            | 'unpaid_fines';
          await interaction.reply(buildSanctionListPayload(tlcStore.getActiveSanctionsList(), filter));
          return;
        }

        if (cmd === 'edit-sanction') {
          if (!isDisciplinaryStaff(interaction.member as GuildMember)) {
            await interaction.reply({
              content: 'You lack Disciplinary Staff permissions to edit sanctions.',
              ephemeral: true,
            });
            return;
          }
          const arg = interaction.options.getString('sanction')?.trim();
          if (arg) {
            const sanction = (state.sanctions ?? []).find(
              (s) =>
                s.status !== 'Removed' &&
                (s.id === arg || s.referenceNumber.toLowerCase() === arg.toLowerCase())
            );
            if (sanction) {
              if (sanction.playerDiscordUserId === interaction.user.id) {
                await interaction.reply({
                  content: 'Players are prohibited from modifying their own sanctions.',
                  ephemeral: true,
                });
                return;
              }
              const appeals = (state.sanctionAppeals ?? []).filter((a) => a.sanctionId === sanction.id);
              await interaction.reply(buildSanctionManagePayload(sanction, appeals));
              return;
            }
          }
          const nonRemoved = (state.sanctions ?? []).filter((s) => s.status !== 'Removed');
          await interaction.reply(buildSanctionListPayload(nonRemoved, 'all'));
          return;
        }

        if (cmd === 'remove-sanction') {
          if (!isDisciplinaryStaff(interaction.member as GuildMember)) {
            await interaction.reply({
              content: 'You lack Disciplinary Staff permissions to remove sanctions.',
              ephemeral: true,
            });
            return;
          }
          const arg = interaction.options.getString('sanction')?.trim();
          if (arg) {
            const sanction = (state.sanctions ?? []).find(
              (s) =>
                s.status !== 'Removed' &&
                (s.id === arg || s.referenceNumber.toLowerCase() === arg.toLowerCase())
            );
            if (sanction) {
              if (sanction.playerDiscordUserId === interaction.user.id) {
                await interaction.reply({
                  content: 'Players are prohibited from removing their own sanctions.',
                  ephemeral: true,
                });
                return;
              }
              await interaction.reply(buildRemoveSanctionConfirmPayload(sanction));
              return;
            }
          }
          const nonRemoved = (state.sanctions ?? []).filter((s) => s.status !== 'Removed');
          await interaction.reply(buildSanctionListPayload(nonRemoved, 'all'));
          return;
        }

        if (cmd === 'appeal-sanction') {
          const mySanctions = (state.sanctions ?? []).filter(
            (s) => s.playerDiscordUserId === interaction.user.id
          );
          if (mySanctions.length === 0) {
            await interaction.reply({
              content: 'You do not have any disciplinary sanctions on record to appeal.',
              ephemeral: true,
            });
            return;
          }
          const pendingIds = new Set(
            (state.sanctionAppeals ?? [])
              .filter((a) => a.playerDiscordUserId === interaction.user.id && a.status === 'Pending')
              .map((a) => a.sanctionId)
          );
          await interaction.reply(buildAppealSanctionPickerPayload(mySanctions, pendingIds));
          return;
        }

        // Staff commands
        if (!isStaffMember(interaction.member as GuildMember)) {
          await interaction.reply({ content: 'You lack TLC Staff permissions for this command.', ephemeral: true });
          return;
        }

        if (cmd === 'create-club') {
          const name = interaction.options.getString('name', true);
          const code = interaction.options.getString('code', true);
          const club = await tlcStore.createClub({ name, shortCode: code }, interaction.user.username);
          await interaction.reply({ content: `Created official club **${club.name}** (\`${club.clubId}\`).` });
          return;
        }

        if (cmd === 'open-transfer-window' || cmd === 'close-transfer-window') {
          const isOpen = cmd === 'open-transfer-window';
          await tlcStore.updateConfig(
            { transferWindow: { ...state.config.transferWindow, isOpen } },
            interaction.user.username
          );
          await interaction.reply({
            content: `TLC Transfer Window is now **${isOpen ? 'OPEN' : 'CLOSED'}**.`,
          });
          return;
        }

        if (cmd === 'result') {
          const matchNo = interaction.options.getInteger('match_number', true);
          const fix = state.fixtures.find((f) => f.matchNumber === matchNo);
          if (!fix) {
            await interaction.reply({ content: `Match #${matchNo} not found.`, ephemeral: true });
            return;
          }
          const updated = await tlcStore.submitMatchResult(
            fix.id,
            {
              homeScore: interaction.options.getInteger('home_score', true),
              awayScore: interaction.options.getInteger('away_score', true),
              notes: interaction.options.getString('notes') || undefined,
              submittedByDiscordId: interaction.user.id,
            },
            interaction.user.username
          );
          const h = state.clubs.find((c) => c.clubId === updated.homeClubId)?.name || 'Home';
          const a = state.clubs.find((c) => c.clubId === updated.awayClubId)?.name || 'Away';

          if (updated.resultStatus === 'Approved') {
            if (state.config.channels.resultsId) {
              await sendToConfiguredChannel(client, state.config.channels.resultsId, {
                embeds: [buildResultAnnouncementEmbed(updated, h, a)],
              });
            }
            await sendCompletedSuspensionAlerts(client);
            await interaction.reply({
              content: `Match #${matchNo} official result recorded (${updated.homeScore}–${updated.awayScore}).`,
            });
          } else {
            const reviewCh = state.config.channels.registrationRequestsId || state.config.channels.resultsId;
            if (reviewCh) {
              await sendToConfiguredChannel(client, reviewCh, buildMatchResultReviewPayload(updated, h, a));
              await interaction.reply({
                content: `Match #${matchNo} result (${updated.homeScore}–${updated.awayScore}) sent to <#${reviewCh}> for staff APPROVE / CANCEL review.`,
                ephemeral: true,
              });
            } else {
              await interaction.reply({
                content: `Match #${matchNo} result saved as Pending Approval. Note: Run \`/setup\` to configure a Review/Results channel so staff approval cards appear automatically.`,
                ephemeral: true,
              });
            }
          }
          return;
        }

        if (cmd === 'fixture-create') {
          const compQ = interaction.options.getString('competition', true).toLowerCase();
          const homeQ = interaction.options.getString('home_club', true).toLowerCase();
          const awayQ = interaction.options.getString('away_club', true).toLowerCase();
          const comp = state.competitions.find((c) => c.name.toLowerCase().includes(compQ));
          const home = state.clubs.find((c) => c.clubId.toLowerCase() === homeQ || c.name.toLowerCase().includes(homeQ));
          const away = state.clubs.find((c) => c.clubId.toLowerCase() === awayQ || c.name.toLowerCase().includes(awayQ));
          if (!comp || !home || !away) {
            await interaction.reply({ content: 'Competition, Home Club, or Away Club not found.', ephemeral: true });
            return;
          }
          const created = await tlcStore.createFixture(
            {
              competitionId: comp.id,
              roundLabel: interaction.options.getString('round') || 'Matchday',
              homeClubId: home.clubId,
              awayClubId: away.clubId,
              matchDate: interaction.options.getString('date', true),
              matchTime: interaction.options.getString('time', true),
              referee: interaction.options.getString('referee') || undefined,
            },
            interaction.user.username
          );
          await sendToConfiguredChannel(client, state.config.channels.fixturesId, {
            embeds: [buildFixtureEmbed(created, home.name, away.name)],
          });
          await interaction.reply({
            embeds: [buildFixtureEmbed(created, home.name, away.name)],
          });
          return;
        }

        if (cmd === 'fixture-reschedule') {
          const matchNo = interaction.options.getInteger('match_number', true);
          const fix = state.fixtures.find((f) => f.matchNumber === matchNo);
          if (!fix) {
            await interaction.reply({ content: `Match #${matchNo} not found.`, ephemeral: true });
            return;
          }
          const updated = await tlcStore.editFixture(
            fix.id,
            {
              matchDate: interaction.options.getString('date') || undefined,
              matchTime: interaction.options.getString('time') || undefined,
              referee: interaction.options.getString('referee') || undefined,
            },
            interaction.user.username
          );
          await interaction.reply({
            content: `Updated Fixture #${updated.matchNumber}: **${updated.matchDate} ${updated.matchTime}** (Ref: ${updated.referee || 'Unassigned'}).`,
          });
          return;
        }

        if (cmd === 'rate') {
          const matchNo = interaction.options.getInteger('match_number', true);
          const fix = state.fixtures.find((f) => f.matchNumber === matchNo);
          if (!fix) {
            await interaction.reply({ content: `Match #${matchNo} not found.`, ephemeral: true });
            return;
          }
          const pQuery = interaction.options.getString('player', true).toLowerCase();
          const player = tlcStore
            .getActivePlayers()
            .find((p) => p.tlcId.toLowerCase() === pQuery || p.playerName.toLowerCase().includes(pQuery));
          if (!player) {
            await interaction.reply({ content: 'Player not found.', ephemeral: true });
            return;
          }
          const res = await tlcStore.rateMatchPlayer(
            fix.id,
            {
              playerTlcId: player.tlcId,
              rating: interaction.options.getNumber('rating', true),
              goals: interaction.options.getInteger('goals') ?? undefined,
              assists: interaction.options.getInteger('assists') ?? undefined,
              saves: interaction.options.getInteger('saves') ?? undefined,
              cleanSheet: interaction.options.getBoolean('clean_sheet') ?? undefined,
              manOfTheMatch: interaction.options.getBoolean('motm') ?? undefined,
            },
            interaction.user.username
          );
          await interaction.reply({
            embeds: [
              buildPlayerRatingCardEmbed(
                res.player,
                res.fixture,
                res.stat.rating,
                res.stat.goals,
                res.stat.assists,
                res.stat.saves,
                res.stat.manOfTheMatch
              ),
            ],
          });
          return;
        }
      }

      // ==================== BUTTONS ====================
      if (interaction.isButton()) {
        const [action, targetId] = interaction.customId.split(':');

        if (action === 'tlc_verify_start') {
          await interaction.reply(buildRegistrationTypeSelectPayload());
          return;
        }

        if (action === 'tlc_profile_correction_start') {
          const modal = new ModalBuilder()
            .setCustomId('tlc_correction_modal')
            .setTitle('Request Profile Correction');
          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('new_name')
                .setLabel('Requested Player/Manager Name (optional)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('new_roblox')
                .setLabel('Requested Roblox Username (optional)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Reason for Correction')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
            )
          );
          await interaction.showModal(modal);
          return;
        }

        if (action === 'tlc_sign_player_search') {
          const club = state.clubs.find((c) => c.clubId === targetId);
          if (!club) {
            await interaction.reply({ content: 'Club not found.', ephemeral: true });
            return;
          }
          await interaction.showModal(buildSignSearchFilterModal(club.clubId));
          return;
        }

        if (action === 'tlc_offer_accept' || action === 'tlc_offer_decline') {
          const offer = state.transferOffers.find((o) => o.id === targetId);
          if (!offer) {
            await interaction.reply({ content: 'Offer no longer exists.', ephemeral: true });
            return;
          }
          const player = state.players.find((p) => p.tlcId === offer.playerTlcId);
          if (!player || player.discordUserId !== interaction.user.id) {
            await interaction.reply({ content: 'Only the offered player can respond to this offer.', ephemeral: true });
            return;
          }
          const updated = await tlcStore.respondToTransferOffer(
            offer.id,
            action === 'tlc_offer_accept' ? 'accept' : 'decline',
            interaction.user.username
          );
          if (updated.status === 'Pending Staff') {
            await sendToConfiguredChannel(
              client,
              state.config.channels.registrationRequestsId,
              buildTransferStaffReviewPayload(updated)
            );
          } else if (updated.status === 'Approved') {
            const latestTransfer = tlcStore.getState().transfers[0];
            await applyTransferDiscordEffects(
              player.discordUserId,
              offer.fromClubId,
              offer.toClubId,
              latestTransfer
            );
          }
          await interaction.update({
            content: `You **${action === 'tlc_offer_accept' ? 'accepted' : 'declined'}** the offer from **${updated.toClubName}** (Status: ${updated.status}).`,
            components: [],
          });
          return;
        }

        if (action === 'tlc_createteam_open_modal') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const draftKey = `${interaction.guildId || 'dm'}:${interaction.user.id}`;
          const draft = createTeamDrafts.get(draftKey) || {};
          await interaction.showModal(buildCreateTeamModal(draft));
          return;
        }

        if (action === 'tlc_createteam_submit') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const draftKey = `${interaction.guildId || 'dm'}:${interaction.user.id}`;
          const draft = createTeamDrafts.get(draftKey);
          if (!draft?.name || !draft.roleId || !draft.ownerId) {
            await interaction.reply({
              content: 'Please select a Team Role, Team Owner, and enter Team Name & Logo Emoji first.',
              ephemeral: true,
            });
            return;
          }
          const team = await tlcStore.createTeam(
            {
              name: draft.name,
              discordRoleId: draft.roleId,
              ownerDiscordUserId: draft.ownerId,
              ownerDiscordUsername: draft.ownerUsername || draft.ownerId,
              logoEmoji: draft.logoEmoji || '⚽',
            },
            interaction.user.username
          );
          createTeamDrafts.delete(draftKey);
          const roster = tlcStore.getTeamRosterMembers(team.clubId);
          const profile = buildTeamProfilePayload(team, roster, []);
          await interaction.update({
            content: `Team ${team.logoEmoji} **${team.name}** created and linked to <@&${team.discordRoleId}> with Owner <@${team.ownerDiscordUserId}>!`,
            embeds: profile.embeds,
            components: [],
          });
          if (state.config.channels.teamManagementId) {
            await sendToConfiguredChannel(client, state.config.channels.teamManagementId, {
              content: `New Official Team Registered: ${team.logoEmoji} **${team.name}** · Owner: <@${team.ownerDiscordUserId}> · Role: <@&${team.discordRoleId}>`,
            });
          }
          return;
        }

        if (action === 'tlc_deleteteam_confirm' || action === 'tlc_deleteteam_cancel') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const team = state.clubs.find((c) => c.clubId === targetId);
          if (!team) {
            await interaction.reply({ content: 'Team not found.', ephemeral: true });
            return;
          }
          if (action === 'tlc_deleteteam_cancel') {
            await interaction.update(buildDeleteTeamConfirmPayload(team, 0, 'Cancelled'));
            return;
          }
          const { club, removedDiscordUserIds } = await tlcStore.deactivateTeam(targetId, interaction.user.username);
          if (club.discordRoleId && interaction.guild) {
            for (const uid of removedDiscordUserIds) {
              const gm = await interaction.guild.members.fetch(uid).catch(() => null);
              if (gm && gm.roles.cache.has(club.discordRoleId)) {
                await withRoleSyncBypass(interaction.guild.id, uid, async () => {
                  await gm.roles.remove(club.discordRoleId).catch(() => {});
                });
              }
            }
          }
          if (club.ownerDiscordUserId && state.config.notifications.sendDirectMessages) {
            try {
              const owner = await client.users.fetch(club.ownerDiscordUserId);
              await owner.send(
                `Notice: Your team **${club.logoEmoji || '⚽'} ${club.name}** has been removed from active teams by **${interaction.user.username}**. All historical matches, transfers, and stats have been preserved.`
              );
            } catch {
              // Ignore closed DMs
            }
          }
          await interaction.update(
            buildDeleteTeamConfirmPayload(club, removedDiscordUserIds.length, 'Deleted')
          );
          return;
        }

        if (action === 'tlc_delplayer_open_search') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          await interaction.showModal(buildDeletePlayerSearchModal());
          return;
        }

        if (action === 'tlc_delplayer_confirm' || action === 'tlc_delplayer_cancel') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const player = state.players.find((p) => p.tlcId === targetId);
          if (!player) {
            await interaction.reply({ content: 'Player profile not found.', ephemeral: true });
            return;
          }
          const curClub = player.currentClubId
            ? state.clubs.find((c) => c.clubId === player.currentClubId)
            : undefined;
          const clubName = curClub
            ? `${curClub.logoEmoji ? `${curClub.logoEmoji} ` : ''}${curClub.name}`
            : 'Free Agent';

          if (action === 'tlc_delplayer_cancel') {
            await interaction.update(buildDeletePlayerConfirmPayload(player, clubName, 'Cancelled'));
            return;
          }

          const res = await tlcStore.deletePlayerProfile(targetId, interaction.user.username);
          const cfg = tlcStore.getState().config;
          const prevClub = res.previousClubId
            ? tlcStore.getState().clubs.find((c) => c.clubId === res.previousClubId)
            : undefined;
          const prevClubName = prevClub
            ? `${prevClub.logoEmoji ? `${prevClub.logoEmoji} ` : ''}${prevClub.name}`
            : 'Free Agent';

          if (interaction.guild) {
            const gm = await interaction.guild.members.fetch(res.player.discordUserId).catch(() => null);
            if (gm) {
              const rolesToRemove = [
                cfg.roles.verifiedRoleId,
                cfg.roles.playerRoleId,
                getPositionRoleId(cfg, res.player.position),
                prevClub?.discordRoleId || '',
              ].filter(Boolean);
              await withRoleSyncBypass(interaction.guild.id, gm.id, async () => {
                for (const rid of rolesToRemove) {
                  if (gm.roles.cache.has(rid)) {
                    await gm.roles.remove(rid).catch(() => {});
                  }
                }
              });
            }
          }

          if (cfg.notifications.sendDirectMessages) {
            try {
              const u = await client.users.fetch(res.player.discordUserId);
              await u.send(
                `Your official TLC player profile (**${res.player.playerName}** · \`${res.player.tlcId}\`) was removed from active players by **${interaction.user.username}**.\nAll historical match statistics, transfers, awards, and contracts remain preserved.`
              );
            } catch {
              // Ignore closed DMs
            }
          }

          await sendLatestAuditLog(client);
          await interaction.update(buildDeletePlayerConfirmPayload(res.player, prevClubName, 'Deleted'));
          return;
        }

        if (action === 'tlc_resplayer_open_search') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          await interaction.showModal(buildRestorePlayerSearchModal());
          return;
        }

        if (action === 'tlc_resplayer_confirm' || action === 'tlc_resplayer_cancel') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const player = state.players.find((p) => p.tlcId === targetId);
          if (!player) {
            await interaction.reply({ content: 'Player profile not found.', ephemeral: true });
            return;
          }
          const prevClub = player.previousClubId
            ? state.clubs.find((c) => c.clubId === player.previousClubId)
            : undefined;
          const prevClubName = prevClub
            ? `${prevClub.logoEmoji ? `${prevClub.logoEmoji} ` : ''}${prevClub.name}`
            : 'Free Agent';

          if (action === 'tlc_resplayer_cancel') {
            await interaction.update(
              buildRestorePlayerConfirmPayload(player, prevClubName, 'Cancelled')
            );
            return;
          }

          const res = await tlcStore.restorePlayerProfile(targetId, interaction.user.username);
          const cfg = tlcStore.getState().config;

          if (interaction.guild) {
            const gm = await interaction.guild.members.fetch(res.player.discordUserId).catch(() => null);
            if (gm) {
              const rolesToAdd = [
                cfg.roles.verifiedRoleId,
                cfg.roles.playerRoleId,
                getPositionRoleId(cfg, res.player.position),
                res.restoredClub?.discordRoleId || '',
              ].filter(Boolean);
              await withRoleSyncBypass(interaction.guild.id, gm.id, async () => {
                for (const rid of rolesToAdd) {
                  if (!gm.roles.cache.has(rid)) {
                    await gm.roles.add(rid).catch(() => {});
                  }
                }
              });
            }
          }

          if (cfg.notifications.sendDirectMessages) {
            try {
              const u = await client.users.fetch(res.player.discordUserId);
              await u.send(
                `Your official TLC player profile (**${res.player.playerName}** · \`${res.player.tlcId}\`) has been **RESTORED** by **${interaction.user.username}**!${
                  res.restoredClub
                    ? `\n• Team Membership Restored: **${res.restoredClub.logoEmoji || '⚽'} ${res.restoredClub.name}**`
                    : '\n• Status: Active (Eligible in player searches & Free Agent lists)'
                }`
              );
            } catch {
              // Ignore closed DMs
            }
          }

          await sendLatestAuditLog(client);
          await interaction.update(
            buildRestorePlayerConfirmPayload(
              res.player,
              prevClubName,
              'Restored',
              res.restoredClub ? `${res.restoredClub.logoEmoji || '⚽'} ${res.restoredClub.name}` : null
            )
          );
          return;
        }

        if (action === 'tlc_delmgr_open_search') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          await interaction.showModal(buildDeleteManagerSearchModal());
          return;
        }

        if (action === 'tlc_delmgr_confirm' || action === 'tlc_delmgr_cancel') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const manager = state.managers.find((m) => m.tlcId === targetId);
          if (!manager) {
            await interaction.reply({ content: 'Manager profile not found.', ephemeral: true });
            return;
          }
          const curClub = manager.currentClubId
            ? state.clubs.find((c) => c.clubId === manager.currentClubId)
            : undefined;
          const clubName = curClub
            ? `${curClub.logoEmoji ? `${curClub.logoEmoji} ` : ''}${curClub.name}`
            : 'Free Agent';

          if (action === 'tlc_delmgr_cancel') {
            await interaction.update(buildDeleteManagerConfirmPayload(manager, clubName, 'Cancelled'));
            return;
          }

          const res = await tlcStore.deleteManagerProfile(targetId, interaction.user.username);
          const currentState = tlcStore.getState();
          const cfg = currentState.config;
          const prevClub = res.previousClubId
            ? currentState.clubs.find((c) => c.clubId === res.previousClubId)
            : undefined;
          const prevClubName = prevClub
            ? `${prevClub.logoEmoji ? `${prevClub.logoEmoji} ` : ''}${prevClub.name}`
            : 'Free Agent';

          const activePlayerProfile = currentState.players.find(
            (p) => p.discordUserId === res.manager.discordUserId && p.status !== 'Deleted'
          );

          if (interaction.guild) {
            const gm = await interaction.guild.members
              .fetch(res.manager.discordUserId)
              .catch(() => null);
            if (gm) {
              const rolesToRemove = [
                cfg.roles.managerRoleId,
                !activePlayerProfile ? cfg.roles.verifiedRoleId : '',
                prevClub && (!activePlayerProfile || activePlayerProfile.currentClubId !== prevClub.clubId)
                  ? prevClub.discordRoleId || ''
                  : '',
              ].filter(Boolean);
              await withRoleSyncBypass(interaction.guild.id, gm.id, async () => {
                for (const rid of rolesToRemove) {
                  if (gm.roles.cache.has(rid)) {
                    await gm.roles.remove(rid).catch(() => {});
                  }
                }
              });
            }
          }

          if (cfg.notifications.sendDirectMessages) {
            try {
              const u = await client.users.fetch(res.manager.discordUserId);
              await u.send(
                `Your official TLC manager profile (**${res.manager.managerName}** · \`${res.manager.tlcId}\`) was removed from active managers by **${interaction.user.username}**.\nAll historical match records, trophies, and clubs managed remain preserved.`
              );
            } catch {
              // Ignore closed DMs
            }
          }

          await sendLatestAuditLog(client);
          await interaction.update(buildDeleteManagerConfirmPayload(res.manager, prevClubName, 'Deleted'));
          return;
        }

        if (action === 'tlc_resmgr_open_search') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          await interaction.showModal(buildRestoreManagerSearchModal());
          return;
        }

        if (action === 'tlc_resmgr_confirm' || action === 'tlc_resmgr_cancel') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const manager = state.managers.find((m) => m.tlcId === targetId);
          if (!manager) {
            await interaction.reply({ content: 'Manager profile not found.', ephemeral: true });
            return;
          }
          const prevClub = manager.previousClubId
            ? state.clubs.find((c) => c.clubId === manager.previousClubId)
            : undefined;
          const prevClubName = prevClub
            ? `${prevClub.logoEmoji ? `${prevClub.logoEmoji} ` : ''}${prevClub.name}`
            : 'Free Agent';

          if (action === 'tlc_resmgr_cancel') {
            await interaction.update(
              buildRestoreManagerConfirmPayload(manager, prevClubName, 'Cancelled')
            );
            return;
          }

          const res = await tlcStore.restoreManagerProfile(targetId, interaction.user.username);
          const cfg = tlcStore.getState().config;

          if (interaction.guild) {
            const gm = await interaction.guild.members
              .fetch(res.manager.discordUserId)
              .catch(() => null);
            if (gm) {
              const rolesToAdd = [
                cfg.roles.verifiedRoleId,
                cfg.roles.managerRoleId,
                res.restoredClub?.discordRoleId || '',
              ].filter(Boolean);
              await withRoleSyncBypass(interaction.guild.id, gm.id, async () => {
                for (const rid of rolesToAdd) {
                  if (!gm.roles.cache.has(rid)) {
                    await gm.roles.add(rid).catch(() => {});
                  }
                }
              });
            }
          }

          if (cfg.notifications.sendDirectMessages) {
            try {
              const u = await client.users.fetch(res.manager.discordUserId);
              await u.send(
                `Your official TLC manager profile (**${res.manager.managerName}** · \`${res.manager.tlcId}\`) has been **RESTORED** by **${interaction.user.username}**!${
                  res.restoredClub
                    ? `\n• Club Assignment Restored: **${res.restoredClub.logoEmoji || '⚽'} ${res.restoredClub.name}**`
                    : '\n• Status: Active (Eligible in manager searches & club appointments)'
                }`
              );
            } catch {
              // Ignore closed DMs
            }
          }

          await sendLatestAuditLog(client);
          await interaction.update(
            buildRestoreManagerConfirmPayload(
              res.manager,
              prevClubName,
              'Restored',
              res.restoredClub ? `${res.restoredClub.logoEmoji || '⚽'} ${res.restoredClub.name}` : null
            )
          );
          return;
        }

        if (action === 'tlc_demande_approve' || action === 'tlc_demande_cancel') {
          if (!isStaffMember(interaction.member as GuildMember)) {
            await interaction.reply({
              content: 'Only authorized Staff or Administrators can approve or cancel signing requests.',
              ephemeral: true,
            });
            return;
          }
          if (action === 'tlc_demande_cancel') {
            const pendingReq = (state.signingRequests ?? []).find((r) => r.id === targetId);
            if (!pendingReq) {
              await interaction.reply({ content: 'Signing request not found.', ephemeral: true });
              return;
            }
            if (pendingReq.status !== 'Pending') {
              await interaction.reply({
                content: `This signing request is already ${pendingReq.status}.`,
                ephemeral: true,
              });
              return;
            }
            await interaction.showModal(
              buildRejectionReasonModal('demande', targetId, 'Reject Signing Request')
            );
            return;
          }

          const res = await tlcStore.reviewDemande(
            targetId,
            'approve',
            interaction.user.username,
            interaction.user.id
          );

          if (res.club && interaction.guild) {
            const gm = await interaction.guild.members.fetch(res.request.playerDiscordUserId).catch(() => null);
            if (gm) {
              await withRoleSyncBypass(interaction.guild.id, gm.id, async () => {
                for (const oldRid of res.prevRoleIds) {
                  if (gm.roles.cache.has(oldRid)) {
                    await gm.roles.remove(oldRid).catch(() => {});
                  }
                }
                if (res.club!.discordRoleId && !gm.roles.cache.has(res.club!.discordRoleId)) {
                  await gm.roles.add(res.club!.discordRoleId).catch(() => {});
                }
              });
            }
          }

          if (state.config.notifications.sendDirectMessages) {
            try {
              const pUser = await client.users.fetch(res.request.playerDiscordUserId);
              await pUser.send(
                `Your signing request to join **${res.request.requestedClubLogoEmoji || '⚽'} ${res.request.requestedClubName}** was **APPROVED** by **${interaction.user.username}**!`
              );
            } catch {
              // Ignore closed DMs
            }
            if (res.club?.ownerDiscordUserId) {
              try {
                const oUser = await client.users.fetch(res.club.ownerDiscordUserId);
                await oUser.send(
                  `**${res.request.playerName}** has officially joined **${res.club.logoEmoji || '⚽'} ${res.club.name}** via \`/demande\`.`
                );
              } catch {
                // Ignore closed DMs
              }
            }
          }

          if (res.transfer && state.config.channels.transferMarketId && state.config.notifications.announceTransfers) {
            await sendToConfiguredChannel(client, state.config.channels.transferMarketId, {
              embeds: [buildTransferAnnouncementEmbed(res.transfer)],
            });
          }

          await sendLatestAuditLog(client);
          await interaction.update(buildDemandeReviewPayload(res.request));
          return;
        }

        if (action === 'tlc_release_confirm' || action === 'tlc_release_cancel') {
          const [, clubId, targetUserId] = interaction.customId.split(':');
          const club = state.clubs.find((c) => c.clubId === clubId);
          if (!club) {
            await interaction.reply({ content: 'Team not found.', ephemeral: true });
            return;
          }
          const isAdminOrStaff = isStaffMember(interaction.member as GuildMember);
          if (!isAdminOrStaff && club.ownerDiscordUserId !== interaction.user.id) {
            await interaction.reply({
              content: 'You can only release players from your own team.',
              ephemeral: true,
            });
            return;
          }
          const memberEntry = tlcStore
            .getTeamRosterMembers(clubId)
            .find((m) => m.discordUserId === targetUserId);
          const displayName = memberEntry?.displayName || targetUserId;

          if (action === 'tlc_release_cancel') {
            await interaction.update(buildReleaseConfirmPayload(club, targetUserId, displayName, 'Cancelled'));
            return;
          }

          const res = await tlcStore.releaseTeamPlayer({
            clubId,
            targetDiscordUserId: targetUserId,
            actorUsername: interaction.user.username,
            actorDiscordId: interaction.user.id,
            isAdmin: isAdminOrStaff,
          });

          if (club.discordRoleId && interaction.guild) {
            const gm = await interaction.guild.members.fetch(targetUserId).catch(() => null);
            if (gm && gm.roles.cache.has(club.discordRoleId)) {
              await withRoleSyncBypass(interaction.guild.id, gm.id, async () => {
                await gm.roles.remove(club.discordRoleId).catch(() => {});
              });
            }
          }

          if (state.config.notifications.sendDirectMessages) {
            try {
              const pUser = await client.users.fetch(targetUserId);
              await pUser.send(
                `You have been released from **${club.logoEmoji || '⚽'} ${club.name}** by **${interaction.user.username}** and are now a Free Agent.`
              );
            } catch {
              // Ignore closed DMs
            }
            if (club.ownerDiscordUserId && club.ownerDiscordUserId !== interaction.user.id) {
              try {
                const oUser = await client.users.fetch(club.ownerDiscordUserId);
                await oUser.send(
                  `**${res.targetName}** has been released from **${club.logoEmoji || '⚽'} ${club.name}** by **${interaction.user.username}**.`
                );
              } catch {
                // Ignore closed DMs
              }
            }
          }

          if (state.config.channels.transferMarketId && state.config.notifications.announceTransfers) {
            await sendToConfiguredChannel(client, state.config.channels.transferMarketId, {
              embeds: [buildTransferAnnouncementEmbed(res.transfer)],
            });
          }

          await interaction.update(buildReleaseConfirmPayload(club, targetUserId, res.targetName, 'Released'));
          return;
        }

        if (action === 'tlc_team_btn_roster' || action === 'tlc_team_btn_owner' || action === 'tlc_team_btn_transfers') {
          const team = state.clubs.find((c) => c.clubId === targetId);
          if (!team) {
            await interaction.reply({ content: 'Team not found.', ephemeral: true });
            return;
          }
          if (action === 'tlc_team_btn_roster') {
            const roster = tlcStore.getTeamRosterMembers(team.clubId);
            const lines = roster.map(
              (m) =>
                `• <@${m.discordUserId}> (**${m.displayName}**)${m.position ? ` — ${m.position}` : ''}${
                  m.isOwner ? ' · Owner' : ''
                }`
            );
            await interaction.reply({
              content: `**${team.logoEmoji || '⚽'} ${team.name} — Active Roster (${roster.length})**\n${
                lines.join('\n') || 'No active players.'
              }`,
              ephemeral: true,
            });
            return;
          }
          if (action === 'tlc_team_btn_owner') {
            await interaction.reply({
              content: team.ownerDiscordUserId
                ? `**${team.logoEmoji || '⚽'} ${team.name} Owner:** <@${team.ownerDiscordUserId}> (@${team.ownerDiscordUsername || 'owner'})`
                : `**${team.logoEmoji || '⚽'} ${team.name}** has no Discord owner assigned.`,
              ephemeral: true,
            });
            return;
          }
          const teamTransfers = state.transfers.filter(
            (t) => t.toClubId === team.clubId || t.fromClubId === team.clubId
          );
          await interaction.reply({
            embeds: [
              buildTransferHistoryEmbed(
                `${team.logoEmoji || '⚽'} ${team.name} — Transfer History`,
                teamTransfers
              ),
            ],
            ephemeral: true,
          });
          return;
        }

        if (action === 'tlc_setup_jump') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator) && !isStaffMember(member)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          await interaction.update(buildSetupPanelPayload(tlcStore.getState(), targetId as SetupSection));
          return;
        }

        if (action === 'tlc_setup_toggle') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator) && !isStaffMember(member)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const cfg = state.config;
          let returnSection: SetupSection = 'toggles';
          if (targetId === 'transferWindow') {
            await tlcStore.updateConfig(
              { transferWindow: { ...cfg.transferWindow, isOpen: !cfg.transferWindow.isOpen } },
              interaction.user.username
            );
          } else if (targetId === 'transferApproval') {
            await tlcStore.updateConfig(
              {
                transferWindow: {
                  ...cfg.transferWindow,
                  requireStaffApproval: !cfg.transferWindow.requireStaffApproval,
                },
              },
              interaction.user.username
            );
          } else if (targetId === 'multiTeamRoles') {
            await tlcStore.updateConfig(
              {
                transferWindow: {
                  ...cfg.transferWindow,
                  allowMultipleTeamRoles: !cfg.transferWindow.allowMultipleTeamRoles,
                },
              },
              interaction.user.username
            );
            returnSection = 'teams';
          } else if (targetId === 'resultApproval') {
            await tlcStore.updateConfig(
              {
                competitions: {
                  ...cfg.competitions,
                  requireResultApproval: !cfg.competitions.requireResultApproval,
                },
              },
              interaction.user.username
            );
          } else if (targetId === 'regAnnouncements') {
            await tlcStore.updateConfig(
              {
                notifications: {
                  ...cfg.notifications,
                  publishRegistrationAnnouncements: !cfg.notifications.publishRegistrationAnnouncements,
                },
              },
              interaction.user.username
            );
          } else if (targetId === 'sendDms') {
            await tlcStore.updateConfig(
              {
                notifications: {
                  ...cfg.notifications,
                  sendDirectMessages: !cfg.notifications.sendDirectMessages,
                },
              },
              interaction.user.username
            );
          }
          await interaction.update(buildSetupPanelPayload(tlcStore.getState(), returnSection));
          return;
        }

        if (
          action === 'tlc_reg_approve' ||
          action === 'tlc_reg_cancel' ||
          action === 'tlc_reg_reject' ||
          action === 'tlc_transfer_staff_approve' ||
          action === 'tlc_transfer_staff_reject' ||
          action === 'tlc_transfer_staff_cancel' ||
          action === 'tlc_clubreg_approve' ||
          action === 'tlc_clubreg_cancel' ||
          action === 'tlc_compreg_approve' ||
          action === 'tlc_compreg_cancel' ||
          action === 'tlc_result_approve' ||
          action === 'tlc_result_cancel' ||
          action === 'tlc_corr_approve' ||
          action === 'tlc_corr_cancel'
        ) {
          if (!isStaffMember(interaction.member as GuildMember)) {
            await interaction.reply({ content: 'Staff permissions are required for this action.', ephemeral: true });
            return;
          }

          if (action === 'tlc_reg_approve') {
            const res = await tlcStore.approveRegistration(targetId, interaction.user.username);
            await applyApprovalDiscordEffects(
              client,
              res.request.discordUserId,
              res.request.playerName,
              res.request.registrationType,
              res.request.position,
              interaction.guildId
            );
            await notifyApprovedRegistration(client, res.request);
            await interaction.update(buildRegistrationReviewEmbed(res.request));
            const latestAudit = tlcStore.getState().auditLogs[0];
            if (latestAudit && state.config.channels.auditLogsId) {
              await sendToConfiguredChannel(client, state.config.channels.auditLogsId, {
                embeds: [buildAuditEmbed(latestAudit)],
              });
            }
            const missingRoles: string[] = [];
            if (!state.config.roles.verifiedRoleId) missingRoles.push('Verified Role');
            if (res.request.registrationType === 'Player' && !state.config.roles.playerRoleId) {
              missingRoles.push('Player Role');
            }
            if (res.request.registrationType === 'Manager' && !state.config.roles.managerRoleId) {
              missingRoles.push('Manager Role');
            }
            if (missingRoles.length > 0) {
              await interaction.followUp({
                content: `Approved **${res.request.playerName}** (\`${res.request.tlcId}\`), but the following roles are not configured yet: **${missingRoles.join(', ')}**. Run \`/setup\` to assign existing Discord roles.`,
                ephemeral: true,
              });
            }
            return;
          }

          if (action === 'tlc_reg_cancel' || action === 'tlc_reg_reject') {
            const req = state.registrations.find((r) => r.id === targetId);
            if (!req) {
              await interaction.reply({ content: 'Registration request not found.', ephemeral: true });
              return;
            }
            if (req.status !== 'Pending') {
              await interaction.reply({ content: 'This registration has already been processed.', ephemeral: true });
              return;
            }
            await interaction.showModal(buildRejectionReasonModal('reg', targetId, 'Reject Registration'));
            return;
          }

          if (action === 'tlc_transfer_staff_approve') {
            const updated = await tlcStore.reviewTransferOffer(targetId, 'approve', interaction.user.username);
            const player = tlcStore.getState().players.find((p) => p.tlcId === updated.playerTlcId);
            const latestTransfer = tlcStore.getState().transfers[0];
            await applyTransferDiscordEffects(
              player?.discordUserId,
              updated.fromClubId,
              updated.toClubId,
              latestTransfer
            );
            await sendLatestAuditLog(client);
            await interaction.update(buildTransferStaffReviewPayload(updated));
            return;
          }

          if (action === 'tlc_transfer_staff_reject' || action === 'tlc_transfer_staff_cancel') {
            const offer = state.transferOffers.find((o) => o.id === targetId);
            if (!offer) {
              await interaction.reply({ content: 'Transfer offer not found.', ephemeral: true });
              return;
            }
            if (offer.status !== 'Pending Staff') {
              await interaction.reply({ content: `Offer is already ${offer.status}.`, ephemeral: true });
              return;
            }
            await interaction.showModal(
              buildRejectionReasonModal(
                action === 'tlc_transfer_staff_reject' ? 'transfer_reject' : 'transfer_cancel',
                targetId,
                'Reject Transfer Request'
              )
            );
            return;
          }

          if (action === 'tlc_clubreg_approve' || action === 'tlc_clubreg_cancel') {
            if (action === 'tlc_clubreg_cancel') {
              const req = (state.clubRegistrationRequests ?? []).find((r) => r.id === targetId);
              if (!req) {
                await interaction.reply({ content: 'Club registration request not found.', ephemeral: true });
                return;
              }
              if (req.status !== 'Pending') {
                await interaction.reply({ content: `Club registration is already ${req.status}.`, ephemeral: true });
                return;
              }
              await interaction.showModal(
                buildRejectionReasonModal('clubreg', targetId, 'Reject Club Registration')
              );
              return;
            }
            const res = await tlcStore.reviewClubRegistration(targetId, 'approve', interaction.user.username);
            await sendLatestAuditLog(client);
            await interaction.update(buildClubRegistrationReviewPayload(res.request));
            return;
          }

          if (action === 'tlc_compreg_approve' || action === 'tlc_compreg_cancel') {
            if (action === 'tlc_compreg_cancel') {
              const reg = state.competitionRegistrations.find((r) => r.id === targetId);
              if (!reg) {
                await interaction.reply({ content: 'Competition registration not found.', ephemeral: true });
                return;
              }
              if (reg.status !== 'Pending') {
                await interaction.reply({ content: `Competition entry is already ${reg.status}.`, ephemeral: true });
                return;
              }
              await interaction.showModal(
                buildRejectionReasonModal('compreg', targetId, 'Reject Competition Entry')
              );
              return;
            }
            const reg = await tlcStore.reviewCompetitionRegistration(targetId, 'approve', interaction.user.username);
            const compName =
              tlcStore.getState().competitions.find((c) => c.id === reg.competitionId)?.name || 'Competition';
            await sendLatestAuditLog(client);
            await interaction.update(buildCompetitionRegistrationReviewPayload(reg, compName));
            return;
          }

          if (action === 'tlc_result_approve' || action === 'tlc_result_cancel') {
            if (action === 'tlc_result_cancel') {
              const fix = state.fixtures.find((f) => f.id === targetId);
              if (!fix) {
                await interaction.reply({ content: 'Fixture not found.', ephemeral: true });
                return;
              }
              if (fix.resultStatus === 'Approved' && fix.status === 'Completed') {
                await interaction.reply({ content: 'Cannot cancel an already approved result.', ephemeral: true });
                return;
              }
              await interaction.showModal(
                buildRejectionReasonModal('result', targetId, 'Reject Match Result')
              );
              return;
            }
            const updated = await tlcStore.approveMatchResult(targetId, interaction.user.username);
            const h = tlcStore.getState().clubs.find((c) => c.clubId === updated.homeClubId)?.name || 'Home';
            const a = tlcStore.getState().clubs.find((c) => c.clubId === updated.awayClubId)?.name || 'Away';
            await interaction.update(buildMatchResultReviewPayload(updated, h, a));
            if (updated.resultStatus === 'Approved' && state.config.channels.resultsId) {
              await sendToConfiguredChannel(client, state.config.channels.resultsId, {
                embeds: [buildResultAnnouncementEmbed(updated, h, a)],
              });
            }
            await sendCompletedSuspensionAlerts(client);
            await sendLatestAuditLog(client);
            return;
          }

          if (action === 'tlc_corr_approve' || action === 'tlc_corr_cancel') {
            if (action === 'tlc_corr_cancel') {
              const corr = state.correctionRequests.find((c) => c.id === targetId);
              if (!corr) {
                await interaction.reply({ content: 'Correction request not found.', ephemeral: true });
                return;
              }
              if (corr.status !== 'Pending') {
                await interaction.reply({ content: 'Correction request already reviewed.', ephemeral: true });
                return;
              }
              await interaction.showModal(
                buildRejectionReasonModal('corr', targetId, 'Reject Profile Correction')
              );
              return;
            }
            const corr = await tlcStore.reviewCorrectionRequest(targetId, 'approve', interaction.user.username);
            const currentState = tlcStore.getState();
            const profName =
              currentState.players.find((p) => p.tlcId === corr.tlcId)?.playerName ||
              currentState.managers.find((m) => m.tlcId === corr.tlcId)?.managerName ||
              corr.tlcId;
            await interaction.update(buildCorrectionReviewPayload(corr, profName));
            if (currentState.config.notifications.sendDirectMessages) {
              try {
                const user = await client.users.fetch(corr.discordUserId);
                await user.send(
                  `Your TLC profile correction request (\`${corr.id}\`) was **APPROVED** by ${interaction.user.username}.`
                );
              } catch {
                // Ignore closed DMs
              }
            }
            await sendLatestAuditLog(client);
            return;
          }
        }

        // ==================== DISCIPLINARY & SANCTION BUTTONS ====================
        if (action === 'tlc_sanctions_setup_currency') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const currentCurrency = state.config.sanctions?.defaultCurrency || 'TLC Coins';
          await interaction.showModal(buildSanctionCurrencyModal(currentCurrency));
          return;
        }

        if (
          action === 'tlc_sanction_open_modal' ||
          action === 'tlc_sanction_preview' ||
          action === 'tlc_sanction_cancel' ||
          action === 'tlc_sanction_confirm'
        ) {
          if (!isDisciplinaryStaff(interaction.member as GuildMember)) {
            await interaction.reply({
              content: 'You lack Disciplinary Staff permissions for this action.',
              ephemeral: true,
            });
            return;
          }
          const draft = sanctionDrafts.get(targetId);
          if (!draft) {
            await interaction.reply({
              content: 'This sanction draft has expired or was already finalized. Run `/sanction` to start a new one.',
              ephemeral: true,
            });
            return;
          }
          if (draft.issuerDiscordId !== interaction.user.id) {
            await interaction.reply({
              content: 'Only the administrator who started this sanction draft may interact with it.',
              ephemeral: true,
            });
            return;
          }
          const currency = state.config.sanctions?.defaultCurrency || 'TLC Coins';

          if (action === 'tlc_sanction_open_modal') {
            await interaction.showModal(buildSanctionDetailsModal(draft, currency));
            return;
          }

          const resolved = draft.playerDiscordUserId
            ? resolveDiscordPlayerSummary(
                draft.playerDiscordUserId,
                draft.playerDiscordUsername,
                draft.fallbackPlayerName,
                draft.fallbackAvatarUrl
              )
            : null;

          if (action === 'tlc_sanction_cancel') {
            sanctionDrafts.delete(targetId);
            if (resolved && draft.playerDiscordUserId) {
              await interaction.update(
                buildSanctionPreviewPayload(draft, currency, resolved, interaction.user.username, 'Cancelled')
              );
            } else {
              await interaction.update({
                content: 'Sanction draft cancelled. No sanction was issued.',
                embeds: [],
                components: [],
              });
            }
            return;
          }

          if (!draft.playerDiscordUserId || !draft.sanctionType || !draft.reason?.trim() || !resolved) {
            await interaction.reply({
              content: 'Please select a Discord user, choose a Sanction Type, and enter a Sanction Reason first.',
              ephemeral: true,
            });
            return;
          }

          if (action === 'tlc_sanction_preview') {
            await interaction.update(
              buildSanctionPreviewPayload(draft, currency, resolved, interaction.user.username)
            );
            return;
          }

          // CONFIRM SANCTION
          sanctionDrafts.delete(targetId);
          const issued = await tlcStore.issueSanction({
            playerDiscordUserId: draft.playerDiscordUserId,
            playerDiscordUsername: resolved.discordUsername,
            fallbackPlayerName: resolved.playerName,
            fallbackAvatarUrl: resolved.avatarUrl,
            sanctionType: draft.sanctionType,
            reason: draft.reason,
            fineAmount: draft.fineAmount,
            suspensionMatches: draft.suspensionMatches,
            issuedByDiscordId: interaction.user.id,
            issuedByUsername: interaction.user.username,
            dedupeKey: draft.draftId,
          });

          const annChannelId = state.config.channels.sanctionsAnnouncementId;
          let publishedMsgId: string | null = null;
          if (annChannelId) {
            const msg = await sendToConfiguredChannelReturningMessage(client, annChannelId, {
              content: `<@${issued.playerDiscordUserId}>`,
              embeds: [buildSanctionNoticeEmbed(issued)],
            });
            if (msg) {
              publishedMsgId = msg.id;
              await tlcStore.setSanctionAnnouncementMeta(issued.id, annChannelId, msg.id);
            }
          }

          await sendToSanctionsLog(client, {
            embeds: [
              buildSanctionLogEmbed(
                'Sanction Issued',
                issued,
                `@${interaction.user.username} (<@${interaction.user.id}>)`,
                `Reason: ${issued.reason}`
              ),
            ],
          });
          await sendLatestAuditLog(client);

          if (state.config.notifications.sendDirectMessages) {
            try {
              const pUser = await client.users.fetch(issued.playerDiscordUserId);
              await pUser.send({
                content: `You have received an official **TLC Disciplinary Sanction** (\`${issued.referenceNumber}\`). You may appeal via \`/appeal-sanction\`.`,
                embeds: [buildSanctionNoticeEmbed(issued)],
              });
            } catch {
              // Ignore closed DMs
            }
          }

          const previewRes = buildSanctionPreviewPayload(
            draft,
            currency,
            resolved,
            interaction.user.username,
            'Confirmed'
          );
          await interaction.update({
            ...previewRes,
            content: annChannelId
              ? publishedMsgId
                ? `✅ Sanction \`${issued.referenceNumber}\` confirmed, saved, and published to <#${annChannelId}>.`
                : `✅ Sanction \`${issued.referenceNumber}\` saved to database, but could not send to <#${annChannelId}>. Check bot channel permissions.`
              : `✅ Sanction \`${issued.referenceNumber}\` saved to database. Note: Configure **Sanctions Announcement Channel** via \`/setup-sanctions\` so notices publish automatically.`,
          });
          return;
        }

        if (
          action === 'tlc_sanction_edit_btn' ||
          action === 'tlc_sanction_pay_btn' ||
          action === 'tlc_sanction_markpaid_btn' ||
          action === 'tlc_sanction_waive_btn' ||
          action === 'tlc_sanction_remove_btn' ||
          action === 'tlc_sanction_remove_confirm' ||
          action === 'tlc_sanction_remove_cancel'
        ) {
          if (!isDisciplinaryStaff(interaction.member as GuildMember)) {
            await interaction.reply({
              content: 'You lack Disciplinary Staff permissions to manage sanctions.',
              ephemeral: true,
            });
            return;
          }
          const sanction = (state.sanctions ?? []).find((s) => s.id === targetId);
          if (!sanction) {
            await interaction.reply({ content: 'Sanction record not found.', ephemeral: true });
            return;
          }
          if (sanction.playerDiscordUserId === interaction.user.id) {
            await interaction.reply({
              content: 'Players are prohibited from modifying, waiving, or removing their own sanctions.',
              ephemeral: true,
            });
            return;
          }

          if (action === 'tlc_sanction_remove_cancel') {
            await interaction.update(buildRemoveSanctionConfirmPayload(sanction, 'Cancelled'));
            return;
          }
          if (sanction.status === 'Removed') {
            await interaction.reply({
              content: 'This sanction has already been removed and preserved in historical records.',
              ephemeral: true,
            });
            return;
          }
          if (action === 'tlc_sanction_edit_btn') {
            await interaction.showModal(buildEditSanctionModal(sanction));
            return;
          }
          if (action === 'tlc_sanction_pay_btn') {
            if (sanction.fineAmount <= 0 || sanction.fineStatus === 'PAID' || sanction.fineStatus === 'WAIVED') {
              await interaction.reply({ content: 'This fine has no remaining balance.', ephemeral: true });
              return;
            }
            await interaction.showModal(buildFinePaymentModal(sanction));
            return;
          }
          if (action === 'tlc_sanction_waive_btn') {
            if (sanction.fineAmount <= 0 || sanction.fineStatus === 'PAID' || sanction.fineStatus === 'WAIVED') {
              await interaction.reply({ content: 'This fine has no remaining balance to waive.', ephemeral: true });
              return;
            }
            await interaction.showModal(
              buildRejectionReasonModal('sanction_waive', sanction.id, `Waive Fine · ${sanction.referenceNumber}`)
            );
            return;
          }
          if (action === 'tlc_sanction_markpaid_btn') {
            const updated = await tlcStore.updateSanctionFine(
              sanction.id,
              { action: 'mark_paid', note: 'Marked as fully paid by staff' },
              interaction.user.username,
              interaction.user.id
            );
            await updatePublishedSanctionNotice(client, updated);
            await sendToSanctionsLog(client, {
              embeds: [
                buildSanctionLogEmbed(
                  'Fine Marked Paid',
                  updated,
                  `@${interaction.user.username}`,
                  `Paid: ${updated.finePaidAmount}/${updated.fineAmount} ${updated.fineCurrency}`
                ),
              ],
            });
            await sendLatestAuditLog(client);
            if (state.config.notifications.sendDirectMessages) {
              try {
                const u = await client.users.fetch(updated.playerDiscordUserId);
                await u.send(
                  `💰 Your fine under sanction \`${updated.referenceNumber}\` (${updated.fineAmount} ${updated.fineCurrency}) has been marked **PAID** by ${interaction.user.username}.`
                );
              } catch {
                // Ignore closed DMs
              }
            }
            const appeals = (tlcStore.getState().sanctionAppeals ?? []).filter((a) => a.sanctionId === updated.id);
            await interaction.update(buildSanctionManagePayload(updated, appeals));
            return;
          }
          if (action === 'tlc_sanction_remove_btn') {
            if (interaction.message.embeds[0]?.title?.startsWith('TLC SANCTION NOTICE')) {
              await interaction.update(buildRemoveSanctionConfirmPayload(sanction));
            } else {
              await interaction.reply(buildRemoveSanctionConfirmPayload(sanction));
            }
            return;
          }
          if (action === 'tlc_sanction_remove_confirm') {
            await interaction.showModal(
              buildRejectionReasonModal('sanction_remove', sanction.id, `Remove ${sanction.referenceNumber}`)
            );
            return;
          }
        }

        if (action === 'tlc_appeal_accept' || action === 'tlc_appeal_reject') {
          if (!isDisciplinaryStaff(interaction.member as GuildMember)) {
            await interaction.reply({
              content: 'You lack Disciplinary Staff permissions to review sanction appeals.',
              ephemeral: true,
            });
            return;
          }
          const appeal = (state.sanctionAppeals ?? []).find((a) => a.id === targetId);
          if (!appeal) {
            await interaction.reply({ content: 'Sanction appeal not found.', ephemeral: true });
            return;
          }
          if (appeal.playerDiscordUserId === interaction.user.id) {
            await interaction.reply({
              content: 'Players are prohibited from reviewing their own sanction appeals.',
              ephemeral: true,
            });
            return;
          }
          if (appeal.status !== 'Pending') {
            await interaction.reply({
              content: `This appeal has already been ${appeal.status.toLowerCase()}.`,
              ephemeral: true,
            });
            return;
          }
          if (action === 'tlc_appeal_reject') {
            await interaction.showModal(
              buildRejectionReasonModal('appeal_reject', appeal.id, `Reject Appeal · ${appeal.sanctionReference}`)
            );
            return;
          }

          const res = await tlcStore.reviewSanctionAppeal(
            appeal.id,
            'accept',
            interaction.user.username,
            interaction.user.id
          );
          if (res.sanction) {
            await sendToSanctionsLog(client, {
              embeds: [
                buildSanctionLogEmbed(
                  'Sanction Appeal Accepted',
                  res.sanction,
                  `@${interaction.user.username}`,
                  `Appeal \`${res.appeal.id}\` accepted. Staff may now cancel or edit the original sanction.`
                ),
              ],
            });
          }
          await sendLatestAuditLog(client);
          if (state.config.notifications.sendDirectMessages) {
            try {
              const pUser = await client.users.fetch(res.appeal.playerDiscordUserId);
              await pUser.send(
                `✅ Your appeal for sanction \`${res.appeal.sanctionReference}\` has been **ACCEPTED** by **${interaction.user.username}**. Disciplinary staff will now cancel or modify the sanction.`
              );
            } catch {
              // Ignore closed DMs
            }
          }
          await interaction.update(buildAppealReviewPayload(res.appeal, res.sanction));
          return;
        }
      }

      // ==================== NATIVE CHANNEL, ROLE & USER SELECTORS ====================
      if (interaction.isUserSelectMenu()) {
        if (interaction.customId === 'tlc_createteam_owner') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const draftKey = `${interaction.guildId || 'dm'}:${interaction.user.id}`;
          const draft = createTeamDrafts.get(draftKey) || {};
          const ownerId = interaction.values[0];
          const pickedUser = interaction.users.get(ownerId);
          draft.ownerId = ownerId;
          draft.ownerUsername = pickedUser?.username || ownerId;
          createTeamDrafts.set(draftKey, draft);
          await interaction.update(buildCreateTeamBuilderPayload(draft));
          return;
        }

        if (interaction.customId.startsWith('tlc_sanction_user:')) {
          if (!isDisciplinaryStaff(interaction.member as GuildMember)) {
            await interaction.reply({
              content: 'You lack Disciplinary Staff permissions.',
              ephemeral: true,
            });
            return;
          }
          const draftId = interaction.customId.split(':')[1];
          const draft = sanctionDrafts.get(draftId);
          if (!draft || draft.issuerDiscordId !== interaction.user.id) {
            await interaction.reply({
              content: 'Sanction draft expired or belongs to another staff member.',
              ephemeral: true,
            });
            return;
          }
          const pickedId = interaction.values[0];
          const pickedUser = interaction.users.get(pickedId);
          const pickedMember = interaction.members.get(pickedId) as GuildMember | undefined;
          draft.playerDiscordUserId = pickedId;
          draft.playerDiscordUsername = pickedUser?.username || pickedId;
          draft.fallbackPlayerName = pickedMember?.displayName || pickedUser?.displayName || pickedUser?.username;
          draft.fallbackAvatarUrl = pickedUser?.displayAvatarURL();
          sanctionDrafts.set(draftId, draft);

          const resolved = resolveDiscordPlayerSummary(
            pickedId,
            draft.playerDiscordUsername,
            draft.fallbackPlayerName,
            draft.fallbackAvatarUrl
          );
          const currency = state.config.sanctions?.defaultCurrency || 'TLC Coins';
          await interaction.update(
            buildSanctionBuilderPayload(draft, currency, {
              name: resolved.playerName,
              teamName: resolved.teamName,
              tlcId: resolved.tlcId,
            })
          );
          return;
        }

        if (interaction.customId === 'tlc_sanction_hist_user') {
          if (!isDisciplinaryStaff(interaction.member as GuildMember)) {
            await interaction.reply({
              content: 'You lack Disciplinary Staff permissions.',
              ephemeral: true,
            });
            return;
          }
          const pickedId = interaction.values[0];
          const pickedUser = interaction.users.get(pickedId);
          const pickedMember = interaction.members.get(pickedId) as GuildMember | undefined;
          await interaction.update(
            buildSanctionHistoryPayloadForDiscordUser(
              pickedId,
              pickedUser?.username,
              pickedMember?.displayName || pickedUser?.displayName,
              pickedUser?.displayAvatarURL()
            )
          );
          return;
        }
      }

      if (interaction.isChannelSelectMenu()) {
        if (interaction.customId.startsWith('tlc_setup_ch:')) {
          const member = interaction.member as GuildMember | null;
          const key = interaction.customId.split(':')[1] as keyof BotConfig['channels'];
          const isSanctionsSetupKey =
            key === 'sanctionsAnnouncementId' || key === 'sanctionsLogId';
          const isTicketSetupKey =
            key === 'ticketPanelId' ||
            key === 'ticketCategoryId' ||
            key === 'registrationCategoryId' ||
            key === 'ticketLogId' ||
            key === 'applicationLogId' ||
            key === 'complaintLogId' ||
            key === 'escalationChannelId';

          if (isSanctionsSetupKey || isTicketSetupKey) {
            if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
              await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
              return;
            }
          } else if (!member?.permissions.has(PermissionFlagsBits.Administrator) && !isStaffMember(member)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }

          const channelId = interaction.values[0];
          await tlcStore.updateConfig(
            { channels: { ...state.config.channels, [key]: channelId } },
            interaction.user.username
          );
          if (isSanctionsSetupKey) {
            await interaction.update(buildSanctionSetupPayload(tlcStore.getState()));
            return;
          }
          if (isTicketSetupKey) {
            const ticketSec: TicketSetupSection =
              key === 'ticketLogId' || key === 'applicationLogId' || key === 'complaintLogId'
                ? 'channels_logs'
                : 'channels_main';
            await interaction.update(buildTicketSetupPayload(tlcStore.getState(), ticketSec));
            return;
          }

          const wasOnTeamsSection = interaction.message.components.some(
            (row) =>
              'components' in row &&
              row.components.some((c) => 'customId' in c && c.customId === 'tlc_setup_toggle:multiTeamRoles')
          );
          const section: SetupSection =
            key === 'signingRequestsId' || key === 'teamManagementId' || wasOnTeamsSection
              ? 'teams'
              : key === 'fixturesId' || key === 'resultsId' || key === 'auditLogsId'
              ? 'channels_matchday'
              : 'channels_core';
          await interaction.update(buildSetupPanelPayload(tlcStore.getState(), section));
          return;
        }
      }

      if (interaction.isRoleSelectMenu()) {
        if (interaction.customId === 'tlc_createteam_role') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const draftKey = `${interaction.guildId || 'dm'}:${interaction.user.id}`;
          const draft = createTeamDrafts.get(draftKey) || {};
          draft.roleId = interaction.values[0];
          createTeamDrafts.set(draftKey, draft);
          await interaction.update(buildCreateTeamBuilderPayload(draft));
          return;
        }

        const member = interaction.member as GuildMember | null;
        if (interaction.customId === 'tlc_setup_role:disciplinaryRoleIds') {
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          await tlcStore.updateConfig(
            { roles: { ...state.config.roles, disciplinaryRoleIds: interaction.values } },
            interaction.user.username
          );
          await interaction.update(buildSanctionSetupPayload(tlcStore.getState()));
          return;
        }

        if (interaction.customId.startsWith('tlc_setup_role:')) {
          const key = interaction.customId.split(':')[1] as keyof BotConfig['roles'];
          const multiTicketRoleKeys: Array<keyof BotConfig['roles']> = [
            'supportRoleIds',
            'staffAppRoleIds',
            'complaintStaffRoleIds',
            'seniorAdminRoleIds',
            'playerRegStaffRoleIds',
            'coachRegStaffRoleIds',
            'teamRegStaffRoleIds',
          ];
          const isTicketSetupPanel = Boolean(
            interaction.message.embeds[0]?.title?.includes('Unified Ticket System Setup')
          );
          const isTicketRoleKey =
            multiTicketRoleKeys.includes(key) || key === 'coachRoleId' || isTicketSetupPanel;

          if (isTicketRoleKey) {
            if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
              await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
              return;
            }
          } else if (!member?.permissions.has(PermissionFlagsBits.Administrator) && !isStaffMember(member)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }

          if (
            key === 'staffRoleIds' ||
            key === 'disciplinaryRoleIds' ||
            multiTicketRoleKeys.includes(key)
          ) {
            await tlcStore.updateConfig(
              { roles: { ...state.config.roles, [key]: interaction.values } },
              interaction.user.username
            );
          } else {
            await tlcStore.updateConfig(
              { roles: { ...state.config.roles, [key]: interaction.values[0] } },
              interaction.user.username
            );
          }

          if (isTicketRoleKey) {
            const ticketSec: TicketSetupSection =
              key === 'supportRoleIds' ||
              key === 'staffAppRoleIds' ||
              key === 'complaintStaffRoleIds' ||
              key === 'seniorAdminRoleIds'
                ? 'roles_staff'
                : key === 'playerRoleId' && isTicketSetupPanel
                ? 'settings'
                : 'roles_reg';
            await interaction.update(buildTicketSetupPayload(tlcStore.getState(), ticketSec));
            return;
          }

          const section: SetupSection =
            key === 'goalkeeperRoleId' ||
            key === 'defenderRoleId' ||
            key === 'midfielderRoleId' ||
            key === 'attackerRoleId'
              ? 'roles_positions'
              : key === 'unverifiedRoleId'
              ? 'roles_clubs'
              : 'roles_core';
          await interaction.update(buildSetupPanelPayload(tlcStore.getState(), section));
          return;
        }

        if (!member?.permissions.has(PermissionFlagsBits.Administrator) && !isStaffMember(member)) {
          await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
          return;
        }

        if (interaction.customId.startsWith('tlc_setup_club_role:')) {
          const clubId = interaction.customId.split(':')[1];
          const roleId = interaction.values[0];
          await tlcStore.editClub(clubId, { discordRoleId: roleId }, interaction.user.username);
          await interaction.update(buildSetupPanelPayload(tlcStore.getState(), 'roles_clubs', clubId));
          return;
        }
      }

      // ==================== STRING SELECT MENUS ====================
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'tlc_setup_section') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator) && !isStaffMember(member)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const sec = interaction.values[0] as SetupSection;
          await interaction.update(buildSetupPanelPayload(state, sec));
          return;
        }

        if (interaction.customId === 'tlc_setup_club_pick') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator) && !isStaffMember(member)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const clubId = interaction.values[0];
          await interaction.update(buildSetupPanelPayload(state, 'roles_clubs', clubId));
          return;
        }

        if (interaction.customId === 'tlc_deleteteam_pick') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const clubId = interaction.values[0];
          const team = tlcStore.getActiveTeams().find((c) => c.clubId === clubId);
          if (!team) {
            await interaction.reply({ content: 'Selected team was not found.', ephemeral: true });
            return;
          }
          const rosterCount = tlcStore.getTeamRosterMembers(team.clubId).length;
          await interaction.update(buildDeleteTeamConfirmPayload(team, rosterCount));
          return;
        }

        if (interaction.customId === 'tlc_teams_view') {
          const clubId = interaction.values[0];
          const team = tlcStore.getActiveTeams().find((c) => c.clubId === clubId);
          if (!team) {
            await interaction.reply({ content: 'Team not found.', ephemeral: true });
            return;
          }
          const rosterMembers = tlcStore.getTeamRosterMembers(team.clubId);
          const teamTransfers = state.transfers.filter(
            (t) => t.toClubId === team.clubId || t.fromClubId === team.clubId
          );
          await interaction.reply({
            ...buildTeamProfilePayload(team, rosterMembers, teamTransfers),
            ephemeral: true,
          });
          return;
        }

        if (interaction.customId === 'tlc_demande_pick') {
          const signingChannelId = state.config.channels.signingRequestsId;
          if (!signingChannelId) {
            await interaction.reply({
              content:
                'Signing Request Channel is not configured yet. Please ask an administrator to run `/setup teams`.',
              ephemeral: true,
            });
            return;
          }
          const requestedClubId = interaction.values[0];
          const gm = interaction.member as GuildMember | null;
          const req = await tlcStore.submitDemande({
            playerDiscordUserId: interaction.user.id,
            playerDiscordUsername: interaction.user.username,
            fallbackName: gm?.displayName || interaction.user.username,
            requestedClubId,
          });
          await sendToConfiguredChannel(client, signingChannelId, buildDemandeReviewPayload(req));
          await interaction.update({
            content: `Your signing request for **${req.requestedClubLogoEmoji || '⚽'} ${req.requestedClubName}** has been sent to <#${signingChannelId}> for staff review.`,
            embeds: [],
            components: [],
          });
          return;
        }

        if (interaction.customId.startsWith('tlc_release_pick:')) {
          const clubId = interaction.customId.split(':')[1];
          const team = tlcStore.getActiveTeams().find((c) => c.clubId === clubId);
          if (!team) {
            await interaction.reply({ content: 'Team not found.', ephemeral: true });
            return;
          }
          const isAdminOrStaff = isStaffMember(interaction.member as GuildMember);
          if (!isAdminOrStaff && team.ownerDiscordUserId !== interaction.user.id) {
            await interaction.reply({
              content: 'You can only release players from your own team.',
              ephemeral: true,
            });
            return;
          }
          const targetUserId = interaction.values[0];
          const memberEntry = tlcStore
            .getTeamRosterMembers(clubId)
            .find((m) => m.discordUserId === targetUserId);
          await interaction.update(
            buildReleaseConfirmPayload(team, targetUserId, memberEntry?.displayName || targetUserId)
          );
          return;
        }

        if (interaction.customId === 'tlc_reg_type_select') {
          const val = interaction.values[0] as 'Player' | 'Manager';
          if (val === 'Manager') {
            await interaction.showModal(buildRegistrationModal('Manager'));
          } else {
            await interaction.update(buildPlayerPositionSelectPayload());
          }
          return;
        }

        if (interaction.customId === 'tlc_reg_position_select') {
          const pos = interaction.values[0] as PlayerPosition;
          await interaction.showModal(buildRegistrationModal('Player', pos));
          return;
        }

        if (interaction.customId === 'tlc_delplayer_pick') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const tlcId = interaction.values[0];
          const player = tlcStore.getActivePlayers().find((p) => p.tlcId === tlcId);
          if (!player) {
            await interaction.reply({ content: 'Active player not found.', ephemeral: true });
            return;
          }
          const club = player.currentClubId
            ? state.clubs.find((c) => c.clubId === player.currentClubId)
            : undefined;
          const clubName = club ? `${club.logoEmoji ? `${club.logoEmoji} ` : ''}${club.name}` : 'Free Agent';
          await interaction.update(buildDeletePlayerConfirmPayload(player, clubName));
          return;
        }

        if (interaction.customId === 'tlc_resplayer_pick') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const tlcId = interaction.values[0];
          const player = tlcStore.getDeletedPlayers().find((p) => p.tlcId === tlcId);
          if (!player) {
            await interaction.reply({ content: 'Deleted player not found.', ephemeral: true });
            return;
          }
          const club = player.previousClubId
            ? state.clubs.find((c) => c.clubId === player.previousClubId)
            : undefined;
          const prevClubName = club
            ? `${club.logoEmoji ? `${club.logoEmoji} ` : ''}${club.name}`
            : 'Free Agent';
          await interaction.update(buildRestorePlayerConfirmPayload(player, prevClubName));
          return;
        }

        if (interaction.customId === 'tlc_delmgr_pick') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const tlcId = interaction.values[0];
          const manager = tlcStore.getActiveManagers().find((m) => m.tlcId === tlcId);
          if (!manager) {
            await interaction.reply({ content: 'Active manager not found.', ephemeral: true });
            return;
          }
          const club = manager.currentClubId
            ? state.clubs.find((c) => c.clubId === manager.currentClubId)
            : undefined;
          const clubName = club ? `${club.logoEmoji ? `${club.logoEmoji} ` : ''}${club.name}` : 'Free Agent';
          await interaction.update(buildDeleteManagerConfirmPayload(manager, clubName));
          return;
        }

        if (interaction.customId === 'tlc_resmgr_pick') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const tlcId = interaction.values[0];
          const manager = tlcStore.getDeletedManagers().find((m) => m.tlcId === tlcId);
          if (!manager) {
            await interaction.reply({ content: 'Deleted manager not found.', ephemeral: true });
            return;
          }
          const club = manager.previousClubId
            ? state.clubs.find((c) => c.clubId === manager.previousClubId)
            : undefined;
          const prevClubName = club
            ? `${club.logoEmoji ? `${club.logoEmoji} ` : ''}${club.name}`
            : 'Free Agent';
          await interaction.update(buildRestoreManagerConfirmPayload(manager, prevClubName));
          return;
        }

        if (interaction.customId.startsWith('tlc_sign_player_select:')) {
          const clubId = interaction.customId.split(':')[1];
          const playerTlcId = interaction.values[0];
          const player = tlcStore.getActivePlayers().find((p) => p.tlcId === playerTlcId);
          if (!player) {
            await interaction.reply({ content: 'Selected active player not found.', ephemeral: true });
            return;
          }
          await interaction.showModal(buildSignPlayerOfferModal(clubId, player));
          return;
        }

        if (interaction.customId.startsWith('tlc_sanction_type:')) {
          if (!isDisciplinaryStaff(interaction.member as GuildMember)) {
            await interaction.reply({ content: 'Disciplinary Staff permission required.', ephemeral: true });
            return;
          }
          const draftId = interaction.customId.split(':')[1];
          const draft = sanctionDrafts.get(draftId);
          if (!draft || draft.issuerDiscordId !== interaction.user.id) {
            await interaction.reply({
              content: 'Sanction draft expired or belongs to another staff member.',
              ephemeral: true,
            });
            return;
          }
          draft.sanctionType = interaction.values[0] as SanctionType;
          sanctionDrafts.set(draftId, draft);
          const resolved = draft.playerDiscordUserId
            ? resolveDiscordPlayerSummary(
                draft.playerDiscordUserId,
                draft.playerDiscordUsername,
                draft.fallbackPlayerName,
                draft.fallbackAvatarUrl
              )
            : undefined;
          const currency = state.config.sanctions?.defaultCurrency || 'TLC Coins';
          await interaction.update(
            buildSanctionBuilderPayload(
              draft,
              currency,
              resolved
                ? { name: resolved.playerName, teamName: resolved.teamName, tlcId: resolved.tlcId }
                : undefined
            )
          );
          return;
        }

        if (interaction.customId === 'tlc_sanction_hist_pick') {
          if (!isDisciplinaryStaff(interaction.member as GuildMember)) {
            await interaction.reply({ content: 'Disciplinary Staff permission required.', ephemeral: true });
            return;
          }
          const targetDiscordId = interaction.values[0];
          await interaction.update(buildSanctionHistoryPayloadForDiscordUser(targetDiscordId));
          return;
        }

        if (interaction.customId === 'tlc_sanction_manage_pick') {
          if (!isDisciplinaryStaff(interaction.member as GuildMember)) {
            await interaction.reply({ content: 'Disciplinary Staff permission required.', ephemeral: true });
            return;
          }
          const sanctionId = interaction.values[0];
          const sanction = (state.sanctions ?? []).find((s) => s.id === sanctionId);
          if (!sanction) {
            await interaction.reply({ content: 'Sanction record not found.', ephemeral: true });
            return;
          }
          const appeals = (state.sanctionAppeals ?? []).filter((a) => a.sanctionId === sanction.id);
          await interaction.reply(buildSanctionManagePayload(sanction, appeals));
          return;
        }

        if (interaction.customId === 'tlc_appeal_pick') {
          const sanctionId = interaction.values[0];
          const sanction = (state.sanctions ?? []).find((s) => s.id === sanctionId);
          if (!sanction || sanction.playerDiscordUserId !== interaction.user.id) {
            await interaction.reply({
              content: 'You may only appeal sanctions issued to your own account.',
              ephemeral: true,
            });
            return;
          }
          if (sanction.status === 'Removed') {
            await interaction.reply({ content: 'This sanction has already been removed.', ephemeral: true });
            return;
          }
          await interaction.showModal(buildAppealModal(sanction));
          return;
        }
      }

      // ==================== MODALS ====================
      if (interaction.isModalSubmit()) {
        if (interaction.customId === 'tlc_createteam_modal') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const draftKey = `${interaction.guildId || 'dm'}:${interaction.user.id}`;
          const draft = createTeamDrafts.get(draftKey) || {};
          draft.name = interaction.fields.getTextInputValue('team_name').trim();
          draft.logoEmoji = interaction.fields.getTextInputValue('team_logo').trim() || '⚽';
          createTeamDrafts.set(draftKey, draft);

          if (draft.roleId && draft.ownerId && draft.name) {
            const team = await tlcStore.createTeam(
              {
                name: draft.name,
                discordRoleId: draft.roleId,
                ownerDiscordUserId: draft.ownerId,
                ownerDiscordUsername: draft.ownerUsername || draft.ownerId,
                logoEmoji: draft.logoEmoji,
              },
              interaction.user.username
            );
            createTeamDrafts.delete(draftKey);
            const roster = tlcStore.getTeamRosterMembers(team.clubId);
            const profile = buildTeamProfilePayload(team, roster, []);
            await interaction.reply({
              content: `Team ${team.logoEmoji} **${team.name}** created and linked to <@&${team.discordRoleId}> with Owner <@${team.ownerDiscordUserId}>!`,
              embeds: profile.embeds,
              ephemeral: true,
            });
            if (state.config.channels.teamManagementId) {
              await sendToConfiguredChannel(client, state.config.channels.teamManagementId, {
                content: `New Official Team Registered: ${team.logoEmoji} **${team.name}** · Owner: <@${team.ownerDiscordUserId}> · Role: <@&${team.discordRoleId}>`,
              });
            }
            return;
          }

          await interaction.reply(buildCreateTeamBuilderPayload(draft));
          return;
        }

        if (interaction.customId.startsWith('tlc_reg_modal_')) {
          const isPlayer = interaction.customId.startsWith('tlc_reg_modal_player_');
          const pos = isPlayer
            ? (interaction.customId.replace('tlc_reg_modal_player_', '') as PlayerPosition)
            : undefined;

          const playerName = interaction.fields.getTextInputValue('player_name');
          const robloxUsername = interaction.fields.getTextInputValue('roblox_username');
          const robloxAvatarUrl = interaction.fields.getTextInputValue('roblox_avatar');

          const req = await tlcStore.submitRegistration({
            discordUserId: interaction.user.id,
            discordUsername: interaction.user.username,
            playerName,
            robloxUsername,
            robloxAvatarUrl,
            registrationType: isPlayer ? 'Player' : 'Manager',
            position: pos,
          });

          const reviewChId = state.config.channels.registrationRequestsId;
          if (!reviewChId) {
            await interaction.reply({
              content:
                'Your registration has been saved, but the **Registration Review Channel** has not been configured yet. Please ask an administrator to run `/setup`.',
              ephemeral: true,
            });
            return;
          }

          await sendToConfiguredChannel(client, reviewChId, buildRegistrationReviewEmbed(req));

          await interaction.reply({
            content: `Your **${req.registrationType}** registration has been submitted for staff review in <#${reviewChId}>.`,
            ephemeral: true,
          });
          return;
        }

        if (interaction.customId === 'tlc_correction_modal') {
          const existingPlayer = state.players.find((p) => p.discordUserId === interaction.user.id);
          const existingManager = state.managers.find((m) => m.discordUserId === interaction.user.id);
          const tlcId = existingPlayer?.tlcId || existingManager?.tlcId;
          const profileName = existingPlayer?.playerName || existingManager?.managerName || interaction.user.username;
          if (!tlcId) {
            await interaction.reply({
              content: 'Only verified members with an approved TLC ID can request a profile correction. Click **Verify** or run `/register` first.',
              ephemeral: true,
            });
            return;
          }
          const playerName = interaction.fields.getTextInputValue('new_name').trim() || undefined;
          const robloxUsername = interaction.fields.getTextInputValue('new_roblox').trim() || undefined;
          const reason = interaction.fields.getTextInputValue('reason').trim();
          const corr = await tlcStore.submitProfileCorrection({
            tlcId,
            discordUserId: interaction.user.id,
            playerName,
            robloxUsername,
            reason,
          });
          const reviewChId = state.config.channels.registrationRequestsId;
          if (reviewChId) {
            await sendToConfiguredChannel(client, reviewChId, buildCorrectionReviewPayload(corr, profileName));
          }
          await interaction.reply({
            content: reviewChId
              ? `Profile correction request \`${corr.id}\` sent to <#${reviewChId}> for staff APPROVE / CANCEL review.`
              : `Profile correction request \`${corr.id}\` saved. Note: Configure the Registration Review Channel via \`/setup\`.`,
            ephemeral: true,
          });
          return;
        }

        if (interaction.customId === 'tlc_delplayer_search_modal') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const query = interaction.fields.getTextInputValue('search_query').trim();
          const payload = buildDeletePlayerPickerPayload(filterActivePlayersForPicker(query), query);
          if (interaction.isFromMessage()) {
            await interaction.update(payload);
          } else {
            await interaction.reply(payload);
          }
          return;
        }

        if (interaction.customId === 'tlc_resplayer_search_modal') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const query = interaction.fields.getTextInputValue('search_query').trim();
          const payload = buildRestorePlayerPickerPayload(filterDeletedPlayersForPicker(query), query);
          if (interaction.isFromMessage()) {
            await interaction.update(payload);
          } else {
            await interaction.reply(payload);
          }
          return;
        }

        if (interaction.customId === 'tlc_delmgr_search_modal') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const query = interaction.fields.getTextInputValue('search_query').trim();
          const payload = buildDeleteManagerPickerPayload(filterActiveManagersForPicker(query), query);
          if (interaction.isFromMessage()) {
            await interaction.update(payload);
          } else {
            await interaction.reply(payload);
          }
          return;
        }

        if (interaction.customId === 'tlc_resmgr_search_modal') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const query = interaction.fields.getTextInputValue('search_query').trim();
          const payload = buildRestoreManagerPickerPayload(filterDeletedManagersForPicker(query), query);
          if (interaction.isFromMessage()) {
            await interaction.update(payload);
          } else {
            await interaction.reply(payload);
          }
          return;
        }

        if (interaction.customId === 'tlc_sanctions_currency_modal') {
          const member = interaction.member as GuildMember | null;
          if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
            return;
          }
          const currency = interaction.fields.getTextInputValue('currency_label').trim();
          if (!currency) {
            await interaction.reply({ content: 'Currency name cannot be empty.', ephemeral: true });
            return;
          }
          await tlcStore.updateConfig({ sanctions: { defaultCurrency: currency } }, interaction.user.username);
          const payload = buildSanctionSetupPayload(tlcStore.getState());
          if (interaction.isFromMessage()) {
            await interaction.update(payload);
          } else {
            await interaction.reply(payload);
          }
          return;
        }

        if (interaction.customId.startsWith('tlc_sanction_modal:')) {
          if (!isDisciplinaryStaff(interaction.member as GuildMember)) {
            await interaction.reply({ content: 'Disciplinary Staff permission required.', ephemeral: true });
            return;
          }
          const draftId = interaction.customId.split(':')[1];
          const draft = sanctionDrafts.get(draftId);
          if (!draft || draft.issuerDiscordId !== interaction.user.id) {
            await interaction.reply({
              content: 'Sanction draft expired or belongs to another staff member.',
              ephemeral: true,
            });
            return;
          }
          const reason = interaction.fields.getTextInputValue('reason').trim();
          const fineRaw = Number(interaction.fields.getTextInputValue('fine_amount').trim());
          const suspRaw = Number(interaction.fields.getTextInputValue('suspension_matches').trim());
          if (!reason) {
            await interaction.reply({ content: 'A sanction reason is required.', ephemeral: true });
            return;
          }
          if (!Number.isFinite(fineRaw) || fineRaw < 0) {
            await interaction.reply({
              content: 'Fine Amount must be a valid number greater than or equal to 0.',
              ephemeral: true,
            });
            return;
          }
          if (!Number.isFinite(suspRaw) || suspRaw < 0 || !Number.isInteger(suspRaw)) {
            await interaction.reply({
              content: 'Match Suspension must be a whole number greater than or equal to 0.',
              ephemeral: true,
            });
            return;
          }

          draft.reason = reason;
          draft.fineAmount = Number(fineRaw.toFixed(2));
          draft.suspensionMatches = suspRaw;
          sanctionDrafts.set(draftId, draft);

          const currency = state.config.sanctions?.defaultCurrency || 'TLC Coins';
          const resolved = draft.playerDiscordUserId
            ? resolveDiscordPlayerSummary(
                draft.playerDiscordUserId,
                draft.playerDiscordUsername,
                draft.fallbackPlayerName,
                draft.fallbackAvatarUrl
              )
            : undefined;

          const payload =
            draft.playerDiscordUserId && draft.sanctionType && resolved
              ? buildSanctionPreviewPayload(draft, currency, resolved, interaction.user.username)
              : buildSanctionBuilderPayload(
                  draft,
                  currency,
                  resolved
                    ? { name: resolved.playerName, teamName: resolved.teamName, tlcId: resolved.tlcId }
                    : undefined
                );

          if (interaction.isFromMessage()) {
            await interaction.update(payload);
          } else {
            await interaction.reply(payload);
          }
          return;
        }

        if (interaction.customId.startsWith('tlc_sanction_edit_modal:')) {
          if (!isDisciplinaryStaff(interaction.member as GuildMember)) {
            await interaction.reply({ content: 'Disciplinary Staff permission required.', ephemeral: true });
            return;
          }
          const sanctionId = interaction.customId.split(':')[1];
          const typeInput = interaction.fields.getTextInputValue('sanction_type').trim();
          const resolvedType = resolveSanctionTypeInput(typeInput);
          if (!resolvedType) {
            await interaction.reply({
              content: `Invalid Sanction Type "${typeInput}". Allowed values: ${SANCTION_TYPES.join(', ')}.`,
              ephemeral: true,
            });
            return;
          }
          const reason = interaction.fields.getTextInputValue('reason').trim();
          const fineRaw = Number(interaction.fields.getTextInputValue('fine_amount').trim());
          const suspRaw = Number(interaction.fields.getTextInputValue('suspension_matches').trim());
          if (!Number.isFinite(fineRaw) || fineRaw < 0) {
            await interaction.reply({ content: 'Fine Amount must be >= 0.', ephemeral: true });
            return;
          }
          if (!Number.isFinite(suspRaw) || suspRaw < 0 || !Number.isInteger(suspRaw)) {
            await interaction.reply({ content: 'Match Suspension must be an integer >= 0.', ephemeral: true });
            return;
          }

          const updated = await tlcStore.editSanction(
            sanctionId,
            {
              sanctionType: resolvedType,
              reason,
              fineAmount: Number(fineRaw.toFixed(2)),
              suspensionMatches: suspRaw,
            },
            interaction.user.username,
            interaction.user.id
          );

          await updatePublishedSanctionNotice(client, updated);
          await sendToSanctionsLog(client, {
            embeds: [
              buildSanctionLogEmbed(
                'Sanction Modified',
                updated,
                `@${interaction.user.username}`,
                `Reason: ${updated.reason}`
              ),
            ],
          });
          await sendLatestAuditLog(client);
          if (state.config.notifications.sendDirectMessages) {
            try {
              const u = await client.users.fetch(updated.playerDiscordUserId);
              await u.send({
                content: `📝 Your TLC sanction (\`${updated.referenceNumber}\`) was updated by **${interaction.user.username}**.`,
                embeds: [buildSanctionNoticeEmbed(updated)],
              });
            } catch {
              // Ignore closed DMs
            }
          }

          const appeals = (tlcStore.getState().sanctionAppeals ?? []).filter((a) => a.sanctionId === updated.id);
          const payload = buildSanctionManagePayload(updated, appeals);
          if (interaction.isFromMessage()) {
            await interaction.update(payload);
          } else {
            await interaction.reply(payload);
          }
          return;
        }

        if (interaction.customId.startsWith('tlc_sanction_pay_modal:')) {
          if (!isDisciplinaryStaff(interaction.member as GuildMember)) {
            await interaction.reply({ content: 'Disciplinary Staff permission required.', ephemeral: true });
            return;
          }
          const sanctionId = interaction.customId.split(':')[1];
          const amount = Number(interaction.fields.getTextInputValue('payment_amount').trim());
          const note = interaction.fields.getTextInputValue('payment_note').trim();
          if (!Number.isFinite(amount) || amount <= 0) {
            await interaction.reply({ content: 'Payment amount must be greater than 0.', ephemeral: true });
            return;
          }

          const updated = await tlcStore.updateSanctionFine(
            sanctionId,
            { action: 'record_payment', amount, note },
            interaction.user.username,
            interaction.user.id
          );
          await updatePublishedSanctionNotice(client, updated);
          await sendToSanctionsLog(client, {
            embeds: [
              buildSanctionLogEmbed(
                'Fine Payment Recorded',
                updated,
                `@${interaction.user.username}`,
                `Payment: +${amount} ${updated.fineCurrency} (Total paid: ${updated.finePaidAmount}/${updated.fineAmount})`
              ),
            ],
          });
          await sendLatestAuditLog(client);
          if (state.config.notifications.sendDirectMessages) {
            try {
              const u = await client.users.fetch(updated.playerDiscordUserId);
              await u.send(
                `💰 Payment of **${amount} ${updated.fineCurrency}** recorded on sanction \`${updated.referenceNumber}\`. Fine Status: **${updated.fineStatus}** (${updated.finePaidAmount}/${updated.fineAmount}).`
              );
            } catch {
              // Ignore closed DMs
            }
          }

          const appeals = (tlcStore.getState().sanctionAppeals ?? []).filter((a) => a.sanctionId === updated.id);
          const payload = buildSanctionManagePayload(updated, appeals);
          if (interaction.isFromMessage()) {
            await interaction.update(payload);
          } else {
            await interaction.reply(payload);
          }
          return;
        }

        if (interaction.customId.startsWith('tlc_appeal_modal:')) {
          const sanctionId = interaction.customId.split(':')[1];
          const explanation = interaction.fields.getTextInputValue('appeal_explanation').trim();
          const { appeal, sanction } = await tlcStore.submitSanctionAppeal({
            sanctionId,
            playerDiscordUserId: interaction.user.id,
            playerDiscordUsername: interaction.user.username,
            fallbackName: (interaction.member as GuildMember | null)?.displayName || interaction.user.username,
            explanation,
          });

          const reviewChId =
            state.config.channels.sanctionsLogId || state.config.channels.registrationRequestsId;
          if (reviewChId) {
            await sendToConfiguredChannel(client, reviewChId, buildAppealReviewPayload(appeal, sanction));
          }
          await sendLatestAuditLog(client);

          await interaction.reply({
            content: reviewChId
              ? `✅ Your appeal (\`${appeal.id}\`) for sanction \`${sanction.referenceNumber}\` has been submitted to <#${reviewChId}> for disciplinary staff review.`
              : `✅ Your appeal (\`${appeal.id}\`) for sanction \`${sanction.referenceNumber}\` has been recorded for disciplinary staff review.`,
            ephemeral: true,
          });
          return;
        }

        if (interaction.customId.startsWith('tlc_reject_modal:')) {
          const [, targetTypeRaw, targetId] = interaction.customId.split(':');
          const targetType = targetTypeRaw as RejectionModalTargetType;
          const isSanctionAction =
            targetType === 'sanction_remove' ||
            targetType === 'sanction_waive' ||
            targetType === 'appeal_reject';

          if (isSanctionAction) {
            if (!isDisciplinaryStaff(interaction.member as GuildMember)) {
              await interaction.reply({
                content: 'Disciplinary Staff permissions are required for this action.',
                ephemeral: true,
              });
              return;
            }
          } else if (!isStaffMember(interaction.member as GuildMember)) {
            await interaction.reply({ content: 'Staff permissions are required for this action.', ephemeral: true });
            return;
          }

          const reason = interaction.fields.getTextInputValue('rejection_reason').trim();
          if (!reason) {
            await interaction.reply({
              content: 'A mandatory rejection reason must be provided.',
              ephemeral: true,
            });
            return;
          }

          if (targetType === 'sanction_remove') {
            const updated = await tlcStore.removeSanction(
              targetId,
              reason,
              interaction.user.username,
              interaction.user.id
            );
            await updatePublishedSanctionNotice(client, updated);
            await sendToSanctionsLog(client, {
              embeds: [
                buildSanctionLogEmbed(
                  'Sanction Removed (History Preserved)',
                  updated,
                  `@${interaction.user.username}`,
                  `Removal Reason: ${reason}`
                ),
              ],
            });
            await sendLatestAuditLog(client);
            if (state.config.notifications.sendDirectMessages) {
              try {
                const u = await client.users.fetch(updated.playerDiscordUserId);
                await u.send(
                  `🗑️ Your sanction \`${updated.referenceNumber}\` has been **cancelled/removed** by **${interaction.user.username}**.\nReason: ${reason}`
                );
              } catch {
                // Ignore closed DMs
              }
            }
            const payload = buildRemoveSanctionConfirmPayload(updated, 'Removed');
            if (interaction.isFromMessage()) {
              await interaction.update(payload);
            } else {
              await interaction.reply(payload);
            }
            return;
          }

          if (targetType === 'sanction_waive') {
            const updated = await tlcStore.updateSanctionFine(
              targetId,
              { action: 'waive', note: reason },
              interaction.user.username,
              interaction.user.id
            );
            await updatePublishedSanctionNotice(client, updated);
            await sendToSanctionsLog(client, {
              embeds: [
                buildSanctionLogEmbed(
                  'Fine Waived',
                  updated,
                  `@${interaction.user.username}`,
                  `Waiver Explanation: ${reason}`
                ),
              ],
            });
            await sendLatestAuditLog(client);
            if (state.config.notifications.sendDirectMessages) {
              try {
                const u = await client.users.fetch(updated.playerDiscordUserId);
                await u.send(
                  `✅ Your financial fine for sanction \`${updated.referenceNumber}\` (${updated.fineAmount} ${updated.fineCurrency}) has been **WAIVED** by **${interaction.user.username}**.\nExplanation: ${reason}`
                );
              } catch {
                // Ignore closed DMs
              }
            }
            const appeals = (tlcStore.getState().sanctionAppeals ?? []).filter((a) => a.sanctionId === updated.id);
            const payload = buildSanctionManagePayload(updated, appeals);
            if (interaction.isFromMessage()) {
              await interaction.update(payload);
            } else {
              await interaction.reply(payload);
            }
            return;
          }

          if (targetType === 'appeal_reject') {
            const res = await tlcStore.reviewSanctionAppeal(
              targetId,
              'reject',
              interaction.user.username,
              interaction.user.id,
              reason
            );
            if (res.sanction) {
              await sendToSanctionsLog(client, {
                embeds: [
                  buildSanctionLogEmbed(
                    'Sanction Appeal Rejected',
                    res.sanction,
                    `@${interaction.user.username}`,
                    `Appeal \`${res.appeal.id}\` rejected. Reason: ${reason}`
                  ),
                ],
              });
            }
            await sendLatestAuditLog(client);
            if (state.config.notifications.sendDirectMessages) {
              try {
                const u = await client.users.fetch(res.appeal.playerDiscordUserId);
                await u.send(
                  `❌ Your appeal for sanction \`${res.appeal.sanctionReference}\` was **REJECTED** by **${interaction.user.username}**.\n\nReason: ${reason}`
                );
              } catch {
                // Ignore closed DMs
              }
            }
            if (interaction.isFromMessage()) {
              await interaction.update(buildAppealReviewPayload(res.appeal, res.sanction));
            } else {
              await interaction.reply({
                content: `Appeal \`${res.appeal.id}\` rejected. Reason: ${reason}`,
                ephemeral: true,
              });
            }
            return;
          }

          if (targetType === 'reg') {
            const req = await tlcStore.rejectRegistration(targetId, reason, true, interaction.user.username);
            await notifyRejectedRegistration(client, req);
            await sendLatestAuditLog(client);
            if (interaction.isFromMessage()) {
              await interaction.update(buildRegistrationReviewEmbed(req));
            } else {
              await interaction.reply({
                content: `Registration rejected. Reason: ${reason}`,
                ephemeral: true,
              });
            }
            return;
          }

          if (targetType === 'demande') {
            const res = await tlcStore.reviewDemande(
              targetId,
              'cancel',
              interaction.user.username,
              interaction.user.id,
              reason
            );
            await sendRejectionDm(client, res.request.playerDiscordUserId, reason);
            await sendLatestAuditLog(client);
            if (interaction.isFromMessage()) {
              await interaction.update(buildDemandeReviewPayload(res.request));
            } else {
              await interaction.reply({
                content: `Signing request rejected. Reason: ${reason}`,
                ephemeral: true,
              });
            }
            return;
          }

          if (targetType === 'transfer_reject' || targetType === 'transfer_cancel') {
            const dec = targetType === 'transfer_reject' ? 'reject' : 'cancel';
            const updated = await tlcStore.reviewTransferOffer(
              targetId,
              dec,
              interaction.user.username,
              reason
            );
            const player = tlcStore.getState().players.find((p) => p.tlcId === updated.playerTlcId);
            const mgr = tlcStore.getState().managers.find((m) => m.tlcId === updated.managerTlcId);
            await sendRejectionDm(client, player?.discordUserId, reason);
            await sendRejectionDm(client, mgr?.discordUserId, reason);
            await sendLatestAuditLog(client);
            if (interaction.isFromMessage()) {
              await interaction.update(buildTransferStaffReviewPayload(updated));
            } else {
              await interaction.reply({
                content: `Transfer request rejected. Reason: ${reason}`,
                ephemeral: true,
              });
            }
            return;
          }

          if (targetType === 'clubreg') {
            const res = await tlcStore.reviewClubRegistration(
              targetId,
              'cancel',
              interaction.user.username,
              reason
            );
            await sendRejectionDm(client, res.request.requestedByDiscordId, reason);
            await sendLatestAuditLog(client);
            if (interaction.isFromMessage()) {
              await interaction.update(buildClubRegistrationReviewPayload(res.request));
            } else {
              await interaction.reply({
                content: `Club registration rejected. Reason: ${reason}`,
                ephemeral: true,
              });
            }
            return;
          }

          if (targetType === 'compreg') {
            const reg = await tlcStore.reviewCompetitionRegistration(
              targetId,
              'reject',
              interaction.user.username,
              reason
            );
            const currentState = tlcStore.getState();
            const compName =
              currentState.competitions.find((c) => c.id === reg.competitionId)?.name || 'Competition';
            const mgr = currentState.managers.find((m) => m.tlcId === reg.managerTlcId);
            await sendRejectionDm(client, mgr?.discordUserId, reason);
            await sendLatestAuditLog(client);
            if (interaction.isFromMessage()) {
              await interaction.update(buildCompetitionRegistrationReviewPayload(reg, compName));
            } else {
              await interaction.reply({
                content: `Competition entry rejected. Reason: ${reason}`,
                ephemeral: true,
              });
            }
            return;
          }

          if (targetType === 'corr') {
            const corr = await tlcStore.reviewCorrectionRequest(
              targetId,
              'reject',
              interaction.user.username,
              reason
            );
            const currentState = tlcStore.getState();
            const profName =
              currentState.players.find((p) => p.tlcId === corr.tlcId)?.playerName ||
              currentState.managers.find((m) => m.tlcId === corr.tlcId)?.managerName ||
              corr.tlcId;
            await sendRejectionDm(client, corr.discordUserId, reason);
            await sendLatestAuditLog(client);
            if (interaction.isFromMessage()) {
              await interaction.update(buildCorrectionReviewPayload(corr, profName));
            } else {
              await interaction.reply({
                content: `Profile correction rejected. Reason: ${reason}`,
                ephemeral: true,
              });
            }
            return;
          }

          if (targetType === 'result') {
            const updated = await tlcStore.cancelMatchResult(targetId, interaction.user.username, reason);
            const currentState = tlcStore.getState();
            const h = currentState.clubs.find((c) => c.clubId === updated.homeClubId)?.name || 'Home';
            const a = currentState.clubs.find((c) => c.clubId === updated.awayClubId)?.name || 'Away';
            await sendRejectionDm(client, updated.resultSubmittedByDiscordId, reason);
            await sendLatestAuditLog(client);
            if (interaction.isFromMessage()) {
              await interaction.update(buildMatchResultReviewPayload(updated, h, a));
            } else {
              await interaction.reply({
                content: `Match result rejected. Reason: ${reason}`,
                ephemeral: true,
              });
            }
            return;
          }
        }

        if (interaction.customId.startsWith('tlc_sign_search_modal:')) {
          const clubId = interaction.customId.split(':')[1];
          const club = state.clubs.find((c) => c.clubId === clubId);
          if (!club) {
            await interaction.reply({ content: 'Club not found.', ephemeral: true });
            return;
          }
          const q = interaction.fields.getTextInputValue('search_query').trim().toLowerCase();
          const pos = interaction.fields.getTextInputValue('search_position').trim().toUpperCase();
          const matches = tlcStore.getActivePlayers().filter((p) => {
            if (p.currentClubId || (p.status !== 'Free Agent' && p.status !== 'Active')) return false;
            if (pos && p.position !== pos) return false;
            if (q && !p.playerName.toLowerCase().includes(q) && !p.tlcId.toLowerCase().includes(q)) {
              return false;
            }
            return true;
          });
          await interaction.reply(buildFreeAgentSignPickerPayload(club, matches, q, pos));
          return;
        }

        if (interaction.customId.startsWith('tlc_sign_offer_modal:')) {
          const [, clubId, playerTlcId] = interaction.customId.split(':');
          const club = state.clubs.find((c) => c.clubId === clubId);
          const player = tlcStore.getActivePlayers().find((p) => p.tlcId === playerTlcId);
          const mgr =
            tlcStore.getActiveManagers().find((m) => m.discordUserId === interaction.user.id) ||
            tlcStore.getActiveManagers().find((m) => m.tlcId === club?.currentManagerTlcId);

          if (!club || !player || !mgr) {
            await interaction.reply({
              content: 'Unable to resolve club, active player, or verified manager.',
              ephemeral: true,
            });
            return;
          }

          const rawType = interaction.fields.getTextInputValue('contract_type').trim().toLowerCase();
          const transferType = rawType.includes('loan') ? 'Loan' : 'Signing';
          const term = interaction.fields.getTextInputValue('contract_term').trim();
          const notes = interaction.fields.getTextInputValue('offer_details').trim();
          const details = [term, notes].filter(Boolean).join(' — ');

          const offer = await tlcStore.submitTransferOffer(
            {
              playerTlcId: player.tlcId,
              toClubId: club.clubId,
              managerTlcId: mgr.tlcId,
              transferType,
              details,
            },
            interaction.user.username
          );

          await dispatchTransferOfferToDiscord(offer);

          await interaction.reply({
            content: `Formal **${transferType}** offer sent to **${player.playerName}** (\`${player.tlcId}\`) for **${club.name}**.\nOnce accepted and approved, their roster, club role, and \`#transfer-market\` announcement will trigger automatically.`,
            ephemeral: true,
          });
          return;
        }
      }
    } catch (error: any) {
      console.error('[TLC Bot] Interaction error:', error);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction
          .reply({ content: error?.message || 'Unable to process interaction.', ephemeral: true })
          .catch(() => {});
      }
    } finally {
      activeInteractions.delete(lockKey);
    }
    });
  };

  wireClientEvents(client);

  try {
    await client.login(token);
    lastBotError = null;
    return { ok: true, message: 'Discord bot logged in and coming online.' };
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.toLowerCase().includes('disallowed intents')) {
      console.warn('[TLC Bot] GuildMembers intent disallowed; retrying with Guilds + GuildMessages.');
      client.destroy();
      client = createBotClient(false);
      wireClientEvents(client);
      try {
        await client.login(token);
        lastBotError = null;
        return {
          ok: true,
          message: 'Discord bot connected (without privileged GuildMembers intent).',
        };
      } catch (retryErr: any) {
        lastBotError = String(retryErr?.message || retryErr);
        console.error('[TLC Bot] Discord retry login failed:', retryErr);
        return { ok: false, message: lastBotError };
      }
    }
    lastBotError = msg;
    console.error('[TLC Bot] Discord login failed:', err);
    return { ok: false, message: lastBotError };
  }
}
