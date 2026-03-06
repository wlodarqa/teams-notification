# Teams notifications z Playwright E2E – instrukcja spięcia

Ten dokument opisuje, jak podłączyć wysyłkę raportów do kanału Teams po zakończeniu testów E2E
## 1) Co musi być w skrypcie `sendTeamsReport.js`

Nie wklejamy tutaj całego skryptu, tylko kluczowe wymagania, które muszą się zgadzać:

- skrypt czyta webhook z `TEAMS_WEBHOOK_URL`
- skrypt czyta dane builda z:
    - `BUILD_NUMBER`
    - `BUILD_URL`
    - `ENVIRONMENT` (opcjonalnie, ale zalecane)
- skrypt czyta dane QA z:
    - `QA1_NAME`, `QA2_NAME`
    - `QA1_TEAMS_MENTION_ID`, `QA2_TEAMS_MENTION_ID`
- mention w karcie Adaptive Card musi używać:
    - `mentioned.id = QA*_TEAMS_MENTION_ID`

### Akceptowane formaty `QA*_TEAMS_MENTION_ID`

- `GUID` (np. `3997cdeb-9fd3-4644-92b0-37f3d5441e72`)
- `8:orgid:GUID` (np. `8:orgid:3997cdeb-9fd3-4644-92b0-37f3d5441e72`)

Jeśli ID ma prefiks `8:orgid:`, skrypt może go znormalizować do samego GUID.

---

## 2) Co ustawić w pipeline (zmienne)>

## Minimum

- `TEAMS_WEBHOOK_URL` – URL webhooka kanału Teams
- `QA1_TEAMS_MENTION_ID`
- `QA2_TEAMS_MENTION_ID`
- `QA1_NAME`
- `QA2_NAME`

## Rekomendacja bezpieczeństwa

- trzymaj `TEAMS_WEBHOOK_URL` jako **secret** (Library Variable Group lub secret variable)
- nie commituj webhooka do repo
- ID i nazwy możesz trzymać jako zwykłe zmienne

---

## 3) Przykładowy fragment Azure DevOps pipeline (YAML)

Wariant minimalny, który możesz wkleić do istniejącego pipeline:

```yaml
variables:
    - name: TEAMS_WEBHOOK_URL
      value: $(TEAMS_WEBHOOK_URL)
    - name: QA1_TEAMS_MENTION_ID
      value: $(QA1_TEAMS_MENTION_ID)
    - name: QA2_TEAMS_MENTION_ID
      value: $(QA2_TEAMS_MENTION_ID)
    - name: QA1_NAME
      value: 'Imie i nazwisko Testera'
    - name: QA2_NAME
      value: 'Imie i nazwisko testera'

steps:
    # ... Twoje kroki testowe Playwright

    - task: PowerShell@2
      displayName: 'Send Teams Notification'
      condition: always()
      inputs:
          targetType: 'inline'
          workingDirectory: '$(Build.Repository.LocalPath)'
          script: |
              $env:TEAMS_WEBHOOK_URL = "$(TEAMS_WEBHOOK_URL)"
              $env:ENVIRONMENT = "$(Build.SourceBranchName)"
              $env:BUILD_NUMBER = "$(Build.BuildNumber)"
              $env:BUILD_URL = "$(System.CollectionUri)$(System.TeamProject)/_build/results?buildId=$(Build.BuildId)"

              $env:QA1_NAME = "$(QA1_NAME)"
              $env:QA2_NAME = "$(QA2_NAME)"
              $env:QA1_TEAMS_MENTION_ID = "$(QA1_TEAMS_MENTION_ID)"
              $env:QA2_TEAMS_MENTION_ID = "$(QA2_TEAMS_MENTION_ID)"

              if (Test-Path "sendTeamsReport.js") {
                node sendTeamsReport.js
              } else {
                Write-Host "❌ sendTeamsReport.js not found in $(Get-Location)"
              }
```

> Jeśli skrypt działa z katalogu root repo, `workingDirectory` zostaw jak wyżej.

---

## 4) Jak dodać webhook do kanału Teams

## Incoming Webhook (Connector) – klasycznie

1. Wejdź w docelowy kanał Teams.
2. Otwórz menu kanału (`...`) -> `Connectors` lub `Manage channel` -> integracje.
3. Dodaj `Incoming Webhook`.
4. Nadaj nazwę (np. `E2E Playwright Notifications`).
5. Skopiuj wygenerowany URL webhooka.
6. Wklej URL do sekretu `TEAMS_WEBHOOK_URL` w Azure DevOps.

---

## 5) Skąd wziąć `QA*_TEAMS_MENTION_ID`

Najczęściej używa się **Entra ID (Azure AD) Object ID** użytkownika.

Praktycznie:

1. Azure Portal -> Entra ID -> Users -> wybierz użytkownika.
2. Skopiuj `Object ID` (GUID).
3. Ustaw jako:
    - `QA1_TEAMS_MENTION_ID=<GUID>`
    - `QA2_TEAMS_MENTION_ID=<GUID>`

Jeśli masz format `8:orgid:<GUID>`, też możesz go użyć.

## Moj sposób
1. Zaloguj się na web teamsy
2. Otwórz devtools -> Network
3. Wyślij wiadomość z oznaczeniem osoby, które ID chcesz wyciągnąć
4. Znajdziesz tam też ID swoje, czyli osoby która wysyła wiadomoś
---

## 6) Checklista końcowa

- [ ] `sendTeamsReport.js` jest w root repo (albo poprawiona ścieżka w pipeline)
- [ ] `TEAMS_WEBHOOK_URL` ustawiony jako secret
- [ ] `QA1_TEAMS_MENTION_ID` i `QA2_TEAMS_MENTION_ID` ustawione
- [ ] krok `Send Teams Notification` ma `condition: always()`
- [ ] pipeline po teście wywołuje `node sendTeamsReport.js`
- [ ] w kanale Teams pojawia się karta z wynikami i mentionami

---

## 7) Najczęstsze problemy

- Brak mentionów, mimo że karta się wysyła:
    - sprawdź, czy ID są poprawne i nie są puste
    - sprawdź log `Mention ID type` w output skryptu
- Błąd 4xx/5xx z Teams:
    - webhook nieaktywny, wygasły albo zły URL
- Brak wyników testów w karcie:
    - sprawdź, czy `test-results.json` jest w jednej z obsługiwanych lokalizacji
