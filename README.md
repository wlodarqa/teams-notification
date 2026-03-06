# Teams Notifications from Playwright E2E – Integration Guide

## Passed tests notification
<img width="937" height="557" alt="2026-03-06_12h39_47" src="https://github.com/user-attachments/assets/bf022dd7-c979-4e90-8846-2e6e8f8f2f97" />

## Failed tests notification
<img width="688" height="552" alt="2026-03-06_12h40_00" src="https://github.com/user-attachments/assets/036ee6e2-a0bc-4ef4-8088-fc494b8a786c" />



This document explains how to connect **Teams channel notifications** that are sent after **Playwright E2E tests finish**.

---

# 1) Requirements for `sendTeamsReport.js`

We are **not including the full script here**, only the key requirements that must be satisfied.

The script must read the webhook from:

* `TEAMS_WEBHOOK_URL`

The script must read build data from:

* `BUILD_NUMBER`
* `BUILD_URL`
* `ENVIRONMENT` (optional but recommended)

The script must read QA data from:

* `QA1_NAME`
* `QA2_NAME`
* `QA1_TEAMS_MENTION_ID`
* `QA2_TEAMS_MENTION_ID`

The **mention inside the Adaptive Card** must use:

```
mentioned.id = QA*_TEAMS_MENTION_ID
```

### Accepted formats for `QA*_TEAMS_MENTION_ID`

* `GUID`

Example:

```
3997cdeb-9fd3-4644-92b0-37f3d5441e72
```

* `8:orgid:GUID`

Example:

```
8:orgid:3997cdeb-9fd3-4644-92b0-37f3d5441e72
```

If the ID contains the `8:orgid:` prefix, the script may normalize it to the GUID only.

---

# 2) Pipeline Variables to Configure

## Minimum required

* `TEAMS_WEBHOOK_URL` – Teams channel webhook URL
* `QA1_TEAMS_MENTION_ID`
* `QA2_TEAMS_MENTION_ID`
* `QA1_NAME`
* `QA2_NAME`

## Security recommendation

* Store `TEAMS_WEBHOOK_URL` as a **secret** (Library Variable Group or secret variable)
* Do **not commit the webhook URL** to the repository
* QA IDs and names can be stored as normal variables

---

# 3) Example Azure DevOps Pipeline Snippet (YAML)

A **minimal example** that can be inserted into an existing pipeline:

```yaml
variables:
    - name: TEAMS_WEBHOOK_URL
      value: $(TEAMS_WEBHOOK_URL)
    - name: QA1_TEAMS_MENTION_ID
      value: $(QA1_TEAMS_MENTION_ID)
    - name: QA2_TEAMS_MENTION_ID
      value: $(QA2_TEAMS_MENTION_ID)
    - name: QA1_NAME
      value: 'Tester Name'
    - name: QA2_NAME
      value: 'Tester Name'

steps:
    # ... Your Playwright test steps

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

If the script runs from the **repository root**, keep the `workingDirectory` as shown above.

---

# 4) How to Add a Webhook to a Teams Channel

## Incoming Webhook (Connector) – Classic Method

1. Go to the target **Teams channel**.
2. Open the channel menu (`...`) → `Connectors` or `Manage channel` → integrations.
3. Add **Incoming Webhook**.
4. Give it a name (e.g. `E2E Playwright Notifications`).
5. Copy the generated webhook URL.
6. Paste the URL into the `TEAMS_WEBHOOK_URL` secret in Azure DevOps.

---

# 5) Where to Get `QA*_TEAMS_MENTION_ID`

The most common option is to use the **Entra ID (Azure AD) Object ID** of the user.

Practical steps:

1. Azure Portal → **Entra ID** → **Users** → select a user.
2. Copy the **Object ID** (GUID).
3. Set it as:

```
QA1_TEAMS_MENTION_ID=<GUID>
QA2_TEAMS_MENTION_ID=<GUID>
```

If you have the format:

```
8:orgid:<GUID>
```

it can also be used.

---

## My Method

1. Log in to **Teams Web**.
2. Open **DevTools → Network**.
3. Send a message mentioning the person whose ID you want to extract.
4. In the network request payload you will also find:

   * the ID of the mentioned user
   * your own ID (the sender)

---

# 6) Final Checklist

* [ ] `sendTeamsReport.js` exists in the **repository root** (or pipeline path adjusted)
* [ ] `TEAMS_WEBHOOK_URL` is stored as a **secret**
* [ ] `QA1_TEAMS_MENTION_ID` and `QA2_TEAMS_MENTION_ID` are configured
* [ ] the `Send Teams Notification` step uses `condition: always()`
* [ ] the pipeline executes `node sendTeamsReport.js` after tests
* [ ] a card with results and mentions appears in the Teams channel

---

# 7) Most Common Issues

### Mentions do not work, but the card is sent

Check:

* whether the IDs are correct
* whether the IDs are not empty
* the `Mention ID type` log in the script output

### 4xx / 5xx error returned by Teams

Possible causes:

* webhook is invalid
* webhook expired
* incorrect webhook URL

### No test results displayed in the card

Check whether:

* `test-results.json` exists in one of the supported locations

