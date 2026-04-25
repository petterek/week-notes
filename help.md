# Hjelp

Velkommen til **Ukenotater** — et personlig system for ukenotater, oppgaver, møter og personer organisert per kontekst.

## Oversikt

Appen er bygget rundt **uker**. Hver uke har:

- **Notater** — markdown-filer (`yyyy-Www.md`) du kan redigere fritt
- **Oppgaver** — todo-elementer som kan fullføres med kommentar
- **Møter** — kalenderoppføringer med type og deltakere
- **Resultater** — utfall og leveranser knyttet til uka

## Kontekster

Alt innhold lever inne i en **kontekst** (f.eks. "Jobb", "Privat"). Hver kontekst har sin egen mappe med data og kan kobles til et eget git-repo for backup og versjonering.

Bytt kontekst via velgeren øverst i navigasjonen. Administrer kontekster på `/settings`.

## Hurtigtaster

| Tast | Side |
|------|------|
| `Alt+H` | 🏠 Hjem |
| `Alt+O` | ☑️ Oppgaver |
| `Alt+K` | 📅 Kalender |
| `Alt+P` | 👥 Personer |
| `Alt+R` | ⚖️ Resultater |
| `Alt+N` | 📝 Nytt notat |
| `Alt+S` | ⚙️ Innstillinger |

## Hjem

Hjemskjermen viser inneværende uke med notater, møter og oppgaver. På venstre side er **åpne oppgaver** for alle uker; fullførte oppgaver vises sammen med uka de ble løst.

På høyre side ligger **resultater** som rulles fram fra tidligere uker.

## Oppgaver

- Klikk avkrysningsboksen for å fullføre en oppgave (legg til valgfri kommentar)
- Bruk `+` for å legge til en ny oppgave på en uke
- Fullførte oppgaver flyttes til uka der de ble fullført

## Møter

Møter har en **type** (møte, 1-på-1, standup, workshop osv.) som vises som et ikon i kalenderen og sidekortet.

Møtetyper konfigureres per kontekst på `/settings` under "Møtetyper". Velg ikoner fra det grupperte ikonpaletten (Personer, Kommunikasjon, Dokumenter, Sport, …).

## Personer

Personer kan refereres med `@kortnavn` i notater. Ved hover vises et tooltip med navn, tittel og kontaktinfo.

På `/people` kan du:

- Opprette nye personer
- Redigere kontaktinfo og notater
- **Inaktivere** personer (skjules fra autocomplete men tas vare på)
- **Slette** personer (gjøres til gravstein så de ikke gjenoppstår fra eksisterende `@`-referanser)

## Notater

- Notatformat er markdown
- Lagre med `Ctrl+S` i editoren
- Bruk `>` for sitater, `|` for tabeller — det styles automatisk
- `@kortnavn` blir til lenker som peker på personkortet

## Kalender

Kalenderen på `/calendar` viser møter i en uke-grid. Klikk på et tidspunkt for å lage et møte; klikk på et møte for å redigere.

Bruk **✏️ Typer** for å justere møtetypene tilgjengelig i den aktive konteksten.

## Innstillinger

`/settings` har en **master/detail**-layout: kontekstene listes på venstre side, og valgt kontekst kan redigeres til høyre.

Hver kontekst har:

- **📦 Status** — git-status og commit-knapp
- **📝 Generelt** — navn, ikon, beskrivelse, remote URL
- **🗓️ Møtetyper** — egen liste med ikoner og labels

## Git og backup

Hvis en kontekst har en `remote`, blir endringer committet og kan pushes manuelt fra status-seksjonen. Data ligger i `data/<kontekst>/`.

> **Tips:** Notater committes ikke automatisk før destruktive operasjoner — bruk commit-knappen ofte hvis du jobber med viktige data.

## Snarveier i notater

| Syntaks | Resultat |
|---------|----------|
| `@navn` | Lenke til person |
| `> ...` | Blå sitat-blokk |
| `\`code\`` | Inline kode |
| `| a \| b |` | Tabell med stylet header |

---

Trykk `Esc` eller klikk utenfor for å lukke denne hjelpen.
