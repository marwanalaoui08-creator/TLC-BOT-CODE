import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { PLAYER_POSITIONS } from '../../src/shared/types.ts';

export const tlcSlashCommands = [
  // Administrator Server Configuration (Discord-Only)
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Admin: Open interactive panel to manually configure roles, channels & settings')
    .addSubcommand((s) =>
      s.setName('general').setDescription('Configure all registration, matchday, roles & approval settings')
    )
    .addSubcommand((s) =>
      s.setName('teams').setDescription('Configure Team Management, Signing Request & Transfer channels and role rules')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // Registration & Verification
  new SlashCommandBuilder()
    .setName('register')
    .setDescription('Register for an official TLC Player or Manager profile'),
  new SlashCommandBuilder()
    .setName('post-verify-panel')
    .setDescription('Staff: Post the permanent Verify button panel in the configured Registration Channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // Player & Manager Profiles
  new SlashCommandBuilder().setName('profile').setDescription('Display your official TLC profile'),
  new SlashCommandBuilder()
    .setName('player')
    .setDescription('Search and display a player profile')
    .addStringOption((o) => o.setName('name').setDescription('Player name or TLC ID').setRequired(true)),
  new SlashCommandBuilder().setName('players').setDescription('Display registered TLC players'),
  new SlashCommandBuilder().setName('free-agents').setDescription('Display all verified Free Agent players'),
  new SlashCommandBuilder()
    .setName('search-player')
    .setDescription('Search players by name or position')
    .addStringOption((o) => o.setName('query').setDescription('Name or TLC ID'))
    .addStringOption((o) =>
      o
        .setName('position')
        .setDescription('Position')
        .addChoices(...PLAYER_POSITIONS.map((p) => ({ name: p, value: p })))
    ),
  new SlashCommandBuilder()
    .setName('manager')
    .setDescription('Search and display a manager profile')
    .addStringOption((o) => o.setName('name').setDescription('Manager name or TLC ID').setRequired(true)),
  new SlashCommandBuilder().setName('managers').setDescription('Display all registered TLC managers'),

  // Teams, Clubs & TeamSign Signing System
  new SlashCommandBuilder()
    .setName('create-team')
    .setDescription('Admin: Create a team using native Discord role & owner selectors')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('delete-team')
    .setDescription('Admin: Safely deactivate a registered team while preserving match & transfer history')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('teams')
    .setDescription('Display all active teams and inspect any team profile'),
  new SlashCommandBuilder()
    .setName('team')
    .setDescription('Display your current team profile or look up a team by name')
    .addStringOption((o) => o.setName('name').setDescription('Optional team name')),
  new SlashCommandBuilder()
    .setName('demande')
    .setDescription('Request to join a registered team'),
  new SlashCommandBuilder()
    .setName('release')
    .setDescription('Team Owner/Admin: Release a player from your team roster')
    .addStringOption((o) => o.setName('team').setDescription('Optional team name (Admins only)')),
  new SlashCommandBuilder()
    .setName('roster')
    .setDescription('Display your team roster or another team roster')
    .addStringOption((o) => o.setName('team').setDescription('Optional team name')),
  new SlashCommandBuilder()
    .setName('transfer-history')
    .setDescription('View your transfer history or a player transfer history')
    .addUserOption((o) => o.setName('player').setDescription('Optional Discord player')),
  new SlashCommandBuilder()
    .setName('club')
    .setDescription('Display a club profile')
    .addStringOption((o) => o.setName('name').setDescription('Club name or ID').setRequired(true)),
  new SlashCommandBuilder().setName('clubs').setDescription('Display all registered TLC clubs'),
  new SlashCommandBuilder()
    .setName('register-club')
    .setDescription('Submit a new club registration request for staff APPROVE / CANCEL review')
    .addStringOption((o) => o.setName('name').setDescription('Club name').setRequired(true))
    .addStringOption((o) => o.setName('code').setDescription('3-5 letter club code').setRequired(true))
    .addStringOption((o) => o.setName('logo_url').setDescription('Optional club crest image URL')),

  // Transfers & Team Signings
  new SlashCommandBuilder()
    .setName('sign-player')
    .setDescription('Manager: Search free agents, select a player, and send a formal signing offer')
    .addStringOption((o) => o.setName('query').setDescription('Filter free agents by name or TLC ID'))
    .addStringOption((o) =>
      o
        .setName('position')
        .setDescription('Filter free agents by position')
        .addChoices(...PLAYER_POSITIONS.map((p) => ({ name: p, value: p })))
    )
    .addStringOption((o) =>
      o.setName('club').setDescription('Destination club name or ID (defaults to your managed club)')
    ),
  new SlashCommandBuilder()
    .setName('sign')
    .setDescription('Manager: Send a direct transfer or contract offer to a specific player')
    .addStringOption((o) => o.setName('player').setDescription('Player TLC ID or name').setRequired(true))
    .addStringOption((o) => o.setName('club').setDescription('Club name or ID').setRequired(true))
    .addStringOption((o) =>
      o
        .setName('type')
        .setDescription('Contract type')
        .setRequired(true)
        .addChoices(
          { name: 'Signing (Free Agent)', value: 'Signing' },
          { name: 'Permanent Transfer', value: 'Permanent Transfer' },
          { name: 'Loan', value: 'Loan' }
        )
    )
    .addStringOption((o) => o.setName('details').setDescription('Squad role or contract terms')),

  // Competitions, Fixtures & Match Ratings
  new SlashCommandBuilder()
    .setName('competition')
    .setDescription('Competition commands')
    .addSubcommand((s) => s.setName('list').setDescription('Display all active competitions'))
    .addSubcommand((s) =>
      s
        .setName('create')
        .setDescription('Staff: Create a new competition')
        .addStringOption((o) => o.setName('name').setDescription('Competition name').setRequired(true))
        .addStringOption((o) =>
          o
            .setName('type')
            .setDescription('Competition type')
            .setRequired(true)
            .addChoices(
              { name: 'League', value: 'League' },
              { name: 'Knockout Tournament', value: 'Knockout Tournament' },
              { name: 'Group Stage', value: 'Group Stage' },
              { name: 'Group Stage + Knockout', value: 'Group Stage + Knockout' },
              { name: 'Friendly Matches', value: 'Friendly Matches' }
            )
        )
        .addStringOption((o) => o.setName('season').setDescription('Season label').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('register')
        .setDescription('Manager: Submit a club entry into a competition for staff approval')
        .addStringOption((o) => o.setName('competition').setDescription('Competition name').setRequired(true))
        .addStringOption((o) => o.setName('club').setDescription('Club name or ID (optional if managing one)'))
    ),
  new SlashCommandBuilder()
    .setName('fixtures')
    .setDescription('Display upcoming fixtures (optionally filtered by competition)')
    .addStringOption((o) => o.setName('competition').setDescription('Optional competition name filter')),
  new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Display upcoming fixtures for a club')
    .addStringOption((o) => o.setName('club').setDescription('Club name').setRequired(true)),
  new SlashCommandBuilder()
    .setName('table')
    .setDescription('Display league standings table')
    .addStringOption((o) => o.setName('competition').setDescription('Competition name').setRequired(true)),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Display TLC leaderboards')
    .addStringOption((o) =>
      o
        .setName('category')
        .setDescription('Leaderboard category')
        .setRequired(true)
        .addChoices(
          { name: 'Top Scorers (goals)', value: 'goals' },
          { name: 'Top Assists (assists)', value: 'assists' },
          { name: 'Highest Rated (ratings)', value: 'ratings' },
          { name: 'Most Trophies (trophies)', value: 'trophies' },
          { name: 'Best Managers (managers)', value: 'managers' }
        )
    ),
  new SlashCommandBuilder()
    .setName('ratings')
    .setDescription('Display top-rated players across TLC competitions')
    .addStringOption((o) =>
      o
        .setName('position')
        .setDescription('Optional position filter')
        .addChoices(...PLAYER_POSITIONS.map((p) => ({ name: p, value: p })))
    ),

  // Staff & Match Official Commands
  new SlashCommandBuilder()
    .setName('create-club')
    .setDescription('Staff: Directly register an official TLC club')
    .addStringOption((o) => o.setName('name').setDescription('Club name').setRequired(true))
    .addStringOption((o) => o.setName('code').setDescription('3-5 letter code').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('open-transfer-window')
    .setDescription('Staff: Open the TLC Transfer Window')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('close-transfer-window')
    .setDescription('Staff: Close the TLC Transfer Window')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('fixture-create')
    .setDescription('Staff: Schedule a new official match fixture')
    .addStringOption((o) => o.setName('competition').setDescription('Competition name').setRequired(true))
    .addStringOption((o) => o.setName('home_club').setDescription('Home club name or ID').setRequired(true))
    .addStringOption((o) => o.setName('away_club').setDescription('Away club name or ID').setRequired(true))
    .addStringOption((o) => o.setName('date').setDescription('Match date (YYYY-MM-DD)').setRequired(true))
    .addStringOption((o) => o.setName('time').setDescription('Kickoff time (e.g. 20:00 UTC)').setRequired(true))
    .addStringOption((o) => o.setName('round').setDescription('Round label (e.g. Matchday 4)'))
    .addStringOption((o) => o.setName('referee').setDescription('Assigned referee'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('fixture-reschedule')
    .setDescription('Staff: Reschedule or assign referee to an existing fixture')
    .addIntegerOption((o) => o.setName('match_number').setDescription('Match number').setRequired(true))
    .addStringOption((o) => o.setName('date').setDescription('New date (YYYY-MM-DD)'))
    .addStringOption((o) => o.setName('time').setDescription('New kickoff time'))
    .addStringOption((o) => o.setName('referee').setDescription('Referee name'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('result')
    .setDescription('Referee/Staff: Submit a match result (routes for APPROVE/CANCEL if approval enabled)')
    .addIntegerOption((o) => o.setName('match_number').setDescription('Match number').setRequired(true))
    .addIntegerOption((o) => o.setName('home_score').setDescription('Home team goals').setRequired(true))
    .addIntegerOption((o) => o.setName('away_score').setDescription('Away team goals').setRequired(true))
    .addStringOption((o) => o.setName('notes').setDescription('Optional match notes'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('rate')
    .setDescription('Referee/Staff: Rate a player performance for a match (1.0 - 10.0)')
    .addIntegerOption((o) => o.setName('match_number').setDescription('Match number').setRequired(true))
    .addStringOption((o) => o.setName('player').setDescription('Player name or TLC ID').setRequired(true))
    .addNumberOption((o) =>
      o.setName('rating').setDescription('Match rating (1.0 to 10.0)').setRequired(true).setMinValue(1).setMaxValue(10)
    )
    .addIntegerOption((o) => o.setName('goals').setDescription('Goals scored'))
    .addIntegerOption((o) => o.setName('assists').setDescription('Assists provided'))
    .addIntegerOption((o) => o.setName('saves').setDescription('Saves (GK)'))
    .addBooleanOption((o) => o.setName('clean_sheet').setDescription('Clean sheet recorded?'))
    .addBooleanOption((o) => o.setName('motm').setDescription('Award Man of the Match?'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('award')
    .setDescription('Staff: Grant an official TLC award')
    .addStringOption((o) => o.setName('award_name').setDescription('Award title (e.g. Golden Boot)').setRequired(true))
    .addStringOption((o) => o.setName('recipient_id').setDescription('TLC ID or Club ID').setRequired(true))
    .addStringOption((o) =>
      o
        .setName('recipient_type')
        .setDescription('Recipient type')
        .setRequired(true)
        .addChoices(
          { name: 'Player', value: 'Player' },
          { name: 'Manager', value: 'Manager' },
          { name: 'Club', value: 'Club' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('delete-player')
    .setDescription('Admin: Searchable player deletion (preserves all match, transfer, and award history)')
    .addStringOption((o) =>
      o
        .setName('search')
        .setDescription('Search player by name, Discord username, or team (optional)')
        .setAutocomplete(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('restore-player')
    .setDescription('Admin: Restore a previously deleted TLC player profile and historical records')
    .addStringOption((o) =>
      o
        .setName('search')
        .setDescription('Search deleted player by name or Discord username (optional)')
        .setAutocomplete(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('delete-manager')
    .setDescription('Admin: Searchable manager deletion (preserves all match, club, and trophy history)')
    .addStringOption((o) =>
      o
        .setName('search')
        .setDescription('Search manager by name, Discord username, or club (optional)')
        .setAutocomplete(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('restore-manager')
    .setDescription('Admin: Restore a previously deleted TLC manager profile and historical records')
    .addStringOption((o) =>
      o
        .setName('search')
        .setDescription('Search deleted manager by name or Discord username (optional)')
        .setAutocomplete(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('rejected-requests')
    .setDescription('Staff: View previously rejected requests and their mandatory rejection reasons')
    .addStringOption((o) =>
      o
        .setName('category')
        .setDescription('Filter by request category')
        .addChoices(
          { name: 'All Categories', value: 'all' },
          { name: 'Registration', value: 'Registration' },
          { name: 'Signing Request (/demande)', value: 'Signing Request' },
          { name: 'Transfer Offer', value: 'Transfer Offer' },
          { name: 'Club Registration', value: 'Club Registration' },
          { name: 'Competition Entry', value: 'Competition Entry' },
          { name: 'Profile Correction', value: 'Profile Correction' },
          { name: 'Match Result', value: 'Match Result' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // Disciplinary & Sanctions Management (Section 16)
  new SlashCommandBuilder()
    .setName('sanction')
    .setDescription('Disciplinary Staff: Issue a formal sanction notice with interactive preview'),
  new SlashCommandBuilder()
    .setName('setup-sanctions')
    .setDescription('Admin: Configure sanctions channels, fine currency & disciplinary staff roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('sanction-history')
    .setDescription('Disciplinary Staff: View full sanction, fine, and suspension history for any player')
    .addUserOption((o) => o.setName('user').setDescription('Select Discord user directly (optional)'))
    .addStringOption((o) =>
      o
        .setName('player')
        .setDescription('Search player by name, Discord username, or TLC ID (optional)')
        .setAutocomplete(true)
    ),
  new SlashCommandBuilder()
    .setName('sanction-list')
    .setDescription('Disciplinary Staff: View active sanctions, unpaid fines, and suspended players')
    .addStringOption((o) =>
      o
        .setName('filter')
        .setDescription('Filter active sanctions list')
        .addChoices(
          { name: 'All Active & Open Sanctions', value: 'all' },
          { name: 'Currently Suspended Players', value: 'suspensions' },
          { name: 'Unpaid & Partially Paid Fines', value: 'unpaid_fines' }
        )
    ),
  new SlashCommandBuilder()
    .setName('edit-sanction')
    .setDescription('Disciplinary Staff: Modify an existing sanction or manage fine payments')
    .addStringOption((o) =>
      o
        .setName('sanction')
        .setDescription('Search sanction by reference number, player, or reason (optional)')
        .setAutocomplete(true)
    ),
  new SlashCommandBuilder()
    .setName('remove-sanction')
    .setDescription('Disciplinary Staff: Cancel/remove a sanction while preserving historical records')
    .addStringOption((o) =>
      o
        .setName('sanction')
        .setDescription('Search sanction by reference number, player, or reason (optional)')
        .setAutocomplete(true)
    ),
  new SlashCommandBuilder()
    .setName('appeal-sanction')
    .setDescription('Player: Submit an official appeal for one of your active or completed sanctions'),

  // Unified Ticket, Support, Applications & Registration System (Section 18)
  new SlashCommandBuilder()
    .setName('setup-tickets')
    .setDescription('Admin: Configure channels, categories, staff roles, naming & custom questions for tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Admin: Publish or refresh the TLC SUPPORT CENTER panel in the configured channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('ticket-stats')
    .setDescription('Staff: View comprehensive ticket, application, and complaint statistics')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map((cmd) => cmd.toJSON());
