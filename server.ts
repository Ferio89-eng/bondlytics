import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseSimpleToolsHtml,
  validateAndCanonicalizeBondUrl,
} from './server/bondParser.ts';
import type { BondData } from './src/types/portfolio.ts';
import { getEurFxRates } from './server/fxRates.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Simple in-memory cache (15 minutes TTL) to avoid hammering simpletoolsforinvestors.eu
const CACHE_TTL_MS = 15 * 60 * 1000;
const bondCache = new Map<string, { data: BondData; expiresAt: number }>();

async function fetchBondFromSource(rawUrl: string): Promise<BondData> {
  const target = validateAndCanonicalizeBondUrl(rawUrl);

  const cached = bondCache.get(target.canonicalUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(target.canonicalUrl, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; Bondlytics/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Risposta HTTP ${response.status} da simpletoolsforinvestors.eu.`
      );
    }

    const html = await response.text();
    const bondData = parseSimpleToolsHtml(html, target);

    bondCache.set(target.canonicalUrl, {
      data: bondData,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return bondData;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        'Timeout durante il recupero dei dati da simpletoolsforinvestors.eu.'
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/fx', async (_req, res) => {
    try {
      const quote = await getEurFxRates();
      res.json(quote);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Cambio BCE non disponibile.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/bond', async (req, res) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
    try {
      const bond = await fetchBondFromSource(rawUrl);
      res.json({ bond });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Errore imprevisto nel recupero del titolo.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/bonds/batch', async (req, res) => {
    const rawUrls: unknown[] = Array.isArray(req.body?.urls) ? req.body.urls : [];
    const safeUrls: string[] = rawUrls
      .filter((u: unknown): u is string => typeof u === 'string')
      .slice(0, 15);

    if (safeUrls.length === 0) {
      res.status(400).json({ error: 'Nessun URL valido fornito.' });
      return;
    }

    const results = await Promise.allSettled(
      safeUrls.map((u: string) => fetchBondFromSource(u))
    );

    const bonds: BondData[] = [];
    const errors: { url: string; error: string }[] = [];

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        bonds.push(result.value);
      } else {
        errors.push({
          url: safeUrls[idx],
          error:
            result.reason instanceof Error
              ? result.reason.message
              : 'Errore nel caricamento',
        });
      }
    });

    res.json({ bonds, errors });
  });

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server Bondlytics attivo su http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Errore avvio server:', err);
  process.exit(1);
});
