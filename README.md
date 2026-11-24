# Bondlytics

Analisi di un portafoglio obbligazionario a partire dalle schede di [simpletoolsforinvestors.eu](https://www.simpletoolsforinvestors.eu): pesi, nominale, costi, fiscalità e piano cedolare.

## Avvio in locale

Serve Node.js 22 o successivo.

1. `npm install`
2. `npm run dev`
3. Apri `http://localhost:3000`

I portafogli restano nel browser (`localStorage`). Non serve una chiave API.

In locale, `npm run dev` avvia il server Node: ogni link di simpletoolsforinvestors.eu e i cambi BCE sono letti al momento.

GitHub Pages pubblica solo file statici, quindi il sito online usa `public/data/bonds.json` e `public/data/fx.json`. Un titolo assente da quel file non può essere scaricato dal browser. Per aggiungerlo, oppure per aggiornare quotazioni e cambi senza lanciare lo script in locale, apri Actions → «Aggiorna dati pubblicati» → Run workflow e, se serve, incolla il link nel campo `bond_url`. L’azione rigenera i JSON, li committa e rilancia la pubblicazione. Lo stesso aggiornamento parte da solo nei giorni feriali alle 16:30 (ora italiana).
