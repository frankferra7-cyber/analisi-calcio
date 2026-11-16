# Collegare Live e formazioni (API-Football)

Questa cartella contiene un proxy Cloudflare Worker. La chiave API resta sul server e **non** viene mai inserita in `index.html`.

## Prima di iniziare

- Serve un account Cloudflare e una chiave API-Football valida.
- Se la registrazione o la gestione dell'account richiede dati personali o accettazione di condizioni, chiedi a un genitore/tutore di aiutarti.
- Controlla nel pannello API-Football che Serie A (ID 135), Premier League (ID 39) e La Liga (ID 140) abbiano copertura per la stagione richiesta. La copertura può variare.

## Pubblicare il Worker

1. In Cloudflare apri **Workers & Pages** e crea un Worker.
2. Copia il contenuto di `worker.js` nell'editor del Worker e pubblicalo.
3. Nelle impostazioni del Worker apri **Settings → Variables and Secrets**.
4. Aggiungi un secret chiamato esattamente `API_FOOTBALL_KEY` e inserisci lì la chiave API. Non inserirla in GitHub, in `index.html`, in screenshot o in chat.
5. Aggiungi una regola di rate limiting Cloudflare per il dominio del Worker (ad esempio un limite prudente per IP) per proteggere la quota API.
6. Copia l'indirizzo HTTPS del Worker, ad esempio `https://nome-worker.nome-account.workers.dev`.

## Collegare il sito

Quando il Worker è pubblicato, modifica in `index.html`:

```js
const API_BASE='';
```

sostituendo la stringa vuota con l'indirizzo HTTPS reale del Worker, senza slash finale, ad esempio:

```js
const API_BASE='https://nome-worker.nome-account.workers.dev';
```

Poi salva e pubblica il file. Non usare l'indirizzo d'esempio: serve quello effettivo assegnato da Cloudflare.

## Endpoint supportati

- `GET /fixtures?league=135&season=2026&date=2026-11-21`
- `GET /fixtures/lineups?fixture=ID`

Il Worker limita le competizioni e i parametri consentiti, gestisce CORS per il sito GitHub Pages e mette in cache brevemente i risultati live e più a lungo le formazioni. La cache non sostituisce una regola di rate limiting.

## Limiti e verifica

- Finché il Worker e il secret non sono configurati, il sito mostrerà correttamente che la fonte non è collegata.
- Un endpoint che risponde non garantisce che il provider abbia dati per quella partita.
- Le formazioni possono essere pubblicate solo poco prima del calcio d'inizio e non per ogni competizione.
- Il calendario dimostrativo già presente nel sito va verificato con il provider prima di considerare affidabili le partite mostrate.
