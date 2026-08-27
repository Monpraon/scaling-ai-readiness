# Scaling AI Readiness

A small, bilingual (Thai/English) self-assessment that shows where a person or
institution sits on a **3-step AI capability ladder** — Personal Skill →
Shared Practice → Institutional Capability — and names the three gaps that keep
teams stuck: Shadow AI, Hero Dependency, and Pilot Purgatory.

It has two doors:

- **Quick Assessment** — 8 questions, ~2 minutes, works for everyone.
- **Analyze My Work** — paste code / a README / a description of something you
  built with AI and get a scaling-readiness verdict.

The app runs **fully static with zero backend**, and gains shared "room"
results plus AI-written explanations when you point it at a backend you deploy.

> This is free, self-hostable software. You deploy it into **your own** cloud
> account. There are no accounts, keys, or endpoints belonging to anyone else
> baked into this repo.

---

## How it works

```
Browser (React SPA)
   │
   │  VITE_API_BASE (optional)
   ▼
API Gateway (HTTP API)  ──►  Lambda
                                ├─ DynamoDB   (anonymous counters + daily budget)
                                └─ Bedrock    (explains rule-engine findings)
```

**Rules first, cheap AI second.** A deterministic rule engine decides the
substance (which ladder step, what the risks are). The model only turns those
structured findings into friendly bilingual prose. That keeps output stable,
cost low, and hallucination minimal — the model never invents the verdict.

Default model is **Amazon Nova Micro** with **Nova Lite** as a fallback, both
via the Bedrock Converse API and configurable with `bedrock_model_id`.

---

## Repository layout

```
web/                  Vite + React frontend
infra/terraform/      Terraform for the serverless backend + optional hosting
  lambda/index.js     the single backend handler
scripts/              build + publish helpers
```

---

## Quick start (frontend only, no cloud)

```bash
cd web
npm install
npm run dev          # http://localhost:5173
```

With no `VITE_API_BASE` set, "room" results are kept on-device in
`localStorage` and "Analyze My Work" is disabled (it needs a backend that can
reach a model — we never put model credentials in the browser).

---

## Full deploy (with the AI backend)

Prerequisites: an AWS account, the AWS CLI authenticated to it, Terraform
≥ 1.5, Node ≥ 18, and **Bedrock model access enabled** for the models you pick
(request access in the Bedrock console → Model access).

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # edit if you like
terraform init
terraform apply

# build the frontend against the new API and publish it:
cd ../..
./scripts/deploy-frontend.sh
```

`terraform apply` prints:

- `api_base_url` — the backend endpoint (used as `VITE_API_BASE`)
- `cloudfront_domain` — the public URL of the hosted app

`deploy-frontend.sh` reads those outputs, builds the SPA with the right API
base, syncs it to S3, and invalidates CloudFront. Nothing is hardcoded, so the
same commands work for any account or region.

---

## Configuration

### Frontend (`web/.env.local`, all optional)

| Variable             | Purpose                                             |
| -------------------- | --------------------------------------------------- |
| `VITE_API_BASE`      | Backend URL. Blank = static/offline mode.           |
| `VITE_BRAND_PRIMARY` | First half of the wordmark.                         |
| `VITE_BRAND_ACCENT`  | Second (coloured) half of the wordmark.             |
| `VITE_CTA_URL`       | Link shown on the results screen.                   |
| `VITE_EVENT_LABEL`   | Small eyebrow label on the landing screen.          |

### Backend (Terraform variables — see `terraform.tfvars.example`)

| Variable                      | Default                   | Purpose                              |
| ----------------------------- | ------------------------- | ------------------------------------ |
| `aws_region`                  | `us-east-1`               | Region for backend + Bedrock.        |
| `bedrock_model_id`            | `amazon.nova-micro-v1:0`  | Primary model.                       |
| `bedrock_fallback_model_id`   | `amazon.nova-lite-v1:0`   | Fallback model.                      |
| `max_ai_requests_per_day`     | `2000`                    | Daily cap on `/analyze` (then 429).  |
| `max_input_chars`             | `8000`                    | Max pasted text sent to the model.   |
| `lambda_reserved_concurrency` | `20`                      | Caps concurrent model spend.         |
| `api_throttle_rate` / `burst` | `20` / `40`              | API Gateway request throttling.      |
| `allowed_origins`             | `["*"]`                   | Lock to your site origin in prod.    |
| `enable_frontend_hosting`     | `true`                    | Provision S3 + CloudFront.           |

---

## Cost & abuse protection

Because this is meant to be offered free to the public, spend is guarded on
several layers:

- **Daily budget counter** in DynamoDB — `/analyze` returns 429 past the cap,
  and the app still shows the deterministic result.
- **Lambda reserved concurrency** — bounds how many model calls can run at once.
- **API Gateway throttling** — steady-state + burst limits.
- **Input truncation** — pasted text is clipped before it reaches the model.
- **Cheap model by default** — Nova Micro.

---

## Security notes

- No provider API keys ever live in the frontend. All model access is
  server-side via IAM.
- Uploaded/pasted text is never executed. Detected secret-like strings are
  flagged but never echoed back.
- `terraform.tfvars`, `*.tfstate`, and `.env*` are gitignored — keep real
  account values out of version control.
- For a public deployment, review `allowed_origins` and consider adding AWS WAF
  in front of CloudFront / the API.

---

## License

MIT — see [LICENSE](./LICENSE).
