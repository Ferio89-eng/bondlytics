# Bondlytics

Analisi di un portafoglio obbligazionario a partire dalle schede di [simpletoolsforinvestors.eu](https://www.simpletoolsforinvestors.eu): pesi, nominale, costi, fiscalità e piano cedolare.

## Avvio in locale

Serve Node.js 22 o successivo.

1. `npm install`
2. `npm run dev`
3. Apri `http://localhost:3000`

I portafogli restano nel browser (`localStorage`). Non serve una chiave API: i dati dei titoli arrivano dal server dell’app, che legge solo pagine di simpletoolsforinvestors.eu.
