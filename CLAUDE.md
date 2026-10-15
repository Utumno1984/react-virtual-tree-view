# react-virtual-tree-view — istruzioni per Claude Code

react-virtual-tree-view è una libreria open-source npm: **TreeView** e **DraggableTreeView**
per React — headless, stand-alone, pensata per alberi performanti (ricerca/filtraggio O(n),
niente layout thrashing nell'auto-scroll) e per il drag & drop via `@dnd-kit` con re-ordering,
cambio di livello (annidamento) e limite massimo di profondità. Showcase e documentazione
vivono in **Storybook**, una story per ogni stato significativo del componente.

## Ruolo della sessione principale: orchestratore del progetto

Daniele parla con l'orchestratore di `~/projects`, che delega qui. Chi lavora in questa cartella
(sessione interattiva o headless) coordina il team in `.claude/agents/`. Per ogni richiesta segui
la pipeline, senza saltare passaggi:

1. **pianificatore** → crea i ticket GitHub (o restituisce domande: giralle a Daniele/
   all'orchestratore e aspetta).
2. Per ogni ticket, in ordine di dipendenza:
   1. **sviluppatore** → branch `feat/<N>-<slug>` (o `fix/<N>-<slug>`) e **PR in bozza subito**
      (`Closes #<N>`), così la CI gira a ogni push. Codice e test insieme: unitari (Vitest),
      **e2e per ogni comportamento visibile dall'esterno** (Playwright, contro Storybook o una
      pagina di test minimale). `npm run check` verde.
   2. **CI verde** sulla PR (`gh pr checks <N> --watch`): lint, tipi, build, unit test, e2e.
      Se è rossa torna allo sviluppatore: tester e critico non partono su una CI rossa.
   3. **tester** → QA: ogni comportamento del ticket dal punto di vista di chi usa la libreria,
      smoke test sulla build (Storybook statico e/o il bundle pubblicato), casi non coperti.
   4. **critico-avversariale** → red team del diff, per ultimo, su codice già verde e verificato.
   5. Se tester o critico segnalano problemi, torna allo **sviluppatore** con l'elenco completo
      e riparti dal punto 2 (CI). Dopo 2 giri senza esito positivo fermati e chiedi a Daniele.
   6. Quando CI verde, tester = QA SUPERATO e critico = APPROVATO: `gh pr ready <N>` e riepilogo
      (cosa cambia, test aggiunti, note del critico).
3. **Merge e pubblicazione npm**: li fa l'orchestratore di `~/projects` (delega di Daniele), mai
   le sessioni o gli agenti di questo progetto. Niente push su `main` né push forzati, niente
   `npm publish` da qui.

### Comandi `gh`

`gh` è nel `PATH`: chiamalo come `gh ...`, all'inizio del comando e da solo (niente prefisso
`PATH=...`, niente `cd ... && gh`). Altrimenti il comando non corrisponde al permesso
`Bash(gh *)` di `.claude/settings.json` e resta bloccato in attesa di un'approvazione.

### Budget dei token (piano Pro)

Le quote di utilizzo (5 ore e settimanale) sono il vincolo: usa il modello più leggero adatto.

- Sessioni headless (`claude -p`) e orchestratore: sempre `--model sonnet`.
- Modelli degli agenti: pianificatore e critico `opus` di default, sviluppatore e tester
  `sonnet`; ogni agente ha un `maxTurns` nel frontmatter.
- Critico su `sonnet`: solo per un ticket a **basso rischio** (una story di Storybook, un
  testo, una rifinitura visiva senza logica di drag/accessibilità coinvolta). Chi invoca il
  critico decide e scrive nel ticket "critico: sonnet (basso rischio)" con il motivo; in caso
  di dubbio resta `opus`. `effort: medium`; dal secondo giro verifica solo i punti segnalati e
  il diff delle correzioni, non rifà il red team completo. Massimo 2 giri.

Lavori piccoli e mirati (una correzione di testo, una domanda sul codice) non richiedono la
pipeline completa: chiedi a Daniele/all'orchestratore se in dubbio.

## Regressione e test

- I test esistenti non si cancellano, non si rinominano e non si indeboliscono (niente
  `.skip`, `.only`, `.fixme`, asserzioni rimosse, soglie o timeout allargati, valori attesi
  cambiati) per far passare una PR: se un test è sbagliato, lo si spiega nella PR.
- Ogni ticket ha la sezione "## Smoke test" (vedi il formato del pianificatore) oltre ai
  criteri di accettazione — lo sviluppatore e il tester li eseguono entrambi.

## Regole di dominio

- **Id stabili per il drag, non posizionali**: ogni `TreeNode` ha un `id` proprio — usalo
  come id del draggable (`useDraggable({ id: node.id })`), mai l'indice/posizione
  nell'albero appiattito. Un id posizionale rompe l'animazione di drop di `DragOverlay`
  (anima verso l'id, che dopo il riordino appartiene a un nodo diverso).
- **Posizionamento delle righe virtualizzate**: usa `top` (stile inline), non
  `transform: translateY(...)` — dnd-kit misura il rect del draggable togliendo i transform
  CSS per ancorare `DragOverlay`, quindi un transform introduce uno scostamento nascosto.
- **Nessuna dipendenza runtime oltre ai peer dependencies** (`react`, `@dnd-kit/core`): la
  libreria resta headless e leggera. Tailwind, Lucide React, Radix UI sono solo per la demo/
  Storybook, non per il pacchetto pubblicato.
- **Performance**: ricerca/filtraggio a complessità O(n) (es. `Set` dei match raccolto prima
  di renderizzare), mai O(n²). Alberi di >500 nodi devono restare fluidi: throttla o cache le
  chiamate a `getBoundingClientRect`/`elementsFromPoint` nei loop di auto-scroll/collisione.
- **Cleanup**: ogni listener nativo su `document`/`window` (es. `pointermove` per il drag) va
  rimosso in `onDragEnd`/`onDragCancel` e nel cleanup di `useEffect` — niente memory leak.
- **Accessibilità**: navigazione da tastiera (freccette per espandere/collassare/muoversi tra
  nodi, Enter/Spazio per selezionare), ruoli ARIA (`role="tree"`, `role="treeitem"`,
  `aria-expanded`, `aria-selected`).

## Convenzioni tecniche

- Stack: React 18+, TypeScript, Tailwind CSS (solo demo/Storybook), `@dnd-kit/core` +
  `@dnd-kit/sortable` come peer/dev dependency, build con `tsup`.
- Codice, nomi e commenti in inglese; la demo/Storybook può avere testi in italiano o inglese
  (decidi in base a dove la mostri — Daniele la usa anche per il portfolio in inglese).
- Struttura: `src/` (libreria pubblicata), `src/tree-utils.ts` (helper puri e testabili:
  `getProjection`, `depth`, `indentation`, `calculateNewParent`), `stories/` (Storybook),
  `tests/unit/` (Vitest), `e2e/` (Playwright).
- Test: `npm run check` = lint + tipi + build + unit test. `npm run test:e2e` = Playwright
  contro Storybook buildato staticamente.
- Prima di ogni commit: `npm run check`. Prima di una PR pronta: anche `npm run test:e2e`.
- Segreti: nessuno previsto in questo progetto (nessuna API esterna, nessun database).
