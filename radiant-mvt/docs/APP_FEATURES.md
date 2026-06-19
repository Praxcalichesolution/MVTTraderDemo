# Radiant-MVT App Guide

## Overview
Radiant-MVT is an AI-assisted trading intelligence platform for commodity trading teams. It combines decision triage, live book and VaR monitoring, market curves, vessel tracking, communications workflow, compliance, performance analytics, connector administration, and AI prompt governance in one workspace.

## Shared Platform Features
- Left-side navigation for Trading, Intelligence, Operations, Tools, Management, and Admin screens.
- Top-bar KPIs for daily P&L, VaR utilisation, open decisions, and alert count.
- Right-side Market Watch panel with commodity intelligence, related news, and quick refresh controls.
- Radiant AI copilot panel that is aware of the current screen and selected record.
- Role-based access for trader, risk, executive, and admin views.

## Screen Guide
### Decision Queue (`decision-queue`)
Purpose: prioritised daily decisions sorted by deadline and impact.

Features:
- Decision cards ranked by urgency with countdowns and potential financial impact.
- AI Decision Briefing panel for a market-aware morning summary.
- Decision reasoning modal that explains why a recommendation matters.
- Quick decision actions including review and snooze patterns.

Common tasks:
- Generate the AI decision briefing.
- Review reasoning for a specific decision.
- Complete or snooze a decision item.

### Trader Dashboard (`dashboard`)
Purpose: live book overview for the current trading day.

Features:
- Role-aware KPI tiles and configurable dashboard layout.
- Book, blotter, heat map, alerts, and news visibility in one screen.
- Fast drill-down into flagged trades and position detail.

Common tasks:
- Refresh the desk overview.
- Inspect high-priority alerts.
- Review blotter and P&L hotspots.

### Positions & Risk (`positions`)
Purpose: full position book with hedging and risk context.

Features:
- All, physical, and financial position filters.
- Position table with exposure, prices, P&L, hedge ratio, and VaR.
- Exposure-by-tenor chart, counterparty exposure, and forward curves.
- VaR explainer including stressed VaR and board-limit utilisation.

Common tasks:
- Refresh the position book.
- Filter the grid by position type.
- Review commodity VaR and curve context.

### AI Intelligence Centre (`ai`)
Purpose: AI workspace for analysis, recommendations, and scenario review.

Features:
- Hedge Advisor with factor attribution and recommended structures.
- Trade idea scanner and anomaly alert summaries.
- Pre-mortem book analysis.
- Forecast narrative and event/sentiment impact on book.

Common tasks:
- Run Hedge Advisor for Brent, Urals, Ethane, or Naphtha.
- Run the pre-mortem on the current book.
- Generate a forecast narrative for a selected commodity.

### Performance & Analytics (`performance`)
Purpose: YTD performance, plan comparison, and missed-opportunity review.

Features:
- YTD P&L, target attainment, and forecast metrics.
- Monthly performance chart and waterfall attribution.
- Opportunity-cost and shortfall investigation hooks.

Common tasks:
- Refresh performance charts.
- Investigate the shortfall with AI support.

### Decision Intelligence (`decision-intelligence`)
Purpose: explain missed opportunities and search institutional memory.

Features:
- Missing-trade investigation and forensics.
- Desk Brain institutional-memory search for similar structures.
- High-signal review of how decisions affected performance.

Common tasks:
- Run the AI forensics investigation.
- Search Desk Brain for similar trades.

### Market Data & Curves (`market`)
Purpose: cached-first prices, curve views, spreads, and scenario testing.

Features:
- Live prices and spread panels.
- Forward curve chart for Brent, WTI, Ethane, Naphtha, and EUA.
- Natural-language curve shifter.
- Market headlines tied to current commodities.

Common tasks:
- Refresh prices.
- Switch the active curve.
- Apply a curve-shift scenario.

### Vessels & Logistics (`vessels`)
Purpose: fleet tracking and voyage economics.

Features:
- Vessel cards and cargo pipeline view.
- Interactive map with route and delay context.
- Voyage and hedge-impact workflow support.

Common tasks:
- Review the impact of a delay.
- Inspect route and voyage economics.

### Communications Hub (`comms`)
Purpose: action-focused inbox with AI summaries and drafts.

Features:
- Priority inbox with urgency filters.
- Email detail panel with AI summary and linked trade or vessel.
- Draft reply workflow and action queue.
- Mark-actioned flow for operational follow-up.

Common tasks:
- Open a specific email.
- Send the drafted reply.
- Mark a communication as actioned.

### Compliance & Audit (`compliance`)
Purpose: filings, audit trail, and AI action logging.

Features:
- Regulatory filing status and deadlines.
- Immutable audit trail with filters.
- Desk-level compliance review support.

Common tasks:
- Refresh compliance data.
- Review filing status or audit trail.

### External Systems Configuration (`configuration`)
Purpose: manage news, market-data, AI-model, and ETRM connectors.

Features:
- Connector dashboard grouped by type.
- Connector creation, update, delete, and test actions.
- Credential storage and provider-aware connectivity tests.

Common tasks:
- Load connector status.
- Test a named connector.
- Save or update connector credentials.

### AI Studio (`ai-studio`)
Purpose: enterprise control plane for prompts, providers, and user context.

Features:
- Agent list with default-copilot selection and version history.
- Prompt, tool-scope, and screen-scope editing.
- Agent test harness and persistent user profile management.

Common tasks:
- Inspect the chat copilot configuration.
- Test an AI agent with a selected screen context.

### Boardroom View (`boardroom`)
Purpose: executive performance and strategic value summary.

Features:
- Top-quartile performance gap analysis.
- Executive-friendly comparison and capital-efficiency view.

Common tasks:
- Review executive summary metrics.
- Assess top-quartile uplift potential.

### Admin / Demo Control (`admin`)
Purpose: demo scenarios, system health, and operational controls.

Features:
- Scenario launcher for fat-finger, stale-price, margin-breach, and vessel-delay cases.
- System-status checks.
- Admin shortcuts for demo and operational workflows.

Common tasks:
- Trigger a named scenario.
- Review system status.

## Chat Copilot Capabilities
- Explain what each screen does and where a feature lives.
- Navigate directly to a screen when the request is explicit.
- Run supported tasks such as refreshing data, generating briefings, applying curve shifts, opening emails, marking items actioned, switching AI provider, testing connectors, and triggering demo scenarios.
- Use the currently selected decision, email, or alert when the task depends on a specific record.

## Example Copilot Requests
- `Take me to Positions & Risk.`
- `Refresh market data and open the Brent curve.`
- `Generate my decision briefing.`
- `Open the Vitol confirmation email and send the drafted reply.`
- `Run a pre-mortem on the book.`
- `Test the LM Studio connector.`
