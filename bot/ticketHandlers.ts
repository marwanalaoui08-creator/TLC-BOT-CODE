import crypto from 'crypto';
import {
  AttachmentBuilder,
  CategoryChannel,
  ChannelType,
  Client,
  EmbedBuilder,
  GuildMember,
  Interaction,
  Message,
  OverwriteResolvable,
  PermissionFlagsBits,
  TextChannel,
} from 'discord.js';
import {
  ComplaintCategory,
  PlayerPosition,
  StaffDepartment,
  TicketCategoryKey,
  TicketEvidenceItem,
  TicketPriority,
  TicketQuestionType,
  TicketTranscriptEntry,
  UnifiedTicket,
} from '../src/shared/types.ts';
import {
  buildDiscordAttachmentFromMediaId,
  linkMediaAssetToTicket,
  persistDiscordAttachment,
  validateExternalMediaUrl,
} from '../server/services/mediaStorage.ts';
import { tlcStore } from '../server/store.ts';
import {
  buildCategoryEditModal,
  buildCloseConfirmationPayload,
  buildCoachRegDraftPayload,
  buildCoachRegModal,
  buildComplaintDraftPayload,
  buildDeleteTicketConfirmationPayload,
  buildDirectCategoryModal,
  buildDynamicQuestionModal,
  buildInsideTicketPayload,
  buildPlayerRegDraftPayload,
  buildPlayerRegModal,
  buildPlayerReportDraftPayload,
  buildPublicTicketPanelPayload,
  buildQuestionEditorModal,
  buildRegisterChoicePayload,
  buildStaffAppDraftPayload,
  buildStaffToolsPayload,
  buildTeamAppDraftPayload,
  buildTicketActionReasonModal,
  buildTicketFeedbackPromptPayload,
  buildTicketLogEmbed,
  buildTicketNamingModal,
  buildTicketPanelCopyModal,
  buildTicketSetupPayload,
  buildTicketStatsEmbed,
  formatTicketChannelName,
  formatTicketTranscriptText,
  getCategoryStaffRoleIds,
  getEffectiveTicketConfig,
  sanitizeChannelSlug,
  TicketDraft,
  TicketSetupSection,
} from './ticketEmbeds.ts';
import { buildAuditEmbed } from './embeds.ts';

interface PendingAttachmentUpload {
  mode: 'draft' | 'ticket';
  userId: string;
  channelId: string;
  draftId?: string;
  ticketId?: string;
  kind: 'avatar' | 'team_logo' | 'evidence';
  expiresAt: number;
}

const ticketDrafts = new Map<string, TicketDraft>();
const pendingAttachmentUploads = new Map<string, PendingAttachmentUpload>();

function isSeniorAdminMember(member: GuildMember | null): boolean {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const seniorRoles = tlcStore.getState().config.roles.seniorAdminRoleIds ?? [];
  return seniorRoles.some((rid) => member.roles.cache.has(rid));
}

function isAnyTicketStaff(member: GuildMember | null): boolean {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const r = tlcStore.getState().config.roles;
  const allRoleIds = new Set([
    ...(r.staffRoleIds ?? []),
    ...(r.supportRoleIds ?? []),
    ...(r.playerRegStaffRoleIds ?? []),
    ...(r.coachRegStaffRoleIds ?? []),
    ...(r.staffAppRoleIds ?? []),
    ...(r.complaintStaffRoleIds ?? []),
    ...(r.teamRegStaffRoleIds ?? []),
    ...(r.seniorAdminRoleIds ?? []),
    ...(r.disciplinaryRoleIds ?? []),
  ]);
  for (const rid of allRoleIds) {
    if (member.roles.cache.has(rid)) return true;
  }
  return false;
}

function isCategoryStaffForTicket(member: GuildMember | null, ticket: UnifiedTicket): boolean {
  if (!member) return false;
  if (isSeniorAdminMember(member)) return true;
  if (ticket.isAnonymous) {
    // Strictly senior admins + Discord Administrators for anonymous complaints
    return false;
  }
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const roleIds = getCategoryStaffRoleIds(tlcStore.getState().config, ticket);
  if (roleIds.some((rid) => member.roles.cache.has(rid))) return true;
  return (tlcStore.getState().config.roles.staffRoleIds ?? []).some((rid) =>
    member.roles.cache.has(rid)
  );
}

async function sendToChannelSafe(
  client: Client,
  channelId: string | undefined,
  payload: Parameters<TextChannel['send']>[0]
) {
  if (!channelId) return null;
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch && ch.isTextBased() && 'send' in ch) {
      return await (ch as TextChannel).send(payload);
    }
  } catch (err) {
    console.warn(`[TLC Tickets] Unable to send to channel ${channelId}:`, err);
  }
  return null;
}

async function emitLatestAudit(client: Client) {
  const state = tlcStore.getState();
  const latest = state.auditLogs[0];
  if (latest && state.config.channels.auditLogsId) {
    await sendToChannelSafe(client, state.config.channels.auditLogsId, {
      embeds: [buildAuditEmbed(latest)],
    });
  }
}

export async function publishTicketPanelToConfiguredChannel(client: Client): Promise<{
  ok: boolean;
  message: string;
}> {
  const state = tlcStore.getState();
  const panelChId = state.config.channels.ticketPanelId;
  if (!panelChId) {
    return {
      ok: false,
      message:
        'Ticket Panel Channel is not configured yet. Please select one in `/setup-tickets` first.',
    };
  }

  const ch = await client.channels.fetch(panelChId).catch(() => null);
  if (!ch || !ch.isTextBased() || !('send' in ch)) {
    return {
      ok: false,
      message: `Configured Ticket Panel Channel (<#${panelChId}>) could not be accessed.`,
    };
  }

  const textCh = ch as TextChannel;
  const payload = buildPublicTicketPanelPayload(state);
  const recent = await textCh.messages.fetch({ limit: 15 }).catch(() => null);
  const existingPanel = recent?.find(
    (m) =>
      m.author.id === client.user?.id &&
      m.components.some(
        (row) =>
          'components' in row &&
          Array.isArray(row.components) &&
          row.components.some(
            (c: unknown) =>
              typeof c === 'object' &&
              c !== null &&
              'customId' in c &&
              (c as { customId?: string }).customId === 'tlc_tkt_open_cat'
          )
      )
  );

  if (existingPanel) {
    await existingPanel.edit(payload);
    return { ok: true, message: `Updated existing Ticket Panel in <#${panelChId}>.` };
  }

  await textCh.send(payload);
  return { ok: true, message: `Published **TLC SUPPORT CENTER** panel in <#${panelChId}>.` };
}

function renderDraftPayload(draft: TicketDraft) {
  const tCfg = getEffectiveTicketConfig(tlcStore.getState());
  const cat = tCfg.categories.find((c) => c.key === draft.categoryKey);
  if (draft.categoryKey === 'register' && draft.applicationSubType === 'Coach') {
    return buildCoachRegDraftPayload(draft);
  }
  if (draft.categoryKey === 'register') {
    return buildPlayerRegDraftPayload(draft);
  }
  if (draft.categoryKey === 'staff_application') {
    return buildStaffAppDraftPayload(draft, cat?.questions || []);
  }
  if (draft.categoryKey === 'player_complaint') {
    return buildComplaintDraftPayload(draft, cat?.questions || []);
  }
  if (draft.categoryKey === 'create_team') {
    return buildTeamAppDraftPayload(draft, cat?.questions || []);
  }
  if (draft.categoryKey === 'player_report') {
    return buildPlayerReportDraftPayload(draft, cat?.questions || []);
  }
  return buildPlayerReportDraftPayload(draft, cat?.questions || []);
}

async function resolvePrimaryDiscordAttachmentForTicket(ticket: UnifiedTicket): Promise<{
  files: AttachmentBuilder[];
  previewUrl: string | null;
}> {
  const mediaId =
    ticket.metadata.avatarMediaId ||
    ticket.metadata.teamLogoMediaId ||
    ticket.evidence.find((e) => e.kind === 'media' && e.mediaAssetId)?.mediaAssetId;

  if (!mediaId) {
    return { files: [], previewUrl: null };
  }

  const built = await buildDiscordAttachmentFromMediaId(mediaId);
  if (!built) {
    return { files: [], previewUrl: null };
  }
  return {
    files: [built.attachment],
    previewUrl: built.isImage ? built.attachmentUrl : null,
  };
}

async function refreshInsideTicketPanelMessage(client: Client, ticket: UnifiedTicket) {
  if (!ticket.channelId || !ticket.panelMessageId) return;
  try {
    const ch = await client.channels.fetch(ticket.channelId);
    if (!ch || !ch.isTextBased() || !('messages' in ch)) return;
    const msg = await (ch as TextChannel).messages.fetch(ticket.panelMessageId).catch(() => null);
    if (!msg) return;

    const tCfg = getEffectiveTicketConfig(tlcStore.getState());
    const cat = tCfg.categories.find((c) => c.key === ticket.categoryKey);
    const { files, previewUrl } = await resolvePrimaryDiscordAttachmentForTicket(ticket);
    const payload = buildInsideTicketPayload(ticket, cat, previewUrl);
    await msg.edit({
      ...payload,
      files,
    });
  } catch (err) {
    console.warn(`[TLC Tickets] Unable to refresh ticket panel for ${ticket.ticketNumber}:`, err);
  }
}

async function openPrivateTicketChannel(
  client: Client,
  params: {
    guildId: string;
    creatorDiscordId: string;
    creatorUsername: string;
    creatorAvatarUrl?: string;
    categoryKey: TicketCategoryKey;
    applicationSubType?: 'Player' | 'Coach' | 'Staff' | 'Team' | null;
    staffDepartment?: StaffDepartment;
    complaintCategory?: ComplaintCategory;
    isAnonymous?: boolean;
    targetDiscordId?: string;
    targetUsername?: string;
    targetDisplayName?: string;
    answers: { questionId: string; label: string; answer: string }[];
    metadata: Record<string, string>;
    evidence: TicketEvidenceItem[];
    mediaIdsToLink?: string[];
  }
): Promise<UnifiedTicket> {
  const state = tlcStore.getState();
  const cfg = state.config;
  const tCfg = getEffectiveTicketConfig(state);
  const cat = tCfg.categories.find((c) => c.key === params.categoryKey);

  const isRegistrationCat =
    params.categoryKey === 'register' ||
    params.categoryKey === 'staff_application' ||
    params.categoryKey === 'create_team';

  const parentCategoryId = isRegistrationCat
    ? cfg.channels.registrationCategoryId || cfg.channels.ticketCategoryId
    : cfg.channels.ticketCategoryId || cfg.channels.registrationCategoryId;

  if (!parentCategoryId) {
    throw new Error(
      'Ticket Category / Registration Category is not configured yet. Please ask an administrator to run `/setup-tickets` and select existing Discord categories (the bot does not auto-create configuration categories).'
    );
  }

  const guild = await client.guilds.fetch(params.guildId);
  const parentChannel = await guild.channels.fetch(parentCategoryId).catch(() => null);
  if (!parentChannel || parentChannel.type !== ChannelType.GuildCategory) {
    throw new Error(
      `Configured Discord Category (<#${parentCategoryId}>) could not be found. Please update it in \`/setup-tickets\`.`
    );
  }

  const isComplaint =
    params.categoryKey === 'player_complaint' || params.categoryKey === 'player_report';
  const reserved = await tlcStore.reserveTicketIdentifiers(isComplaint);

  const channelName = formatTicketChannelName(
    tCfg.namingPattern,
    params.categoryKey,
    params.isAnonymous ? 'confidential' : params.creatorUsername,
    reserved.seqNum,
    params.applicationSubType
  );

  // Determine staff roles with access (anonymous complaints isolate to Senior Admins only)
  const tempTicketForRoles = {
    categoryKey: params.categoryKey,
    applicationSubType: params.applicationSubType ?? null,
    isAnonymous: Boolean(params.isAnonymous),
  } as UnifiedTicket;
  const staffRoleIds = Array.from(new Set(getCategoryStaffRoleIds(cfg, tempTicketForRoles)));

  const overwrites: OverwriteResolvable[] = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: params.creatorDiscordId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  if (client.user?.id) {
    overwrites.push({
      id: client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  for (const rid of staffRoleIds) {
    if (!rid || rid === guild.roles.everyone.id) continue;
    // Reported/target user's role shouldn't accidentally leak; only add valid guild roles
    if (guild.roles.cache.has(rid)) {
      overwrites.push({
        id: rid,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      });
    }
  }

  // Ensure reported user is explicitly denied if specified
  if (isComplaint && params.targetDiscordId && params.targetDiscordId !== params.creatorDiscordId) {
    overwrites.push({
      id: params.targetDiscordId,
      deny: [PermissionFlagsBits.ViewChannel],
    });
  }

  const createdChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: (parentChannel as CategoryChannel).id,
    topic: `TLC Support Ticket ${reserved.ticketNumber} | Category: ${cat?.label || params.categoryKey}`,
    permissionOverwrites: overwrites,
  });

  const ticket = await tlcStore.createUnifiedTicket({
    ticketNumber: reserved.ticketNumber,
    complaintId: reserved.complaintId,
    categoryKey: params.categoryKey,
    applicationSubType: params.applicationSubType ?? null,
    guildId: guild.id,
    channelId: createdChannel.id,
    channelName: createdChannel.name,
    creatorDiscordId: params.creatorDiscordId,
    creatorUsername: params.creatorUsername,
    creatorAvatarUrl: params.creatorAvatarUrl,
    isAnonymous: Boolean(params.isAnonymous),
    complaintCategory: params.complaintCategory,
    staffDepartment: params.staffDepartment,
    targetDiscordId: params.targetDiscordId,
    targetUsername: params.targetUsername,
    targetDisplayName: params.targetDisplayName,
    answers: params.answers,
    metadata: params.metadata,
    evidence: params.evidence,
  });

  for (const mId of params.mediaIdsToLink || []) {
    await linkMediaAssetToTicket(mId, ticket.id);
  }

  const { files, previewUrl } = await resolvePrimaryDiscordAttachmentForTicket(ticket);
  const insidePayload = buildInsideTicketPayload(ticket, cat, previewUrl);

  const staffPing =
    staffRoleIds.length > 0
      ? staffRoleIds
          .filter((id) => guild.roles.cache.has(id))
          .map((id) => `<@&${id}>`)
          .join(' ')
      : '';
  const userPing = params.isAnonymous ? 'Confidential Submitter' : `<@${params.creatorDiscordId}>`;

  const headerMsg = await createdChannel.send({
    content: `${userPing} ${staffPing}`.trim(),
    ...insidePayload,
    files,
  });

  await tlcStore.setTicketPanelMessageId(ticket.id, headerMsg.id);

  await sendToChannelSafe(client, cfg.channels.ticketLogId, {
    embeds: [
      buildTicketLogEmbed(
        'Ticket Opened',
        ticket,
        params.isAnonymous ? 'Anonymous User' : `@${params.creatorUsername}`,
        `Channel: <#${createdChannel.id}>`
      ),
    ],
  });

  if (isComplaint) {
    await sendToChannelSafe(client, cfg.channels.complaintLogId, {
      embeds: [
        buildTicketLogEmbed(
          'Complaint / Report Opened',
          ticket,
          params.isAnonymous ? 'Anonymous User' : `@${params.creatorUsername}`,
          `Complaint ID: \`${ticket.complaintId}\`\nChannel: <#${createdChannel.id}>`,
          0xdc2626
        ),
      ],
    });
  }

  await emitLatestAudit(client);
  return ticket;
}

async function applyRoleOnMember(
  client: Client,
  guildId: string,
  discordUserId: string,
  roleIds: string[],
  nickname?: string
) {
  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) return;
    if (nickname && member.manageable) {
      await member.setNickname(nickname.slice(0, 32)).catch(() => {});
    }
    for (const rid of roleIds) {
      if (rid && guild.roles.cache.has(rid)) {
        await member.roles.add(rid).catch(() => {});
      }
    }
    const unverifiedRole = tlcStore.getState().config.roles.unverifiedRoleId;
    if (unverifiedRole && member.roles.cache.has(unverifiedRole)) {
      await member.roles.remove(unverifiedRole).catch(() => {});
    }
  } catch (err) {
    console.warn(`[TLC Tickets] Could not assign Discord roles to ${discordUserId}:`, err);
  }
}

function getPositionRoleId(pos?: PlayerPosition): string {
  if (!pos) return '';
  const r = tlcStore.getState().config.roles;
  if (pos === 'GK') return r.goalkeeperRoleId;
  if (pos === 'CB' || pos === 'LB' || pos === 'RB') return r.defenderRoleId;
  if (pos === 'CDM' || pos === 'CM' || pos === 'CAM') return r.midfielderRoleId;
  return r.attackerRoleId;
}

export async function handleTicketMessageCreate(message: Message, client: Client): Promise<void> {
  if (message.author.bot || !message.guild) return;

  // 1. Check pending file upload for draft or ticket
  const pendingKey = `${message.author.id}:${message.channelId}`;
  const pending = pendingAttachmentUploads.get(pendingKey);
  if (pending && Date.now() < pending.expiresAt && message.attachments.size > 0) {
    try {
      const uploadedItems: TicketEvidenceItem[] = [];
      for (const [, att] of message.attachments) {
        const persisted = await persistDiscordAttachment({
          url: att.url,
          filename: att.name || 'upload.png',
          contentType: att.contentType,
          size: att.size,
          ownerDiscordId: message.author.id,
          ticketId: pending.ticketId ?? null,
          kind: pending.kind,
        });
        uploadedItems.push({
          id: `ev-${crypto.randomUUID().slice(0, 8)}`,
          kind: 'media',
          mediaAssetId: persisted.id,
          filename: persisted.filename,
          mimeType: persisted.mimeType,
          uploadedByDiscordId: message.author.id,
          uploadedByUsername: message.author.username,
          uploadedAt: new Date().toISOString(),
        });
      }

      if (pending.mode === 'draft' && pending.draftId) {
        const draft = ticketDrafts.get(pending.draftId);
        if (draft) {
          for (const item of uploadedItems) {
            if (item.mediaAssetId) {
              draft.uploadedMediaIds.push(item.mediaAssetId);
              draft.uploadedFileLabels.push(item.filename || item.mediaAssetId);
              if (!draft.primaryMediaId) draft.primaryMediaId = item.mediaAssetId;
            }
          }
          draft.awaitingAttachmentType = null;
        }
        pendingAttachmentUploads.delete(pendingKey);
        await message.delete().catch(() => {});
        const confirm = await (message.channel as TextChannel)
          .send(
            `✅ <@${message.author.id}> Uploaded & saved **${uploadedItems.map((i) => i.filename).join(', ')}** in original quality! Return to your application message above and click **Submit**.`
          )
          .catch(() => null);
        if (confirm) {
          setTimeout(() => void confirm.delete().catch(() => {}), 8000);
        }
        return;
      }

      if (pending.mode === 'ticket' && pending.ticketId) {
        let updatedTicket: UnifiedTicket | undefined;
        for (const item of uploadedItems) {
          updatedTicket = await tlcStore.addTicketEvidenceItem(pending.ticketId, item, {
            setAsAvatar: pending.kind === 'avatar',
            setAsTeamLogo: pending.kind === 'team_logo',
          });
        }
        pendingAttachmentUploads.delete(pendingKey);
        await message.react('✅').catch(() => {});
        if (updatedTicket) {
          await refreshInsideTicketPanelMessage(client, updatedTicket);
        }
        return;
      }
    } catch (err: any) {
      pendingAttachmentUploads.delete(pendingKey);
      const errMsg = await (message.channel as TextChannel)
        .send(`⚠️ Upload failed: ${err?.message || 'Unsupported attachment'}`)
        .catch(() => null);
      if (errMsg) setTimeout(() => void errMsg.delete().catch(() => {}), 8000);
      return;
    }
  }

  // 2. Live ticket transcript capture
  const ticket = tlcStore.getTicketByChannelId(message.channelId);
  if (!ticket || ticket.status === 'Closed') return;

  const member = message.member;
  const isStaff = isCategoryStaffForTicket(member, ticket);
  const attachments: TicketTranscriptEntry['attachments'] = [];

  for (const [, att] of message.attachments) {
    try {
      const persisted = await persistDiscordAttachment({
        url: att.url,
        filename: att.name || 'attachment',
        contentType: att.contentType,
        size: att.size,
        ownerDiscordId: message.author.id,
        ticketId: ticket.id,
        kind: 'transcript_attachment',
      });
      attachments.push({
        filename: persisted.filename,
        url: persisted.storageUrl || `/api/media/${persisted.id}`,
        mediaAssetId: persisted.id,
      });
      await tlcStore.addTicketEvidenceItem(ticket.id, {
        id: `ev-${crypto.randomUUID().slice(0, 8)}`,
        kind: 'media',
        mediaAssetId: persisted.id,
        filename: persisted.filename,
        mimeType: persisted.mimeType,
        uploadedByDiscordId: message.author.id,
        uploadedByUsername: message.author.username,
        uploadedAt: new Date().toISOString(),
      });
    } catch {
      attachments.push({
        filename: att.name || 'file',
        url: att.url,
      });
    }
  }

  await tlcStore.appendTicketTranscriptMessage(
    ticket.id,
    {
      id: message.id,
      authorDiscordId: message.author.id,
      authorUsername: message.author.username,
      isStaff,
      isBot: false,
      content: message.content || '',
      attachments,
      timestamp: message.createdAt.toISOString(),
    },
    isStaff
  );
}

export async function runTicketEscalationScan(client: Client): Promise<void> {
  if (!client.isReady()) return;
  const state = tlcStore.getState();
  const tCfg = getEffectiveTicketConfig(state);
  const reminderMs = Math.max(1, tCfg.inactivityReminderHours) * 3600000;
  const escalationMs = Math.max(1, tCfg.escalationHours) * 3600000;
  const now = Date.now();

  const active = (state.tickets ?? []).filter((t) =>
    ['Open', 'Claimed', 'Under Review', 'Waiting Info'].includes(t.status)
  );

  for (const ticket of active) {
    const lastActMs = new Date(ticket.lastActivityAt).getTime();
    const createdMs = new Date(ticket.createdAt).getTime();
    const lastRemMs = ticket.lastReminderAt ? new Date(ticket.lastReminderAt).getTime() : 0;

    // 1. Escalation if unanswered by staff past threshold
    if (
      !ticket.lastStaffReplyAt &&
      !ticket.escalatedAt &&
      Number.isFinite(createdMs) &&
      now - createdMs >= escalationMs
    ) {
      await tlcStore.markTicketAlertSent(ticket.id, 'escalation');
      const seniorPing = (state.config.roles.seniorAdminRoleIds ?? [])
        .map((id) => `<@&${id}>`)
        .join(' ');
      const escChannelId =
        state.config.channels.escalationChannelId || state.config.channels.ticketLogId;

      await sendToChannelSafe(client, escChannelId, {
        content: seniorPing || undefined,
        embeds: [
          buildTicketLogEmbed(
            'Escalation Alert — Unanswered Ticket',
            ticket,
            'Ticket Escalation Monitor',
            `This ticket in <#${ticket.channelId}> has had no staff reply for over **${tCfg.escalationHours} hour(s)**.`,
            0xd97706
          ),
        ],
      });
      await sendToChannelSafe(client, ticket.channelId, {
        content: `${seniorPing ? `${seniorPing} ` : ''}⏰ **Escalation Notice:** This ticket has been automatically flagged for senior administration review after **${tCfg.escalationHours} hour(s)** awaiting a staff response.`,
      });
    }

    // 2. Inactivity reminder
    if (
      Number.isFinite(lastActMs) &&
      now - lastActMs >= reminderMs &&
      (!lastRemMs || now - lastRemMs >= reminderMs)
    ) {
      await tlcStore.markTicketAlertSent(ticket.id, 'reminder');
      const ping = ticket.claimedByDiscordId
        ? `<@${ticket.claimedByDiscordId}>`
        : getCategoryStaffRoleIds(state.config, ticket)
            .slice(0, 2)
            .map((id) => `<@&${id}>`)
            .join(' ');
      await sendToChannelSafe(client, ticket.channelId, {
        content: `${ping ? `${ping} ` : ''}🔔 **Inactivity Reminder:** Ticket \`${ticket.ticketNumber}\` has had no activity for **${tCfg.inactivityReminderHours}+ hour(s)**. Please review or close if resolved.`,
      });
    }
  }
}

export async function handleTicketInteraction(
  interaction: Interaction,
  client: Client
): Promise<boolean> {
  const state = tlcStore.getState();

  // ==================== SLASH COMMANDS ====================
  if (interaction.isChatInputCommand()) {
    const cmd = interaction.commandName;
    if (cmd === 'setup-tickets') {
      const member = interaction.member as GuildMember | null;
      if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({
          content: 'Administrator permission is required to configure the Ticket System.',
          ephemeral: true,
        });
        return true;
      }
      await interaction.reply(buildTicketSetupPayload(state, 'channels_main'));
      return true;
    }

    if (cmd === 'ticket-panel') {
      const member = interaction.member as GuildMember | null;
      if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({
          content: 'Administrator permission is required to publish the Ticket Panel.',
          ephemeral: true,
        });
        return true;
      }
      const res = await publishTicketPanelToConfiguredChannel(client);
      await interaction.reply({ content: res.message, ephemeral: true });
      return true;
    }

    if (cmd === 'ticket-stats') {
      const member = interaction.member as GuildMember | null;
      if (!isAnyTicketStaff(member)) {
        await interaction.reply({
          content: 'Staff permissions are required to view `/ticket-stats`.',
          ephemeral: true,
        });
        return true;
      }
      const stats = tlcStore.getTicketStatistics();
      await interaction.reply({
        embeds: [buildTicketStatsEmbed(stats, state)],
        ephemeral: true,
      });
      return true;
    }
    return false;
  }

  // ==================== STRING SELECT MENUS ====================
  if (interaction.isStringSelectMenu()) {
    const id = interaction.customId;

    if (id === 'tlc_tkt_setup_sec') {
      const member = interaction.member as GuildMember | null;
      if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
        return true;
      }
      const sec = interaction.values[0] as TicketSetupSection;
      await interaction.update(buildTicketSetupPayload(state, sec));
      return true;
    }

    if (id.startsWith('tlc_tkt_cfg_cat_pick:')) {
      const member = interaction.member as GuildMember | null;
      if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
        return true;
      }
      const sec = id.split(':')[1] as TicketSetupSection;
      const catKey = interaction.values[0] as TicketCategoryKey;
      await interaction.update(buildTicketSetupPayload(state, sec, catKey));
      return true;
    }

    if (id.startsWith('tlc_tkt_cfg_q_pick:')) {
      const member = interaction.member as GuildMember | null;
      if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
        return true;
      }
      const catKey = id.split(':')[1] as TicketCategoryKey;
      const qId = interaction.values[0];
      await interaction.update(buildTicketSetupPayload(state, 'questions', catKey, qId));
      return true;
    }

    if (id === 'tlc_tkt_open_cat') {
      if (!interaction.guildId) return true;
      const catKey = interaction.values[0] as TicketCategoryKey;
      const check = tlcStore.checkUserCanOpenTicket(interaction.user.id, catKey);
      if (!check.ok) {
        await interaction.reply({ content: check.reason, ephemeral: true });
        return true;
      }

      const tCfg = getEffectiveTicketConfig(state);
      const cat = tCfg.categories.find((c) => c.key === catKey);
      if (!cat || !cat.enabled) {
        await interaction.reply({ content: 'This category is currently disabled.', ephemeral: true });
        return true;
      }

      if (catKey === 'register') {
        await interaction.reply(buildRegisterChoicePayload());
        return true;
      }

      if (catKey === 'general_inquiry' && cat.questions.length === 0) {
        await interaction.deferReply({ ephemeral: true });
        const created = await openPrivateTicketChannel(client, {
          guildId: interaction.guildId,
          creatorDiscordId: interaction.user.id,
          creatorUsername: interaction.user.username,
          creatorAvatarUrl: interaction.user.displayAvatarURL({ size: 512 }),
          categoryKey: 'general_inquiry',
          answers: [],
          metadata: {},
          evidence: [],
        });
        await interaction.editReply({
          content: `Your General Inquiry ticket **${created.ticketNumber}** has been opened: <#${created.channelId}>`,
        });
        return true;
      }

      if (
        catKey === 'staff_application' ||
        catKey === 'player_complaint' ||
        catKey === 'create_team' ||
        catKey === 'player_report' ||
        cat.questions.length > 5
      ) {
        const draftId = `drf-${crypto.randomUUID().slice(0, 8)}`;
        const draft: TicketDraft = {
          id: draftId,
          userId: interaction.user.id,
          username: interaction.user.username,
          guildId: interaction.guildId,
          categoryKey: catKey,
          applicationSubType:
            catKey === 'staff_application'
              ? 'Staff'
              : catKey === 'create_team'
              ? 'Team'
              : null,
          isAnonymous: false,
          answers: {},
          uploadedMediaIds: [],
          uploadedFileLabels: [],
          createdAt: Date.now(),
        };
        ticketDrafts.set(draftId, draft);
        await interaction.reply(renderDraftPayload(draft));
        return true;
      }

      // Direct 1-step modal for Team Support, Transfer Assistance, Other, or General Inquiry with <=5 custom questions
      if (cat.questions.length > 0) {
        await interaction.showModal(buildDirectCategoryModal(cat, 0));
        return true;
      }

      await interaction.deferReply({ ephemeral: true });
      const created = await openPrivateTicketChannel(client, {
        guildId: interaction.guildId,
        creatorDiscordId: interaction.user.id,
        creatorUsername: interaction.user.username,
        creatorAvatarUrl: interaction.user.displayAvatarURL({ size: 512 }),
        categoryKey: catKey,
        answers: [],
        metadata: {},
        evidence: [],
      });
      await interaction.editReply({
        content: `Your ticket **${created.ticketNumber}** has been opened: <#${created.channelId}>`,
      });
      return true;
    }

    if (id.startsWith('tlc_tkt_draft_pos:')) {
      const draftId = id.split(':')[1];
      const draft = ticketDrafts.get(draftId);
      if (!draft || draft.userId !== interaction.user.id) {
        await interaction.reply({ content: 'Application draft expired. Select the category again.', ephemeral: true });
        return true;
      }
      draft.position = interaction.values[0] as PlayerPosition;
      await interaction.update(renderDraftPayload(draft));
      return true;
    }

    if (id.startsWith('tlc_tkt_draft_dept:')) {
      const draftId = id.split(':')[1];
      const draft = ticketDrafts.get(draftId);
      if (!draft || draft.userId !== interaction.user.id) {
        await interaction.reply({ content: 'Application draft expired.', ephemeral: true });
        return true;
      }
      draft.staffDepartment = interaction.values[0] as StaffDepartment;
      await interaction.update(renderDraftPayload(draft));
      return true;
    }

    if (id.startsWith('tlc_tkt_draft_cmpcat:')) {
      const draftId = id.split(':')[1];
      const draft = ticketDrafts.get(draftId);
      if (!draft || draft.userId !== interaction.user.id) {
        await interaction.reply({ content: 'Complaint draft expired.', ephemeral: true });
        return true;
      }
      draft.complaintCategory = interaction.values[0] as ComplaintCategory;
      await interaction.update(renderDraftPayload(draft));
      return true;
    }

    if (id.startsWith('tlc_tkt_priority:')) {
      const ticketId = id.split(':')[1];
      const ticket = tlcStore.getTicketById(ticketId);
      if (!ticket || !isCategoryStaffForTicket(interaction.member as GuildMember, ticket)) {
        await interaction.reply({ content: 'Staff permissions required for this ticket.', ephemeral: true });
        return true;
      }
      const priority = interaction.values[0] as TicketPriority;
      const updated = await tlcStore.updateTicketStatusOrPriority(
        ticketId,
        { priority },
        interaction.user.username
      );
      await refreshInsideTicketPanelMessage(client, updated);
      await interaction.update(
        buildStaffToolsPayload(updated, getEffectiveTicketConfig(tlcStore.getState()).categories)
      );
      return true;
    }

    if (id.startsWith('tlc_tkt_transfer:')) {
      const ticketId = id.split(':')[1];
      const ticket = tlcStore.getTicketById(ticketId);
      if (!ticket || !isCategoryStaffForTicket(interaction.member as GuildMember, ticket)) {
        await interaction.reply({ content: 'Staff permissions required for this ticket.', ephemeral: true });
        return true;
      }
      const nextCat = interaction.values[0] as TicketCategoryKey;
      const updated = await tlcStore.transferTicketDepartment(
        ticketId,
        nextCat,
        interaction.user.username
      );
      await refreshInsideTicketPanelMessage(client, updated);
      await emitLatestAudit(client);
      await interaction.update(
        buildStaffToolsPayload(updated, getEffectiveTicketConfig(tlcStore.getState()).categories)
      );
      return true;
    }
  }

  // ==================== USER / ROLE SELECT MENUS ====================
  if (interaction.isUserSelectMenu()) {
    const id = interaction.customId;
    if (id.startsWith('tlc_tkt_draft_target:')) {
      const draftId = id.split(':')[1];
      const draft = ticketDrafts.get(draftId);
      if (!draft || draft.userId !== interaction.user.id) {
        await interaction.reply({ content: 'Draft expired.', ephemeral: true });
        return true;
      }
      const target = interaction.users.first();
      if (target) {
        draft.targetDiscordId = target.id;
        draft.targetUsername = target.username;
        draft.targetDisplayName = target.displayName;
      }
      await interaction.update(renderDraftPayload(draft));
      return true;
    }

    if (id.startsWith('tlc_tkt_draft_owner:')) {
      const draftId = id.split(':')[1];
      const draft = ticketDrafts.get(draftId);
      if (!draft || draft.userId !== interaction.user.id) {
        await interaction.reply({ content: 'Draft expired.', ephemeral: true });
        return true;
      }
      const owner = interaction.users.first();
      if (owner) {
        draft.teamOwnerDiscordId = owner.id;
        draft.teamOwnerUsername = owner.username;
      }
      await interaction.update(renderDraftPayload(draft));
      return true;
    }

    if (id.startsWith('tlc_tkt_add_member:') || id.startsWith('tlc_tkt_rem_member:')) {
      const isAdd = id.startsWith('tlc_tkt_add_member:');
      const ticketId = id.split(':')[1];
      const ticket = tlcStore.getTicketById(ticketId);
      if (!ticket || !isCategoryStaffForTicket(interaction.member as GuildMember, ticket)) {
        await interaction.reply({ content: 'Staff permissions required.', ephemeral: true });
        return true;
      }
      const target = interaction.users.first();
      if (!target) return true;

      const updated = isAdd
        ? await tlcStore.addTicketParticipant(ticketId, target.id, interaction.user.username)
        : await tlcStore.removeTicketParticipant(ticketId, target.id, interaction.user.username);

      const ch = await client.channels.fetch(updated.channelId).catch(() => null);
      if (ch && ch.type === ChannelType.GuildText) {
        if (isAdd) {
          await ch.permissionOverwrites.edit(target.id, {
            ViewChannel: true,
            SendMessages: true,
            AttachFiles: true,
            ReadMessageHistory: true,
          });
          await ch.send(`➕ <@${target.id}> was added to this ticket by <@${interaction.user.id}>.`);
        } else {
          await ch.permissionOverwrites.delete(target.id).catch(() => {});
          await ch.send(`➖ <@${target.id}> was removed from this ticket by <@${interaction.user.id}>.`);
        }
      }
      await emitLatestAudit(client);
      await interaction.update(
        buildStaffToolsPayload(updated, getEffectiveTicketConfig(tlcStore.getState()).categories)
      );
      return true;
    }
  }

  if (interaction.isRoleSelectMenu()) {
    const id = interaction.customId;
    if (id.startsWith('tlc_tkt_draft_teamrole:')) {
      const draftId = id.split(':')[1];
      const draft = ticketDrafts.get(draftId);
      if (!draft || draft.userId !== interaction.user.id) {
        await interaction.reply({ content: 'Draft expired.', ephemeral: true });
        return true;
      }
      draft.teamRoleId = interaction.values[0];
      await interaction.update(renderDraftPayload(draft));
      return true;
    }
  }

  // ==================== BUTTONS ====================
  if (interaction.isButton()) {
    const id = interaction.customId;

    if (id === 'tlc_tkt_publish_panel') {
      const member = interaction.member as GuildMember | null;
      if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
        return true;
      }
      const res = await publishTicketPanelToConfiguredChannel(client);
      await interaction.reply({ content: res.message, ephemeral: true });
      return true;
    }

    if (id === 'tlc_tkt_edit_naming') {
      const member = interaction.member as GuildMember | null;
      if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
        return true;
      }
      await interaction.showModal(buildTicketNamingModal(getEffectiveTicketConfig(state)));
      return true;
    }

    if (id === 'tlc_tkt_edit_panel_copy') {
      const member = interaction.member as GuildMember | null;
      if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
        return true;
      }
      await interaction.showModal(buildTicketPanelCopyModal(getEffectiveTicketConfig(state)));
      return true;
    }

    if (id.startsWith('tlc_tkt_cfg_cat_toggle:')) {
      if (!(interaction.member as GuildMember)?.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
        return true;
      }
      const key = id.split(':')[1] as TicketCategoryKey;
      await tlcStore.toggleTicketCategory(key, interaction.user.username);
      await interaction.update(buildTicketSetupPayload(tlcStore.getState(), 'categories', key));
      return true;
    }

    if (id.startsWith('tlc_tkt_cfg_cat_reqev:')) {
      if (!(interaction.member as GuildMember)?.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
        return true;
      }
      const key = id.split(':')[1] as TicketCategoryKey;
      const cat = getEffectiveTicketConfig(state).categories.find((c) => c.key === key);
      if (cat) {
        await tlcStore.updateTicketCategoryMeta(
          key,
          { requireEvidence: !cat.requireEvidence },
          interaction.user.username
        );
      }
      await interaction.update(buildTicketSetupPayload(tlcStore.getState(), 'categories', key));
      return true;
    }

    if (id.startsWith('tlc_tkt_cfg_cat_edit:')) {
      if (!(interaction.member as GuildMember)?.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
        return true;
      }
      const key = id.split(':')[1] as TicketCategoryKey;
      const cat = getEffectiveTicketConfig(state).categories.find((c) => c.key === key);
      if (!cat) return true;
      await interaction.showModal(buildCategoryEditModal(cat));
      return true;
    }

    if (id.startsWith('tlc_tkt_cfg_cat_move:')) {
      if (!(interaction.member as GuildMember)?.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
        return true;
      }
      const [, key, dir] = id.split(':');
      await tlcStore.moveTicketCategory(
        key as TicketCategoryKey,
        dir as 'up' | 'down',
        interaction.user.username
      );
      await interaction.update(
        buildTicketSetupPayload(tlcStore.getState(), 'categories', key as TicketCategoryKey)
      );
      return true;
    }

    if (id.startsWith('tlc_tkt_cfg_open_qs:')) {
      if (!(interaction.member as GuildMember)?.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
        return true;
      }
      const key = id.split(':')[1] as TicketCategoryKey;
      await interaction.update(buildTicketSetupPayload(state, 'questions', key));
      return true;
    }

    if (id.startsWith('tlc_tkt_cfg_q_add:')) {
      if (!(interaction.member as GuildMember)?.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
        return true;
      }
      const key = id.split(':')[1] as TicketCategoryKey;
      await interaction.showModal(buildQuestionEditorModal(key));
      return true;
    }

    if (id.startsWith('tlc_tkt_cfg_q_edit:')) {
      if (!(interaction.member as GuildMember)?.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
        return true;
      }
      const [, key, qId] = id.split(':');
      const cat = getEffectiveTicketConfig(state).categories.find((c) => c.key === key);
      const q = cat?.questions.find((item) => item.id === qId);
      if (!q) return true;
      await interaction.showModal(buildQuestionEditorModal(key as TicketCategoryKey, q));
      return true;
    }

    if (id.startsWith('tlc_tkt_cfg_q_move:')) {
      if (!(interaction.member as GuildMember)?.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
        return true;
      }
      const [, key, qId, dir] = id.split(':');
      await tlcStore.moveTicketCategoryQuestion(
        key as TicketCategoryKey,
        qId,
        dir as 'up' | 'down',
        interaction.user.username
      );
      await interaction.update(
        buildTicketSetupPayload(tlcStore.getState(), 'questions', key as TicketCategoryKey, qId)
      );
      return true;
    }

    if (id.startsWith('tlc_tkt_cfg_q_del:')) {
      if (!(interaction.member as GuildMember)?.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Administrator permission required.', ephemeral: true });
        return true;
      }
      const [, key, qId] = id.split(':');
      await tlcStore.removeTicketCategoryQuestion(
        key as TicketCategoryKey,
        qId,
        interaction.user.username
      );
      await interaction.update(
        buildTicketSetupPayload(tlcStore.getState(), 'questions', key as TicketCategoryKey)
      );
      return true;
    }

    // Registration Subtype Choice (Player or Coach ONLY)
    if (id.startsWith('tlc_tkt_reg_type:')) {
      if (!interaction.guildId) return true;
      const subType = id.split(':')[1] as 'Player' | 'Coach';
      const check = tlcStore.checkUserCanOpenTicket(interaction.user.id, 'register', subType);
      if (!check.ok) {
        await interaction.reply({ content: check.reason, ephemeral: true });
        return true;
      }
      const draftId = `drf-${crypto.randomUUID().slice(0, 8)}`;
      const draft: TicketDraft = {
        id: draftId,
        userId: interaction.user.id,
        username: interaction.user.username,
        guildId: interaction.guildId,
        categoryKey: 'register',
        applicationSubType: subType,
        isAnonymous: false,
        answers: {},
        uploadedMediaIds: [],
        uploadedFileLabels: [],
        createdAt: Date.now(),
      };
      ticketDrafts.set(draftId, draft);
      await interaction.update(renderDraftPayload(draft));
      return true;
    }

    // Draft Form Buttons
    if (id.startsWith('tlc_tkt_draft_form:')) {
      const [, draftId, formKind] = id.split(':');
      const draft = ticketDrafts.get(draftId);
      if (!draft || draft.userId !== interaction.user.id) {
        await interaction.reply({ content: 'Draft expired. Please open the ticket panel again.', ephemeral: true });
        return true;
      }
      if (formKind === 'player_reg') {
        await interaction.showModal(buildPlayerRegModal(draft));
      } else {
        await interaction.showModal(buildCoachRegModal(draft));
      }
      return true;
    }

    if (id.startsWith('tlc_tkt_draft_qpage:')) {
      const [, draftId, pageStr] = id.split(':');
      const draft = ticketDrafts.get(draftId);
      if (!draft || draft.userId !== interaction.user.id) {
        await interaction.reply({ content: 'Draft expired.', ephemeral: true });
        return true;
      }
      const cat = getEffectiveTicketConfig(state).categories.find(
        (c) => c.key === draft.categoryKey
      );
      await interaction.showModal(
        buildDynamicQuestionModal(
          draftId,
          `${cat?.label || 'Form'} (Part ${Number(pageStr) + 1})`,
          cat?.questions || [],
          Number(pageStr) || 0,
          draft.answers
        )
      );
      return true;
    }

    if (id.startsWith('tlc_tkt_draft_anon:')) {
      const draftId = id.split(':')[1];
      const draft = ticketDrafts.get(draftId);
      if (!draft || draft.userId !== interaction.user.id) {
        await interaction.reply({ content: 'Draft expired.', ephemeral: true });
        return true;
      }
      draft.isAnonymous = !draft.isAnonymous;
      await interaction.update(renderDraftPayload(draft));
      return true;
    }

    if (id.startsWith('tlc_tkt_draft_upload:')) {
      const [, draftId, kind] = id.split(':');
      const draft = ticketDrafts.get(draftId);
      if (!draft || draft.userId !== interaction.user.id) {
        await interaction.reply({ content: 'Draft expired.', ephemeral: true });
        return true;
      }
      const uploadKind = kind as 'avatar' | 'team_logo' | 'evidence';
      draft.awaitingAttachmentType = uploadKind;
      pendingAttachmentUploads.set(`${interaction.user.id}:${interaction.channelId}`, {
        mode: 'draft',
        userId: interaction.user.id,
        channelId: interaction.channelId,
        draftId: draft.id,
        kind: uploadKind,
        expiresAt: Date.now() + 90000,
      });
      await interaction.update(renderDraftPayload(draft));
      return true;
    }

    if (id.startsWith('tlc_tkt_draft_submit:')) {
      const draftId = id.split(':')[1];
      const draft = ticketDrafts.get(draftId);
      if (!draft || draft.userId !== interaction.user.id) {
        await interaction.reply({ content: 'Draft expired. Please reopen from the Ticket Panel.', ephemeral: true });
        return true;
      }

      const check = tlcStore.checkUserCanOpenTicket(
        interaction.user.id,
        draft.categoryKey,
        draft.applicationSubType
      );
      if (!check.ok) {
        await interaction.reply({ content: check.reason, ephemeral: true });
        return true;
      }

      const cat = getEffectiveTicketConfig(state).categories.find(
        (c) => c.key === draft.categoryKey
      );
      if (
        cat?.requireEvidence &&
        draft.uploadedMediaIds.length === 0 &&
        !draft.primaryImageUrl &&
        !draft.answers.rep_evidence_url
      ) {
        await interaction.reply({
          content: 'Evidence or an image attachment is required for this category before submitting.',
          ephemeral: true,
        });
        return true;
      }

      await interaction.deferUpdate();

      const structuredAnswers: { questionId: string; label: string; answer: string }[] = [];
      const metadata: Record<string, string> = {};

      if (draft.categoryKey === 'register' && draft.applicationSubType === 'Player') {
        metadata.fullName = draft.answers.fullName || draft.username;
        if (draft.position) metadata.position = draft.position;
        if (draft.primaryImageUrl) metadata.avatarUrl = draft.primaryImageUrl;
        if (draft.primaryMediaId) metadata.avatarMediaId = draft.primaryMediaId;
        if (draft.answers.additionalInfo) metadata.additionalInfo = draft.answers.additionalInfo;
        structuredAnswers.push(
          { questionId: 'fullName', label: 'Full / Player Name', answer: metadata.fullName },
          ...(draft.position
            ? [{ questionId: 'position', label: 'Position', answer: draft.position }]
            : []),
          ...(draft.answers.additionalInfo
            ? [
                {
                  questionId: 'additionalInfo',
                  label: 'Additional Info',
                  answer: draft.answers.additionalInfo,
                },
              ]
            : [])
        );
      } else if (draft.categoryKey === 'register' && draft.applicationSubType === 'Coach') {
        metadata.fullName = draft.answers.fullName || draft.username;
        metadata.coachingExperience = draft.answers.coachingExperience || '';
        if (draft.answers.previousTeams) metadata.previousTeams = draft.answers.previousTeams;
        if (draft.primaryImageUrl) metadata.avatarUrl = draft.primaryImageUrl;
        if (draft.primaryMediaId) metadata.avatarMediaId = draft.primaryMediaId;
        if (draft.answers.additionalInfo) metadata.additionalInfo = draft.answers.additionalInfo;
        structuredAnswers.push(
          { questionId: 'fullName', label: 'Full Name', answer: metadata.fullName },
          {
            questionId: 'coachingExperience',
            label: 'Coaching Experience',
            answer: metadata.coachingExperience,
          },
          ...(metadata.previousTeams
            ? [{ questionId: 'previousTeams', label: 'Previous Teams', answer: metadata.previousTeams }]
            : []),
          ...(metadata.additionalInfo
            ? [{ questionId: 'additionalInfo', label: 'Additional Info', answer: metadata.additionalInfo }]
            : [])
        );
      } else {
        for (const q of cat?.questions || []) {
          if (draft.answers[q.id]?.trim()) {
            structuredAnswers.push({
              questionId: q.id,
              label: q.label,
              answer: draft.answers[q.id].trim(),
            });
          }
        }
        if (draft.categoryKey === 'create_team') {
          metadata.teamName = draft.answers.team_name || '';
          metadata.teamEmoji = draft.answers.team_emoji || '⚽';
          metadata.teamOwnerDiscordId = draft.teamOwnerDiscordId || draft.userId;
          metadata.teamOwnerUsername = draft.teamOwnerUsername || draft.username;
          if (draft.teamRoleId) metadata.teamRoleId = draft.teamRoleId;
          if (draft.primaryMediaId) metadata.teamLogoMediaId = draft.primaryMediaId;
          if (draft.answers.team_additional && draft.answers.team_additional.startsWith('http')) {
            try {
              metadata.teamLogoUrl = validateExternalMediaUrl(draft.answers.team_additional);
            } catch {
              // ignore non-URL text
            }
          }
        }
      }

      const evidence: TicketEvidenceItem[] = draft.uploadedMediaIds.map((mId, idx) => ({
        id: `ev-${crypto.randomUUID().slice(0, 8)}`,
        kind: 'media',
        mediaAssetId: mId,
        filename: draft.uploadedFileLabels[idx] || 'uploaded_file',
        uploadedByDiscordId: draft.userId,
        uploadedByUsername: draft.username,
        uploadedAt: new Date().toISOString(),
      }));

      if (draft.primaryImageUrl) {
        evidence.push({
          id: `ev-${crypto.randomUUID().slice(0, 8)}`,
          kind: 'url',
          url: draft.primaryImageUrl,
          uploadedByDiscordId: draft.userId,
          uploadedByUsername: draft.username,
          uploadedAt: new Date().toISOString(),
        });
      }
      if (draft.answers.rep_evidence_url?.trim()) {
        evidence.push({
          id: `ev-${crypto.randomUUID().slice(0, 8)}`,
          kind: 'url',
          url: draft.answers.rep_evidence_url.trim(),
          uploadedByDiscordId: draft.userId,
          uploadedByUsername: draft.username,
          uploadedAt: new Date().toISOString(),
        });
      }

      const created = await openPrivateTicketChannel(client, {
        guildId: draft.guildId,
        creatorDiscordId: draft.userId,
        creatorUsername: draft.username,
        creatorAvatarUrl: interaction.user.displayAvatarURL({ size: 512 }),
        categoryKey: draft.categoryKey,
        applicationSubType: draft.applicationSubType ?? null,
        staffDepartment: draft.staffDepartment,
        complaintCategory: draft.complaintCategory,
        isAnonymous: draft.isAnonymous,
        targetDiscordId: draft.targetDiscordId,
        targetUsername: draft.targetUsername,
        targetDisplayName: draft.targetDisplayName,
        answers: structuredAnswers,
        metadata,
        evidence,
        mediaIdsToLink: draft.uploadedMediaIds,
      });

      ticketDrafts.delete(draftId);
      await interaction.editReply({
        content: `✅ Your ticket **${created.ticketNumber}** has been created: <#${created.channelId}>`,
        embeds: [],
        components: [],
      });
      return true;
    }

    // ==================== INSIDE-TICKET MANAGEMENT & DECISION BUTTONS ====================
    if (id.startsWith('tlc_tkt_act:')) {
      const [, act, ticketId] = id.split(':');
      const ticket = tlcStore.getTicketById(ticketId);
      if (!ticket) {
        await interaction.reply({ content: 'Ticket record not found.', ephemeral: true });
        return true;
      }

      const member = interaction.member as GuildMember | null;

      if (act === 'reveal_anon') {
        if (!isSeniorAdminMember(member)) {
          await interaction.reply({
            content: 'Only authorized Senior Administrators can view confidential complainant identities.',
            ephemeral: true,
          });
          return true;
        }
        await interaction.reply({
          content: `🔒 **Confidential Identity (${ticket.complaintId || ticket.ticketNumber}):**\nSubmitted by <@${ticket.creatorDiscordId}> (@${ticket.creatorUsername})`,
          ephemeral: true,
        });
        return true;
      }

      if (act === 'addevidence') {
        if (
          interaction.user.id !== ticket.creatorDiscordId &&
          !isCategoryStaffForTicket(member, ticket)
        ) {
          await interaction.reply({
            content: 'Only the ticket creator or assigned staff can upload files here.',
            ephemeral: true,
          });
          return true;
        }
        const kind =
          ticket.categoryKey === 'register'
            ? 'avatar'
            : ticket.categoryKey === 'create_team'
            ? 'team_logo'
            : 'evidence';
        pendingAttachmentUploads.set(`${interaction.user.id}:${interaction.channelId}`, {
          mode: 'ticket',
          userId: interaction.user.id,
          channelId: interaction.channelId,
          ticketId: ticket.id,
          kind,
          expiresAt: Date.now() + 90000,
        });
        await interaction.reply({
          content:
            '📤 **Upload Ready (90 seconds):** Send a message in this ticket channel with your image or video attachment (PNG/JPG/WEBP/GIF/MP4/WEBM/MOV). It will be saved in original quality to PostgreSQL and attached to this ticket.',
          ephemeral: true,
        });
        return true;
      }

      if (act === 'close') {
        if (
          interaction.user.id !== ticket.creatorDiscordId &&
          !isCategoryStaffForTicket(member, ticket)
        ) {
          await interaction.reply({
            content: 'Only the ticket creator or assigned staff can close this ticket.',
            ephemeral: true,
          });
          return true;
        }
        await interaction.reply(buildCloseConfirmationPayload(ticket));
        return true;
      }

      // All remaining actions strictly require category staff
      if (!isCategoryStaffForTicket(member, ticket)) {
        await interaction.reply({
          content: 'You do not have staff permissions for this ticket category.',
          ephemeral: true,
        });
        return true;
      }

      if (act === 'claim') {
        const updated = await tlcStore.claimTicket(
          ticket.id,
          interaction.user.id,
          interaction.user.username
        );
        await refreshInsideTicketPanelMessage(client, updated);
        await emitLatestAudit(client);
        await interaction.reply({
          content: `✋ Ticket **${updated.ticketNumber}** claimed by <@${interaction.user.id}>.`,
        });
        return true;
      }

      if (act === 'unclaim') {
        const updated = await tlcStore.unclaimTicket(ticket.id, interaction.user.username);
        await refreshInsideTicketPanelMessage(client, updated);
        await emitLatestAudit(client);
        await interaction.reply({
          content: `Ticket **${updated.ticketNumber}** is now unclaimed.`,
        });
        return true;
      }

      if (act === 'under_review') {
        const updated = await tlcStore.updateTicketStatusOrPriority(
          ticket.id,
          { status: 'Under Review' },
          interaction.user.username
        );
        await refreshInsideTicketPanelMessage(client, updated);
        await emitLatestAudit(client);
        await interaction.reply({
          content: `🔎 Ticket **${updated.ticketNumber}** marked as **Under Review** by <@${interaction.user.id}>.`,
        });
        return true;
      }

      if (act === 'stafftools') {
        const cats = getEffectiveTicketConfig(state).categories;
        await interaction.reply(buildStaffToolsPayload(ticket, cats));
        return true;
      }

      if (act === 'reqinfo' || act === 'reject' || act === 'dismiss' || act === 'resolve' || act === 'addnote' || act === 'rename') {
        const currentVal = act === 'rename' ? ticket.channelName : undefined;
        await interaction.showModal(buildTicketActionReasonModal(act, ticket.id, currentVal));
        return true;
      }

      if (act === 'delete') {
        await interaction.reply(buildDeleteTicketConfirmationPayload(ticket));
        return true;
      }

      if (act === 'reopen') {
        const updated = await tlcStore.reopenTicket(
          ticket.id,
          interaction.user.id,
          interaction.user.username
        );
        const ch = await client.channels.fetch(updated.channelId).catch(() => null);
        if (ch && ch.type === ChannelType.GuildText) {
          await ch.permissionOverwrites
            .edit(updated.creatorDiscordId, {
              ViewChannel: true,
              SendMessages: true,
              AttachFiles: true,
            })
            .catch(() => {});
        }
        await refreshInsideTicketPanelMessage(client, updated);
        await emitLatestAudit(client);
        await interaction.reply({
          content: `🔓 Ticket **${updated.ticketNumber}** reopened by <@${interaction.user.id}>.`,
        });
        return true;
      }

      if (act === 'approve') {
        await interaction.deferReply({ ephemeral: true });
        const cfg = tlcStore.getState().config;

        if (ticket.categoryKey === 'register' && ticket.applicationSubType === 'Player') {
          const { ticket: updated, player } = await tlcStore.approvePlayerRegistrationTicket(
            ticket.id,
            interaction.user.id,
            interaction.user.username
          );
          const posRole = getPositionRoleId(player.position);
          await applyRoleOnMember(
            client,
            updated.guildId,
            updated.creatorDiscordId,
            [cfg.roles.verifiedRoleId, cfg.roles.playerRoleId, posRole].filter(Boolean),
            player.playerName
          );
          await refreshInsideTicketPanelMessage(client, updated);
          await sendToChannelSafe(client, updated.channelId, {
            content: `✅ **Player Registration Approved!** <@${updated.creatorDiscordId}> now holds official TLC Player ID \`${player.tlcId}\` (${player.position}).`,
          });
          await sendToChannelSafe(client, cfg.channels.applicationLogId, {
            embeds: [
              buildTicketLogEmbed(
                'Player Registration Approved',
                updated,
                `@${interaction.user.username}`,
                `Assigned TLC ID: \`${player.tlcId}\` (${player.position})`,
                0x059669
              ),
            ],
          });
          await emitLatestAudit(client);
          await interaction.editReply(`Approved Player Registration for **${player.playerName}** (\`${player.tlcId}\`).`);
          return true;
        }

        if (ticket.categoryKey === 'register' && ticket.applicationSubType === 'Coach') {
          const { ticket: updated, coach } = await tlcStore.approveCoachRegistrationTicket(
            ticket.id,
            interaction.user.id,
            interaction.user.username
          );
          await applyRoleOnMember(
            client,
            updated.guildId,
            updated.creatorDiscordId,
            [cfg.roles.verifiedRoleId, cfg.roles.coachRoleId || ''].filter(Boolean),
            coach.coachName
          );
          await refreshInsideTicketPanelMessage(client, updated);
          await sendToChannelSafe(client, updated.channelId, {
            content: `✅ **Coach Registration Approved!** <@${updated.creatorDiscordId}> now holds official TLC Coach ID \`${coach.tlcId}\`.`,
          });
          await sendToChannelSafe(client, cfg.channels.applicationLogId, {
            embeds: [
              buildTicketLogEmbed(
                'Coach Registration Approved',
                updated,
                `@${interaction.user.username}`,
                `Assigned Official Coach ID: \`${coach.tlcId}\` (No Player profile created)`,
                0x2563eb
              ),
            ],
          });
          await emitLatestAudit(client);
          await interaction.editReply(`Approved Coach Registration for **${coach.coachName}** (\`${coach.tlcId}\`).`);
          return true;
        }

        if (ticket.categoryKey === 'staff_application') {
          const updated = await tlcStore.acceptStaffApplicationTicket(
            ticket.id,
            interaction.user.id,
            interaction.user.username
          );
          await refreshInsideTicketPanelMessage(client, updated);
          await sendToChannelSafe(client, updated.channelId, {
            content: `✅ **Staff Application Accepted!** Congratulations <@${updated.creatorDiscordId}>! An administrator will complete your manual Discord onboarding shortly.`,
          });
          await sendToChannelSafe(client, cfg.channels.applicationLogId, {
            embeds: [
              buildTicketLogEmbed(
                'Staff Application Accepted',
                updated,
                `@${interaction.user.username}`,
                `Department: ${updated.staffDepartment || 'Administration'} (Admin permissions NOT auto-granted)`,
                0x059669
              ),
            ],
          });
          await emitLatestAudit(client);
          await interaction.editReply(`Accepted Staff Application \`${updated.ticketNumber}\`.`);
          return true;
        }

        if (ticket.categoryKey === 'create_team') {
          const { ticket: updated, club, pendingRoleLink } =
            await tlcStore.approveTeamCreationTicket(
              ticket.id,
              interaction.user.id,
              interaction.user.username
            );
          if (club && club.discordRoleId && club.ownerDiscordUserId) {
            await applyRoleOnMember(client, updated.guildId, club.ownerDiscordUserId, [
              club.discordRoleId,
            ]);
          }
          await refreshInsideTicketPanelMessage(client, updated);
          await sendToChannelSafe(client, updated.channelId, {
            content: club
              ? `✅ **Team Creation Approved!** Official club **${club.logoEmoji || ''} ${club.name}** (\`${club.clubId}\`) has been registered and linked to <@&${club.discordRoleId}>!`
              : `✅ **Team Application Approved!** No existing Discord role was attached to the application. An administrator can finish linking the Discord role via \`/create-team\` or \`/setup\`.`,
          });
          await sendToChannelSafe(client, cfg.channels.applicationLogId, {
            embeds: [
              buildTicketLogEmbed(
                'Team Creation Approved',
                updated,
                `@${interaction.user.username}`,
                club
                  ? `Created Club: **${club.name}** (\`${club.clubId}\`)`
                  : `Team "${updated.metadata.teamName}" approved (pending Discord role link).`,
                0x059669
              ),
            ],
          });
          await emitLatestAudit(client);
          await interaction.editReply(
            pendingRoleLink
              ? `Approved team "${updated.metadata.teamName}". Remind an admin to link its Discord role.`
              : `Approved and created official club **${club?.name}** (\`${club?.clubId}\`).`
          );
          return true;
        }

        await interaction.editReply('This ticket type does not use application approval.');
        return true;
      }
    }

    if (id.startsWith('tlc_tkt_confirm_close:')) {
      const ticketId = id.split(':')[1];
      const ticket = tlcStore.getTicketById(ticketId);
      if (!ticket) {
        await interaction.reply({ content: 'Ticket not found.', ephemeral: true });
        return true;
      }
      await interaction.deferUpdate();

      const ch = await client.channels.fetch(ticket.channelId).catch(() => null);
      const fetchedTranscript: TicketTranscriptEntry[] = [];
      if (ch && ch.type === ChannelType.GuildText) {
        const msgs = await ch.messages.fetch({ limit: 100 }).catch(() => null);
        if (msgs) {
          for (const [, m] of Array.from(msgs.entries()).reverse()) {
            fetchedTranscript.push({
              id: m.id,
              authorDiscordId: m.author.id,
              authorUsername: m.author.username,
              isStaff: !m.author.bot && isCategoryStaffForTicket(m.member, ticket),
              isBot: m.author.bot,
              content: m.content || (m.embeds[0]?.title ? `[Embed: ${m.embeds[0].title}]` : ''),
              attachments: Array.from(m.attachments.values()).map((a) => ({
                filename: a.name || 'file',
                url: a.url,
              })),
              timestamp: m.createdAt.toISOString(),
            });
          }
        }
        await ch.permissionOverwrites
          .edit(ticket.creatorDiscordId, {
            ViewChannel: true,
            SendMessages: false,
            ReadMessageHistory: true,
          })
          .catch(() => {});
      }

      const closed = await tlcStore.closeTicket(
        ticket.id,
        interaction.user.id,
        interaction.user.username,
        fetchedTranscript
      );
      await refreshInsideTicketPanelMessage(client, closed);

      const transcriptText = formatTicketTranscriptText(closed);
      const transcriptFile = new AttachmentBuilder(Buffer.from(transcriptText, 'utf8'), {
        name: `${closed.ticketNumber.toLowerCase()}-transcript.txt`,
      });

      const cfg = tlcStore.getState().config;
      await sendToChannelSafe(client, cfg.channels.ticketLogId, {
        embeds: [
          buildTicketLogEmbed(
            'Ticket Closed & Transcript Saved',
            closed,
            `@${interaction.user.username}`,
            `Transcript contains **${closed.transcript.length}** message(s).`,
            0x0f172a
          ),
        ],
        files: [transcriptFile],
      });

      if (cfg.notifications.sendDirectMessages) {
        try {
          const creator = await client.users.fetch(closed.creatorDiscordId);
          const dmPrompt = buildTicketFeedbackPromptPayload(closed);
          await creator.send({
            content: `Your TLC ticket **${closed.ticketNumber}** has been closed by **@${interaction.user.username}**.`,
            ...dmPrompt,
          });
        } catch {
          // DMs closed
        }
      }

      await sendToChannelSafe(client, closed.channelId, {
        content: `🔒 Ticket **${closed.ticketNumber}** has been closed by <@${interaction.user.id}>. Full transcript archived permanently.`,
        ...buildTicketFeedbackPromptPayload(closed),
      });

      await emitLatestAudit(client);
      await interaction.editReply({
        content: `Ticket **${closed.ticketNumber}** closed and transcript archived.`,
        embeds: [],
        components: [],
      });
      return true;
    }

    if (id.startsWith('tlc_tkt_confirm_delete:')) {
      const ticketId = id.split(':')[1];
      const ticket = tlcStore.getTicketById(ticketId);
      if (!ticket || !isCategoryStaffForTicket(interaction.member as GuildMember, ticket)) {
        await interaction.reply({ content: 'Staff permission required.', ephemeral: true });
        return true;
      }
      await interaction.deferUpdate();
      const preserved = await tlcStore.markTicketChannelDeleted(
        ticket.id,
        interaction.user.username
      );
      await sendToChannelSafe(client, tlcStore.getState().config.channels.ticketLogId, {
        embeds: [
          buildTicketLogEmbed(
            'Ticket Channel Deleted (History Preserved)',
            preserved,
            `@${interaction.user.username}`,
            `Channel <#${preserved.channelId}> was deleted. Transcript & decision history remain permanently stored in PostgreSQL.`,
            0xdc2626
          ),
        ],
      });
      await emitLatestAudit(client);
      const ch = await client.channels.fetch(preserved.channelId).catch(() => null);
      if (ch && 'delete' in ch) {
        await (ch as TextChannel).delete(`Ticket ${preserved.ticketNumber} deleted by ${interaction.user.username}`).catch(() => {});
      }
      return true;
    }

    if (id.startsWith('tlc_tkt_cancel_confirm:')) {
      await interaction.update({ content: 'Cancelled.', embeds: [], components: [] });
      return true;
    }

    if (id.startsWith('tlc_tkt_rate:')) {
      const [, ticketId, ratingStr] = id.split(':');
      const rating = Number.parseInt(ratingStr, 10);
      const updated = await tlcStore.submitTicketFeedback(
        ticketId,
        interaction.user.id,
        rating
      );
      await sendToChannelSafe(client, tlcStore.getState().config.channels.ticketLogId, {
        embeds: [
          buildTicketLogEmbed(
            'Staff Evaluation Received',
            updated,
            updated.isAnonymous ? 'Anonymous Complainant' : `@${updated.creatorUsername}`,
            `Rating: ${'⭐'.repeat(rating)} (${rating}/5)`,
            0x059669
          ),
        ],
      });
      await interaction.update({
        content: `Thank you for rating your TLC support experience **${'⭐'.repeat(rating)} (${rating}/5)**!`,
        embeds: [],
        components: [],
      });
      return true;
    }
  }

  // ==================== MODAL SUBMISSIONS ====================
  if (interaction.isModalSubmit()) {
    const id = interaction.customId;

    if (id === 'tlc_tkt_naming_modal') {
      const pattern = interaction.fields.getTextInputValue('naming_pattern').trim();
      const maxOpen = Number.parseInt(interaction.fields.getTextInputValue('max_open').trim(), 10);
      const reminderH = Number.parseInt(
        interaction.fields.getTextInputValue('inactivity_hours').trim(),
        10
      );
      const escH = Number.parseInt(
        interaction.fields.getTextInputValue('escalation_hours').trim(),
        10
      );
      await tlcStore.updateTicketSystemSettings(
        {
          namingPattern: pattern,
          maxOpenTicketsPerUserPerCategory: maxOpen,
          inactivityReminderHours: reminderH,
          escalationHours: escH,
        },
        interaction.user.username
      );
      await emitLatestAudit(client);
      const payload = buildTicketSetupPayload(tlcStore.getState(), 'settings');
      if (interaction.isFromMessage()) {
        await interaction.update(payload);
      } else {
        await interaction.reply(payload);
      }
      return true;
    }

    if (id === 'tlc_tkt_panel_copy_modal') {
      const title = interaction.fields.getTextInputValue('panel_title').trim();
      const desc = interaction.fields.getTextInputValue('panel_description').trim();
      await tlcStore.updateTicketSystemSettings(
        { panelTitle: title, panelDescription: desc },
        interaction.user.username
      );
      await emitLatestAudit(client);
      const payload = buildTicketSetupPayload(tlcStore.getState(), 'settings');
      if (interaction.isFromMessage()) {
        await interaction.update(payload);
      } else {
        await interaction.reply(payload);
      }
      return true;
    }

    if (id.startsWith('tlc_tkt_cat_edit_modal:')) {
      const key = id.split(':')[1] as TicketCategoryKey;
      const label = interaction.fields.getTextInputValue('cat_label').trim();
      const emoji = interaction.fields.getTextInputValue('cat_emoji').trim();
      const description = interaction.fields.getTextInputValue('cat_desc').trim();
      await tlcStore.updateTicketCategoryMeta(
        key,
        { label, emoji, description },
        interaction.user.username
      );
      await emitLatestAudit(client);
      const payload = buildTicketSetupPayload(tlcStore.getState(), 'categories', key);
      if (interaction.isFromMessage()) {
        await interaction.update(payload);
      } else {
        await interaction.reply(payload);
      }
      return true;
    }

    if (id.startsWith('tlc_tkt_q_modal:')) {
      const [, mode, key, qId] = id.split(':');
      const catKey = key as TicketCategoryKey;
      const label = interaction.fields.getTextInputValue('q_label').trim();
      const rawType = interaction.fields.getTextInputValue('q_type').trim().toLowerCase();
      const validTypes: TicketQuestionType[] = [
        'short',
        'paragraph',
        'url',
        'attachment',
        'select',
      ];
      const qType: TicketQuestionType = validTypes.includes(rawType as TicketQuestionType)
        ? (rawType as TicketQuestionType)
        : 'short';
      const reqStr = interaction.fields.getTextInputValue('q_required').trim().toLowerCase();
      const required = reqStr === 'yes' || reqStr === 'true' || reqStr === '1';
      const placeholder = interaction.fields.getTextInputValue('q_placeholder').trim();
      const options = interaction.fields
        .getTextInputValue('q_options')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (mode === 'add') {
        await tlcStore.addTicketCategoryQuestion(
          catKey,
          { label, type: qType, required, placeholder, options },
          interaction.user.username
        );
      } else if (mode === 'edit' && qId) {
        await tlcStore.editTicketCategoryQuestion(
          catKey,
          qId,
          { label, type: qType, required, placeholder, options },
          interaction.user.username
        );
      }

      await emitLatestAudit(client);
      const payload = buildTicketSetupPayload(tlcStore.getState(), 'questions', catKey, qId);
      if (interaction.isFromMessage()) {
        await interaction.update(payload);
      } else {
        await interaction.reply(payload);
      }
      return true;
    }

    if (id.startsWith('tlc_tkt_draft_modal:')) {
      const [, draftId, formKind] = id.split(':');
      const draft = ticketDrafts.get(draftId);
      if (!draft || draft.userId !== interaction.user.id) {
        await interaction.reply({ content: 'Draft expired. Please reopen from the Ticket Panel.', ephemeral: true });
        return true;
      }

      draft.answers.fullName = interaction.fields.getTextInputValue('fullName').trim();
      const rawUrl = interaction.fields.getTextInputValue('avatarUrl').trim();
      if (rawUrl) {
        draft.primaryImageUrl = validateExternalMediaUrl(rawUrl);
      }
      draft.answers.additionalInfo = interaction.fields
        .getTextInputValue('additionalInfo')
        .trim();

      if (formKind === 'coach_reg') {
        draft.answers.coachingExperience = interaction.fields
          .getTextInputValue('coachingExperience')
          .trim();
        draft.answers.previousTeams = interaction.fields
          .getTextInputValue('previousTeams')
          .trim();
      }

      if (interaction.isFromMessage()) {
        await interaction.update(renderDraftPayload(draft));
      } else {
        await interaction.reply(renderDraftPayload(draft));
      }
      return true;
    }

    if (id.startsWith('tlc_tkt_draft_qmodal:')) {
      const [, draftId, pageStr] = id.split(':');
      const draft = ticketDrafts.get(draftId);
      if (!draft || draft.userId !== interaction.user.id) {
        await interaction.reply({ content: 'Draft expired.', ephemeral: true });
        return true;
      }
      const pageIdx = Number.parseInt(pageStr, 10) || 0;
      const cat = getEffectiveTicketConfig(state).categories.find(
        (c) => c.key === draft.categoryKey
      );
      const slice = (cat?.questions || []).slice(pageIdx * 5, pageIdx * 5 + 5);
      for (const q of slice) {
        const val = interaction.fields.getTextInputValue(q.id).trim();
        if (q.type === 'url' && val) {
          draft.answers[q.id] = validateExternalMediaUrl(val);
        } else {
          draft.answers[q.id] = val;
        }
      }

      if (interaction.isFromMessage()) {
        await interaction.update(renderDraftPayload(draft));
      } else {
        await interaction.reply(renderDraftPayload(draft));
      }
      return true;
    }

    if (id.startsWith('tlc_tkt_direct_modal:')) {
      if (!interaction.guildId) return true;
      const [, key, pageStr] = id.split(':');
      const catKey = key as TicketCategoryKey;
      const check = tlcStore.checkUserCanOpenTicket(interaction.user.id, catKey);
      if (!check.ok) {
        await interaction.reply({ content: check.reason, ephemeral: true });
        return true;
      }

      const cat = getEffectiveTicketConfig(state).categories.find((c) => c.key === catKey);
      const pageIdx = Number.parseInt(pageStr, 10) || 0;
      const slice = (cat?.questions || []).slice(pageIdx * 5, pageIdx * 5 + 5);
      const answers: { questionId: string; label: string; answer: string }[] = [];
      for (const q of slice) {
        const val = interaction.fields.getTextInputValue(q.id).trim();
        if (q.type === 'url' && val) {
          answers.push({
            questionId: q.id,
            label: q.label,
            answer: validateExternalMediaUrl(val),
          });
        } else if (val) {
          answers.push({ questionId: q.id, label: q.label, answer: val });
        }
      }

      await interaction.deferReply({ ephemeral: true });
      const created = await openPrivateTicketChannel(client, {
        guildId: interaction.guildId,
        creatorDiscordId: interaction.user.id,
        creatorUsername: interaction.user.username,
        creatorAvatarUrl: interaction.user.displayAvatarURL({ size: 512 }),
        categoryKey: catKey,
        answers,
        metadata: {},
        evidence: [],
      });
      await interaction.editReply({
        content: `✅ Your ticket **${created.ticketNumber}** has been opened: <#${created.channelId}>`,
      });
      return true;
    }

    if (id.startsWith('tlc_tkt_modal:')) {
      const [, act, ticketId] = id.split(':');
      const ticket = tlcStore.getTicketById(ticketId);
      if (!ticket || !isCategoryStaffForTicket(interaction.member as GuildMember, ticket)) {
        await interaction.reply({ content: 'Staff permission required.', ephemeral: true });
        return true;
      }
      const val = interaction.fields.getTextInputValue('value').trim();
      const cfg = tlcStore.getState().config;

      if (act === 'reject' || act === 'dismiss') {
        const decision = act === 'dismiss' ? 'Dismissed' : 'Rejected';
        const updated = await tlcStore.rejectOrDismissTicket(
          ticket.id,
          decision,
          val,
          interaction.user.id,
          interaction.user.username
        );
        await refreshInsideTicketPanelMessage(client, updated);
        await sendToChannelSafe(client, updated.channelId, {
          content: `❌ **Ticket ${decision}** by <@${interaction.user.id}>\n**Reason:** ${val}`,
        });

        const logCh =
          updated.categoryKey === 'player_complaint' || updated.categoryKey === 'player_report'
            ? cfg.channels.complaintLogId
            : cfg.channels.applicationLogId || cfg.channels.ticketLogId;

        await sendToChannelSafe(client, logCh, {
          embeds: [
            buildTicketLogEmbed(
              `Ticket ${decision}`,
              updated,
              `@${interaction.user.username}`,
              `Reason: ${val}`,
              0xdc2626
            ),
          ],
        });

        if (cfg.notifications.sendDirectMessages) {
          try {
            const u = await client.users.fetch(updated.creatorDiscordId);
            await u.send(
              `❌ Your TLC ticket **${updated.ticketNumber}** was **${decision}** by **@${interaction.user.username}**.\n\n**Reason:** ${val}`
            );
          } catch {
            // DMs closed
          }
        }
        await emitLatestAudit(client);
        await interaction.reply({ content: `Ticket marked as **${decision}**.`, ephemeral: true });
        return true;
      }

      if (act === 'resolve') {
        const updated = await tlcStore.resolveComplaintTicket(
          ticket.id,
          val,
          interaction.user.id,
          interaction.user.username
        );
        await refreshInsideTicketPanelMessage(client, updated);
        await sendToChannelSafe(client, updated.channelId, {
          content: `✅ **Complaint Resolved** by <@${interaction.user.id}>\n**Summary:** ${val}`,
        });
        await sendToChannelSafe(client, cfg.channels.complaintLogId || cfg.channels.ticketLogId, {
          embeds: [
            buildTicketLogEmbed(
              'Complaint Resolved',
              updated,
              `@${interaction.user.username}`,
              `Summary: ${val}`,
              0x059669
            ),
          ],
        });
        await emitLatestAudit(client);
        await interaction.reply({ content: 'Complaint marked as **Resolved**.', ephemeral: true });
        return true;
      }

      if (act === 'reqinfo') {
        const updated = await tlcStore.updateTicketStatusOrPriority(
          ticket.id,
          { status: 'Waiting Info' },
          interaction.user.username
        );
        await refreshInsideTicketPanelMessage(client, updated);
        await sendToChannelSafe(client, updated.channelId, {
          content: `📩 ${updated.isAnonymous ? 'Submitter' : `<@${updated.creatorDiscordId}>`} — **Additional Information Requested** by <@${interaction.user.id}>:\n> ${val}`,
        });
        await interaction.reply({ content: 'Requested additional information in channel.', ephemeral: true });
        return true;
      }

      if (act === 'addnote') {
        const updated = await tlcStore.addTicketStaffNote(
          ticket.id,
          interaction.user.id,
          interaction.user.username,
          val
        );
        await emitLatestAudit(client);
        await interaction.reply({
          content: `🔒 Private staff note added to **${updated.ticketNumber}** (never shown to the ticket creator).`,
          ephemeral: true,
        });
        return true;
      }

      if (act === 'rename') {
        const slug = sanitizeChannelSlug(val, ticket.channelName);
        const ch = await client.channels.fetch(ticket.channelId).catch(() => null);
        if (ch && ch.type === ChannelType.GuildText) {
          await ch.setName(slug);
        }
        const updated = await tlcStore.updateTicketChannelName(
          ticket.id,
          slug,
          interaction.user.username
        );
        await emitLatestAudit(client);
        await interaction.reply({
          content: `Renamed ticket channel to \`#${updated.channelName}\`.`,
          ephemeral: true,
        });
        return true;
      }
    }
  }

  return false;
}
