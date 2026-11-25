import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  applyTransferDiscordEffects,
  deploySlashCommands,
  dispatchTransferOfferToDiscord,
  getDiscordBotStatus,
  startDiscordBot,
  stopDiscordBot,
} from './bot/client.ts';
import { tlcStore } from './server/store.ts';
import { getMediaAssetById } from './server/services/mediaStorage.ts';

const PORT = 3000;

async function bootstrap() {
  await tlcStore.init();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // ==================== TLC API ROUTES (SHARED WITH FUTURE WEBSITE) ====================

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, db: tlcStore.getDbStatus(), bot: getDiscordBotStatus() });
  });

  app.get('/api/state', (_req: Request, res: Response) => {
    res.json({
      ...tlcStore.getPublicSummary(),
      dbStatus: tlcStore.getDbStatus(),
      botStatus: getDiscordBotStatus(),
    });
  });

  app.get('/api/media/:id', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!/^med-[a-f0-9-]+$/i.test(id)) {
        res.status(400).json({ error: 'Invalid media identifier' });
        return;
      }
      const asset = await getMediaAssetById(id);
      if (!asset || !asset.buffer) {
        res.status(404).json({ error: 'Media asset not found' });
        return;
      }
      res.setHeader('Content-Type', asset.mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Content-Disposition', `inline; filename="${asset.filename.replace(/"/g, '')}"`);
      res.send(asset.buffer);
    } catch {
      res.status(500).json({ error: 'Unable to serve media asset' });
    }
  });

  // Registrations & Corrections
  app.post('/api/registrations', async (req: Request, res: Response) => {
    try {
      const created = await tlcStore.submitRegistration(req.body);
      res.status(201).json(created);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Invalid registration payload' });
    }
  });

  app.patch('/api/registrations/:id', async (req: Request, res: Response) => {
    try {
      const { actor = 'TLC Staff', ...patch } = req.body;
      res.json(await tlcStore.editRegistration(String(req.params.id), patch, actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/registrations/:id/approve', async (req: Request, res: Response) => {
    try {
      const actor = req.body?.actor || 'TLC Staff';
      res.json(await tlcStore.approveRegistration(String(req.params.id), actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/registrations/:id/reject', async (req: Request, res: Response) => {
    try {
      const { reason = 'Rejected by staff.', allowResubmit = true, actor = 'TLC Staff' } = req.body || {};
      res.json(
        await tlcStore.rejectRegistration(
          String(req.params.id),
          String(reason),
          Boolean(allowResubmit),
          actor
        )
      );
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/corrections', async (req: Request, res: Response) => {
    try {
      res.status(201).json(await tlcStore.submitProfileCorrection(req.body));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/corrections/:id/review', async (req: Request, res: Response) => {
    try {
      const { decision, actor = 'TLC Staff', reason = 'Rejected by staff.' } = req.body;
      res.json(await tlcStore.reviewCorrectionRequest(String(req.params.id), decision, actor, reason));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Profiles & Server Membership Sync
  app.patch('/api/players/:tlcId', async (req: Request, res: Response) => {
    try {
      const { actor = 'TLC Staff', ...patch } = req.body;
      res.json(await tlcStore.editPlayer(String(req.params.tlcId), patch, actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch('/api/managers/:tlcId', async (req: Request, res: Response) => {
    try {
      const { actor = 'TLC Staff', ...patch } = req.body;
      res.json(await tlcStore.editManager(String(req.params.tlcId), patch, actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/profiles/:tlcId', async (req: Request, res: Response) => {
    try {
      const actor = req.body?.actor || 'TLC Staff';
      res.json(await tlcStore.deleteProfile(String(req.params.tlcId), actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/members/:discordUserId/leave', async (req: Request, res: Response) => {
    try {
      res.json(await tlcStore.handleMemberLeave(String(req.params.discordUserId)));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/members/:discordUserId/rejoin', async (req: Request, res: Response) => {
    try {
      res.json(await tlcStore.handleMemberRejoin(String(req.params.discordUserId)));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Clubs
  app.post('/api/clubs', async (req: Request, res: Response) => {
    try {
      const { actor = 'TLC Staff', ...input } = req.body;
      res.status(201).json(await tlcStore.createClub(input, actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch('/api/clubs/:clubId', async (req: Request, res: Response) => {
    try {
      const { actor = 'TLC Staff', ...patch } = req.body;
      res.json(await tlcStore.editClub(String(req.params.clubId), patch, actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/clubs/:clubId/manager', async (req: Request, res: Response) => {
    try {
      const { managerTlcId, actor = 'TLC Staff' } = req.body;
      const clubId = String(req.params.clubId);
      if (managerTlcId) {
        res.json(await tlcStore.assignManager(clubId, managerTlcId, actor));
      } else {
        res.json(await tlcStore.removeManager(clubId, actor));
      }
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Transfers & Contracts
  app.post('/api/transfers/offer', async (req: Request, res: Response) => {
    try {
      const { actor = 'Club Manager', ...input } = req.body;
      const offer = await tlcStore.submitTransferOffer(input, actor);
      await dispatchTransferOfferToDiscord(offer);
      res.status(201).json(offer);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/transfers/offers/:id/respond', async (req: Request, res: Response) => {
    try {
      const { decision, actor = 'Player' } = req.body;
      const updated = await tlcStore.respondToTransferOffer(String(req.params.id), decision, actor);
      if (updated.status === 'Approved') {
        const player = tlcStore.getState().players.find((p) => p.tlcId === updated.playerTlcId);
        const latestTransfer = tlcStore.getState().transfers[0];
        await applyTransferDiscordEffects(
          player?.discordUserId,
          updated.fromClubId,
          updated.toClubId,
          latestTransfer
        );
      }
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/transfers/offers/:id/review', async (req: Request, res: Response) => {
    try {
      const { decision, actor = 'TLC Staff', reason = 'Rejected by staff.' } = req.body;
      const updated = await tlcStore.reviewTransferOffer(
        String(req.params.id),
        decision,
        actor,
        reason
      );
      if (decision === 'approve' && updated.status === 'Approved') {
        const player = tlcStore.getState().players.find((p) => p.tlcId === updated.playerTlcId);
        const latestTransfer = tlcStore.getState().transfers[0];
        await applyTransferDiscordEffects(
          player?.discordUserId,
          updated.fromClubId,
          updated.toClubId,
          latestTransfer
        );
      }
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/transfers/direct', async (req: Request, res: Response) => {
    try {
      const { actor = 'TLC Staff', ...input } = req.body;
      const record = await tlcStore.executeDirectTransfer(input, actor);
      const player = tlcStore.getState().players.find((p) => p.tlcId === record.playerTlcId);
      await applyTransferDiscordEffects(
        player?.discordUserId,
        record.fromClubId,
        record.toClubId,
        record
      );
      res.status(201).json(record);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/contracts', async (req: Request, res: Response) => {
    try {
      const { actor = 'TLC Staff', ...input } = req.body;
      res.status(201).json(await tlcStore.createContract(input, actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/contracts/:id/action', async (req: Request, res: Response) => {
    try {
      const { action, newExpirationDate, actor = 'TLC Staff' } = req.body;
      res.json(await tlcStore.updateContract(String(req.params.id), action, newExpirationDate, actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/contracts/check-expirations', async (req: Request, res: Response) => {
    try {
      const actor = req.body?.actor || 'TLC Staff';
      res.json(await tlcStore.runContractExpirationCheck(actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Competitions, Fixtures & Results
  app.post('/api/competitions', async (req: Request, res: Response) => {
    try {
      const { actor = 'TLC Staff', ...input } = req.body;
      res.status(201).json(await tlcStore.createCompetition(input, actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/competitions/:id/register-team', async (req: Request, res: Response) => {
    try {
      const { actor = 'Club Manager', ...input } = req.body;
      res.status(201).json(
        await tlcStore.registerTeamForCompetition(
          { ...input, competitionId: String(req.params.id) },
          actor
        )
      );
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/competition-registrations/:id/review', async (req: Request, res: Response) => {
    try {
      const { decision, actor = 'TLC Staff', reason = 'Rejected by staff.' } = req.body;
      res.json(
        await tlcStore.reviewCompetitionRegistration(String(req.params.id), decision, actor, reason)
      );
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/competitions/:id/generate-fixtures', async (req: Request, res: Response) => {
    try {
      const actor = req.body?.actor || 'TLC Staff';
      res.json(await tlcStore.generateFixtures(String(req.params.id), actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/fixtures', async (req: Request, res: Response) => {
    try {
      const { actor = 'TLC Staff', ...input } = req.body;
      res.status(201).json(await tlcStore.createFixture(input, actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch('/api/fixtures/:id', async (req: Request, res: Response) => {
    try {
      const { actor = 'TLC Staff', ...patch } = req.body;
      res.json(await tlcStore.editFixture(String(req.params.id), patch, actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/fixtures/:id/result', async (req: Request, res: Response) => {
    try {
      const { actor = 'Match Referee', ...input } = req.body;
      res.json(await tlcStore.submitMatchResult(String(req.params.id), input, actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/fixtures/:id/approve', async (req: Request, res: Response) => {
    try {
      const actor = req.body?.actor || 'TLC Staff';
      res.json(await tlcStore.approveMatchResult(String(req.params.id), actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch('/api/fixtures/:id/stats', async (req: Request, res: Response) => {
    try {
      const { playerStats, actor = 'TLC Staff' } = req.body;
      res.json(await tlcStore.editMatchStats(String(req.params.id), playerStats || [], actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/fixtures/:id/rate-player', async (req: Request, res: Response) => {
    try {
      const { actor = 'Match Referee', ...input } = req.body;
      res.json(await tlcStore.rateMatchPlayer(String(req.params.id), input, actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Awards & Leaderboards
  app.post('/api/awards', async (req: Request, res: Response) => {
    try {
      const { actor = 'TLC Staff', ...input } = req.body;
      res.status(201).json(await tlcStore.grantAward(input, actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/leaderboards', (req: Request, res: Response) => {
    const category = (req.query.category as string) || 'goals';
    const competitionId = req.query.competitionId as string | undefined;
    res.json(
      tlcStore.getLeaderboard(
        category as 'goals' | 'assists' | 'saves' | 'matches' | 'ratings' | 'trophies' | 'managers',
        competitionId
      )
    );
  });

  // Bot Configuration & Gateway Power
  app.post('/api/bot/power', async (req: Request, res: Response) => {
    try {
      const action = req.body?.action as 'online' | 'offline' | 'deploy-commands';
      if (action === 'offline') {
        await stopDiscordBot();
        res.json({ ok: true, message: 'Discord bot disconnected.', botStatus: getDiscordBotStatus() });
        return;
      }
      if (action === 'deploy-commands') {
        const count = await deploySlashCommands();
        res.json({
          ok: count > 0,
          message:
            count > 0
              ? `Deployed ${count} slash commands to Discord.`
              : 'Cannot deploy commands: ensure DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID are set in Secrets.',
          botStatus: getDiscordBotStatus(),
        });
        return;
      }
      const result = await startDiscordBot();
      if (!result.ok) {
        res.status(400).json({ error: result.message, botStatus: getDiscordBotStatus() });
        return;
      }
      res.json({ ok: true, message: result.message, botStatus: getDiscordBotStatus() });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Bot power action failed.' });
    }
  });

  app.patch('/api/config', async (req: Request, res: Response) => {
    try {
      const { actor = 'TLC Admin', ...patch } = req.body;
      res.json(await tlcStore.updateConfig(patch, actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ==================== VITE / STATIC SERVING ====================
  const distDir = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distDir);

  if (isProd) {
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Server Error]', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[TLC Server] Listening on http://0.0.0.0:${PORT}`);
    void startDiscordBot();
  });
}

bootstrap();
