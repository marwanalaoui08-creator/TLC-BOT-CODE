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
  AuditLogEntry,
  Club,
  ClubRegistrationRequest,
  CompetitionRegistration,
  Fixture,
  ManagerProfile,
  PLAYER_POSITIONS,
  PlayerProfile,
  ProfileCorrectionRequest,
  RegistrationRequest,
  RejectedRequestItem,
  SANCTION_TYPES,
  SanctionAppeal,
  SanctionRecord,
  SanctionType,
  SigningRequest,
  StandingRow,
  TlcDatabaseState,
  TransferOffer,
  TransferRecord,
} from '../src/shared/types.ts';

export const TLC_BRAND_COLOR = 0x059669;
export const TLC_DARK_COLOR = 0x0f172a;
export const TLC_AMBER_COLOR = 0xd97706;
export const TLC_RED_COLOR = 0xdc2626;

export function buildVerifyPanelPayload() {
  const embed = new EmbedBuilder()
    .setColor(TLC_BRAND_COLOR)
    .setTitle('Touchline (TLC) — Official Registration & Verification')
    .setDescription(
      [
        'Welcome to the official **Touchline Football Community**.',
        '',
        'Every verified player and manager receives a permanent **TLC ID** (e.g. `TLC-00001`), career profile, club eligibility, and verified server access.',
        '',
        'Click **Verify** below to choose your registration type (**Player** or **Manager**) and submit your application for staff review.',
      ].join('\n')
    )
    .setFooter({ text: 'TLC Football Management System · One official profile per Discord account' })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('tlc_verify_start')
      .setLabel('Verify')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('tlc_profile_correction_start')
      .setLabel('Request Profile Correction')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

export function buildRegistrationTypeSelectPayload() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('tlc_reg_type_select')
    .setPlaceholder('Select your official TLC Registration Type')
    .addOptions(
      {
        label: 'Player',
        description: 'Register as a player and select your primary match position',
        value: 'Player',
      },
      {
        label: 'Manager',
        description: 'Register as a club manager (no player position assigned)',
        value: 'Manager',
      }
    );

  return {
    content: 'Select whether you are registering as a **Player** or a **Manager**:',
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    ephemeral: true,
  };
}

export function buildPlayerPositionSelectPayload() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('tlc_reg_position_select')
    .setPlaceholder('Select your primary Player Position')
    .addOptions(
      PLAYER_POSITIONS.map((pos) => ({
        label: pos,
        description: `Primary position: ${pos}`,
        value: pos,
      }))
    );

  return {
    content: 'Step 2 of 2: Choose your **Position** to open the Player Registration Form:',
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    ephemeral: true,
  };
}

export function buildRegistrationModal(type: 'Player' | 'Manager', position?: string) {
  const modal = new ModalBuilder()
    .setCustomId(
      type === 'Player'
        ? `tlc_reg_modal_player_${position || 'CM'}`
        : 'tlc_reg_modal_manager'
    )
    .setTitle(type === 'Player' ? `TLC Player Registration (${position})` : 'TLC Manager Registration');

  const nameInput = new TextInputBuilder()
    .setCustomId('player_name')
    .setLabel(type === 'Player' ? 'Player Name (Official TLC Name)' : 'Manager Name (Official TLC Name)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(40);

  const robloxUserInput = new TextInputBuilder()
    .setCustomId('roblox_username')
    .setLabel('Roblox Username')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(40);

  const robloxAvatarInput = new TextInputBuilder()
    .setCustomId('roblox_avatar')
    .setLabel('Roblox Avatar / Image URL')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('https://...');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(robloxUserInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(robloxAvatarInput)
  );

  return modal;
}

export function buildRegistrationReviewEmbed(req: RegistrationRequest) {
  const statusDisplay =
    req.status === 'Rejected'
      ? `Cancelled${req.reviewedBy ? ` by ${req.reviewedBy}` : ''}`
      : req.tlcId
      ? `${req.status} (${req.tlcId})${req.reviewedBy ? ` · by ${req.reviewedBy}` : ''}`
      : req.status;

  const embed = new EmbedBuilder()
    .setColor(
      req.status === 'Approved'
        ? TLC_BRAND_COLOR
        : req.status === 'Rejected'
        ? TLC_RED_COLOR
        : TLC_AMBER_COLOR
    )
    .setTitle(`Registration Request · ${req.playerName}`)
    .setThumbnail(req.robloxAvatarUrl.startsWith('http') ? req.robloxAvatarUrl : null)
    .addFields(
      { name: 'Player Name', value: req.playerName, inline: true },
      { name: 'Registration Type', value: req.registrationType, inline: true },
      ...(req.registrationType === 'Player' && req.position
        ? [{ name: 'Position', value: req.position, inline: true }]
        : []),
      { name: 'Discord Username', value: `@${req.discordUsername}`, inline: true },
      { name: 'Discord User ID', value: `\`${req.discordUserId}\``, inline: true },
      { name: 'Roblox Username', value: req.robloxUsername, inline: true },
      { name: 'Registration Date', value: req.submittedAt.slice(0, 10), inline: true },
      { name: 'Status', value: statusDisplay, inline: true },
      ...(req.rejectionReason
        ? [{ name: 'Rejection Reason', value: req.rejectionReason, inline: false }]
        : [])
    )
    .setTimestamp(new Date(req.submittedAt));

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_reg_approve:${req.id}`)
      .setLabel('APPROVE')
      .setStyle(ButtonStyle.Success)
      .setDisabled(req.status !== 'Pending'),
    new ButtonBuilder()
      .setCustomId(`tlc_reg_cancel:${req.id}`)
      .setLabel('CANCEL')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(req.status !== 'Pending')
  );

  return { embeds: [embed], components: [row] };
}

export function buildPlayerProfileEmbed(
  player: PlayerProfile,
  clubName: string,
  disciplinary?: {
    suspendedMatchesRemaining: number;
    hasDisciplinaryBan: boolean;
    unpaidFineTotal: number;
    currency: string;
  }
) {
  const isBanned = Boolean(disciplinary?.hasDisciplinaryBan);
  const suspMatches = disciplinary?.suspendedMatchesRemaining ?? 0;
  const unpaidFine = disciplinary?.unpaidFineTotal ?? 0;

  const disciplinaryLines: string[] = [];
  if (isBanned) {
    disciplinaryLines.push('🚫 **Active Disciplinary Ban** (Ineligible for official matches)');
  } else if (suspMatches > 0 || player.status === 'Suspended') {
    disciplinaryLines.push(
      `⛔ **Suspended** — **${Math.max(suspMatches, 1)}** official match(es) remaining`
    );
  }
  if (unpaidFine > 0) {
    disciplinaryLines.push(`💰 **Outstanding Fines:** ${unpaidFine} ${disciplinary?.currency || 'TLC Coins'}`);
  }

  const embed = new EmbedBuilder()
    .setColor(player.status === 'Suspended' || isBanned || suspMatches > 0 ? TLC_RED_COLOR : TLC_BRAND_COLOR)
    .setTitle(`${player.playerName} · ${player.tlcId}`)
    .setDescription(`Official Touchline Player Profile · **${player.position}** · **${player.status}**`)
    .setThumbnail(player.robloxAvatarUrl.startsWith('http') ? player.robloxAvatarUrl : null)
    .addFields(
      { name: 'Current Club', value: clubName, inline: true },
      { name: 'Discord', value: `@${player.discordUsername}`, inline: true },
      { name: 'Roblox', value: player.robloxUsername, inline: true },
      { name: 'Matches Played', value: String(player.matchesPlayed), inline: true },
      { name: 'Goals', value: String(player.goals), inline: true },
      { name: 'Assists', value: String(player.assists), inline: true },
      { name: 'Clean Sheets', value: String(player.cleanSheets), inline: true },
      { name: 'Saves', value: String(player.saves), inline: true },
      { name: 'Average Rating', value: player.averageRating.toFixed(2), inline: true },
      { name: 'MOTM Awards', value: String(player.manOfTheMatchAwards), inline: true },
      { name: 'Trophies', value: String(player.trophies), inline: true },
      { name: 'Registered', value: player.registrationDate.slice(0, 10), inline: true },
      ...(disciplinaryLines.length > 0
        ? [{ name: 'Disciplinary Status', value: disciplinaryLines.join('\n'), inline: false }]
        : [])
    )
    .setFooter({ text: `TLC ID: ${player.tlcId}` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_profile_career:${player.tlcId}`)
      .setLabel('Career & Transfers')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`tlc_profile_achievements:${player.tlcId}`)
      .setLabel('Trophies & Achievements')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

export function buildManagerProfileEmbed(manager: ManagerProfile, clubName: string) {
  return new EmbedBuilder()
    .setColor(TLC_DARK_COLOR)
    .setTitle(`${manager.managerName} · ${manager.tlcId}`)
    .setDescription(`Official Touchline Manager Profile · **${manager.status}**`)
    .setThumbnail(manager.robloxAvatarUrl.startsWith('http') ? manager.robloxAvatarUrl : null)
    .addFields(
      { name: 'Current Club', value: clubName, inline: true },
      { name: 'Discord', value: `@${manager.discordUsername}`, inline: true },
      { name: 'Roblox', value: manager.robloxUsername, inline: true },
      { name: 'Matches Managed', value: String(manager.matchesManaged), inline: true },
      { name: 'Record (W-D-L)', value: `${manager.wins}-${manager.draws}-${manager.losses}`, inline: true },
      { name: 'Win Rate', value: `${manager.winRate}%`, inline: true },
      { name: 'Trophies', value: String(manager.trophies), inline: true },
      { name: 'Clubs Managed', value: String(manager.clubsManaged.length), inline: true },
      { name: 'Registered', value: manager.registrationDate.slice(0, 10), inline: true }
    )
    .setFooter({ text: `TLC ID: ${manager.tlcId}` });
}

export function buildClubProfileEmbed(club: Club, managerName: string, rosterCount: number) {
  return new EmbedBuilder()
    .setColor(TLC_BRAND_COLOR)
    .setTitle(`${club.name} (${club.shortCode}) · ${club.clubId}`)
    .setThumbnail(club.logoUrl.startsWith('http') ? club.logoUrl : null)
    .addFields(
      { name: 'Manager', value: managerName, inline: true },
      { name: 'Squad Size', value: String(rosterCount), inline: true },
      { name: 'Trophies', value: String(club.trophies), inline: true },
      { name: 'Matches Played', value: String(club.matchesPlayed), inline: true },
      { name: 'W / D / L', value: `${club.wins} / ${club.draws} / ${club.losses}`, inline: true },
      { name: 'Goals (GF / GA)', value: `${club.goalsFor} / ${club.goalsAgainst}`, inline: true }
    )
    .setFooter({ text: `Registered ${club.registrationDate.slice(0, 10)}` });
}

export function buildTransferOfferPlayerPayload(offer: TransferOffer) {
  const embed = new EmbedBuilder()
    .setColor(TLC_AMBER_COLOR)
    .setTitle(`Official Transfer Offer · ${offer.toClubName}`)
    .addFields(
      { name: 'Player Name', value: offer.playerName, inline: true },
      { name: 'Current Club', value: offer.fromClubName, inline: true },
      { name: 'Offered Club', value: offer.toClubName, inline: true },
      { name: 'Manager', value: offer.managerName, inline: true },
      { name: 'Transfer Type', value: offer.transferType, inline: true },
      { name: 'Offer Details', value: offer.details || 'Standard offer', inline: false }
    )
    .setTimestamp(new Date(offer.createdAt));

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_offer_accept:${offer.id}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`tlc_offer_decline:${offer.id}`)
      .setLabel('Decline')
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row] };
}

export function buildTransferStaffReviewPayload(offer: TransferOffer) {
  const embed = new EmbedBuilder()
    .setColor(
      offer.status === 'Approved'
        ? TLC_BRAND_COLOR
        : offer.status === 'Rejected by Player' ||
          offer.status === 'Rejected by Staff' ||
          offer.status === 'Cancelled'
        ? TLC_RED_COLOR
        : TLC_AMBER_COLOR
    )
    .setTitle(`Staff Transfer Review · ${offer.playerName}`)
    .addFields(
      { name: 'Player', value: `${offer.playerName} (${offer.playerTlcId})`, inline: true },
      { name: 'Route', value: `${offer.fromClubName} → ${offer.toClubName}`, inline: true },
      { name: 'Type', value: offer.transferType, inline: true },
      { name: 'Submitted By', value: offer.managerName, inline: true },
      { name: 'Status', value: offer.status, inline: true },
      { name: 'Details', value: offer.details || 'Standard offer', inline: false },
      ...(offer.rejectionReason
        ? [{ name: 'Rejection Reason', value: offer.rejectionReason, inline: false }]
        : [])
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_transfer_staff_approve:${offer.id}`)
      .setLabel('APPROVE')
      .setStyle(ButtonStyle.Success)
      .setDisabled(offer.status !== 'Pending Staff'),
    new ButtonBuilder()
      .setCustomId(`tlc_transfer_staff_cancel:${offer.id}`)
      .setLabel('CANCEL')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(offer.status !== 'Pending Staff')
  );

  return { embeds: [embed], components: [row] };
}

export function buildTransferAnnouncementEmbed(record: TransferRecord) {
  return new EmbedBuilder()
    .setColor(TLC_BRAND_COLOR)
    .setTitle(`OFFICIAL ${record.transferType.toUpperCase()}`)
    .setDescription(
      `**${record.playerName}** (\`${record.playerTlcId}\`) has completed a **${record.transferType}** from **${record.fromClubName}** to **${record.toClubName}**.`
    )
    .addFields(
      { name: 'Details', value: record.details || 'Official transfer completed', inline: false },
      { name: 'Approved By', value: record.approvedBy, inline: true }
    )
    .setTimestamp(new Date(record.completedAt));
}

export function buildResultAnnouncementEmbed(
  fixture: Fixture,
  homeName: string,
  awayName: string
) {
  return new EmbedBuilder()
    .setColor(TLC_BRAND_COLOR)
    .setTitle('OFFICIAL RESULT')
    .setDescription(`**${homeName} ${fixture.homeScore}–${fixture.awayScore} ${awayName}**`)
    .addFields(
      { name: 'Competition', value: fixture.competitionName, inline: true },
      { name: 'Round', value: fixture.roundLabel, inline: true },
      { name: 'Status', value: fixture.status, inline: true }
    )
    .setTimestamp();
}

export function buildStandingsEmbed(competitionName: string, rows: StandingRow[]) {
  const lines = rows.map(
    (r) =>
      `\`${String(r.position).padStart(2, '0')}\` **${r.clubName}** — P:${r.played} W:${r.won} D:${r.drawn} L:${r.lost} GD:${r.goalDifference >= 0 ? `+${r.goalDifference}` : r.goalDifference} **Pts:${r.points}**`
  );
  return new EmbedBuilder()
    .setColor(TLC_BRAND_COLOR)
    .setTitle(`${competitionName} — Standings Table`)
    .setDescription(lines.length > 0 ? lines.join('\n') : 'No clubs registered yet.')
    .setTimestamp();
}

export function buildAuditEmbed(entry: AuditLogEntry) {
  return new EmbedBuilder()
    .setColor(TLC_DARK_COLOR)
    .setTitle(`Audit Log · ${entry.action}`)
    .addFields(
      { name: 'Performed By', value: entry.actor, inline: true },
      { name: 'Target', value: entry.target, inline: true },
      { name: 'Previous Value', value: entry.previousValue || '—', inline: false },
      { name: 'New Value', value: entry.newValue || '—', inline: false }
    )
    .setTimestamp(new Date(entry.timestamp));
}

export function buildFixtureEmbed(fixture: Fixture, homeName: string, awayName: string) {
  return new EmbedBuilder()
    .setColor(TLC_BRAND_COLOR)
    .setTitle(`Fixture #${fixture.matchNumber} · ${fixture.competitionName}`)
    .setDescription(`**${homeName}** vs **${awayName}**`)
    .addFields(
      { name: 'Round', value: fixture.roundLabel, inline: true },
      { name: 'Date & Time', value: `${fixture.matchDate} · ${fixture.matchTime}`, inline: true },
      { name: 'Status', value: fixture.status, inline: true },
      { name: 'Referee', value: fixture.referee || 'Unassigned', inline: true }
    )
    .setTimestamp();
}

export function buildPlayerRatingCardEmbed(
  player: PlayerProfile,
  fixture: Fixture,
  rating: number,
  goals: number,
  assists: number,
  saves: number,
  motm: boolean
) {
  return new EmbedBuilder()
    .setColor(motm ? TLC_AMBER_COLOR : TLC_BRAND_COLOR)
    .setTitle(`Match Rating · ${player.playerName} (${player.tlcId})`)
    .setDescription(
      `${fixture.competitionName} · Match #${fixture.matchNumber} (${fixture.roundLabel})${
        motm ? '\n**Man of the Match**' : ''
      }`
    )
    .addFields(
      { name: 'Position', value: player.position, inline: true },
      { name: 'Match Rating', value: `${rating.toFixed(1)} / 10.0`, inline: true },
      { name: 'Season Avg', value: `${player.averageRating.toFixed(2)}`, inline: true },
      { name: 'Goals / Assists', value: `${goals}G · ${assists}A`, inline: true },
      { name: 'Saves', value: String(saves), inline: true },
      { name: 'Total MOTM', value: String(player.manOfTheMatchAwards), inline: true }
    )
    .setTimestamp();
}

export function buildFreeAgentSignPickerPayload(
  club: Club,
  freeAgents: PlayerProfile[],
  query?: string,
  position?: string
) {
  const filterLabel = [
    query ? `Query: "${query}"` : null,
    position ? `Position: ${position}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const lines = freeAgents
    .slice(0, 12)
    .map(
      (p) =>
        `\`${p.tlcId}\` **${p.playerName}** (${p.position}) — Avg **${p.averageRating.toFixed(
          2
        )}** · ${p.goals}G ${p.assists}A`
    );

  const embed = new EmbedBuilder()
    .setColor(TLC_BRAND_COLOR)
    .setTitle(`Free Agent Market · Sign Player for ${club.name}`)
    .setDescription(
      [
        filterLabel ? `Active Filter: **${filterLabel}**` : 'Showing available verified Free Agents.',
        '',
        lines.length > 0
          ? lines.join('\n')
          : 'No free agents matched this search. Click **Refine Search** to adjust filters.',
      ].join('\n')
    )
    .setFooter({ text: `Club ID: ${club.clubId} · Select a player below to send a formal offer` });

  const components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];

  if (freeAgents.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`tlc_sign_player_select:${club.clubId}`)
      .setPlaceholder('Select an available Free Agent to sign')
      .addOptions(
        freeAgents.slice(0, 25).map((p) => ({
          label: `${p.playerName} (${p.position}) · ${p.tlcId}`,
          description: `Avg ${p.averageRating.toFixed(2)} · ${p.matchesPlayed} GP · ${p.goals}G ${p.assists}A`,
          value: p.tlcId,
        }))
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_sign_player_search:${club.clubId}`)
      .setLabel('Search / Filter Free Agents')
      .setStyle(ButtonStyle.Secondary)
  );
  components.push(buttonRow);

  return { embeds: [embed], components, ephemeral: true };
}

export function buildSignSearchFilterModal(clubId: string) {
  const modal = new ModalBuilder()
    .setCustomId(`tlc_sign_search_modal:${clubId}`)
    .setTitle('Search Available Free Agents');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('search_query')
        .setLabel('Player Name or TLC ID (optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('e.g. Silva or TLC-00004')
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('search_position')
        .setLabel('Position Filter (GK, CB, CM, ST, etc.)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Leave blank for all positions')
    )
  );

  return modal;
}

export function buildSignPlayerOfferModal(clubId: string, player: PlayerProfile) {
  const modal = new ModalBuilder()
    .setCustomId(`tlc_sign_offer_modal:${clubId}:${player.tlcId}`)
    .setTitle(`Formal Offer: ${player.playerName.slice(0, 28)}`);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('contract_type')
        .setLabel('Contract Type (Signing or Loan)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue('Signing')
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('contract_term')
        .setLabel('Contract Duration')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue('1 Season (60d)')
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('offer_details')
        .setLabel('Squad Role & Formal Terms')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('First-team starter, jersey number, bonus clauses...')
    )
  );

  return modal;
}

export function buildEditRegistrationModal(req: RegistrationRequest) {
  const modal = new ModalBuilder()
    .setCustomId(`tlc_reg_edit_modal:${req.id}`)
    .setTitle(`Edit Application: ${req.playerName.slice(0, 26)}`);

  const components: ActionRowBuilder<TextInputBuilder>[] = [
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('player_name')
        .setLabel('Official TLC Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(req.playerName.slice(0, 40))
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('roblox_username')
        .setLabel('Roblox Username')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(req.robloxUsername.slice(0, 40))
    ),
  ];

  if (req.registrationType === 'Player') {
    components.push(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('position')
          .setLabel('Position (GK, CB, LB, RB, CDM, CM, CAM, LW, RW, ST)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(req.position || 'CM')
      )
    );
  }

  modal.addComponents(...components);
  return modal;
}

export function buildRegistrationAnnouncementEmbed(req: RegistrationRequest) {
  return new EmbedBuilder()
    .setColor(TLC_BRAND_COLOR)
    .setTitle(`New Verified TLC ${req.registrationType}`)
    .setDescription(
      `**${req.playerName}** (\`${req.tlcId}\`) is now officially verified in Touchline!`
    )
    .setThumbnail(req.robloxAvatarUrl.startsWith('http') ? req.robloxAvatarUrl : null)
    .addFields(
      { name: 'TLC ID', value: `\`${req.tlcId}\``, inline: true },
      { name: 'Role', value: req.registrationType, inline: true },
      ...(req.registrationType === 'Player' && req.position
        ? [{ name: 'Position', value: req.position, inline: true }]
        : []),
      { name: 'Club Status', value: 'Free Agent', inline: true }
    )
    .setTimestamp();
}

export function buildClubRegistrationReviewPayload(req: ClubRegistrationRequest) {
  const embed = new EmbedBuilder()
    .setColor(
      req.status === 'Approved'
        ? TLC_BRAND_COLOR
        : req.status === 'Cancelled'
        ? TLC_RED_COLOR
        : TLC_AMBER_COLOR
    )
    .setTitle(`Club Registration Request · ${req.name} (${req.shortCode})`)
    .setThumbnail(req.logoUrl.startsWith('http') ? req.logoUrl : null)
    .addFields(
      { name: 'Club Name', value: req.name, inline: true },
      { name: 'Short Code', value: req.shortCode, inline: true },
      { name: 'Requested By', value: `@${req.requestedByUsername} (\`${req.requestedByDiscordId}\`)`, inline: false },
      { name: 'Initial Manager TLC ID', value: req.managerTlcId || 'Vacant', inline: true },
      {
        name: 'Status',
        value: req.clubId ? `${req.status} (${req.clubId})` : req.status,
        inline: true,
      },
      ...(req.rejectionReason
        ? [{ name: 'Rejection Reason', value: req.rejectionReason, inline: false }]
        : [])
    )
    .setTimestamp(new Date(req.submittedAt));

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_clubreg_approve:${req.id}`)
      .setLabel('APPROVE')
      .setStyle(ButtonStyle.Success)
      .setDisabled(req.status !== 'Pending'),
    new ButtonBuilder()
      .setCustomId(`tlc_clubreg_cancel:${req.id}`)
      .setLabel('CANCEL')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(req.status !== 'Pending')
  );

  return { embeds: [embed], components: [row] };
}

export function buildCompetitionRegistrationReviewPayload(
  reg: CompetitionRegistration,
  competitionName: string
) {
  const statusText = reg.status === 'Rejected' ? 'Cancelled' : reg.status;
  const embed = new EmbedBuilder()
    .setColor(
      reg.status === 'Approved'
        ? TLC_BRAND_COLOR
        : reg.status === 'Rejected'
        ? TLC_RED_COLOR
        : TLC_AMBER_COLOR
    )
    .setTitle(`Competition Registration · ${reg.clubName}`)
    .addFields(
      { name: 'Competition', value: competitionName, inline: true },
      { name: 'Club', value: `${reg.clubName} (${reg.clubId})`, inline: true },
      { name: 'Manager TLC ID', value: reg.managerTlcId, inline: true },
      {
        name: 'Submitted Squad',
        value: reg.rosterTlcIds.length > 0 ? reg.rosterTlcIds.join(', ') : 'Current Club Roster',
        inline: false,
      },
      { name: 'Status', value: statusText, inline: true },
      ...(reg.rejectionReason
        ? [{ name: 'Rejection Reason', value: reg.rejectionReason, inline: false }]
        : [])
    )
    .setTimestamp(new Date(reg.submittedAt));

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_compreg_approve:${reg.id}`)
      .setLabel('APPROVE')
      .setStyle(ButtonStyle.Success)
      .setDisabled(reg.status !== 'Pending'),
    new ButtonBuilder()
      .setCustomId(`tlc_compreg_cancel:${reg.id}`)
      .setLabel('CANCEL')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(reg.status !== 'Pending')
  );

  return { embeds: [embed], components: [row] };
}

export function buildMatchResultReviewPayload(
  fixture: Fixture,
  homeName: string,
  awayName: string
) {
  const statusText = fixture.resultStatus || 'None';
  const embed = new EmbedBuilder()
    .setColor(
      fixture.resultStatus === 'Approved'
        ? TLC_BRAND_COLOR
        : fixture.resultStatus === 'Cancelled'
        ? TLC_RED_COLOR
        : TLC_AMBER_COLOR
    )
    .setTitle(`Match Result Review · Match #${fixture.matchNumber}`)
    .setDescription(`**${homeName} ${fixture.homeScore ?? 0} – ${fixture.awayScore ?? 0} ${awayName}**`)
    .addFields(
      { name: 'Competition', value: fixture.competitionName, inline: true },
      { name: 'Round', value: fixture.roundLabel, inline: true },
      { name: 'Submitted By', value: fixture.resultSubmittedBy || 'Match Official', inline: true },
      { name: 'Status', value: statusText, inline: true },
      ...(fixture.notes ? [{ name: 'Match Notes', value: fixture.notes, inline: false }] : []),
      ...(fixture.resultRejectionReason
        ? [{ name: 'Rejection Reason', value: fixture.resultRejectionReason, inline: false }]
        : [])
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_result_approve:${fixture.id}`)
      .setLabel('APPROVE')
      .setStyle(ButtonStyle.Success)
      .setDisabled(fixture.resultStatus !== 'Pending Approval'),
    new ButtonBuilder()
      .setCustomId(`tlc_result_cancel:${fixture.id}`)
      .setLabel('CANCEL')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(fixture.resultStatus !== 'Pending Approval')
  );

  return { embeds: [embed], components: [row] };
}

export function buildCorrectionReviewPayload(corr: ProfileCorrectionRequest, currentName: string) {
  const statusText = corr.status === 'Rejected' ? 'Cancelled' : corr.status;
  const changes = [
    corr.requestedFields.playerName ? `Name → **${corr.requestedFields.playerName}**` : null,
    corr.requestedFields.robloxUsername ? `Roblox → **${corr.requestedFields.robloxUsername}**` : null,
    corr.requestedFields.position ? `Position → **${corr.requestedFields.position}**` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(
      corr.status === 'Approved'
        ? TLC_BRAND_COLOR
        : corr.status === 'Rejected'
        ? TLC_RED_COLOR
        : TLC_AMBER_COLOR
    )
    .setTitle(`Profile Correction Request · ${currentName} (${corr.tlcId})`)
    .addFields(
      { name: 'TLC ID', value: `\`${corr.tlcId}\``, inline: true },
      { name: 'Discord User ID', value: `\`${corr.discordUserId}\``, inline: true },
      { name: 'Status', value: statusText, inline: true },
      { name: 'Requested Changes', value: changes || 'None specified', inline: false },
      { name: 'Reason', value: corr.reason || '—', inline: false },
      ...(corr.rejectionReason
        ? [{ name: 'Rejection Reason', value: corr.rejectionReason, inline: false }]
        : [])
    )
    .setTimestamp(new Date(corr.submittedAt));

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_corr_approve:${corr.id}`)
      .setLabel('APPROVE')
      .setStyle(ButtonStyle.Success)
      .setDisabled(corr.status !== 'Pending'),
    new ButtonBuilder()
      .setCustomId(`tlc_corr_cancel:${corr.id}`)
      .setLabel('CANCEL')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(corr.status !== 'Pending')
  );

  return { embeds: [embed], components: [row] };
}

export type SetupSection =
  | 'channels_core'
  | 'channels_matchday'
  | 'teams'
  | 'roles_core'
  | 'roles_positions'
  | 'roles_clubs'
  | 'toggles';

export function buildSetupPanelPayload(
  state: TlcDatabaseState,
  section: SetupSection = 'channels_core',
  selectedClubId?: string
) {
  const cfg = state.config;
  const fmtCh = (id?: string) => (id ? `<#${id}>` : '`Not configured`');
  const fmtRole = (id?: string) => (id ? `<@&${id}>` : '`Not configured`');
  const fmtStaffRoles =
    cfg.roles.staffRoleIds.length > 0
      ? cfg.roles.staffRoleIds.map((id) => `<@&${id}>`).join(', ')
      : '`Not configured (Admin/ManageGuild fallback)`';

  const activeTeams = state.clubs.filter((c) => c.status !== 'Deleted');

  const embed = new EmbedBuilder()
    .setColor(TLC_DARK_COLOR)
    .setTitle('Touchline (TLC) — Manual Discord Server Configuration')
    .setDescription(
      'Select your existing Discord channels and roles using the native Discord menus below. The bot never auto-creates channels or roles.'
    )
    .addFields(
      {
        name: 'Configured Channels',
        value: [
          `• **Registration (#verify-yourself):** ${fmtCh(cfg.channels.verifyYourselfId)}`,
          `• **Registration Review:** ${fmtCh(cfg.channels.registrationRequestsId)}`,
          `• **Signing Requests (/demande):** ${fmtCh(cfg.channels.signingRequestsId)}`,
          `• **Team Management:** ${fmtCh(cfg.channels.teamManagementId)}`,
          `• **Transfer Market:** ${fmtCh(cfg.channels.transferMarketId)}`,
          `• **Fixtures:** ${fmtCh(cfg.channels.fixturesId)}`,
          `• **Results:** ${fmtCh(cfg.channels.resultsId)}`,
          `• **Audit Logs:** ${fmtCh(cfg.channels.auditLogsId)}`,
          `• **Announcements:** ${fmtCh(cfg.channels.announcementsId)}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Configured Core & Position Roles',
        value: [
          `• **Verified:** ${fmtRole(cfg.roles.verifiedRoleId)} · **Unverified:** ${fmtRole(cfg.roles.unverifiedRoleId)}`,
          `• **Player:** ${fmtRole(cfg.roles.playerRoleId)} · **Manager:** ${fmtRole(cfg.roles.managerRoleId)}`,
          `• **GK:** ${fmtRole(cfg.roles.goalkeeperRoleId)} · **DEF:** ${fmtRole(cfg.roles.defenderRoleId)}`,
          `• **MID:** ${fmtRole(cfg.roles.midfielderRoleId)} · **ATT:** ${fmtRole(cfg.roles.attackerRoleId)}`,
          `• **Staff Roles:** ${fmtStaffRoles}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Automation, Teams & Approvals',
        value: [
          `Transfer Window: **${cfg.transferWindow.isOpen ? 'OPEN' : 'CLOSED'}**`,
          `Transfer Staff Approval: **${cfg.transferWindow.requireStaffApproval ? 'ON' : 'OFF'}**`,
          `Multi-Team Roles: **${cfg.transferWindow.allowMultipleTeamRoles ? 'ON' : 'OFF'}**`,
          `Result Staff Approval: **${cfg.competitions.requireResultApproval ? 'ON' : 'OFF'}**`,
          `Reg Announcements: **${cfg.notifications.publishRegistrationAnnouncements ? 'ON' : 'OFF'}**`,
          `DMs: **${cfg.notifications.sendDirectMessages ? 'ON' : 'OFF'}**`,
        ].join(' · '),
        inline: false,
      }
    )
    .setFooter({ text: 'Saved permanently to TLC database' })
    .setTimestamp();

  const sectionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('tlc_setup_section')
      .setPlaceholder('Choose configuration section')
      .addOptions(
        {
          label: 'Team Management & Signing Config (/setup teams)',
          value: 'teams',
          default: section === 'teams',
        },
        {
          label: 'Channels: Registration, Market & Announcements',
          value: 'channels_core',
          default: section === 'channels_core',
        },
        {
          label: 'Channels: Fixtures, Results & Audit Logs',
          value: 'channels_matchday',
          default: section === 'channels_matchday',
        },
        {
          label: 'Roles: Verified, Player, Manager & Staff',
          value: 'roles_core',
          default: section === 'roles_core',
        },
        {
          label: 'Roles: Goalkeeper, Defender, Midfielder & Attacker',
          value: 'roles_positions',
          default: section === 'roles_positions',
        },
        {
          label: 'Roles: Unverified & Club Roles',
          value: 'roles_clubs',
          default: section === 'roles_clubs',
        },
        {
          label: 'Approval & Notification Toggles',
          value: 'toggles',
          default: section === 'toggles',
        }
      )
  );

  const rows: ActionRowBuilder<
    StringSelectMenuBuilder | ChannelSelectMenuBuilder | RoleSelectMenuBuilder | ButtonBuilder
  >[] = [sectionRow];

  const textChannelTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

  if (section === 'teams') {
    rows.push(
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('tlc_setup_ch:signingRequestsId')
          .setPlaceholder('Set Signing Request Channel (/demande)')
          .setChannelTypes(...textChannelTypes)
      ),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('tlc_setup_ch:transferMarketId')
          .setPlaceholder('Set Transfer Announcement Channel (#transfer-market)')
          .setChannelTypes(...textChannelTypes)
      ),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('tlc_setup_ch:teamManagementId')
          .setPlaceholder('Set Team Management Channel')
          .setChannelTypes(...textChannelTypes)
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('tlc_setup_toggle:multiTeamRoles')
          .setLabel(
            `Allow Multiple Team Roles: ${cfg.transferWindow.allowMultipleTeamRoles ? 'ON' : 'OFF'}`
          )
          .setStyle(
            cfg.transferWindow.allowMultipleTeamRoles ? ButtonStyle.Success : ButtonStyle.Secondary
          ),
        new ButtonBuilder()
          .setCustomId('tlc_setup_jump:roles_core')
          .setLabel('Configure Verified Role')
          .setStyle(ButtonStyle.Primary)
      )
    );
  } else if (section === 'channels_core') {
    rows.push(
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('tlc_setup_ch:verifyYourselfId')
          .setPlaceholder('Set Registration Channel (#verify-yourself)')
          .setChannelTypes(...textChannelTypes)
      ),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('tlc_setup_ch:registrationRequestsId')
          .setPlaceholder('Set Registration Review Channel (#registration-requests)')
          .setChannelTypes(...textChannelTypes)
      ),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('tlc_setup_ch:transferMarketId')
          .setPlaceholder('Set Transfer Channel (#transfer-market)')
          .setChannelTypes(...textChannelTypes)
      ),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('tlc_setup_ch:announcementsId')
          .setPlaceholder('Set Announcements Channel (#announcements)')
          .setChannelTypes(...textChannelTypes)
      )
    );
  } else if (section === 'channels_matchday') {
    rows.push(
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('tlc_setup_ch:fixturesId')
          .setPlaceholder('Set Fixture Channel (#fixtures)')
          .setChannelTypes(...textChannelTypes)
      ),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('tlc_setup_ch:resultsId')
          .setPlaceholder('Set Results Channel (#results)')
          .setChannelTypes(...textChannelTypes)
      ),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('tlc_setup_ch:auditLogsId')
          .setPlaceholder('Set Audit Log Channel (#tlc-audit-logs)')
          .setChannelTypes(...textChannelTypes)
      )
    );
  } else if (section === 'roles_core') {
    rows.push(
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('tlc_setup_role:verifiedRoleId')
          .setPlaceholder('Set Verified Role')
      ),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('tlc_setup_role:playerRoleId')
          .setPlaceholder('Set Player Role')
      ),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('tlc_setup_role:managerRoleId')
          .setPlaceholder('Set Manager Role')
      ),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('tlc_setup_role:staffRoleIds')
          .setPlaceholder('Set Staff Role(s) (multi-select)')
          .setMinValues(1)
          .setMaxValues(5)
      )
    );
  } else if (section === 'roles_positions') {
    rows.push(
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('tlc_setup_role:goalkeeperRoleId')
          .setPlaceholder('Set Goalkeeper Role')
      ),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('tlc_setup_role:defenderRoleId')
          .setPlaceholder('Set Defender Role')
      ),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('tlc_setup_role:midfielderRoleId')
          .setPlaceholder('Set Midfielder Role')
      ),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('tlc_setup_role:attackerRoleId')
          .setPlaceholder('Set Attacker Role')
      )
    );
  } else if (section === 'roles_clubs') {
    rows.push(
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('tlc_setup_role:unverifiedRoleId')
          .setPlaceholder('Set Unverified Role (Optional)')
      )
    );

    const activeClubId = selectedClubId || activeTeams[0]?.clubId;
    if (activeTeams.length > 0) {
      const clubListText = activeTeams
        .slice(0, 15)
        .map((c) => `• ${c.logoEmoji ? `${c.logoEmoji} ` : ''}**${c.name}**: ${fmtRole(c.discordRoleId)}`)
        .join('\n');
      embed.addFields({ name: 'Configured Team / Club Roles', value: clubListText, inline: false });

      rows.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('tlc_setup_club_pick')
            .setPlaceholder('Choose Team to Configure Discord Role')
            .addOptions(
              activeTeams.slice(0, 25).map((c) => ({
                label: `${c.logoEmoji ? `${c.logoEmoji} ` : ''}${c.name}`,
                description: c.discordRoleId ? 'Discord Role linked' : 'No Discord role set',
                value: c.clubId,
                default: c.clubId === activeClubId,
              }))
            )
        )
      );
      if (activeClubId) {
        const activeClub = activeTeams.find((c) => c.clubId === activeClubId);
        rows.push(
          new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
            new RoleSelectMenuBuilder()
              .setCustomId(`tlc_setup_club_role:${activeClubId}`)
              .setPlaceholder(`Set Team Role for ${activeClub?.name || 'Team'}`)
          )
        );
      }
    }
  } else if (section === 'toggles') {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('tlc_setup_toggle:transferWindow')
          .setLabel(`Transfer Window: ${cfg.transferWindow.isOpen ? 'OPEN' : 'CLOSED'}`)
          .setStyle(cfg.transferWindow.isOpen ? ButtonStyle.Success : ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('tlc_setup_toggle:transferApproval')
          .setLabel(`Transfer Approval: ${cfg.transferWindow.requireStaffApproval ? 'ON' : 'OFF'}`)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('tlc_setup_toggle:resultApproval')
          .setLabel(`Result Approval: ${cfg.competitions.requireResultApproval ? 'ON' : 'OFF'}`)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('tlc_setup_toggle:regAnnouncements')
          .setLabel(
            `Reg Announce: ${cfg.notifications.publishRegistrationAnnouncements ? 'ON' : 'OFF'}`
          )
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('tlc_setup_toggle:sendDms')
          .setLabel(`Send DMs: ${cfg.notifications.sendDirectMessages ? 'ON' : 'OFF'}`)
          .setStyle(ButtonStyle.Secondary)
      )
    );
  }

  return { embeds: [embed], components: rows, ephemeral: true };
}

// ==================== TEAMSIGN TEAM MANAGEMENT & SIGNING EMBEDS ====================

export interface CreateTeamDraft {
  name?: string;
  logoEmoji?: string;
  roleId?: string;
  ownerId?: string;
  ownerUsername?: string;
}

export function buildCreateTeamBuilderPayload(draft: CreateTeamDraft) {
  const ready = Boolean(draft.name && draft.roleId && draft.ownerId);
  const embed = new EmbedBuilder()
    .setColor(ready ? TLC_BRAND_COLOR : TLC_DARK_COLOR)
    .setTitle('Create Official Team')
    .setDescription(
      'Select an existing **Team Role** and **Team Owner** below, then click **Enter Team Name & Logo**.'
    )
    .addFields(
      { name: 'Team Name', value: draft.name ? `**${draft.name}**` : '`Not entered yet`', inline: true },
      { name: 'Team Logo', value: draft.logoEmoji || '`Not entered yet`', inline: true },
      { name: 'Team Role', value: draft.roleId ? `<@&${draft.roleId}>` : '`Select below`', inline: true },
      { name: 'Team Owner', value: draft.ownerId ? `<@${draft.ownerId}>` : '`Select below`', inline: true }
    )
    .setFooter({ text: 'The bot links existing Discord roles and never creates roles automatically.' });

  const roleRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('tlc_createteam_role')
      .setPlaceholder('Select existing Team Role')
  );

  const ownerRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId('tlc_createteam_owner')
      .setPlaceholder('Select Team Owner / President')
  );

  const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('tlc_createteam_open_modal')
      .setLabel(draft.name ? 'Edit Name & Logo Emoji' : 'Enter Team Name & Logo Emoji')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('tlc_createteam_submit')
      .setLabel('Create Team')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!ready)
  );

  return { embeds: [embed], components: [roleRow, ownerRow, btnRow], ephemeral: true };
}

export function buildCreateTeamModal(draft?: CreateTeamDraft) {
  const modal = new ModalBuilder()
    .setCustomId('tlc_createteam_modal')
    .setTitle('Team Name & Logo Emoji');

  const nameInput = new TextInputBuilder()
    .setCustomId('team_name')
    .setLabel('Team Name')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50)
    .setPlaceholder('e.g. Real Madrid');
  if (draft?.name) nameInput.setValue(draft.name);

  const logoInput = new TextInputBuilder()
    .setCustomId('team_logo')
    .setLabel('Team Logo (Emoji)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20)
    .setPlaceholder('e.g. ⚪ or 🦁');
  if (draft?.logoEmoji) logoInput.setValue(draft.logoEmoji);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(logoInput)
  );
  return modal;
}

export function buildDeleteTeamPickerPayload(teams: Club[]) {
  const embed = new EmbedBuilder()
    .setColor(TLC_RED_COLOR)
    .setTitle('Delete Team')
    .setDescription(
      teams.length > 0
        ? 'Select the team you want to remove from active team management. Historical match records, transfers, and stats will be preserved, and the Discord role itself will not be deleted.'
        : 'There are no active teams to delete.'
    );

  if (teams.length === 0) {
    return { embeds: [embed], components: [], ephemeral: true };
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('tlc_deleteteam_pick')
    .setPlaceholder('Choose a team to delete')
    .addOptions(
      teams.slice(0, 25).map((t) => ({
        label: `${t.logoEmoji ? `${t.logoEmoji} ` : ''}${t.name}`.slice(0, 100),
        description: t.ownerDiscordUsername ? `Owner: @${t.ownerDiscordUsername}` : 'Active Team',
        value: t.clubId,
      }))
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    ephemeral: true,
  };
}

export function buildDeleteTeamConfirmPayload(
  team: Club,
  rosterCount: number,
  outcome?: 'Deleted' | 'Cancelled'
) {
  const embed = new EmbedBuilder()
    .setColor(outcome === 'Cancelled' ? TLC_DARK_COLOR : TLC_RED_COLOR)
    .setTitle(`${team.logoEmoji || '⚽'} ${team.name} — ${outcome ? outcome : 'Confirm Team Deletion'}`)
    .setDescription(
      outcome === 'Deleted'
        ? `**${team.logoEmoji || '⚽'} ${team.name}** has been removed from active teams. Historical matches, transfers, and stats remain preserved.`
        : outcome === 'Cancelled'
        ? `Deletion of **${team.logoEmoji || '⚽'} ${team.name}** was cancelled.`
        : `Are you sure you want to delete **${team.logoEmoji || '⚽'} ${team.name}**?\n\n• Active team membership roles will be removed from **${rosterCount}** member(s).\n• The Discord role itself will **not** be deleted.\n• All historical transfers, matches, and stats are preserved.`
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_deleteteam_confirm:${team.clubId}`)
      .setLabel('Confirm Delete')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(Boolean(outcome)),
    new ButtonBuilder()
      .setCustomId(`tlc_deleteteam_cancel:${team.clubId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(Boolean(outcome))
  );

  return { embeds: [embed], components: [row], ephemeral: true };
}

export function buildTeamsListPayload(teams: Club[], rosterCounts: Record<string, number>) {
  const lines = teams.map((t) => {
    const owner = t.ownerDiscordUserId ? `<@${t.ownerDiscordUserId}>` : 'No owner assigned';
    const count = rosterCounts[t.clubId] ?? 0;
    return `${t.logoEmoji || '⚽'} **${t.name}** — Owner: ${owner} · Players: **${count}**`;
  });

  const embed = new EmbedBuilder()
    .setColor(TLC_BRAND_COLOR)
    .setTitle(`Official TLC Teams (${teams.length})`)
    .setDescription(lines.length > 0 ? lines.join('\n') : 'No active teams registered yet.')
    .setTimestamp();

  const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  if (teams.length > 0) {
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('tlc_teams_view')
          .setPlaceholder('Select a team to view its full profile')
          .addOptions(
            teams.slice(0, 25).map((t) => ({
              label: `${t.logoEmoji ? `${t.logoEmoji} ` : ''}${t.name}`.slice(0, 100),
              description: `${rosterCounts[t.clubId] ?? 0} player(s)`,
              value: t.clubId,
            }))
          )
      )
    );
  }

  return { embeds: [embed], components };
}

export function buildTeamProfilePayload(
  team: Club,
  rosterMembers: {
    discordUserId: string;
    displayName: string;
    position?: string;
    isOwner: boolean;
  }[],
  recentTransfers: TransferRecord[]
) {
  const ownerDisplay = team.ownerDiscordUserId
    ? `<@${team.ownerDiscordUserId}>`
    : team.ownerDiscordUsername
    ? `@${team.ownerDiscordUsername}`
    : 'Unassigned';

  const rosterPreview =
    rosterMembers.length > 0
      ? rosterMembers
          .slice(0, 10)
          .map(
            (m) =>
              `• <@${m.discordUserId}> (${m.displayName})${m.position ? ` — **${m.position}**` : ''}${
                m.isOwner ? ' · Owner' : ''
              }`
          )
          .join('\n') + (rosterMembers.length > 10 ? `\n*...and ${rosterMembers.length - 10} more*` : '')
      : 'No active players on roster.';

  const transferLines =
    recentTransfers.length > 0
      ? recentTransfers
          .slice(0, 5)
          .map(
            (t) =>
              `• **${t.transferType}:** ${t.playerName} (${t.fromClubName} → ${t.toClubName})`
          )
          .join('\n')
      : 'No recent transfers recorded.';

  const historyLines =
    team.history.length > 0
      ? team.history
          .slice(0, 4)
          .map((h) => `• \`${h.date}\` ${h.summary}`)
          .join('\n')
      : 'No history entries yet.';

  const embed = new EmbedBuilder()
    .setColor(TLC_BRAND_COLOR)
    .setTitle(`${team.logoEmoji || '⚽'} ${team.name}`)
    .addFields(
      { name: 'Team Owner', value: ownerDisplay, inline: true },
      { name: 'Team Role', value: team.discordRoleId ? `<@&${team.discordRoleId}>` : 'Not linked', inline: true },
      { name: 'Players', value: String(rosterMembers.length), inline: true },
      { name: 'Created', value: team.registrationDate.slice(0, 10), inline: true },
      { name: 'Record (W-D-L)', value: `${team.wins}-${team.draws}-${team.losses}`, inline: true },
      { name: 'Trophies', value: String(team.trophies), inline: true },
      { name: 'Roster Preview', value: rosterPreview, inline: false },
      { name: 'Recent Transfers', value: transferLines, inline: false },
      { name: 'Team History', value: historyLines, inline: false }
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_team_btn_roster:${team.clubId}`)
      .setLabel('View Roster')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`tlc_team_btn_owner:${team.clubId}`)
      .setLabel('View Owner')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`tlc_team_btn_transfers:${team.clubId}`)
      .setLabel('Transfer History')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

export function buildDemandePickerPayload(teams: Club[], rosterCounts: Record<string, number>) {
  const embed = new EmbedBuilder()
    .setColor(TLC_BRAND_COLOR)
    .setTitle('Player Signing Request (/demande)')
    .setDescription(
      teams.length > 0
        ? 'Select the team you would like to join. Your signing request will be sent to staff for approval.'
        : 'No active teams are available right now.'
    );

  if (teams.length === 0) {
    return { embeds: [embed], components: [], ephemeral: true };
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('tlc_demande_pick')
    .setPlaceholder('Select a team to request to join')
    .addOptions(
      teams.slice(0, 25).map((t) => ({
        label: `${t.logoEmoji ? `${t.logoEmoji} ` : ''}${t.name}`.slice(0, 100),
        description: `${rosterCounts[t.clubId] ?? 0} player(s) currently on roster`,
        value: t.clubId,
      }))
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    ephemeral: true,
  };
}

export function buildDemandeReviewPayload(req: SigningRequest) {
  const statusLabel =
    req.status === 'Approved'
      ? `APPROVED${req.approvedBy ? ` · by ${req.approvedBy}` : ''}`
      : req.status === 'Cancelled'
      ? `CANCELLED${req.approvedBy ? ` · by ${req.approvedBy}` : ''}`
      : 'Pending Review';

  const embed = new EmbedBuilder()
    .setColor(
      req.status === 'Approved'
        ? TLC_BRAND_COLOR
        : req.status === 'Cancelled'
        ? TLC_RED_COLOR
        : TLC_AMBER_COLOR
    )
    .setTitle(`${req.requestedClubLogoEmoji || '⚽'} Player Signing Request · ${req.requestedClubName}`)
    .addFields(
      { name: 'Player Name', value: req.playerName, inline: true },
      { name: 'Discord Member', value: `<@${req.playerDiscordUserId}>`, inline: true },
      ...(req.robloxUsername ? [{ name: 'Roblox Username', value: req.robloxUsername, inline: true }] : []),
      { name: 'Current Team', value: req.fromClubName, inline: true },
      { name: 'Requested Team', value: `${req.requestedClubLogoEmoji || '⚽'} ${req.requestedClubName}`, inline: true },
      ...(req.position ? [{ name: 'Player Position', value: req.position, inline: true }] : []),
      { name: 'Team Logo', value: req.requestedClubLogoEmoji || '⚽', inline: true },
      { name: 'Request Date', value: req.requestDate.slice(0, 10), inline: true },
      { name: 'Status', value: statusLabel, inline: true },
      ...(req.rejectionReason
        ? [{ name: 'Rejection Reason', value: req.rejectionReason, inline: false }]
        : [])
    )
    .setTimestamp(new Date(req.requestDate));

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_demande_approve:${req.id}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success)
      .setDisabled(req.status !== 'Pending'),
    new ButtonBuilder()
      .setCustomId(`tlc_demande_cancel:${req.id}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(req.status !== 'Pending')
  );

  return { embeds: [embed], components: [row] };
}

export function buildReleaseRosterPayload(
  team: Club,
  members: { discordUserId: string; displayName: string; position?: string; isOwner: boolean }[]
) {
  const embed = new EmbedBuilder()
    .setColor(TLC_AMBER_COLOR)
    .setTitle(`${team.logoEmoji || '⚽'} ${team.name} — Release Player`)
    .setDescription(
      members.length > 0
        ? 'Select a player from your active team roster to release them to Free Agency.'
        : 'There are currently no active players on this team roster.'
    );

  if (members.length === 0) {
    return { embeds: [embed], components: [], ephemeral: true };
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`tlc_release_pick:${team.clubId}`)
    .setPlaceholder('Select player to release')
    .addOptions(
      members.slice(0, 25).map((m) => ({
        label: m.displayName.slice(0, 100),
        description: `${m.position ? `${m.position} · ` : ''}@${m.displayName}`.slice(0, 100),
        value: m.discordUserId,
      }))
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    ephemeral: true,
  };
}

export function buildReleaseConfirmPayload(
  team: Club,
  targetDiscordUserId: string,
  targetName: string,
  outcome?: 'Released' | 'Cancelled'
) {
  const embed = new EmbedBuilder()
    .setColor(outcome === 'Released' ? TLC_BRAND_COLOR : outcome === 'Cancelled' ? TLC_DARK_COLOR : TLC_RED_COLOR)
    .setTitle(`${team.logoEmoji || '⚽'} ${team.name} — ${outcome || 'Confirm Player Release'}`)
    .setDescription(
      outcome === 'Released'
        ? `<@${targetDiscordUserId}> (**${targetName}**) has been released from **${team.name}**.`
        : outcome === 'Cancelled'
        ? `Release cancelled. <@${targetDiscordUserId}> remains on **${team.name}**.`
        : `Confirm releasing <@${targetDiscordUserId}> (**${targetName}**) from **${team.name}**?\n\nThis will remove their team Discord role, update the roster, and record the release in transfer history.`
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_release_confirm:${team.clubId}:${targetDiscordUserId}`)
      .setLabel('Confirm Release')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(Boolean(outcome)),
    new ButtonBuilder()
      .setCustomId(`tlc_release_cancel:${team.clubId}:${targetDiscordUserId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(Boolean(outcome))
  );

  return { embeds: [embed], components: [row], ephemeral: true };
}

export function buildTransferHistoryEmbed(title: string, records: TransferRecord[]) {
  const lines = records.slice(0, 15).map(
    (t) =>
      `• \`${t.completedAt.slice(0, 10)}\` **${t.transferType}** — **${t.playerName}**: ${t.fromClubName} → ${t.toClubName} *(by ${t.approvedBy})*`
  );

  return new EmbedBuilder()
    .setColor(TLC_DARK_COLOR)
    .setTitle(title)
    .setDescription(lines.length > 0 ? lines.join('\n') : 'No transfer history recorded yet.')
    .setTimestamp();
}

// ==================== REJECTION REASONS & PLAYER DELETE / RESTORE ====================

export type RejectionModalTargetType =
  | 'reg'
  | 'demande'
  | 'transfer_reject'
  | 'transfer_cancel'
  | 'clubreg'
  | 'compreg'
  | 'corr'
  | 'result'
  | 'sanction_remove'
  | 'sanction_waive'
  | 'appeal_reject';

export function formatRejectionDmMessage(reason: string): string {
  return `❌ Your request has been rejected.\n\nReason: ${reason}`;
}

export function buildRejectionReasonModal(
  type: RejectionModalTargetType,
  id: string,
  title: string
) {
  const modal = new ModalBuilder()
    .setCustomId(`tlc_reject_modal:${type}:${id}`)
    .setTitle(title.slice(0, 45));

  const label =
    type === 'sanction_remove'
      ? 'Reason for Removing Sanction (Mandatory)'
      : type === 'sanction_waive'
      ? 'Explanation for Waiving Fine (Mandatory)'
      : type === 'appeal_reject'
      ? 'Appeal Rejection Reason (Mandatory)'
      : 'Rejection Reason (Mandatory)';

  const placeholder =
    type === 'sanction_remove'
      ? 'Explain why this sanction is being cancelled/removed...'
      : type === 'sanction_waive'
      ? 'Explain why this financial fine is being waived...'
      : type === 'appeal_reject'
      ? 'Provide a clear reason for rejecting this sanction appeal...'
      : 'Provide a clear, specific reason for rejecting this request...';

  const reasonInput = new TextInputBuilder()
    .setCustomId('rejection_reason')
    .setLabel(label)
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(500)
    .setPlaceholder(placeholder);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
  return modal;
}

export function buildDeletePlayerPickerPayload(
  players: { player: PlayerProfile; clubName: string }[],
  query?: string
) {
  const embed = new EmbedBuilder()
    .setColor(TLC_RED_COLOR)
    .setTitle('Delete Player Profile')
    .setDescription(
      players.length > 0
        ? `${
            query ? `Search Filter: **"${query}"**\n\n` : ''
          }Select a registered player below to review and confirm deletion.\n\n• Removes Verified, Player, Position & Team Discord roles.\n• Preserves all historical stats, transfers, trophies, and contracts.`
        : query
        ? `No active players matched **"${query}"**. Click **Search Players** to try another query.`
        : 'There are no active registered players.'
    )
    .setFooter({ text: `Showing ${Math.min(players.length, 25)} of ${players.length} matching player(s)` });

  const components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];

  if (players.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('tlc_delplayer_pick')
      .setPlaceholder('Select a player to delete')
      .addOptions(
        players.slice(0, 25).map(({ player, clubName }) => ({
          label: `${player.playerName} (${player.position}) · ${player.tlcId}`.slice(0, 100),
          description: `@${player.discordUsername} · Team: ${clubName}`.slice(0, 100),
          value: player.tlcId,
        }))
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('tlc_delplayer_open_search')
        .setLabel('Search Players')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components, ephemeral: true };
}

export function buildDeletePlayerSearchModal() {
  const modal = new ModalBuilder()
    .setCustomId('tlc_delplayer_search_modal')
    .setTitle('Search Registered Players');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('search_query')
        .setLabel('Player Name, Discord Username, or Team')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Leave blank to list all active players')
    )
  );
  return modal;
}

export function buildDeletePlayerConfirmPayload(
  player: PlayerProfile,
  clubName: string,
  outcome?: 'Deleted' | 'Cancelled'
) {
  const embed = new EmbedBuilder()
    .setColor(outcome === 'Cancelled' ? TLC_DARK_COLOR : TLC_RED_COLOR)
    .setTitle(
      outcome === 'Deleted'
        ? `Player Deleted · ${player.playerName}`
        : outcome === 'Cancelled'
        ? `Deletion Cancelled · ${player.playerName}`
        : `Confirm Player Deletion · ${player.playerName}`
    )
    .setThumbnail(player.robloxAvatarUrl.startsWith('http') ? player.robloxAvatarUrl : null)
    .setDescription(
      outcome === 'Deleted'
        ? `**${player.playerName}** (\`${player.tlcId}\`) has been removed from active players.\n\n• Verified, Player, Position & Team Discord roles removed.\n• Pending signing requests and transfer offers cancelled.\n• All historical match statistics, transfers, trophies, and contracts preserved.`
        : outcome === 'Cancelled'
        ? `Deletion of **${player.playerName}** (\`${player.tlcId}\`) was cancelled. No changes were made.`
        : 'Review the player details below and click **CONFIRM DELETE** to deactivate this profile while preserving all historical records.'
    )
    .addFields(
      { name: 'Player Name', value: player.playerName, inline: true },
      { name: 'Discord Username', value: `@${player.discordUsername}`, inline: true },
      { name: 'TLC ID', value: `\`${player.tlcId}\``, inline: true },
      { name: 'Current Team', value: clubName, inline: true },
      { name: 'Position', value: player.position, inline: true },
      {
        name: 'Career Stats Preserved',
        value: `${player.matchesPlayed} GP · ${player.goals}G · ${player.assists}A · ${player.trophies} Trophies`,
        inline: true,
      }
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_delplayer_confirm:${player.tlcId}`)
      .setLabel('CONFIRM DELETE')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(Boolean(outcome)),
    new ButtonBuilder()
      .setCustomId(`tlc_delplayer_cancel:${player.tlcId}`)
      .setLabel('CANCEL')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(Boolean(outcome))
  );

  return { embeds: [embed], components: [row], ephemeral: true };
}

export function buildRestorePlayerPickerPayload(
  deletedPlayers: { player: PlayerProfile; prevClubName: string }[],
  query?: string
) {
  const embed = new EmbedBuilder()
    .setColor(TLC_BRAND_COLOR)
    .setTitle('Restore Deleted Player')
    .setDescription(
      deletedPlayers.length > 0
        ? `${
            query ? `Search Filter: **"${query}"**\n\n` : ''
          }Select a previously deleted player below to inspect their preserved profile and restore them.`
        : query
        ? `No deleted players matched **"${query}"**.`
        : 'There are currently no deleted player profiles to restore.'
    )
    .setFooter({
      text: `Showing ${Math.min(deletedPlayers.length, 25)} of ${deletedPlayers.length} deleted player(s)`,
    });

  const components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];

  if (deletedPlayers.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('tlc_resplayer_pick')
      .setPlaceholder('Select a deleted player to restore')
      .addOptions(
        deletedPlayers.slice(0, 25).map(({ player, prevClubName }) => ({
          label: `${player.playerName} (${player.position}) · ${player.tlcId}`.slice(0, 100),
          description: `@${player.discordUsername} · Prev: ${prevClubName}`.slice(0, 100),
          value: player.tlcId,
        }))
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('tlc_resplayer_open_search')
        .setLabel('Search Deleted Players')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components, ephemeral: true };
}

export function buildRestorePlayerSearchModal() {
  const modal = new ModalBuilder()
    .setCustomId('tlc_resplayer_search_modal')
    .setTitle('Search Deleted Players');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('search_query')
        .setLabel('Player Name or Discord Username')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Leave blank to list all deleted players')
    )
  );
  return modal;
}

export function buildRestorePlayerConfirmPayload(
  player: PlayerProfile,
  prevClubName: string,
  outcome?: 'Restored' | 'Cancelled',
  restoredClubName?: string | null
) {
  const embed = new EmbedBuilder()
    .setColor(outcome === 'Cancelled' ? TLC_DARK_COLOR : TLC_BRAND_COLOR)
    .setTitle(
      outcome === 'Restored'
        ? `Player Restored · ${player.playerName}`
        : outcome === 'Cancelled'
        ? `Restore Cancelled · ${player.playerName}`
        : `Confirm Player Restoration · ${player.playerName}`
    )
    .setThumbnail(player.robloxAvatarUrl.startsWith('http') ? player.robloxAvatarUrl : null)
    .setDescription(
      outcome === 'Restored'
        ? `**${player.playerName}** (\`${player.tlcId}\`) has been restored to **Active** status.${
            restoredClubName
              ? `\n• Restored Team Membership: **${restoredClubName}**`
              : '\n• Eligible in active player searches and Free Agent lists.'
          }`
        : outcome === 'Cancelled'
        ? `Restoration of **${player.playerName}** (\`${player.tlcId}\`) was cancelled.`
        : 'Click **CONFIRM RESTORE** to reactivate this official TLC profile, historical career records, and eligible Discord roles.'
    )
    .addFields(
      { name: 'Player Name', value: player.playerName, inline: true },
      { name: 'Discord Username', value: `@${player.discordUsername}`, inline: true },
      { name: 'TLC ID', value: `\`${player.tlcId}\``, inline: true },
      { name: 'Previous Team', value: prevClubName, inline: true },
      { name: 'Position', value: player.position, inline: true },
      {
        name: 'Deleted Info',
        value: player.deletedAt
          ? `${player.deletedAt.slice(0, 10)} by ${player.deletedBy || 'Admin'}`
          : 'Deactivated',
        inline: true,
      },
      {
        name: 'Preserved Career Stats',
        value: `${player.matchesPlayed} GP · ${player.goals}G · ${player.assists}A · ${player.trophies} Trophies`,
        inline: false,
      }
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_resplayer_confirm:${player.tlcId}`)
      .setLabel('CONFIRM RESTORE')
      .setStyle(ButtonStyle.Success)
      .setDisabled(Boolean(outcome)),
    new ButtonBuilder()
      .setCustomId(`tlc_resplayer_cancel:${player.tlcId}`)
      .setLabel('CANCEL')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(Boolean(outcome))
  );

  return { embeds: [embed], components: [row], ephemeral: true };
}

export function buildRejectedRequestsEmbed(
  items: RejectedRequestItem[],
  categoryLabel: string
) {
  const lines = items.slice(0, 12).map(
    (item) =>
      `• **[${item.category}]** ${item.title} (${item.requesterName})\n  ↳ **Reason:** ${item.reason} — *by ${item.rejectedBy} on ${item.rejectedAt.slice(0, 10)}*`
  );

  return new EmbedBuilder()
    .setColor(TLC_RED_COLOR)
    .setTitle(`Rejected Requests Archive · ${categoryLabel} (${items.length})`)
    .setDescription(
      lines.length > 0 ? lines.join('\n\n') : 'No rejected requests recorded for this filter.'
    )
    .setTimestamp();
}

// ==================== MANAGER DELETE / RESTORE ====================

export function buildDeleteManagerPickerPayload(
  managers: { manager: ManagerProfile; clubName: string }[],
  query?: string
) {
  const embed = new EmbedBuilder()
    .setColor(TLC_RED_COLOR)
    .setTitle('Delete Manager Profile')
    .setDescription(
      managers.length > 0
        ? `${
            query ? `Search Filter: **"${query}"**\n\n` : ''
          }Select a registered manager below to review and confirm deletion.\n\n• Removes Verified, Manager & Team Discord roles (if applicable).\n• Preserves all historical match records, clubs managed, and trophies.`
        : query
        ? `No active managers matched **"${query}"**. Click **Search Managers** to try another query.`
        : 'There are no active registered managers.'
    )
    .setFooter({ text: `Showing ${Math.min(managers.length, 25)} of ${managers.length} matching manager(s)` });

  const components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];

  if (managers.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('tlc_delmgr_pick')
      .setPlaceholder('Select a manager to delete')
      .addOptions(
        managers.slice(0, 25).map(({ manager, clubName }) => ({
          label: `${manager.managerName} · ${manager.tlcId}`.slice(0, 100),
          description: `@${manager.discordUsername} · Club: ${clubName}`.slice(0, 100),
          value: manager.tlcId,
        }))
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('tlc_delmgr_open_search')
        .setLabel('Search Managers')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components, ephemeral: true };
}

export function buildDeleteManagerSearchModal() {
  const modal = new ModalBuilder()
    .setCustomId('tlc_delmgr_search_modal')
    .setTitle('Search Registered Managers');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('search_query')
        .setLabel('Manager Name, Discord Username, or Club')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Leave blank to list all active managers')
    )
  );
  return modal;
}

export function buildDeleteManagerConfirmPayload(
  manager: ManagerProfile,
  clubName: string,
  outcome?: 'Deleted' | 'Cancelled'
) {
  const embed = new EmbedBuilder()
    .setColor(outcome === 'Cancelled' ? TLC_DARK_COLOR : TLC_RED_COLOR)
    .setTitle(
      outcome === 'Deleted'
        ? `Manager Deleted · ${manager.managerName}`
        : outcome === 'Cancelled'
        ? `Deletion Cancelled · ${manager.managerName}`
        : `Confirm Manager Deletion · ${manager.managerName}`
    )
    .setThumbnail(manager.robloxAvatarUrl.startsWith('http') ? manager.robloxAvatarUrl : null)
    .setDescription(
      outcome === 'Deleted'
        ? `**${manager.managerName}** (\`${manager.tlcId}\`) has been removed from active managers.\n\n• Verified, Manager & Team Discord roles removed.\n• Pending transfer offers & competition entries cancelled.\n• All historical match records, clubs managed, and trophies preserved.`
        : outcome === 'Cancelled'
        ? `Deletion of **${manager.managerName}** (\`${manager.tlcId}\`) was cancelled. No changes were made.`
        : 'Review the manager details below and click **CONFIRM DELETE** to deactivate this profile while preserving all historical records.'
    )
    .addFields(
      { name: 'Manager Name', value: manager.managerName, inline: true },
      { name: 'Discord Username', value: `@${manager.discordUsername}`, inline: true },
      { name: 'TLC ID', value: `\`${manager.tlcId}\``, inline: true },
      { name: 'Current Club', value: clubName, inline: true },
      { name: 'Record (W-D-L)', value: `${manager.wins}-${manager.draws}-${manager.losses}`, inline: true },
      {
        name: 'Career Stats Preserved',
        value: `${manager.matchesManaged} Managed · ${manager.winRate}% Win Rate · ${manager.trophies} Trophies`,
        inline: true,
      }
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_delmgr_confirm:${manager.tlcId}`)
      .setLabel('CONFIRM DELETE')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(Boolean(outcome)),
    new ButtonBuilder()
      .setCustomId(`tlc_delmgr_cancel:${manager.tlcId}`)
      .setLabel('CANCEL')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(Boolean(outcome))
  );

  return { embeds: [embed], components: [row], ephemeral: true };
}

export function buildRestoreManagerPickerPayload(
  deletedManagers: { manager: ManagerProfile; prevClubName: string }[],
  query?: string
) {
  const embed = new EmbedBuilder()
    .setColor(TLC_BRAND_COLOR)
    .setTitle('Restore Deleted Manager')
    .setDescription(
      deletedManagers.length > 0
        ? `${
            query ? `Search Filter: **"${query}"**\n\n` : ''
          }Select a previously deleted manager below to inspect their preserved profile and restore them.`
        : query
        ? `No deleted managers matched **"${query}"**.`
        : 'There are currently no deleted manager profiles to restore.'
    )
    .setFooter({
      text: `Showing ${Math.min(deletedManagers.length, 25)} of ${deletedManagers.length} deleted manager(s)`,
    });

  const components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];

  if (deletedManagers.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('tlc_resmgr_pick')
      .setPlaceholder('Select a deleted manager to restore')
      .addOptions(
        deletedManagers.slice(0, 25).map(({ manager, prevClubName }) => ({
          label: `${manager.managerName} · ${manager.tlcId}`.slice(0, 100),
          description: `@${manager.discordUsername} · Prev: ${prevClubName}`.slice(0, 100),
          value: manager.tlcId,
        }))
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('tlc_resmgr_open_search')
        .setLabel('Search Deleted Managers')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components, ephemeral: true };
}

export function buildRestoreManagerSearchModal() {
  const modal = new ModalBuilder()
    .setCustomId('tlc_resmgr_search_modal')
    .setTitle('Search Deleted Managers');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('search_query')
        .setLabel('Manager Name or Discord Username')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Leave blank to list all deleted managers')
    )
  );
  return modal;
}

export function buildRestoreManagerConfirmPayload(
  manager: ManagerProfile,
  prevClubName: string,
  outcome?: 'Restored' | 'Cancelled',
  restoredClubName?: string | null
) {
  const embed = new EmbedBuilder()
    .setColor(outcome === 'Cancelled' ? TLC_DARK_COLOR : TLC_BRAND_COLOR)
    .setTitle(
      outcome === 'Restored'
        ? `Manager Restored · ${manager.managerName}`
        : outcome === 'Cancelled'
        ? `Restore Cancelled · ${manager.managerName}`
        : `Confirm Manager Restoration · ${manager.managerName}`
    )
    .setThumbnail(manager.robloxAvatarUrl.startsWith('http') ? manager.robloxAvatarUrl : null)
    .setDescription(
      outcome === 'Restored'
        ? `**${manager.managerName}** (\`${manager.tlcId}\`) has been restored to **Active** status.${
            restoredClubName
              ? `\n• Restored Club Assignment: **${restoredClubName}**`
              : '\n• Eligible in active manager searches and club appointments.'
          }`
        : outcome === 'Cancelled'
        ? `Restoration of **${manager.managerName}** (\`${manager.tlcId}\`) was cancelled.`
        : 'Click **CONFIRM RESTORE** to reactivate this official TLC manager profile, historical career records, and eligible Discord roles.'
    )
    .addFields(
      { name: 'Manager Name', value: manager.managerName, inline: true },
      { name: 'Discord Username', value: `@${manager.discordUsername}`, inline: true },
      { name: 'TLC ID', value: `\`${manager.tlcId}\``, inline: true },
      { name: 'Previous Club', value: prevClubName, inline: true },
      { name: 'Record (W-D-L)', value: `${manager.wins}-${manager.draws}-${manager.losses}`, inline: true },
      {
        name: 'Deleted Info',
        value: manager.deletedAt
          ? `${manager.deletedAt.slice(0, 10)} by ${manager.deletedBy || 'Admin'}`
          : 'Deactivated',
        inline: true,
      },
      {
        name: 'Preserved Career Stats',
        value: `${manager.matchesManaged} Managed · ${manager.winRate}% Win Rate · ${manager.trophies} Trophies`,
        inline: false,
      }
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_resmgr_confirm:${manager.tlcId}`)
      .setLabel('CONFIRM RESTORE')
      .setStyle(ButtonStyle.Success)
      .setDisabled(Boolean(outcome)),
    new ButtonBuilder()
      .setCustomId(`tlc_resmgr_cancel:${manager.tlcId}`)
      .setLabel('CANCEL')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(Boolean(outcome))
  );

  return { embeds: [embed], components: [row], ephemeral: true };
}

// ==================== DISCIPLINARY SYSTEM — SANCTIONS MANAGEMENT ====================

export interface SanctionDraft {
  draftId: string;
  issuerDiscordId: string;
  playerDiscordUserId?: string;
  playerDiscordUsername?: string;
  fallbackPlayerName?: string;
  fallbackAvatarUrl?: string;
  sanctionType?: SanctionType;
  reason?: string;
  fineAmount: number;
  suspensionMatches: number;
}

export function buildSanctionBuilderPayload(
  draft: SanctionDraft,
  currency: string,
  resolvedPlayer?: { name: string; teamName: string; tlcId?: string | null }
) {
  const ready = Boolean(draft.playerDiscordUserId && draft.sanctionType && draft.reason?.trim());
  const embed = new EmbedBuilder()
    .setColor(ready ? TLC_AMBER_COLOR : TLC_DARK_COLOR)
    .setTitle('TLC Disciplinary System — Issue Sanction')
    .setDescription(
      'Select the **Discord User**, choose the **Sanction Type**, and enter the **Reason, Fine Amount & Match Suspension** before previewing and confirming.'
    )
    .addFields(
      {
        name: '1. Discord User',
        value: draft.playerDiscordUserId
          ? `<@${draft.playerDiscordUserId}>${
              resolvedPlayer
                ? ` (**${resolvedPlayer.name}** · ${resolvedPlayer.teamName}${
                    resolvedPlayer.tlcId ? ` · \`${resolvedPlayer.tlcId}\`` : ''
                  })`
                : ` (@${draft.playerDiscordUsername || 'user'})`
            }`
          : '`Not selected`',
        inline: false,
      },
      {
        name: '2. Sanction Type',
        value: draft.sanctionType ? `**${draft.sanctionType}**` : '`Not selected`',
        inline: true,
      },
      {
        name: '3. Fine Amount',
        value: `${draft.fineAmount} ${currency}`,
        inline: true,
      },
      {
        name: '4. Match Suspension',
        value: `${draft.suspensionMatches} official match(es)`,
        inline: true,
      },
      {
        name: '5. Sanction Reason',
        value: draft.reason?.trim() || '`Not entered yet`',
        inline: false,
      }
    )
    .setFooter({ text: `Draft ${draft.draftId} · Step 1 of 2: Configure & Preview` });

  const userRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`tlc_sanction_user:${draft.draftId}`)
      .setPlaceholder('Select player directly from Discord')
  );

  const typeRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`tlc_sanction_type:${draft.draftId}`)
      .setPlaceholder('Select Sanction Type')
      .addOptions(
        SANCTION_TYPES.map((t) => ({
          label: t,
          value: t,
          default: draft.sanctionType === t,
        }))
      )
  );

  const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_sanction_open_modal:${draft.draftId}`)
      .setLabel(draft.reason ? 'Edit Reason / Fine / Suspension' : 'Enter Reason, Fine & Suspension')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`tlc_sanction_preview:${draft.draftId}`)
      .setLabel('Preview Sanction')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!ready),
    new ButtonBuilder()
      .setCustomId(`tlc_sanction_cancel:${draft.draftId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [userRow, typeRow, btnRow], ephemeral: true };
}

export function buildSanctionDetailsModal(draft: SanctionDraft, currency: string) {
  const modal = new ModalBuilder()
    .setCustomId(`tlc_sanction_modal:${draft.draftId}`)
    .setTitle('Sanction Reason, Fine & Suspension');

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Sanction Reason')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(800)
    .setPlaceholder('Explain why the player is being sanctioned...')
    .setValue(draft.reason ? draft.reason.slice(0, 800) : '');

  const fineInput = new TextInputBuilder()
    .setCustomId('fine_amount')
    .setLabel(`Fine Amount (${currency}) — enter 0 if none`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(String(draft.fineAmount ?? 0));

  const suspInput = new TextInputBuilder()
    .setCustomId('suspension_matches')
    .setLabel('Match Suspension (official matches) — 0 if none')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(String(draft.suspensionMatches ?? 0));

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(fineInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(suspInput)
  );
  return modal;
}

export function buildSanctionPreviewPayload(
  draft: SanctionDraft,
  currency: string,
  resolved: {
    playerName: string;
    discordUsername: string;
    teamName: string;
    avatarUrl?: string;
    tlcId?: string | null;
  },
  issuerUsername: string,
  outcome?: 'Confirmed' | 'Cancelled'
) {
  const embed = new EmbedBuilder()
    .setColor(outcome === 'Cancelled' ? TLC_DARK_COLOR : outcome === 'Confirmed' ? TLC_BRAND_COLOR : TLC_AMBER_COLOR)
    .setTitle(
      outcome === 'Confirmed'
        ? 'Sanction Confirmed & Issued'
        : outcome === 'Cancelled'
        ? 'Sanction Draft Cancelled'
        : 'Preview — TLC SANCTION NOTICE'
    )
    .setThumbnail(resolved.avatarUrl?.startsWith('http') ? resolved.avatarUrl : null)
    .setDescription(
      outcome === 'Confirmed'
        ? 'The official sanction has been saved and published.'
        : outcome === 'Cancelled'
        ? 'This sanction draft was cancelled. No sanction was issued.'
        : 'Review the sanction details below. Click **CONFIRM SANCTION** to save and publish the official notice.'
    )
    .addFields(
      { name: 'Player Name', value: resolved.playerName, inline: true },
      {
        name: 'Discord Username & Mention',
        value: `@${resolved.discordUsername} (<@${draft.playerDiscordUserId}>)`,
        inline: true,
      },
      { name: 'Current Team', value: resolved.teamName, inline: true },
      { name: 'Sanction Type', value: draft.sanctionType || 'Other', inline: true },
      { name: 'Fine Amount', value: `${draft.fineAmount} ${currency}`, inline: true },
      { name: 'Matches Suspended', value: `${draft.suspensionMatches} match(es)`, inline: true },
      { name: 'Issuing Administrator', value: `@${issuerUsername}`, inline: true },
      { name: 'TLC Profile', value: resolved.tlcId ? `\`${resolved.tlcId}\`` : 'Discord Member', inline: true },
      { name: 'Reason for the Sanction', value: draft.reason || '—', inline: false }
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_sanction_confirm:${draft.draftId}`)
      .setLabel('CONFIRM SANCTION')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(Boolean(outcome)),
    new ButtonBuilder()
      .setCustomId(`tlc_sanction_open_modal:${draft.draftId}`)
      .setLabel('Edit Details')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(Boolean(outcome)),
    new ButtonBuilder()
      .setCustomId(`tlc_sanction_cancel:${draft.draftId}`)
      .setLabel('CANCEL')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(Boolean(outcome))
  );

  return { embeds: [embed], components: [row], ephemeral: true };
}

export function buildSanctionNoticeEmbed(sanction: SanctionRecord) {
  const color =
    sanction.status === 'Removed'
      ? TLC_DARK_COLOR
      : sanction.status === 'Completed'
      ? TLC_BRAND_COLOR
      : sanction.sanctionType === 'Disciplinary Ban' || sanction.suspensionMatchesRemaining > 0
      ? TLC_RED_COLOR
      : TLC_AMBER_COLOR;

  const suspText =
    sanction.suspensionMatchesTotal <= 0
      ? '0 Matches'
      : sanction.status === 'Removed'
      ? `0 remaining (${sanction.suspensionMatchesTotal} originally · Cancelled)`
      : `${sanction.suspensionMatchesRemaining} remaining (${sanction.suspensionMatchesTotal} total)`;

  const fineText =
    sanction.fineAmount <= 0
      ? `0 ${sanction.fineCurrency} (None)`
      : `${sanction.fineAmount} ${sanction.fineCurrency} — **${sanction.fineStatus}**${
          sanction.finePaidAmount > 0 && sanction.fineStatus === 'PARTIALLY PAID'
            ? ` (${sanction.finePaidAmount} paid)`
            : ''
        }`;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`TLC SANCTION NOTICE · ${sanction.referenceNumber}`)
    .setThumbnail(sanction.playerAvatarUrl.startsWith('http') ? sanction.playerAvatarUrl : null)
    .setDescription(
      sanction.status === 'Removed'
        ? `⚠️ **This sanction has been cancelled/removed** by ${sanction.removedBy || 'Staff'}.`
        : `Official disciplinary notice issued by the Touchline Disciplinary Committee.`
    )
    .addFields(
      { name: 'Player Name', value: sanction.playerName, inline: true },
      {
        name: 'Discord User',
        value: `@${sanction.playerDiscordUsername} (<@${sanction.playerDiscordUserId}>)`,
        inline: true,
      },
      { name: 'Current Team', value: sanction.clubName || 'Free Agent', inline: true },
      { name: 'Sanction Type', value: sanction.sanctionType, inline: true },
      { name: 'Fine Amount', value: fineText, inline: true },
      { name: 'Matches Suspended', value: suspText, inline: true },
      { name: 'Date of Issue', value: sanction.issuedAt.slice(0, 10), inline: true },
      { name: 'Sanction Reference Number', value: `\`${sanction.referenceNumber}\``, inline: true },
      {
        name: 'Issuing Administrator',
        value: `@${sanction.issuedByUsername} (<@${sanction.issuedByDiscordId}>)`,
        inline: true,
      },
      { name: 'Reason for the Sanction', value: sanction.reason, inline: false },
      ...(sanction.removalReason
        ? [{ name: 'Cancellation / Removal Reason', value: sanction.removalReason, inline: false }]
        : [])
    )
    .setFooter({ text: `TLC Disciplinary Committee · ${sanction.referenceNumber} · Status: ${sanction.status}` })
    .setTimestamp(new Date(sanction.issuedAt));

  return embed;
}

export function buildSanctionLogEmbed(
  actionTitle: string,
  sanction: SanctionRecord,
  actorLabel: string,
  details?: string
) {
  return new EmbedBuilder()
    .setColor(TLC_DARK_COLOR)
    .setTitle(`Disciplinary Log · ${actionTitle}`)
    .addFields(
      { name: 'Sanction Reference', value: `\`${sanction.referenceNumber}\``, inline: true },
      {
        name: 'Player',
        value: `${sanction.playerName} (<@${sanction.playerDiscordUserId}>)`,
        inline: true,
      },
      { name: 'Handled By', value: actorLabel, inline: true },
      { name: 'Type / Status', value: `${sanction.sanctionType} · ${sanction.status}`, inline: true },
      {
        name: 'Fine',
        value: `${sanction.fineAmount} ${sanction.fineCurrency} (${sanction.fineStatus})`,
        inline: true,
      },
      {
        name: 'Suspension',
        value: `${sanction.suspensionMatchesRemaining}/${sanction.suspensionMatchesTotal} match(es)`,
        inline: true,
      },
      ...(details ? [{ name: 'Details', value: details.slice(0, 1000), inline: false }] : [])
    )
    .setTimestamp();
}

export function buildSanctionSetupPayload(state: TlcDatabaseState) {
  const cfg = state.config;
  const fmtCh = (id?: string) => (id ? `<#${id}>` : '`Not configured`');
  const discRoleIds = cfg.roles.disciplinaryRoleIds ?? [];
  const discRoles =
    discRoleIds.length > 0
      ? discRoleIds.map((id) => `<@&${id}>`).join(', ')
      : '`Not configured (Admin / ManageGuild / Staff fallback)`';
  const currency = cfg.sanctions?.defaultCurrency || 'TLC Coins';

  const embed = new EmbedBuilder()
    .setColor(TLC_DARK_COLOR)
    .setTitle('Touchline (TLC) — Sanctions & Disciplinary Configuration')
    .setDescription(
      'Configure your Sanctions Announcement Channel, Private Sanctions Log Channel, Default Fine Currency, and authorized Disciplinary Staff Roles. Saved permanently in the database.'
    )
    .addFields(
      {
        name: 'Sanctions Announcement Channel',
        value: fmtCh(cfg.channels.sanctionsAnnouncementId),
        inline: true,
      },
      {
        name: 'Sanctions Log Channel (Private)',
        value: fmtCh(cfg.channels.sanctionsLogId),
        inline: true,
      },
      {
        name: 'Default Fine Currency',
        value: `**${currency}**`,
        inline: true,
      },
      {
        name: 'Authorized Disciplinary Staff Roles',
        value: discRoles,
        inline: false,
      }
    )
    .setFooter({ text: 'Saved permanently to PostgreSQL database' })
    .setTimestamp();

  const textChannelTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

  const rows: ActionRowBuilder<
    ChannelSelectMenuBuilder | RoleSelectMenuBuilder | ButtonBuilder
  >[] = [
    new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('tlc_setup_ch:sanctionsAnnouncementId')
        .setPlaceholder('Set Sanctions Announcement Channel')
        .setChannelTypes(...textChannelTypes)
    ),
    new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('tlc_setup_ch:sanctionsLogId')
        .setPlaceholder('Set Sanctions Log Channel (Private)')
        .setChannelTypes(...textChannelTypes)
    ),
    new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId('tlc_setup_role:disciplinaryRoleIds')
        .setPlaceholder('Select Disciplinary Staff Roles (multi-select)')
        .setMinValues(1)
        .setMaxValues(10)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('tlc_sanctions_setup_currency')
        .setLabel(`Set Default Fine Currency (${currency})`.slice(0, 80))
        .setStyle(ButtonStyle.Primary)
    ),
  ];

  return { embeds: [embed], components: rows, ephemeral: true };
}

export function buildSanctionCurrencyModal(currentCurrency: string) {
  const modal = new ModalBuilder()
    .setCustomId('tlc_sanctions_currency_modal')
    .setTitle('Default Fine Currency');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('currency_label')
        .setLabel('Currency / Financial Unit Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(30)
        .setPlaceholder('e.g. TLC Coins, EUR, USD, Credits')
        .setValue(currentCurrency.slice(0, 30))
    )
  );
  return modal;
}

export function buildSanctionHistoryPickerPayload(
  sanctionedPlayers: {
    discordUserId: string;
    name: string;
    username: string;
    tlcId?: string | null;
    activeCount: number;
    totalCount: number;
  }[]
) {
  const embed = new EmbedBuilder()
    .setColor(TLC_DARK_COLOR)
    .setTitle('Player Sanction History Lookup')
    .setDescription(
      'Select any Discord user directly below, or pick from players with existing disciplinary records (including deleted/restored profiles).'
    );

  const components: ActionRowBuilder<UserSelectMenuBuilder | StringSelectMenuBuilder>[] = [
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId('tlc_sanction_hist_user')
        .setPlaceholder('Select any Discord user to inspect sanction history')
    ),
  ];

  if (sanctionedPlayers.length > 0) {
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('tlc_sanction_hist_pick')
          .setPlaceholder('Or pick a player with recorded sanctions')
          .addOptions(
            sanctionedPlayers.slice(0, 25).map((p) => ({
              label: `${p.name}${p.tlcId ? ` (${p.tlcId})` : ''}`.slice(0, 100),
              description: `@${p.username} · ${p.totalCount} sanction(s) (${p.activeCount} active)`.slice(
                0,
                100
              ),
              value: p.discordUserId,
            }))
          )
      )
    );
  }

  return { embeds: [embed], components, ephemeral: true };
}

export function buildSanctionHistoryEmbed(info: {
  name: string;
  discordUserId: string;
  discordUsername: string;
  avatarUrl?: string;
  teamName: string;
  tlcId?: string | null;
  isDeletedProfile?: boolean;
  disciplinaryStatus: string;
  unpaidFineTotal: number;
  currency: string;
  sanctions: SanctionRecord[];
}) {
  const embed = new EmbedBuilder()
    .setColor(info.disciplinaryStatus.includes('Suspended') || info.disciplinaryStatus.includes('Ban') ? TLC_RED_COLOR : TLC_DARK_COLOR)
    .setTitle(`Sanction History · ${info.name}${info.tlcId ? ` (${info.tlcId})` : ''}`)
    .setThumbnail(info.avatarUrl?.startsWith('http') ? info.avatarUrl : null)
    .setDescription(
      info.isDeletedProfile
        ? '⚠️ **Note:** This player profile is marked Deleted; all disciplinary records remain permanently preserved.'
        : null
    )
    .addFields(
      { name: 'Discord Account', value: `@${info.discordUsername} (<@${info.discordUserId}>)`, inline: true },
      { name: 'Current Team', value: info.teamName, inline: true },
      { name: 'Disciplinary Status', value: info.disciplinaryStatus, inline: true },
      { name: 'Total Sanctions', value: String(info.sanctions.length), inline: true },
      {
        name: 'Outstanding Fines',
        value: info.unpaidFineTotal > 0 ? `${info.unpaidFineTotal} ${info.currency}` : '0 (Clear)',
        inline: true,
      }
    )
    .setTimestamp();

  if (info.sanctions.length === 0) {
    embed.addFields({
      name: 'Sanction Records',
      value: 'No sanctions recorded for this player.',
      inline: false,
    });
    return { embeds: [embed], components: [], ephemeral: true };
  }

  const lines = info.sanctions.slice(0, 10).map((s) => {
    const fineStr =
      s.fineAmount > 0 ? `Fine: ${s.finePaidAmount}/${s.fineAmount} ${s.fineCurrency} [${s.fineStatus}]` : 'No Fine';
    const suspStr =
      s.suspensionMatchesTotal > 0
        ? `Susp: ${s.suspensionMatchesRemaining}/${s.suspensionMatchesTotal} match(es)`
        : 'No Susp';
    return `• \`${s.referenceNumber}\` **${s.sanctionType}** [${s.status}] — ${s.issuedAt.slice(
      0,
      10
    )} by @${s.issuedByUsername}\n  ↳ ${fineStr} · ${suspStr}\n  ↳ *Reason:* ${s.reason.slice(0, 140)}${
      s.removalReason ? `\n  ↳ *Removed:* ${s.removalReason}` : ''
    }`;
  });

  embed.addFields({
    name: `Sanction Records (${info.sanctions.length})`,
    value: lines.join('\n\n').slice(0, 1020),
    inline: false,
  });

  const manageable = info.sanctions.filter((s) => s.status !== 'Removed');
  const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  if (manageable.length > 0) {
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('tlc_sanction_manage_pick')
          .setPlaceholder('Select a sanction to edit, manage fines, or remove')
          .addOptions(
            manageable.slice(0, 25).map((s) => ({
              label: `${s.referenceNumber} · ${s.sanctionType}`.slice(0, 100),
              description: `${s.fineStatus} · Susp ${s.suspensionMatchesRemaining}/${s.suspensionMatchesTotal} · ${s.reason}`.slice(
                0,
                100
              ),
              value: s.id,
            }))
          )
      )
    );
  }

  return { embeds: [embed], components, ephemeral: true };
}

export function buildSanctionListPayload(
  sanctions: SanctionRecord[],
  filter: 'all' | 'suspensions' | 'unpaid_fines'
) {
  const titleMap = {
    all: 'Active & Open Sanctions',
    suspensions: 'Currently Suspended Players',
    unpaid_fines: 'Unpaid & Partially Paid Fines',
  };

  const filtered = sanctions.filter((s) => {
    if (s.status === 'Removed') return false;
    if (filter === 'suspensions') {
      return s.status === 'Active' && (s.suspensionMatchesRemaining > 0 || s.sanctionType === 'Disciplinary Ban');
    }
    if (filter === 'unpaid_fines') {
      return s.fineAmount > 0 && (s.fineStatus === 'UNPAID' || s.fineStatus === 'PARTIALLY PAID');
    }
    return true;
  });

  const lines = filtered.slice(0, 15).map((s) => {
    const fine =
      s.fineAmount > 0
        ? `${s.finePaidAmount}/${s.fineAmount} ${s.fineCurrency} (${s.fineStatus})`
        : 'None';
    const susp =
      s.suspensionMatchesTotal > 0
        ? `${s.suspensionMatchesRemaining}/${s.suspensionMatchesTotal} match(es)`
        : s.sanctionType === 'Disciplinary Ban'
        ? 'Ban'
        : '0';
    return `• \`${s.referenceNumber}\` **${s.playerName}** (<@${s.playerDiscordUserId}>) · ${s.clubName}\n  ↳ **${s.sanctionType}** · Fine: ${fine} · Susp: ${susp}`;
  });

  const embed = new EmbedBuilder()
    .setColor(TLC_AMBER_COLOR)
    .setTitle(`TLC Disciplinary — ${titleMap[filter]} (${filtered.length})`)
    .setDescription(lines.length > 0 ? lines.join('\n\n') : 'No sanctions match this filter.')
    .setTimestamp();

  const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  if (filtered.length > 0) {
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('tlc_sanction_manage_pick')
          .setPlaceholder('Select a sanction to edit, record fine payment, or remove')
          .addOptions(
            filtered.slice(0, 25).map((s) => ({
              label: `${s.referenceNumber} · ${s.playerName}`.slice(0, 100),
              description: `${s.sanctionType} · Fine ${s.fineStatus} · Susp ${s.suspensionMatchesRemaining}`.slice(
                0,
                100
              ),
              value: s.id,
            }))
          )
      )
    );
  }

  return { embeds: [embed], components, ephemeral: true };
}

export function buildSanctionManagePayload(sanction: SanctionRecord, appeals: SanctionAppeal[]) {
  const isRemoved = sanction.status === 'Removed';
  const hasFine = sanction.fineAmount > 0;
  const fineCleared = !hasFine || sanction.fineStatus === 'PAID' || sanction.fineStatus === 'WAIVED';
  const remainingFine = Math.max(0, Number((sanction.fineAmount - sanction.finePaidAmount).toFixed(2)));

  const embed = buildSanctionNoticeEmbed(sanction);
  if (sanction.fineHistory.length > 0) {
    const fineLines = sanction.fineHistory
      .slice(0, 5)
      .map(
        (f) =>
          `• \`${f.recordedAt.slice(0, 10)}\` **${f.type}** ${f.amount} ${sanction.fineCurrency} — ${f.note} *(by @${f.recordedBy})*`
      );
    embed.addFields({ name: 'Fine Payment & Waiver History', value: fineLines.join('\n'), inline: false });
  }
  if (hasFine && !fineCleared) {
    embed.addFields({
      name: 'Remaining Fine Balance',
      value: `**${remainingFine} ${sanction.fineCurrency}**`,
      inline: true,
    });
  }
  const latestAppeal = appeals[0];
  if (latestAppeal) {
    embed.addFields({
      name: 'Latest Appeal',
      value: `Status: **${latestAppeal.status}** (${latestAppeal.submittedAt.slice(0, 10)}) — ${latestAppeal.explanation.slice(
        0,
        180
      )}`,
      inline: false,
    });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_sanction_edit_btn:${sanction.id}`)
      .setLabel('Edit Sanction')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(isRemoved),
    new ButtonBuilder()
      .setCustomId(`tlc_sanction_pay_btn:${sanction.id}`)
      .setLabel('Record Payment')
      .setStyle(ButtonStyle.Success)
      .setDisabled(isRemoved || fineCleared),
    new ButtonBuilder()
      .setCustomId(`tlc_sanction_markpaid_btn:${sanction.id}`)
      .setLabel('Mark Fine Paid')
      .setStyle(ButtonStyle.Success)
      .setDisabled(isRemoved || fineCleared),
    new ButtonBuilder()
      .setCustomId(`tlc_sanction_waive_btn:${sanction.id}`)
      .setLabel('Waive Fine')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isRemoved || fineCleared),
    new ButtonBuilder()
      .setCustomId(`tlc_sanction_remove_btn:${sanction.id}`)
      .setLabel('Remove Sanction')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(isRemoved)
  );

  return { embeds: [embed], components: [row], ephemeral: true };
}

export function buildEditSanctionModal(sanction: SanctionRecord) {
  const modal = new ModalBuilder()
    .setCustomId(`tlc_sanction_edit_modal:${sanction.id}`)
    .setTitle(`Edit ${sanction.referenceNumber}`);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('sanction_type')
        .setLabel('Sanction Type')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder(SANCTION_TYPES.join(', '))
        .setValue(sanction.sanctionType)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Sanction Reason')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setValue(sanction.reason.slice(0, 800))
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('fine_amount')
        .setLabel(`Fine Amount (${sanction.fineCurrency})`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(String(sanction.fineAmount))
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('suspension_matches')
        .setLabel('Total Match Suspension (official matches)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(String(sanction.suspensionMatchesTotal))
    )
  );
  return modal;
}

export function buildFinePaymentModal(sanction: SanctionRecord) {
  const remaining = Math.max(0, Number((sanction.fineAmount - sanction.finePaidAmount).toFixed(2)));
  const modal = new ModalBuilder()
    .setCustomId(`tlc_sanction_pay_modal:${sanction.id}`)
    .setTitle(`Record Payment · ${sanction.referenceNumber}`);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('payment_amount')
        .setLabel(`Amount Paid (${sanction.fineCurrency}) — Balance: ${remaining}`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(String(remaining))
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('payment_note')
        .setLabel('Payment Reference / Note (optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('e.g. Paid via club treasurer')
    )
  );
  return modal;
}

export function buildRemoveSanctionConfirmPayload(
  sanction: SanctionRecord,
  outcome?: 'Removed' | 'Cancelled'
) {
  const embed = buildSanctionNoticeEmbed(sanction);
  if (!outcome) {
    embed.setTitle(`Confirm Sanction Removal · ${sanction.referenceNumber}`);
    embed.setDescription(
      'Click **CONFIRM REMOVE** to provide a mandatory removal reason, cancel active suspensions/unpaid fines, and preserve this sanction permanently in historical records.'
    );
  } else if (outcome === 'Cancelled') {
    embed.setTitle(`Removal Cancelled · ${sanction.referenceNumber}`);
    embed.setDescription('Sanction removal was cancelled. No changes were made.');
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tlc_sanction_remove_confirm:${sanction.id}`)
      .setLabel('CONFIRM REMOVE')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(Boolean(outcome) || sanction.status === 'Removed'),
    new ButtonBuilder()
      .setCustomId(`tlc_sanction_remove_cancel:${sanction.id}`)
      .setLabel('CANCEL')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(Boolean(outcome))
  );

  return { embeds: [embed], components: [row], ephemeral: true };
}

export function buildAppealSanctionPickerPayload(
  sanctions: SanctionRecord[],
  pendingAppealSanctionIds: Set<string>
) {
  const eligible = sanctions.filter(
    (s) => s.status !== 'Removed' && !pendingAppealSanctionIds.has(s.id)
  );
  const embed = new EmbedBuilder()
    .setColor(TLC_DARK_COLOR)
    .setTitle('Appeal a Disciplinary Sanction')
    .setDescription(
      eligible.length > 0
        ? 'Select one of your sanctions below to submit a formal appeal to the TLC Disciplinary Committee.'
        : sanctions.some((s) => pendingAppealSanctionIds.has(s.id))
        ? 'You already have pending appeal(s) awaiting disciplinary staff review.'
        : 'You currently have no eligible sanctions available to appeal.'
    );

  if (eligible.length === 0) {
    return { embeds: [embed], components: [], ephemeral: true };
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('tlc_appeal_pick')
    .setPlaceholder('Select the sanction you want to appeal')
    .addOptions(
      eligible.slice(0, 25).map((s) => ({
        label: `${s.referenceNumber} · ${s.sanctionType}`.slice(0, 100),
        description: `${s.issuedAt.slice(0, 10)} · ${s.reason}`.slice(0, 100),
        value: s.id,
      }))
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    ephemeral: true,
  };
}

export function buildAppealModal(sanction: SanctionRecord) {
  const modal = new ModalBuilder()
    .setCustomId(`tlc_appeal_modal:${sanction.id}`)
    .setTitle(`Appeal ${sanction.referenceNumber}`);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('appeal_explanation')
        .setLabel('Appeal Explanation & Evidence')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(1000)
        .setPlaceholder('Explain clearly why this sanction should be reviewed, modified, or cancelled...')
    )
  );
  return modal;
}

export function buildAppealReviewPayload(appeal: SanctionAppeal, sanction?: SanctionRecord) {
  const color =
    appeal.status === 'Accepted'
      ? TLC_BRAND_COLOR
      : appeal.status === 'Rejected'
      ? TLC_RED_COLOR
      : TLC_AMBER_COLOR;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`Sanction Appeal · ${appeal.sanctionReference}`)
    .setThumbnail(sanction?.playerAvatarUrl.startsWith('http') ? sanction.playerAvatarUrl : null)
    .addFields(
      {
        name: 'Player',
        value: `${appeal.playerName} (<@${appeal.playerDiscordUserId}>)`,
        inline: true,
      },
      { name: 'Sanction Reference', value: `\`${appeal.sanctionReference}\``, inline: true },
      { name: 'Appeal Status', value: appeal.status, inline: true },
      ...(sanction
        ? [
            {
              name: 'Original Sanction',
              value: `${sanction.sanctionType} · Fine: ${sanction.fineAmount} ${sanction.fineCurrency} (${sanction.fineStatus}) · Susp: ${sanction.suspensionMatchesRemaining}/${sanction.suspensionMatchesTotal} match(es)`,
              inline: false,
            },
            { name: 'Original Reason', value: sanction.reason, inline: false },
          ]
        : []),
      { name: 'Player Appeal Explanation', value: appeal.explanation, inline: false },
      ...(appeal.reviewedBy
        ? [{ name: 'Reviewed By', value: `@${appeal.reviewedBy}`, inline: true }]
        : []),
      ...(appeal.rejectionReason
        ? [{ name: 'Rejection Reason', value: appeal.rejectionReason, inline: false }]
        : [])
    )
    .setTimestamp(new Date(appeal.submittedAt));

  const components: ActionRowBuilder<ButtonBuilder>[] = [];

  if (appeal.status === 'Pending') {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`tlc_appeal_accept:${appeal.id}`)
          .setLabel('ACCEPT APPEAL')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`tlc_appeal_reject:${appeal.id}`)
          .setLabel('REJECT APPEAL')
          .setStyle(ButtonStyle.Danger)
      )
    );
  } else if (appeal.status === 'Accepted' && sanction && sanction.status !== 'Removed') {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`tlc_sanction_remove_btn:${sanction.id}`)
          .setLabel('Cancel Original Sanction')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`tlc_sanction_edit_btn:${sanction.id}`)
          .setLabel('Edit Original Sanction')
          .setStyle(ButtonStyle.Primary)
      )
    );
  }

  return { embeds: [embed], components };
}



