# Änderungen

- **Fix Listener-Leck:** `get-shared-state`/`set-shared-state` entfernen ihre `init`/`change`-Listener beim Schließen (`close`). Vorher blieb bei jedem Teil-Deploy ein alter Listener am weiterlebenden `shared-state`-Config-Node hängen, sodass eine einzige Zustandsänderung N-fach ausgegeben wurde (inkl. `MaxListenersExceededWarning`).
- Zustandsänderungen werden jetzt immer persistiert, auch bei `historyCount=0`.
- Schreibvorgänge werden über eine Warteschlange serialisiert und per temporärer Datei plus `rename` atomar ersetzt. Veraltete `.tmp`-Dateien werden beim Laden entfernt.
- Beschädigte JSON-Zustandsdateien werden beim Laden abgefangen und als Fehler gemeldet, statt den Prozess durch einen ungefangenen Parse-Fehler zu beenden.
- Unbenutzte Abhängigkeiten (`lodash`, `mkdirp`, `is-valid-var-name`) wurden entfernt; die Verzeichniserstellung nutzt `fs.mkdirSync(..., {recursive:true})`.
- Mocha-, Node-RED- und Test-Helper-Entwicklungsabhängigkeiten sowie Regressionstests für Persistenz und atomare Dateien ergänzt.
- Travis CI durch GitHub Actions für Node.js 18, 20 und 22 ersetzt.

Nicht geändert: Die vorhandene Änderungserkennung per `JSON.stringify` sowie die Trigger-Filter in `getState` bleiben unverändert; Deadband/Debounce und zusätzliche Übergangsfilter sind bewusst nicht Bestandteil dieser Änderung.
