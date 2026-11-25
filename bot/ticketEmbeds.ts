import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from 'discord.js';
import {
  BotConfig,
  COMPLAINT_CATEGORIES,
  ComplaintCategory,
  PLAYER_POSITIONS,
  PlayerPosition,
  STAFF_DEPARTMENTS,
  StaffDepartment,
  TicketCategoryConfig,
  TicketCategoryKey,
  TicketPriority,
  TicketQuestionConfig,
  TicketQuestionType,
  TicketStatistics,
  TicketSystemConfig,
  TlcDatabaseState,
  UnifiedTicket,
} from '../src/shared/types.ts';
import { createDefaultTicketSystemConfig } from '../server/db/sync.ts';

const TLC_COLOR = 0x059669;
const TLC_DARK = 0x0f172a;
const TLC_AMBER = 0xd97706;
const TLC_RED = 0xdc2626;
const TLC_BLUE = 0x2563eb;

export type TicketSetupSection =
  | 'channels_main'
  | 'channels_logs'
  | 'roles_staff'
  | 'roles_reg'
  | 'settings'
  | 'categories'
  | 'questions';

export interface TicketDraft {
  id: string;
  userId: string;
  username: string;
  guildId: string;
  categoryKey: TicketCategoryKey;
  applicationSubType?: 'Player' | 'Coach' | 'Staff' | 'Team' | null;
  staffDepartment?: StaffDepartment;
  complaintCategory?: ComplaintCategory;
  isAnonymous: boolean;
  targetDiscordId?: string;
  targetUsername?: string;
  targetDisplayName?: string;
  teamOwnerDiscordId?: string;
  teamOwnerUsername?: string;
  teamRoleId?: string;
  position?: PlayerPosition;
  answers: Record<string, string>;
  uploadedMediaIds: string[];
  uploadedFileLabels: string[];
  primaryMediaId?: string;
  primaryImageUrl?: string;
  awaitingAttachmentType?: 'avatar' | 'team_logo' | 'evidence' | null;
  awaitingChannelId?: string;
  createdAt: number;
}

export function getEffectiveTicketConfig(state: TlcDatabaseState): TicketSystemConfig {
  const defaults = createDefaultTicketSystemConfig();
  const saved = state.config.tickets;
  if (!saved) return defaults;
  const cats =
    Array.isArray(saved.categories) && saved.categories.length > 0
      ? [
          ...saved.categories,
          ...defaults.categories.filter((d) => !saved.categories.some((c) => c.key === d.key)),
        ].sort((a, b) => a.order - b.order)
      : defaults.categories;
  return { ...defaults, ...saved, categories: cats };
}

export function sanitizeChannelSlug(raw: string, fallback = 'ticket'): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

export function formatTicketChannelName(
  pattern: string,
  categoryKey: TicketCategoryKey,
  username: string,
  seqNum: number,
  subType?: string | null
): string {
  const shortCat = subType
    ? `${subType.toLowerCase()}-reg`
    : categoryKey.replace(/_/g, '-');
  const numPadded = String(seqNum).padStart(4, '0');
  const cleanUser = sanitizeChannelSlug(username, 'user').slice(0, 20);
  const rendered = (pattern || '{category}-{num}')
    .replace(/\{category\}/gi, shortCat)
    .replace(/\{type\}/gi, shortCat)
    .replace(/\{username\}/gi, cleanUser)
    .replace(/\{num\}/gi, numPadded)
    .replace(/\{id\}/gi, numPadded);
  return sanitizeChannelSlug(rendered, `ticket-${numPadded}`);
}

export function getCategoryStaffRoleIds(cfg: BotConfig, ticket: UnifiedTicket): string[] {
  const r = cfg.roles;
  if (ticket.categoryKey === 'register') {
    if (ticket.applicationSubType === 'Coach') {
      return r.coachRegStaffRoleIds?.length
        ? r.coachRegStaffRoleIds
        : r.supportRoleIds?.length
        ? r.supportRoleIds
        : r.staffRoleIds;
    }
    return r.playerRegStaffRoleIds?.length
      ? r.playerRegStaffRoleIds
      : r.supportRoleIds?.length
      ? r.supportRoleIds
      : r.staffRoleIds;
  }
  if (ticket.categoryKey === 'staff_application') {
    return r.staffAppRoleIds?.length
      ? r.staffAppRoleIds
      : r.seniorAdminRoleIds?.length
      ? r.seniorAdminRoleIds
      : r.staffRoleIds;
  }
  if (ticket.categoryKey === 'create_team') {
    return r.teamRegStaffRoleIds?.length
      ? r.teamRegStaffRoleIds
      : r.supportRoleIds?.length
      ? r.supportRoleIds
      : r.staffRoleIds;
  }
  if (ticket.categoryKey === 'player_complaint' || ticket.categoryKey === 'player_report') {
    if (ticket.isAnonymous && r.seniorAdminRoleIds?.length) {
      return r.seniorAdminRoleIds;
    }
    return r.complaintStaffRoleIds?.length
      ? r.complaintStaffRoleIds
      : r.disciplinaryRoleIds?.length
      ? r.disciplinaryRoleIds
      : r.staffRoleIds;
  }
  return r.supportRoleIds?.length ? r.supportRoleIds : r.staffRoleIds;
}

// ==================== /setup-tickets PANEL ====================

export function buildTicketSetupPayload(
  state: TlcDatabaseState,
  section: TicketSetupSection = 'channels_main',
  selectedCategoryKey: TicketCategoryKey = 'player_complaint',
  selectedQuestionId?: string
) {
  const cfg = state.config;
  const tCfg = getEffectiveTicketConfig(state);
  const fmtCh = (id?: string) => (id ? `<#${id}>` : '`Not configured`');
  const fmtRoles = (ids?: string[]) =>
    ids && ids.length > 0 ? ids.map((id) => `<@&${id}>`).join(', ') : '`Not configured`';

  const activeCat =
    tCfg.categories.find((c) => c.key === selectedCategoryKey) || tCfg.categories[0];

  const embed = new EmbedBuilder()
    .setColor(TLC_DARK)
    .setTitle('Touchline (TLC) — Unified Ticket System Setup')
    .setDescription(
      'Manually select your existing Discord channels, categories, and roles below. The bot never creates roles or setup channels automatically. All changes save permanently to PostgreSQL.'
    );

  if (section === 'channels_main' || section === 'channels_logs') {
    embed.addFields(
      { name: '1. Ticket Panel Channel', value: fmtCh(cfg.channels.ticketPanelId), inline: true },
      { name: '2. Ticket Category', value: fmtCh(cfg.channels.ticketCategoryId), inline: true },
      {
        name: '3. Registration Category',
        value: fmtCh(cfg.channels.registrationCategoryId),
        inline: true,
      },
      { name: '4. Ticket Log Channel', value: fmtCh(cfg.channels.ticketLogId), inline: true },
      {
        name: '5. Application Log Channel',
        value: fmtCh(cfg.channels.applicationLogId),
        inline: true,
      },
      { name: '6. Complaint Log Channel', value: fmtCh(cfg.channels.complaintLogId), inline: true },
      {
        name: '7. Escalation Channel (Optional)',
        value: fmtCh(cfg.channels.escalationChannelId),
        inline: true,
      }
    );
  } else if (section === 'roles_staff' || section === 'roles_reg') {
    embed.addFields(
      { name: 'Staff Support Roles', value: fmtRoles(cfg.roles.supportRoleIds), inline: true },
      {
        name: 'Player Reg Staff Roles',
        value: fmtRoles(cfg.roles.playerRegStaffRoleIds),
        inline: true,
      },
      {
        name: 'Coach Reg Staff Roles',
        value: fmtRoles(cfg.roles.coachRegStaffRoleIds),
        inline: true,
      },
      { name: 'Staff Application Roles', value: fmtRoles(cfg.roles.staffAppRoleIds), inline: true },
      {
        name: 'Complaint Staff Roles',
        value: fmtRoles(cfg.roles.complaintStaffRoleIds),
        inline: true,
      },
      {
        name: 'Team Reg Staff Roles',
        value: fmtRoles(cfg.roles.teamRegStaffRoleIds),
        inline: true,
      },
      {
        name: 'Senior Admin Roles (Confidential)',
        value: fmtRoles(cfg.roles.seniorAdminRoleIds),
        inline: true,
      },
      {
        name: 'Approved Player Role',
        value: cfg.roles.playerRoleId ? `<@&${cfg.roles.playerRoleId}>` : '`Not configured`',
        inline: true,
      },
      {
        name: 'Approved Coach Role',
        value: cfg.roles.coachRoleId ? `<@&${cfg.roles.coachRoleId}>` : '`Not configured`',
        inline: true,
      }
    );
  } else if (section === 'settings') {
    embed.addFields(
      { name: 'Channel Naming Pattern', value: `\`${tCfg.namingPattern}\``, inline: true },
      {
        name: 'Max Open Tickets / User / Cat',
        value: `**${tCfg.maxOpenTicketsPerUserPerCategory}**`,
        inline: true,
      },
      {
        name: 'Inactivity Reminder',
        value: `**${tCfg.inactivityReminderHours}h**`,
        inline: true,
      },
      { name: 'Auto-Escalation Threshold', value: `**${tCfg.escalationHours}h**`, inline: true },
      { name: 'Panel Title', value: tCfg.panelTitle, inline: false },
      { name: 'Panel Description', value: tCfg.panelDescription.slice(0, 400), inline: false }
    );
  } else if (section === 'categories') {
    embed.addFields({
      name: `Categories (${tCfg.categories.filter((c) => c.enabled).length}/${tCfg.categories.length} enabled)`,
      value: tCfg.categories
        .map(
          (c) =>
            `${c.order}. ${c.enabled ? '🟢' : '🔴'} ${c.emoji} **${c.label}** — \`${c.questions.length}\` question(s)${c.requireEvidence ? ' · 📎 Evidence Req' : ''}`
        )
        .join('\n'),
      inline: false,
    });
    if (activeCat) {
      embed.addFields({
        name: `Selected Category: ${activeCat.emoji} ${activeCat.label}`,
        value: `Status: **${activeCat.enabled ? 'Enabled' : 'Disabled'}**\nDescription: ${activeCat.description}\nRequire Evidence/File: **${activeCat.requireEvidence ? 'Yes' : 'No'}**`,
        inline: false,
      });
    }
  } else if (section === 'questions' && activeCat) {
    const qLines =
      activeCat.questions.length > 0
        ? activeCat.questions.map(
            (q, i) =>
              `${i + 1}. **${q.label}** (\`${q.type}\` · ${q.required ? 'Required' : 'Optional'})${q.id === selectedQuestionId ? ' ⬅️ Selected' : ''}`
          )
        : ['_No custom questions configured for this category._'];
    embed.addFields({
      name: `Questions for ${activeCat.emoji} ${activeCat.label} (${activeCat.questions.length}/15)`,
      value: qLines.join('\n').slice(0, 1020),
      inline: false,
    });
  }

  const rows: ActionRowBuilder<
    ChannelSelectMenuBuilder | RoleSelectMenuBuilder | StringSelectMenuBuilder | ButtonBuilder
  >[] = [];

  rows.push(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('tlc_tkt_setup_sec')
        .setPlaceholder('Choose configuration section')
        .addOptions(
          {
            label: 'Channels & Categories (Part 1)',
            value: 'channels_main',
            description: 'Panel channel, Ticket category, Registration category, Escalation channel',
            default: section === 'channels_main',
          },
          {
            label: 'Log Channels & Publish Panel',
            value: 'channels_logs',
            description: 'Ticket log, Application log, Complaint log & Publish panel',
            default: section === 'channels_logs',
          },
          {
            label: 'Staff & Complaint Roles',
            value: 'roles_staff',
            description: 'Support, Staff App, Complaint & Senior Admin roles',
            default: section === 'roles_staff',
          },
          {
            label: 'Registration Staff & Player/Coach Roles',
            value: 'roles_reg',
            description: 'Player/Coach/Team reg staff + Official Player & Coach roles',
            default: section === 'roles_reg',
          },
          {
            label: 'Naming System, Limits & Timers',
            value: 'settings',
            description: 'Channel naming pattern, anti-duplicate limit, reminders & escalation',
            default: section === 'settings',
          },
          {
            label: 'Customize Categories (Enable / Rename / Order)',
            value: 'categories',
            description: 'Enable/disable, rename, reorder or require evidence per category',
            default: section === 'categories',
          },
          {
            label: 'Customize Category Questions',
            value: 'questions',
            description: 'Add, edit, remove, toggle required, or reorder form questions',
            default: section === 'questions',
          }
        )
    )
  );

  if (section === 'channels_main') {
    rows.push(
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('tlc_setup_ch:ticketPanelId')
          .setPlaceholder('1. Select Ticket Panel Channel (Text)')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      ),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('tlc_setup_ch:ticketCategoryId')
          .setPlaceholder('2. Select General Ticket Category')
          .setChannelTypes(ChannelType.GuildCategory)
      ),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('tlc_setup_ch:registrationCategoryId')
          .setPlaceholder('3. Select Registration Category')
          .setChannelTypes(ChannelType.GuildCategory)
      ),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('tlc_setup_ch:escalationChannelId')
          .setPlaceholder('7. Select Escalation Alert Channel (Optional)')
          .setChannelTypes(ChannelType.GuildText)
      )
    );
  } else if (section === 'channels_logs') {
    rows.push(
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('tlc_setup_ch:ticketLogId')
          .setPlaceholder('4. Select Ticket Log Channel')
          .setChannelTypes(ChannelType.GuildText)
      ),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('tlc_setup_ch:applicationLogId')
          .setPlaceholder('5. Select Application Log Channel')
          .setChannelTypes(ChannelType.GuildText)
      ),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('tlc_setup_ch:complaintLogId')
          .setPlaceholder('6. Select Complaint Log Channel')
          .setChannelTypes(ChannelType.GuildText)
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('tlc_tkt_publish_panel')
          .setLabel('Publish / Refresh Ticket Panel')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('tlc_tkt_edit_naming')
          .setLabel('Ticket Naming & Limits')
          .setStyle(ButtonStyle.Primary)
      )
    );
  } else if (section === 'roles_staff') {
    rows.push(
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('tlc_setup_role:supportRoleIds')
          .setPlaceholder('Select Staff Support Roles (multi-select)')
          .setMinValues(1)
          .setMaxValues(10)
      ),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('tlc_setup_role:staffAppRoleIds')
          .setPlaceholder('Select Staff Application Roles (multi-select)')
          .setMinValues(1)
          .setMaxValues(10)
      ),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('tlc_setup_role:complaintStaffRoleIds')
          .setPlaceholder('Select Complaint Staff Roles (multi-select)')
          .setMinValues(1)
          .setMaxValues(10)
      ),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('tlc_setup_role:seniorAdminRoleIds')
          .setPlaceholder('Select Senior Admin Roles for Anonymous Complaints')
          .setMinValues(1)
          .setMaxValues(10)
      )
    );
  } else if (section === 'roles_reg') {
    rows.push(
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('tlc_setup_role:playerRegStaffRoleIds')
          .setPlaceholder('Select Player Registration Staff Roles')
          .setMinValues(1)
          .setMaxValues(10)
      ),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('tlc_setup_role:coachRegStaffRoleIds')
          .setPlaceholder('Select Coach Registration Staff Roles')
          .setMinValues(1)
          .setMaxValues(10)
      ),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('tlc_setup_role:teamRegStaffRoleIds')
          .setPlaceholder('Select Team Registration Staff Roles')
          .setMinValues(1)
          .setMaxValues(10)
      ),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('tlc_setup_role:coachRoleId')
          .setPlaceholder('Select Official Approved Coach Role')
      )
    );
  } else if (section === 'settings') {
    rows.push(
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('tlc_setup_role:playerRoleId')
          .setPlaceholder('Approved Player Role (syncs with /setup)')
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('tlc_tkt_edit_naming')
          .setLabel('Edit Naming & Limits')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('tlc_tkt_edit_panel_copy')
          .setLabel('Edit Panel Title & Text')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('tlc_tkt_publish_panel')
          .setLabel('Publish / Refresh Ticket Panel')
          .setStyle(ButtonStyle.Success)
      )
    );
  } else if (section === 'categories' && activeCat) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('tlc_tkt_cfg_cat_pick:categories')
          .setPlaceholder('Select a ticket category to customize')
          .addOptions(
            tCfg.categories.map((c) => ({
              label: `${c.order}. ${c.label}`.slice(0, 100),
              value: c.key,
              description: `${c.enabled ? 'Enabled' : 'Disabled'} · ${c.questions.length} question(s)`.slice(
                0,
                100
              ),
              emoji: c.emoji || undefined,
              default: c.key === activeCat.key,
            }))
          )
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`tlc_tkt_cfg_cat_toggle:${activeCat.key}`)
          .setLabel(activeCat.enabled ? 'Disable Category' : 'Enable Category')
          .setStyle(activeCat.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`tlc_tkt_cfg_cat_edit:${activeCat.key}`)
          .setLabel('Rename / Description')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`tlc_tkt_cfg_cat_reqev:${activeCat.key}`)
          .setLabel(activeCat.requireEvidence ? 'Evidence: Required' : 'Evidence: Optional')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`tlc_tkt_cfg_cat_move:${activeCat.key}:up`)
          .setLabel('Move Up')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`tlc_tkt_cfg_cat_move:${activeCat.key}:down`)
          .setLabel('Move Down')
          .setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`tlc_tkt_cfg_open_qs:${activeCat.key}`)
          .setLabel(`Edit Questions (${activeCat.questions.length})`)
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('tlc_tkt_publish_panel')
          .setLabel('Refresh Live Panel')
          .setStyle(ButtonStyle.Success)
      )
    );
  } else if (section === 'questions' && activeCat) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('tlc_tkt_cfg_cat_pick:questions')
          .setPlaceholder('Select category whose questions to manage')
          .addOptions(
            tCfg.categories.map((c) => ({
              label: `${c.label} (${c.questions.length} Qs)`.slice(0, 100),
              value: c.key,
              default: c.key === activeCat.key,
            }))
          )
      )
    );

    const effectiveQId =
      selectedQuestionId && activeCat.questions.some((q) => q.id === selectedQuestionId)
        ? selectedQuestionId
        : activeCat.questions[0]?.id;

    if (activeCat.questions.length > 0) {
      rows.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`tlc_tkt_cfg_q_pick:${activeCat.key}`)
            .setPlaceholder('Select a question to edit, move, or remove')
            .addOptions(
              activeCat.questions.slice(0, 25).map((q, idx) => ({
                label: `${idx + 1}. ${q.label}`.slice(0, 100),
                value: q.id,
                description: `${q.type} · ${q.required ? 'Required' : 'Optional'}`.slice(0, 100),
                default: q.id === effectiveQId,
              }))
            )
        )
      );
    }

    const qBtnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`tlc_tkt_cfg_q_add:${activeCat.key}`)
        .setLabel('Add Question')
        .setStyle(ButtonStyle.Success)
    );

    if (effectiveQId) {
      qBtnRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`tlc_tkt_cfg_q_edit:${activeCat.key}:${effectiveQId}`)
          .setLabel('Edit Selected')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`tlc_tkt_cfg_q_move:${activeCat.key}:${effectiveQId}:up`)
          .setLabel('Up')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`tlc_tkt_cfg_q_move:${activeCat.key}:${effectiveQId}:down`)
          .setLabel('Down')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`tlc_tkt_cfg_q_del:${activeCat.key}:${effectiveQId}`)
          .setLabel('Remove')
          .setStyle(ButtonStyle.Danger)
      );
    }
    rows.push(qBtnRow);
  }

  return { embeds: [embed], components: rows, ephemeral: true };
}

export function buildTicketNamingModal(tCfg: TicketSystemConfig) {
  const modal = new ModalBuilder()
    .setCustomId('tlc_tkt_naming_modal')
    .setTitle('Ticket Naming & Limits');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('naming_pattern')
        .setLabel('Channel Pattern ({category}, {username}, {num})')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(tCfg.namingPattern.slice(0, 60))
        .setPlaceholder('{category}-{num}')
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('max_open')
        .setLabel('Max Open Tickets per User per Category (1-10)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(String(tCfg.maxOpenTicketsPerUserPerCategory))
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('inactivity_hours')
        .setLabel('Inactivity Reminder Hours')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(String(tCfg.inactivityReminderHours))
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('escalation_hours')
        .setLabel('Unanswered Ticket Escalation Hours')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(String(tCfg.escalationHours))
    )
  );
  return modal;
}

export function buildTicketPanelCopyModal(tCfg: TicketSystemConfig) {
  const modal = new ModalBuilder()
    .setCustomId('tlc_tkt_panel_copy_modal')
    .setTitle('Ticket Panel Branding');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('panel_title')
        .setLabel('Panel Title')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(tCfg.panelTitle.slice(0, 100))
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('panel_description')
        .setLabel('Panel Description')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setValue(tCfg.panelDescription.slice(0, 900))
    )
  );
  return modal;
}

export function buildCategoryEditModal(cat: TicketCategoryConfig) {
  const modal = new ModalBuilder()
    .setCustomId(`tlc_tkt_cat_edit_modal:${cat.key}`)
    .setTitle(`Customize: ${cat.label}`.slice(0, 45));

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('cat_label')
        .setLabel('Category Display Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(cat.label.slice(0, 60))
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('cat_emoji')
        .setLabel('Category Emoji')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(cat.emoji.slice(0, 16))
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('cat_desc')
        .setLabel('Dropdown Description (max 100 chars)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
        .setValue(cat.description.slice(0, 100))
    )
  );
  return modal;
}

export function buildQuestionEditorModal(
  categoryKey: TicketCategoryKey,
  existing?: TicketQuestionConfig
) {
  const customId = existing
    ? `tlc_tkt_q_modal:edit:${categoryKey}:${existing.id}`
    : `tlc_tkt_q_modal:add:${categoryKey}`;

  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(existing ? 'Edit Ticket Question' : 'Add Custom Question');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('q_label')
        .setLabel('Question Label (max 45 chars)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(45)
        .setValue(existing?.label.slice(0, 45) || '')
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('q_type')
        .setLabel('Type: short, paragraph, url, attachment, select')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(existing?.type || 'short')
        .setPlaceholder('short | paragraph | url | attachment | select')
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('q_required')
        .setLabel('Required? (yes or no)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(existing ? (existing.required ? 'yes' : 'no') : 'yes')
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('q_placeholder')
        .setLabel('Placeholder / Help Hint (optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100)
        .setValue(existing?.placeholder?.slice(0, 100) || '')
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('q_options')
        .setLabel('Select Options (comma-separated, if select)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(existing?.options?.join(', ') || '')
    )
  );
  return modal;
}

// ==================== PUBLIC TICKET PANEL (B) ====================

export function buildPublicTicketPanelPayload(state: TlcDatabaseState) {
  const tCfg = getEffectiveTicketConfig(state);
  const enabledCats = tCfg.categories.filter((c) => c.enabled).sort((a, b) => a.order - b.order);

  const embed = new EmbedBuilder()
    .setColor(TLC_COLOR)
    .setTitle(tCfg.panelTitle || 'TLC SUPPORT CENTER')
    .setDescription(
      tCfg.panelDescription ||
        'Need assistance from TLC Administration? Select the appropriate category below to open a ticket.'
    )
    .addFields({
      name: 'Available Ticket Categories',
      value:
        enabledCats.length > 0
          ? enabledCats.map((c) => `${c.emoji} **${c.label}** — ${c.description}`).join('\n')
          : 'No categories are currently enabled.',
      inline: false,
    })
    .setFooter({ text: 'Touchline (TLC) Official Support & Registration System' })
    .setTimestamp();

  const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  if (enabledCats.length > 0) {
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('tlc_tkt_open_cat')
          .setPlaceholder('Select a ticket category to begin...')
          .addOptions(
            enabledCats.slice(0, 25).map((c) => ({
              label: c.label.slice(0, 100),
              value: c.key,
              description: c.description.slice(0, 100),
              emoji: c.emoji || undefined,
            }))
          )
      )
    );
  }

  return { embeds: [embed], components };
}

// ==================== INTERACTIVE BUILDER FLOWS (D, E, F, G, I) ====================

export function buildRegisterChoicePayload() {
  const embed = new EmbedBuilder()
    .setColor(TLC_COLOR)
    .setTitle('TLC Official Registration')
    .setDescription(
      'Choose which official TLC registration application you would like to submit.\n\n• **Player Registration** — Official active/free-agent player profile\n• **Coach Registration** — Official team coach profile (separate from player profiles)'
    )
    .setFooter({ text: 'Your Discord account is detected automatically.' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('tlc_tkt_reg_type:Player')
      .setLabel('Player Registration')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('tlc_tkt_reg_type:Coach')
      .setLabel('Coach Registration')
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row], ephemeral: true };
}

export function buildPlayerRegDraftPayload(draft: TicketDraft) {
  const fullName = draft.answers.fullName || '_Not set yet_';
  const position = draft.position || '_Optional (Not selected)_';
  const avatarSummary = draft.primaryMediaId
    ? `Uploaded File (${draft.uploadedFileLabels[0] || 'Saved to DB'})`
    : draft.primaryImageUrl
    ? draft.primaryImageUrl
    : '_Optional — Upload a file or paste an Image URL_';

  const embed = new EmbedBuilder()
    .setColor(TLC_COLOR)
    .setTitle('Player Registration Application')
    .setDescription(
      draft.awaitingAttachmentType === 'avatar'
        ? '📤 **Upload Active:** Send a message in this channel now with your **Profile Picture image attachment** (PNG/JPG/WEBP/GIF). It will be saved permanently in original quality.'
        : 'Complete your Player Registration details below, then click **Submit Player Application** to open your private verification ticket.'
    )
    .addFields(
      { name: 'Discord Account (Auto-Detected)', value: `<@${draft.userId}> (@${draft.username})`, inline: true },
      { name: 'Full Name / Player Name', value: fullName, inline: true },
      { name: 'Position (Optional)', value: position, inline: true },
      { name: 'Profile Picture', value: avatarSummary.slice(0, 300), inline: false },
      {
        name: 'Additional Information',
        value: (draft.answers.additionalInfo || '_None_').slice(0, 300),
        inline: false,
      }
    );

  const posRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`tlc_tkt_draft_pos:${draft.id}`)
      .setPlaceholder('Select Position (Optional)')
      .addOptions(
        PLAYER_POSITIONS.map((pos) => ({
          label: pos,
          value: pos,
          default: draft.position === pos,
        }))
      )
  );

  const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_draft_form:${draft.id}:player_reg`)
      .setLabel(draft.answers.fullName ? 'Edit Name & Info' : '1. Fill Name & Info')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_draft_upload:${draft.id}:avatar`)
      .setLabel('2. Import Profile Picture')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_draft_submit:${draft.id}`)
      .setLabel('3. Submit Player Application')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!draft.answers.fullName?.trim())
  );

  return { embeds: [embed], components: [posRow, btnRow], ephemeral: true };
}

export function buildPlayerRegModal(draft: TicketDraft) {
  const modal = new ModalBuilder()
    .setCustomId(`tlc_tkt_draft_modal:${draft.id}:player_reg`)
    .setTitle('Player Registration Details');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('fullName')
        .setLabel('Full Name / Player Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80)
        .setValue(draft.answers.fullName || '')
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('avatarUrl')
        .setLabel('Profile Picture Image URL (or use Import File)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('https://... (leave blank if uploading a file)')
        .setValue(draft.primaryImageUrl || '')
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('additionalInfo')
        .setLabel('Additional Information (Optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500)
        .setValue(draft.answers.additionalInfo || '')
    )
  );
  return modal;
}

export function buildCoachRegDraftPayload(draft: TicketDraft) {
  const fullName = draft.answers.fullName || '_Not set yet_';
  const exp = draft.answers.coachingExperience || '_Not set yet_';
  const avatarSummary = draft.primaryMediaId
    ? `Uploaded File (${draft.uploadedFileLabels[0] || 'Saved to DB'})`
    : draft.primaryImageUrl
    ? draft.primaryImageUrl
    : '_Optional — Import File or paste Image URL_';

  const embed = new EmbedBuilder()
    .setColor(TLC_BLUE)
    .setTitle('Coach Registration Application')
    .setDescription(
      draft.awaitingAttachmentType === 'avatar'
        ? '📤 **Upload Active:** Send a message in this channel now with your **Profile Picture image attachment** (PNG/JPG/WEBP/GIF).'
        : 'Complete your Coach Registration details below. Approved coaches receive an official Coach profile (separate from player profiles) and the Coach role.'
    )
    .addFields(
      { name: 'Discord Account (Auto-Detected)', value: `<@${draft.userId}> (@${draft.username})`, inline: true },
      { name: 'Full Name', value: fullName, inline: true },
      { name: 'Previous Teams (Optional)', value: draft.answers.previousTeams || '_None_', inline: true },
      { name: 'Coaching Experience', value: exp.slice(0, 400), inline: false },
      { name: 'Profile Picture', value: avatarSummary.slice(0, 300), inline: false },
      {
        name: 'Additional Information',
        value: (draft.answers.additionalInfo || '_None_').slice(0, 300),
        inline: false,
      }
    );

  const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_draft_form:${draft.id}:coach_reg`)
      .setLabel(draft.answers.fullName ? 'Edit Coach Details' : '1. Fill Coach Form')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_draft_upload:${draft.id}:avatar`)
      .setLabel('2. Import Profile Picture')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_draft_submit:${draft.id}`)
      .setLabel('3. Submit Coach Application')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!draft.answers.fullName?.trim() || !draft.answers.coachingExperience?.trim())
  );

  return { embeds: [embed], components: [btnRow], ephemeral: true };
}

export function buildCoachRegModal(draft: TicketDraft) {
  const modal = new ModalBuilder()
    .setCustomId(`tlc_tkt_draft_modal:${draft.id}:coach_reg`)
    .setTitle('Coach Registration Details');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('fullName')
        .setLabel('Full Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80)
        .setValue(draft.answers.fullName || '')
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('coachingExperience')
        .setLabel('Coaching Experience')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(600)
        .setValue(draft.answers.coachingExperience || '')
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('previousTeams')
        .setLabel('Previous Teams Coached (Optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(200)
        .setValue(draft.answers.previousTeams || '')
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('avatarUrl')
        .setLabel('Profile Picture URL (or use Import File)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(draft.primaryImageUrl || '')
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('additionalInfo')
        .setLabel('Additional Information (Optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(400)
        .setValue(draft.answers.additionalInfo || '')
    )
  );
  return modal;
}

export function buildStaffAppDraftPayload(draft: TicketDraft, questions: TicketQuestionConfig[]) {
  const pages = Math.max(1, Math.ceil(questions.length / 5));
  const missingRequired = questions.filter((q) => q.required && !draft.answers[q.id]?.trim());
  const ready = Boolean(draft.staffDepartment) && missingRequired.length === 0;

  const summaryLines = questions.map((q, idx) => {
    const val = draft.answers[q.id]?.trim();
    return `${idx + 1}. **${q.label}**: ${val ? val.slice(0, 80) : q.required ? '`Required`' : '_Optional_'}`;
  });

  const embed = new EmbedBuilder()
    .setColor(TLC_COLOR)
    .setTitle('TLC Staff Application (Administration Recruitment)')
    .setDescription(
      'Select your preferred Department and complete all required questions across the form parts below.'
    )
    .addFields(
      {
        name: 'Discord Account (Auto-Detected)',
        value: `<@${draft.userId}> (@${draft.username})`,
        inline: true,
      },
      {
        name: 'Department',
        value: draft.staffDepartment || '`Select below`',
        inline: true,
      },
      {
        name: `Application Questions (${questions.length - missingRequired.length}/${questions.length} filled)`,
        value: summaryLines.join('\n').slice(0, 1020) || 'No questions configured.',
        inline: false,
      }
    );

  const deptRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`tlc_tkt_draft_dept:${draft.id}`)
      .setPlaceholder('Select Department to Apply For')
      .addOptions(
        STAFF_DEPARTMENTS.map((d) => ({
          label: d,
          value: d,
          default: draft.staffDepartment === d,
        }))
      )
  );

  const btnRow = new ActionRowBuilder<ButtonBuilder>();
  for (let p = 0; p < Math.min(pages, 3); p++) {
    btnRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`tlc_tkt_draft_qpage:${draft.id}:${p}`)
        .setLabel(`Fill Questions Part ${p + 1}`)
        .setStyle(ButtonStyle.Primary)
    );
  }
  btnRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_draft_submit:${draft.id}`)
      .setLabel('Submit Staff Application')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!ready)
  );

  return { embeds: [embed], components: [deptRow, btnRow], ephemeral: true };
}

export function buildComplaintDraftPayload(draft: TicketDraft, questions: TicketQuestionConfig[]) {
  const pages = Math.max(1, Math.ceil(questions.length / 5));
  const missingRequired = questions.filter((q) => q.required && !draft.answers[q.id]?.trim());
  const ready = Boolean(draft.complaintCategory) && missingRequired.length === 0;

  const evidenceText = [
    ...draft.uploadedFileLabels.map((l) => `📎 ${l}`),
    ...(draft.primaryImageUrl ? [`🔗 ${draft.primaryImageUrl}`] : []),
  ];

  const embed = new EmbedBuilder()
    .setColor(TLC_RED)
    .setTitle('TLC Official Complaint Submission')
    .setDescription(
      draft.awaitingAttachmentType === 'evidence'
        ? '📤 **Evidence Upload Active:** Send your screenshot or video file in this channel now. It will be encrypted into your complaint record.'
        : 'Select the complaint category, optionally mark it **Confidential / Anonymous**, select the reported Discord user (if applicable), and complete the complaint form.'
    )
    .addFields(
      {
        name: 'Complaint Category',
        value: draft.complaintCategory || '`Select category below`',
        inline: true,
      },
      {
        name: 'Confidential Mode',
        value: draft.isAnonymous
          ? '🔒 **Anonymous (Senior Admins Only)**'
          : '🔓 Standard (Staff Visible)',
        inline: true,
      },
      {
        name: 'Target Discord User (Optional)',
        value: draft.targetDiscordId ? `<@${draft.targetDiscordId}>` : '_Not specified / N/A_',
        inline: true,
      },
      {
        name: 'Details Status',
        value:
          questions
            .map((q) => `• **${q.label}**: ${draft.answers[q.id]?.trim() ? '✅ Provided' : q.required ? '❌ Required' : 'Optional'}`)
            .join('\n')
            .slice(0, 900) || '_Ready_',
        inline: false,
      },
      {
        name: 'Evidence Attached',
        value: evidenceText.length > 0 ? evidenceText.join('\n').slice(0, 500) : '_None yet (Upload File or Paste URL)_',
        inline: false,
      }
    );

  const catRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`tlc_tkt_draft_cmpcat:${draft.id}`)
      .setPlaceholder('1. Select Complaint Category')
      .addOptions(
        COMPLAINT_CATEGORIES.map((c) => ({
          label: c,
          value: c,
          default: draft.complaintCategory === c,
        }))
      )
  );

  const userRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`tlc_tkt_draft_target:${draft.id}`)
      .setPlaceholder('2. Select Target Discord User (Optional)')
  );

  const btnRow = new ActionRowBuilder<ButtonBuilder>();
  for (let p = 0; p < Math.min(pages, 2); p++) {
    btnRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`tlc_tkt_draft_qpage:${draft.id}:${p}`)
        .setLabel(pages > 1 ? `Fill Details (${p + 1})` : '3. Fill Complaint Details')
        .setStyle(ButtonStyle.Primary)
    );
  }
  btnRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_draft_anon:${draft.id}`)
      .setLabel(draft.isAnonymous ? 'Confidential: ON' : 'Confidential: OFF')
      .setStyle(draft.isAnonymous ? ButtonStyle.Danger : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_draft_upload:${draft.id}:evidence`)
      .setLabel('Attach Evidence')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_draft_submit:${draft.id}`)
      .setLabel('Submit Complaint')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!ready)
  );

  return { embeds: [embed], components: [catRow, userRow, btnRow], ephemeral: true };
}

export function buildTeamAppDraftPayload(draft: TicketDraft, questions: TicketQuestionConfig[]) {
  const missingRequired = questions.filter((q) => q.required && !draft.answers[q.id]?.trim());
  const ready = missingRequired.length === 0;

  const embed = new EmbedBuilder()
    .setColor(TLC_COLOR)
    .setTitle('Create a Team — Official Team Application')
    .setDescription(
      draft.awaitingAttachmentType === 'team_logo'
        ? '📤 **Logo Upload Active:** Send your **Team Logo image** in this channel now. It will be stored in original quality.'
        : 'Complete your Team Creation request using Discord selectors and the application form below.'
    )
    .addFields(
      {
        name: 'Team Owner / President',
        value: draft.teamOwnerDiscordId
          ? `<@${draft.teamOwnerDiscordId}>`
          : `<@${draft.userId}> (Applicant)`,
        inline: true,
      },
      {
        name: 'Existing Discord Role (Optional)',
        value: draft.teamRoleId ? `<@&${draft.teamRoleId}>` : '_None linked yet (Admin can link)_',
        inline: true,
      },
      {
        name: 'Team Logo File',
        value: draft.primaryMediaId
          ? `📎 ${draft.uploadedFileLabels[0] || 'Saved in DB'}`
          : '_Optional — Click Upload Team Logo_',
        inline: true,
      },
      {
        name: 'Application Responses',
        value: questions
          .map(
            (q) =>
              `• **${q.label}**: ${draft.answers[q.id]?.trim() ? draft.answers[q.id].slice(0, 70) : q.required ? '❌ Required' : '_Optional_'}`
          )
          .join('\n')
          .slice(0, 900),
        inline: false,
      }
    );

  const ownerRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`tlc_tkt_draft_owner:${draft.id}`)
      .setPlaceholder('Select Team Owner (Optional — defaults to you)')
  );

  const roleRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`tlc_tkt_draft_teamrole:${draft.id}`)
      .setPlaceholder('Select Existing Discord Role for Team (Optional)')
  );

  const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_draft_qpage:${draft.id}:0`)
      .setLabel('1. Fill Team Application')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_draft_upload:${draft.id}:team_logo`)
      .setLabel('2. Upload Team Logo')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_draft_submit:${draft.id}`)
      .setLabel('3. Submit Team Application')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!ready)
  );

  return { embeds: [embed], components: [ownerRow, roleRow, btnRow], ephemeral: true };
}

export function buildPlayerReportDraftPayload(draft: TicketDraft, questions: TicketQuestionConfig[]) {
  const missingRequired = questions.filter((q) => q.required && !draft.answers[q.id]?.trim());
  const ready = missingRequired.length === 0;
  const evidenceText = [
    ...draft.uploadedFileLabels.map((l) => `📎 ${l}`),
    ...(draft.answers.rep_evidence_url ? [`🔗 ${draft.answers.rep_evidence_url}`] : []),
  ];

  const embed = new EmbedBuilder()
    .setColor(TLC_AMBER)
    .setTitle('Player Report Submission')
    .setDescription(
      draft.awaitingAttachmentType === 'evidence'
        ? '📤 **Evidence Upload Active:** Send your screenshot or video file in this channel now.'
        : 'Select the reported Discord player (if in server), fill in the report form, and optionally attach evidence.'
    )
    .addFields(
      {
        name: 'Reported Player (Optional)',
        value: draft.targetDiscordId ? `<@${draft.targetDiscordId}>` : '_Not selected yet_',
        inline: true,
      },
      {
        name: 'Evidence Attached',
        value: evidenceText.length > 0 ? evidenceText.join('\n').slice(0, 400) : '_None yet_',
        inline: true,
      },
      {
        name: 'Form Fields',
        value: questions
          .map(
            (q) =>
              `• **${q.label}**: ${draft.answers[q.id]?.trim() ? '✅ Provided' : q.required ? '❌ Required' : '_Optional_'}`
          )
          .join('\n')
          .slice(0, 900),
        inline: false,
      }
    );

  const userRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`tlc_tkt_draft_target:${draft.id}`)
      .setPlaceholder('Select Reported Player from Discord (Optional)')
  );

  const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_draft_qpage:${draft.id}:0`)
      .setLabel('1. Fill Report Form')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_draft_upload:${draft.id}:evidence`)
      .setLabel('2. Attach Evidence File')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_draft_submit:${draft.id}`)
      .setLabel('3. Submit Report')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!ready)
  );

  return { embeds: [embed], components: [userRow, btnRow], ephemeral: true };
}

export function buildDynamicQuestionModal(
  draftId: string,
  title: string,
  questions: TicketQuestionConfig[],
  pageIdx: number,
  existingAnswers: Record<string, string>
) {
  const slice = questions.slice(pageIdx * 5, pageIdx * 5 + 5);
  const modal = new ModalBuilder()
    .setCustomId(`tlc_tkt_draft_qmodal:${draftId}:${pageIdx}`)
    .setTitle(title.slice(0, 45));

  for (const q of slice) {
    const style = q.type === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short;
    const input = new TextInputBuilder()
      .setCustomId(q.id)
      .setLabel(q.label.slice(0, 45))
      .setStyle(style)
      .setRequired(q.required)
      .setMaxLength(q.type === 'paragraph' ? 900 : 250);
    if (q.placeholder) input.setPlaceholder(q.placeholder.slice(0, 100));
    if (existingAnswers[q.id]) input.setValue(existingAnswers[q.id].slice(0, 900));
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }
  return modal;
}

export function buildDirectCategoryModal(
  cat: TicketCategoryConfig,
  pageIdx = 0
) {
  const slice = cat.questions.slice(pageIdx * 5, pageIdx * 5 + 5);
  const modal = new ModalBuilder()
    .setCustomId(`tlc_tkt_direct_modal:${cat.key}:${pageIdx}`)
    .setTitle(`${cat.label}`.slice(0, 45));

  for (const q of slice) {
    const style = q.type === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short;
    const input = new TextInputBuilder()
      .setCustomId(q.id)
      .setLabel(q.label.slice(0, 45))
      .setStyle(style)
      .setRequired(q.required)
      .setMaxLength(q.type === 'paragraph' ? 900 : 250);
    if (q.placeholder) input.setPlaceholder(q.placeholder.slice(0, 100));
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }
  return modal;
}

// ==================== INSIDE-TICKET EMBEDS & MANAGEMENT BUTTONS (K) ====================

export function buildInsideTicketPayload(
  ticket: UnifiedTicket,
  catConfig?: TicketCategoryConfig,
  attachedPreviewUrl?: string | null
) {
  const isComplaint =
    ticket.categoryKey === 'player_complaint' || ticket.categoryKey === 'player_report';
  const isRegOrApp =
    ticket.categoryKey === 'register' ||
    ticket.categoryKey === 'staff_application' ||
    ticket.categoryKey === 'create_team';

  const statusColor =
    ticket.status === 'Approved' || ticket.status === 'Resolved'
      ? TLC_COLOR
      : ticket.status === 'Rejected' || ticket.status === 'Dismissed' || ticket.priority === 'Urgent'
      ? TLC_RED
      : ticket.status === 'Closed'
      ? TLC_DARK
      : TLC_BLUE;

  const titleCategory = ticket.applicationSubType
    ? `${ticket.applicationSubType} Registration`
    : catConfig?.label || ticket.categoryKey.replace(/_/g, ' ');

  const embed = new EmbedBuilder()
    .setColor(statusColor)
    .setTitle(`${catConfig?.emoji || '🎫'} ${titleCategory} — ${ticket.ticketNumber}`)
    .setFooter({
      text: `Ticket ID: ${ticket.ticketNumber}${ticket.complaintId ? ` • Complaint ID: ${ticket.complaintId}` : ''} • TLC Support System`,
    })
    .setTimestamp(new Date(ticket.createdAt));

  if (ticket.categoryKey === 'general_inquiry' && ticket.answers.length === 0) {
    embed.setDescription(
      'Welcome to TLC Support! Please explain your question or concern. A member of our administration team will assist you as soon as possible.'
    );
  } else if (ticket.isAnonymous) {
    embed.setDescription(
      '🔒 **Confidential / Anonymous Submission:** The submitter identity is protected and visible only to authorized Senior Administrators.'
    );
  } else {
    embed.setDescription(
      'Please use this private ticket channel to communicate with TLC Administration. All messages and uploaded files are archived permanently.'
    );
  }

  const submittedByValue = ticket.isAnonymous
    ? '🔒 `Anonymous Complainant (Senior Admin Access Only)`'
    : `<@${ticket.creatorDiscordId}> (@${ticket.creatorUsername})`;

  embed.addFields(
    { name: 'Submitted By', value: submittedByValue, inline: true },
    { name: 'Status', value: `**${ticket.status}**`, inline: true },
    { name: 'Priority', value: `**${ticket.priority}**`, inline: true },
    {
      name: 'Claimed By',
      value: ticket.claimedByDiscordId
        ? `<@${ticket.claimedByDiscordId}> (@${ticket.claimedByUsername})`
        : '_Unclaimed_',
      inline: true,
    }
  );

  if (ticket.staffDepartment) {
    embed.addFields({ name: 'Department', value: ticket.staffDepartment, inline: true });
  }
  if (ticket.complaintCategory) {
    embed.addFields({ name: 'Complaint Category', value: ticket.complaintCategory, inline: true });
  }
  if (ticket.complaintId) {
    embed.addFields({ name: 'Complaint ID', value: `\`${ticket.complaintId}\``, inline: true });
  }
  if (ticket.targetDiscordId) {
    embed.addFields({
      name: 'Target / Reported User',
      value: `<@${ticket.targetDiscordId}> (${ticket.targetDisplayName || ticket.targetUsername || 'Discord Member'})`,
      inline: true,
    });
  }
  if (ticket.metadata.teamName) {
    embed.addFields({
      name: 'Proposed Team',
      value: `${ticket.metadata.teamEmoji || '⚽'} **${ticket.metadata.teamName}**`,
      inline: true,
    });
  }
  if (ticket.metadata.teamRoleId) {
    embed.addFields({ name: 'Team Role', value: `<@&${ticket.metadata.teamRoleId}>`, inline: true });
  }
  if (ticket.createdProfileTlcId) {
    embed.addFields({
      name: 'Created Profile TLC ID',
      value: `\`${ticket.createdProfileTlcId}\``,
      inline: true,
    });
  }
  if (ticket.createdClubId) {
    embed.addFields({ name: 'Created Club ID', value: `\`${ticket.createdClubId}\``, inline: true });
  }

  for (const ans of ticket.answers.slice(0, 12)) {
    if (!ans.answer?.trim()) continue;
    embed.addFields({
      name: ans.label.slice(0, 256),
      value: ans.answer.slice(0, 1000),
      inline: false,
    });
  }

  if (ticket.evidence.length > 0) {
    embed.addFields({
      name: `Attached Files / Evidence (${ticket.evidence.length})`,
      value: ticket.evidence
        .map((ev, idx) =>
          ev.kind === 'media'
            ? `${idx + 1}. 📎 **${ev.filename || 'Uploaded File'}** (Persisted)`
            : `${idx + 1}. 🔗 ${ev.url}`
        )
        .join('\n')
        .slice(0, 1000),
      inline: false,
    });
  }

  if (ticket.decision) {
    embed.addFields({
      name: `Decision: ${ticket.decision}`,
      value: `${ticket.decisionReason ? `Reason/Notes: ${ticket.decisionReason}\n` : ''}By ${ticket.decidedByUsername || 'Staff'}`,
      inline: false,
    });
  }

  if (attachedPreviewUrl) {
    if (ticket.categoryKey === 'register' || ticket.categoryKey === 'create_team') {
      embed.setThumbnail(attachedPreviewUrl);
    } else {
      embed.setImage(attachedPreviewUrl);
    }
  } else if (ticket.metadata.avatarUrl && ticket.metadata.avatarUrl.startsWith('http')) {
    embed.setThumbnail(ticket.metadata.avatarUrl);
  } else if (ticket.metadata.teamLogoUrl && ticket.metadata.teamLogoUrl.startsWith('http')) {
    embed.setThumbnail(ticket.metadata.teamLogoUrl);
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const isClosed = ticket.status === 'Closed';

  if (!isClosed) {
    if (isRegOrApp && !ticket.decision) {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`tlc_tkt_act:approve:${ticket.id}`)
            .setLabel(ticket.categoryKey === 'staff_application' ? 'ACCEPT' : 'APPROVE')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`tlc_tkt_act:reject:${ticket.id}`)
            .setLabel('REJECT')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`tlc_tkt_act:reqinfo:${ticket.id}`)
            .setLabel('REQUEST MORE INFO')
            .setStyle(ButtonStyle.Secondary)
        )
      );
    }

    if (isComplaint && !ticket.decision) {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`tlc_tkt_act:under_review:${ticket.id}`)
            .setLabel('UNDER REVIEW')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`tlc_tkt_act:reqinfo:${ticket.id}`)
            .setLabel('REQUEST MORE INFO')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`tlc_tkt_act:resolve:${ticket.id}`)
            .setLabel('RESOLVE')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`tlc_tkt_act:dismiss:${ticket.id}`)
            .setLabel('DISMISS')
            .setStyle(ButtonStyle.Danger)
        )
      );
    }

    const mgmtRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ticket.claimedByDiscordId
        ? new ButtonBuilder()
            .setCustomId(`tlc_tkt_act:unclaim:${ticket.id}`)
            .setLabel('UNCLAIM')
            .setStyle(ButtonStyle.Secondary)
        : new ButtonBuilder()
            .setCustomId(`tlc_tkt_act:claim:${ticket.id}`)
            .setLabel('CLAIM')
            .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`tlc_tkt_act:addevidence:${ticket.id}`)
        .setLabel('Upload File / Photo')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`tlc_tkt_act:stafftools:${ticket.id}`)
        .setLabel('Staff Tools')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`tlc_tkt_act:close:${ticket.id}`)
        .setLabel('CLOSE')
        .setStyle(ButtonStyle.Danger)
    );

    if (ticket.isAnonymous) {
      mgmtRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`tlc_tkt_act:reveal_anon:${ticket.id}`)
          .setLabel('Identity (Senior Admin)')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    rows.push(mgmtRow);
  } else {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`tlc_tkt_act:reopen:${ticket.id}`)
          .setLabel('REOPEN TICKET')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`tlc_tkt_act:delete:${ticket.id}`)
          .setLabel('DELETE CHANNEL')
          .setStyle(ButtonStyle.Danger)
      )
    );
  }

  return { embeds: [embed], components: rows };
}

export function buildStaffToolsPayload(ticket: UnifiedTicket, categories: TicketCategoryConfig[]) {
  const embed = new EmbedBuilder()
    .setColor(TLC_DARK)
    .setTitle(`Staff Management Tools — ${ticket.ticketNumber}`)
    .setDescription(
      `Priority: **${ticket.priority}** • Status: **${ticket.status}**\nPrivate Staff Notes: **${ticket.staffNotes.length}** (never shown to applicant)`
    );

  if (ticket.staffNotes.length > 0) {
    embed.addFields({
      name: 'Recent Private Staff Notes',
      value: ticket.staffNotes
        .slice(0, 5)
        .map((n) => `• **${n.authorUsername}** (${n.createdAt.slice(0, 16).replace('T', ' ')}): ${n.content}`)
        .join('\n')
        .slice(0, 1000),
      inline: false,
    });
  }

  const priorityRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`tlc_tkt_priority:${ticket.id}`)
      .setPlaceholder('Set Ticket Priority')
      .addOptions(
        (['Low', 'Normal', 'High', 'Urgent'] as TicketPriority[]).map((p) => ({
          label: `Priority: ${p}`,
          value: p,
          default: ticket.priority === p,
        }))
      )
  );

  const transferRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`tlc_tkt_transfer:${ticket.id}`)
      .setPlaceholder('Transfer Ticket Department / Category')
      .addOptions(
        categories.slice(0, 25).map((c) => ({
          label: `${c.emoji} ${c.label}`.slice(0, 100),
          value: c.key,
          default: ticket.categoryKey === c.key,
        }))
      )
  );

  const addMemberRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`tlc_tkt_add_member:${ticket.id}`)
      .setPlaceholder('ADD MEMBER to this ticket channel')
  );

  const removeMemberRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`tlc_tkt_rem_member:${ticket.id}`)
      .setPlaceholder('REMOVE MEMBER from this ticket channel')
  );

  const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_act:addnote:${ticket.id}`)
      .setLabel('Add Private Note')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_act:rename:${ticket.id}`)
      .setLabel('RENAME')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_act:reqinfo:${ticket.id}`)
      .setLabel('REQUEST MORE INFO')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_act:delete:${ticket.id}`)
      .setLabel('DELETE')
      .setStyle(ButtonStyle.Danger)
  );

  return {
    embeds: [embed],
    components: [priorityRow, transferRow, addMemberRow, removeMemberRow, btnRow],
    ephemeral: true,
  };
}

export function buildCloseConfirmationPayload(ticket: UnifiedTicket) {
  const embed = new EmbedBuilder()
    .setColor(TLC_AMBER)
    .setTitle(`Confirm Close Ticket — ${ticket.ticketNumber}`)
    .setDescription(
      'Are you sure you want to close this ticket? A permanent transcript will be archived in PostgreSQL and posted to the Ticket Log Channel.'
    );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_confirm_close:${ticket.id}`)
      .setLabel('CONFIRM CLOSE')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_cancel_confirm:${ticket.id}`)
      .setLabel('CANCEL')
      .setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row], ephemeral: true };
}

export function buildDeleteTicketConfirmationPayload(ticket: UnifiedTicket) {
  const embed = new EmbedBuilder()
    .setColor(TLC_RED)
    .setTitle(`Confirm Delete Ticket Channel — ${ticket.ticketNumber}`)
    .setDescription(
      'This will delete the Discord channel. **All ticket records, transcripts, applications, and complaints remain permanently preserved in the database.**'
    );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_confirm_delete:${ticket.id}`)
      .setLabel('CONFIRM DELETE')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`tlc_tkt_cancel_confirm:${ticket.id}`)
      .setLabel('CANCEL')
      .setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row], ephemeral: true };
}

export function buildTicketFeedbackPromptPayload(ticket: UnifiedTicket) {
  const embed = new EmbedBuilder()
    .setColor(TLC_COLOR)
    .setTitle(`Rate Your TLC Support Experience — ${ticket.ticketNumber}`)
    .setDescription(
      'Your ticket has been closed. Please rate the assistance you received from TLC Staff (1–5 stars) to help us improve support quality!'
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...[1, 2, 3, 4, 5].map((stars) =>
      new ButtonBuilder()
        .setCustomId(`tlc_tkt_rate:${ticket.id}:${stars}`)
        .setLabel(`${'⭐'.repeat(stars)} (${stars})`)
        .setStyle(stars >= 4 ? ButtonStyle.Success : stars === 3 ? ButtonStyle.Primary : ButtonStyle.Secondary)
    )
  );
  return { embeds: [embed], components: [row] };
}

export function buildTicketActionReasonModal(
  action: 'reject' | 'dismiss' | 'resolve' | 'reqinfo' | 'addnote' | 'rename' | 'team_role_url',
  ticketId: string,
  currentValue?: string
) {
  const titles: Record<typeof action, string> = {
    reject: 'Mandatory Rejection Reason',
    dismiss: 'Mandatory Dismissal Reason',
    resolve: 'Resolution Summary',
    reqinfo: 'Request Additional Information',
    addnote: 'Add Private Staff Note',
    rename: 'Rename Ticket Channel',
    team_role_url: 'Feedback Comment',
  };
  const labels: Record<typeof action, string> = {
    reject: 'Rejection Reason (Sent to Applicant)',
    dismiss: 'Dismissal Reason (Sent to Complainant)',
    resolve: 'Resolution Notes / Outcome',
    reqinfo: 'What additional details or evidence are needed?',
    addnote: 'Private Staff Note (Hidden from Applicant)',
    rename: 'New Discord Channel Name',
    team_role_url: 'Optional Feedback Comment',
  };
  const required = action !== 'team_role_url';

  const modal = new ModalBuilder()
    .setCustomId(`tlc_tkt_modal:${action}:${ticketId}`)
    .setTitle(titles[action]);

  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(labels[action])
    .setStyle(action === 'rename' ? TextInputStyle.Short : TextInputStyle.Paragraph)
    .setRequired(required)
    .setMaxLength(action === 'rename' ? 80 : 1000);
  if (currentValue) input.setValue(currentValue.slice(0, 80));

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

export function buildTicketStatsEmbed(stats: TicketStatistics, state: TlcDatabaseState) {
  const tCfg = getEffectiveTicketConfig(state);
  const catName = (key: TicketCategoryKey) =>
    tCfg.categories.find((c) => c.key === key)?.label || key;

  const perCatLines =
    stats.ticketsPerCategory.length > 0
      ? stats.ticketsPerCategory.map((c) => `• **${catName(c.categoryKey)}**: ${c.count}`).join('\n')
      : '_No tickets recorded yet._';

  const topStaffLines =
    stats.mostActiveStaff.length > 0
      ? stats.mostActiveStaff
          .map((s, i) => `${i + 1}. **@${s.username}** (<@${s.discordId}>) — ${s.actionsCount} action(s)`)
          .join('\n')
      : '_No staff activity recorded yet._';

  const avgText =
    stats.averageResolutionMinutes >= 60
      ? `${(stats.averageResolutionMinutes / 60).toFixed(1)} hr(s)`
      : `${stats.averageResolutionMinutes} min(s)`;

  return new EmbedBuilder()
    .setColor(TLC_COLOR)
    .setTitle('Touchline (TLC) — Ticket & Registration Statistics')
    .addFields(
      { name: 'Total Tickets', value: `**${stats.totalTickets}**`, inline: true },
      { name: 'Open Tickets', value: `**${stats.openTickets}**`, inline: true },
      { name: 'Closed Tickets', value: `**${stats.closedTickets}**`, inline: true },
      { name: 'Pending / Under Review', value: `**${stats.pendingReviewTickets}**`, inline: true },
      { name: 'Avg Resolution Time', value: `**${avgText}**`, inline: true },
      {
        name: 'Complaints Summary',
        value: `Total: **${stats.totalComplaints}** · Resolved: **${stats.resolvedComplaints}** · Pending: **${stats.pendingComplaints}**`,
        inline: false,
      },
      {
        name: 'Applications Summary',
        value: `Player Apps: **${stats.totalPlayerApplications}** · Coach Apps: **${stats.totalCoachApplications}** · Staff Apps: **${stats.totalStaffApplications}** · Team Apps: **${stats.totalTeamApplications}**\nApproved/Accepted: **${stats.approvedApplications}** · Rejected: **${stats.rejectedApplications}**`,
        inline: false,
      },
      { name: 'Tickets Per Category', value: perCatLines.slice(0, 1000), inline: false },
      { name: 'Most Active Staff Members', value: topStaffLines.slice(0, 1000), inline: false }
    )
    .setFooter({ text: 'Live metrics computed from PostgreSQL ticket archive' })
    .setTimestamp();
}

export function buildTicketLogEmbed(
  title: string,
  ticket: UnifiedTicket,
  actorUsername: string,
  details?: string,
  color = TLC_DARK
) {
  const isAnon = ticket.isAnonymous;
  const submitterText = isAnon
    ? '🔒 Anonymous Complainant'
    : `<@${ticket.creatorDiscordId}> (@${ticket.creatorUsername})`;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${title} — ${ticket.ticketNumber}`)
    .addFields(
      { name: 'Category', value: `${ticket.categoryKey}${ticket.applicationSubType ? ` (${ticket.applicationSubType})` : ''}`, inline: true },
      { name: 'Submitted By', value: submitterText, inline: true },
      { name: 'Action By', value: actorUsername, inline: true },
      { name: 'Status', value: ticket.status, inline: true }
    )
    .setTimestamp();

  if (ticket.complaintId) {
    embed.addFields({ name: 'Complaint ID', value: `\`${ticket.complaintId}\``, inline: true });
  }
  if (ticket.feedbackRating) {
    embed.addFields({
      name: 'Creator Evaluation',
      value: `${'⭐'.repeat(ticket.feedbackRating)} (${ticket.feedbackRating}/5)${ticket.feedbackComment ? `\n"${ticket.feedbackComment}"` : ''}`,
      inline: false,
    });
  }
  if (details) {
    embed.addFields({ name: 'Details', value: details.slice(0, 1000), inline: false });
  }
  return embed;
}

export function formatTicketTranscriptText(ticket: UnifiedTicket): string {
  const header = [
    `============================================================`,
    `TLC SUPPORT CENTER — OFFICIAL TICKET TRANSCRIPT`,
    `Ticket ID:      ${ticket.ticketNumber}`,
    ticket.complaintId ? `Complaint ID:   ${ticket.complaintId}` : null,
    `Category:       ${ticket.categoryKey}${ticket.applicationSubType ? ` (${ticket.applicationSubType})` : ''}`,
    `Created By:     ${ticket.isAnonymous ? 'ANONYMOUS (Protected Identity)' : `@${ticket.creatorUsername} (${ticket.creatorDiscordId})`}`,
    `Status:         ${ticket.status}`,
    `Decision:       ${ticket.decision || 'None'}${ticket.decisionReason ? ` — ${ticket.decisionReason}` : ''}`,
    `Created At:     ${ticket.createdAt}`,
    `Closed At:      ${ticket.closedAt || 'Still Open'}`,
    `============================================================`,
    ``,
    `--- FORM ANSWERS ---`,
    ...(ticket.answers.length > 0
      ? ticket.answers.map((a) => `${a.label}: ${a.answer}`)
      : ['(No structured form answers)']),
    ``,
    `--- CONVERSATION LOG (${ticket.transcript.length} messages) ---`,
  ].filter((x): x is string => x !== null);

  const messages = ticket.transcript.map((m) => {
    const speaker = ticket.isAnonymous && m.authorDiscordId === ticket.creatorDiscordId
      ? 'Anonymous Complainant'
      : `@${m.authorUsername}${m.isStaff ? ' [STAFF]' : ''}${m.isBot ? ' [BOT]' : ''}`;
    const att =
      m.attachments.length > 0
        ? ` [Attachments: ${m.attachments.map((a) => a.filename).join(', ')}]`
        : '';
    return `[${m.timestamp}] ${speaker}: ${m.content || '(no text)'}${att}`;
  });

  return [...header, ...messages].join('\n');
}
