# MIP Production Implementation Document

## 1. Product Vision

MIP should evolve from a demo dashboard into a production-grade marketing intelligence platform.

The production version should allow agencies or internal marketing teams to connect Meta Ads and Google Ads accounts, automatically ingest campaign data, store it securely, analyze campaign performance, generate AI-driven recommendations, and create client-ready reports.

The goal is not only reporting. The goal is to build a campaign command center that answers:

- What happened?
- Why did it happen?
- Which campaigns are risky?
- Which campaigns should be scaled?
- What should be reported to the client?
- What action should the team take next?

## 2. High-Level Production Flow

```text
User Login
  ↓
Tenant / Workspace Selection
  ↓
Connect Meta Ads / Google Ads
  ↓
OAuth Authorization
  ↓
Encrypted Token Storage
  ↓
Initial Data Backfill Job
  ↓
Raw Platform Data Storage
  ↓
Normalized Data Transformation
  ↓
Reporting / Analytics Tables
  ↓
Dashboard + AI Agent + Reports
  ↓
Optional Enterprise Analytics in Microsoft Fabric
```

## 3. Core Production Modules

### Module 1: Authentication and User Management

Purpose:

Provide real production login and secure access control.

Features:

- User login and logout
- Workspace / tenant selection
- Role-based access control
- User invitation
- Passwordless login or SSO
- Session management
- JWT or secure cookie-based authentication

Recommended roles:

- Owner
- Admin
- Analyst
- Client Viewer
- Report Viewer

Database tables:

```text
users
tenants
tenant_users
roles
permissions
user_sessions
```

Production requirement:

Tenant ID must come from authenticated user context, not from frontend query params.

---

### Module 2: Platform Connection Module

Purpose:

Allow users to connect Meta Ads and Google Ads accounts securely.

Features:

- Connect Meta Ads
- Connect Google Ads
- OAuth callback handling
- Store encrypted access and refresh tokens
- List connected ad accounts
- Disconnect account
- Refresh expired tokens
- Show connection health

Database tables:

```text
platform_connections
platform_accounts
oauth_states
connection_audit_logs
```

Important:

One Meta or Google login may expose multiple ad accounts. The system should store both the OAuth connection and the individual ad accounts separately.

---

### Module 3: Data Ingestion and Sync Module

Purpose:

Fetch campaign data dynamically from Meta Ads and Google Ads.

Features:

- Initial historical backfill
- Daily incremental sync
- Manual sync trigger
- Failed sync retry
- Sync status tracking
- Rate-limit handling
- Partial failure handling
- Sync logs

Sync flow:

```text
OAuth connection completed
  ↓
Create sync job
  ↓
Worker picks job
  ↓
Fetch platform accounts
  ↓
Fetch campaigns / adsets / ads / insights
  ↓
Store raw data
  ↓
Normalize into internal schema
  ↓
Update reporting tables
  ↓
Notify frontend
```

Database tables:

```text
sync_jobs
sync_job_logs
sync_failures
sync_checkpoints
```

Why workers are needed:

Fetching full Meta or Google campaign data should not happen inside a normal API request. It should run in background jobs because large accounts can take time and API calls may fail or hit rate limits.

---

### Module 4: Raw Data Layer

Purpose:

Store original platform API responses before transformation.

Tables:

```text
raw_meta_campaigns
raw_meta_adsets
raw_meta_ads
raw_meta_creatives
raw_meta_insights
raw_google_campaigns
raw_google_adgroups
raw_google_ads
raw_google_assets
raw_google_metrics
```

Why this is needed:

- Debug failed transformations
- Reprocess old data
- Preserve original platform response
- Audit imported data
- Avoid repeated API calls when mapping logic changes

---

### Module 5: Normalized Core Data Layer

Purpose:

Convert Meta and Google data into common internal tables.

Tables:

```text
clients
campaigns
adsets
ads
creatives
campaign_daily_metrics
adset_daily_metrics
ad_daily_metrics
conversion_events
```

Example structure:

```text
campaigns
  id
  tenant_id
  client_id
  platform
  platform_campaign_id
  name
  objective
  status
  created_at
  updated_at

campaign_daily_metrics
  id
  tenant_id
  campaign_id
  date
  spend
  impressions
  clicks
  reach
  conversions
  revenue
  ctr
  cpc
  cpm
  roas
```

Why this is better than the current demo table:

The current `campaign_data` table mixes campaign identity and daily metrics in one table. That is acceptable for demo, but production should separate master data from metric data.

---

### Module 6: Reporting and Analytics Layer

Purpose:

Provide fast, consistent data for dashboards, reports, and AI.

Tables or materialized views:

```text
client_daily_summary
campaign_health_summary
platform_daily_summary
monthly_performance_summary
budget_pacing_summary
creative_fatigue_summary
```

Used by:

- Dashboard page
- Campaign page
- AI Brain
- Reports
- Alerts
- Power BI / Fabric

Production rule:

Dashboards should not calculate everything from raw tables in real time. They should read from clean analytics views or summary tables.

---

### Module 7: AI Agent Module

Purpose:

Allow users to ask business questions and receive campaign-specific recommendations.

Example questions:

- Which campaign is wasting budget?
- Which campaign has high frequency?
- Why did CPC increase?
- Which campaigns should we scale?
- What should I tell the client?
- Generate a 7-day action plan.

AI flow:

```text
User asks question
  ↓
Backend receives prompt
  ↓
Load tenant-scoped campaign context
  ↓
Use only approved AI views
  ↓
Generate insight / recommendation / widget
  ↓
Store AI message and tool-call audit
  ↓
Return response to frontend
```

Tables:

```text
ai_conversations
ai_messages
ai_tool_calls
ai_feedback
ai_prompt_versions
ai_response_audit_logs
```

Security rule:

AI should not access unrestricted database tables. It should read only from approved, tenant-scoped analytics views.

Recommended AI views:

```text
ai_campaign_performance_view
ai_budget_risk_view
ai_creative_fatigue_view
ai_client_summary_view
ai_anomaly_view
```

---

### Module 8: Campaign Health and Alerting Module

Purpose:

Automatically detect risks and opportunities.

Features:

- Budget at risk
- High frequency warning
- CPC spike detection
- Low CTR detection
- Zero-conversion spend detection
- Campaign fatigue detection
- Scale opportunity detection
- Notification generation

Tables:

```text
campaign_scores
brain_insights
notifications
alert_rules
alert_events
```

Example statuses:

- Healthy
- Warning
- Critical
- Scale Opportunity

---

### Module 9: Report Generation Module

Purpose:

Generate client-ready reports from trusted campaign data.

Features:

- DOCX reports
- PPT reports
- PDF reports
- Scheduled reports
- Email report delivery
- Report history
- Share links with expiry
- Download tracking

Tables:

```text
reports
report_files
report_recipients
report_schedules
report_download_logs
```

Storage:

Generated files should be stored in object storage such as Azure Blob Storage, not local server folders.

---

### Module 10: Dashboard and Frontend Experience

Purpose:

Provide the main command center for users.

Screens:

- Login
- Workspace selector
- Client overview
- Campaign dashboard
- Campaign detail
- AI Brain
- Reports
- Integrations
- Data sources
- Team management
- Settings
- Notifications

Production enhancements:

- Real auth state
- Loading and error states
- Data freshness indicators
- Last synced timestamp
- Sync status per platform
- Empty states
- Role-based UI access
- Audit-friendly report actions

---

### Module 11: Admin and Audit Module

Purpose:

Give administrators visibility into platform usage and security events.

Features:

- User activity logs
- Login logs
- Platform connection logs
- Sync job logs
- Report download logs
- AI query logs
- Data export logs

Tables:

```text
audit_logs
security_events
data_access_logs
```

---

### Module 12: Microsoft Fabric Integration Module

Purpose:

Use Microsoft Fabric as the enterprise analytics layer.

Fabric should be used for:

- Large historical datasets
- Cross-platform analytics
- Power BI dashboards
- Lakehouse / warehouse modeling
- Long-term reporting
- Enterprise governance
- Curated AI-ready datasets

Fabric should not replace the application database.

Recommended split:

```text
PostgreSQL
  - app users
  - tenants
  - tokens
  - sync jobs
  - dashboard config
  - reports metadata
  - near-real-time campaign data

Microsoft Fabric
  - historical marketing data
  - enterprise reporting
  - Power BI semantic models
  - long-term analytics
  - governed AI datasets
```

## 4. PostgreSQL vs Microsoft Fabric vs Ingestion Feature

### Connect and Auto-Ingest Feature

This is an application feature.

Purpose:

```text
Let users connect Meta/Google accounts and automatically import ad data.
```

It includes:

- OAuth
- token storage
- account discovery
- backfill
- recurring sync
- raw data capture
- data normalization
- sync monitoring

### PostgreSQL

This is the operational application database.

Use it for:

- Users
- Tenants
- Permissions
- Platform tokens
- Sync jobs
- Campaign metrics for app screens
- AI chat history
- Report metadata
- Dashboard configuration

### Microsoft Fabric

This is the enterprise analytics and BI layer.

Use it for:

- Long-term historical analytics
- Power BI
- Cross-platform reporting
- Lakehouse / warehouse
- Governance
- Enterprise data modeling

## 5. Production Infrastructure

Recommended infrastructure:

```text
Frontend
  Vercel / Azure Static Web Apps

Backend API
  Azure App Service / Azure Container Apps / Kubernetes

Background Workers
  Azure Container Apps Jobs / Azure Functions / Queue workers

Database
  Managed PostgreSQL

Queue
  Azure Service Bus / Redis Queue / BullMQ

File Storage
  Azure Blob Storage

Secrets
  Azure Key Vault

Analytics
  Microsoft Fabric

Monitoring
  Application Insights / Log Analytics / Sentry
```

## 6. Production Security Requirements

Must-have items:

- Real authentication
- Role-based access control
- Tenant isolation
- Route protection for all APIs
- Encrypted Meta/Google tokens
- Secrets stored in Key Vault
- Strict CORS
- Audit logs
- Rate limiting
- API request validation
- Report link expiry
- AI read-only data access
- No hardcoded JWT secrets
- No committed `.env` files
- No generated files in Git

Important production rule:

Never trust tenant ID from the frontend. Always derive tenant access from the authenticated user.

## 7. Data Security

Sensitive data:

- Access tokens
- Refresh tokens
- Client campaign data
- Report files
- AI chat history
- Email recipients
- Download links

Required controls:

- Encryption at rest
- Encryption in transit
- Token encryption using managed key
- Audit logging
- Tenant-based row filtering
- Backup and restore policy
- Data retention policy
- Client offboarding process

## 8. AI Security

AI should have restricted access.

Rules:

- AI can only read approved views
- AI cannot write to DB
- AI SQL must be `SELECT` only
- Apply row limits
- Apply query timeout
- Scope every query by tenant
- Log prompts, tool calls, and response metadata
- Add user feedback for AI answers

## 9. Delivery Roadmap

### Phase 1: Stabilize Current Codebase

- Clean tracked generated files
- Remove scratch/browser cache files
- Remove generated reports from Git
- Add `.env.example`
- Document local setup
- Fix route protection gaps
- Restrict CORS
- Remove fallback JWT secret

### Phase 2: Authentication and Tenant Model

- Add users and tenants
- Add role-based access
- Replace local login
- Add backend-issued JWT/session
- Protect all APIs
- Derive tenant from user session

### Phase 3: Platform Connection

- Production Meta OAuth
- Production Google OAuth
- Token encryption
- Account discovery
- Connection health UI
- Disconnect and reconnect flow

### Phase 4: Data Ingestion Pipeline

- Add sync job tables
- Add queue and worker
- Add initial backfill
- Add incremental sync
- Add retry and failure logs
- Store raw platform data

### Phase 5: Data Model Upgrade

- Add normalized campaign/adset/ad tables
- Add daily metric tables
- Add reporting summary tables
- Migrate existing dashboard reads
- Add data freshness indicators

### Phase 6: AI Agent Hardening

- Add AI-safe views
- Add prompt versioning
- Add AI audit logs
- Add AI feedback
- Add source-backed answers
- Add stale-data warnings

### Phase 7: Reporting and Notification System

- Store reports in Blob Storage
- Add report history
- Add scheduled reports
- Add notification tables
- Add email delivery tracking

### Phase 8: Microsoft Fabric Integration

- Export curated data to Fabric
- Build Lakehouse / Warehouse model
- Build Power BI semantic model
- Add enterprise analytics dashboards
- Use Fabric for historical reporting

### Phase 9: Observability and Production Operations

- Add structured logging
- Add error tracking
- Add metrics
- Add uptime checks
- Add sync failure alerts
- Add DB backup monitoring
- Add CI/CD pipeline

## 10. Final Production Positioning

MIP should be positioned as:

```text
An AI-powered marketing intelligence command center that connects ad platforms,
automatically ingests campaign data, detects risks, recommends actions, and
generates client-ready reports.
```

Differentiator:

```text
Reporting platforms show what happened.
MIP explains why it happened, what to do next, and prepares the client-ready action plan.
```

