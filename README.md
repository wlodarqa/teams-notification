# Teams Notifications from Playwright E2E – Integration Guide

## Passed tests notification
<img width="937" height="557" alt="2026-03-06_12h39_47" src="https://github.com/user-attachments/assets/bf022dd7-c979-4e90-8846-2e6e8f8f2f97" />

## Failed tests notification
<img width="688" height="552" alt="2026-03-06_12h40_00" src="https://github.com/user-attachments/assets/036ee6e2-a0bc-4ef4-8088-fc494b8a786c" />



## 1) First add a webhook to the Teams channel

### Incoming Webhook (Connector)

1. Open the target Teams channel.
2. Click `...` next to the channel → `Connectors` (or channel integrations).
3. Add `Incoming Webhook`.
4. Give it a name (e.g., `E2E Notifications`).
5. Copy the webhook URL.
6. In Azure DevOps, save it as a secret variable: `TEAMS_WEBHOOK_URL`.

---

## 2) Then get the user IDs for mentions

1. Log in to **Teams Web**.
2. Open **DevTools → Network**.
3. Send a message mentioning the person whose ID you want to extract.
4. In the network request payload you will find:
   - the **ID of the mentioned user**
   - **your own ID** (the sender)

Accepted ID formats:

- `GUID`
- `8:orgid:GUID`

---

## 3) Next add a step to the pipeline

Make sure you have the following variables:

- `TEAMS_WEBHOOK_URL` (**secret**)
- `QA1_TEAMS_MENTION_ID`, `QA2_TEAMS_MENTION_ID`
- `QA1_NAME`, `QA2_NAME`

Paste the following at the end of the test job:

```yaml
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

---

## 4) Finally connect the script

The `sendTeamsReport.js` script should:

- read `TEAMS_WEBHOOK_URL`
- read `BUILD_NUMBER`, `BUILD_URL`, `ENVIRONMENT`
- read `QA1_NAME`, `QA2_NAME`
- read `QA1_TEAMS_MENTION_ID`, `QA2_TEAMS_MENTION_ID`
- set the mention by ID: `mentioned.id = QA*_TEAMS_MENTION_ID`
### No test results displayed in the card

Check whether:

* `test-results.json` exists in one of the supported locations

