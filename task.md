# ShipWatch — Build Tracker

## Phase 1: Project Foundation ✅ COMPLETE
**All code scaffolded and ready!**

### 🤖 Agent Built:
- [x] Next.js frontend (App Router, TypeScript, Tailwind, shadcn/ui)
- [x] Python FastAPI backend
- [x] Landing page with premium dark theme, glassmorphism, animated gradient borders
- [x] Scan results dashboard with risk cards, filter tabs, expandable package details
- [x] API client with TypeScript types
- [x] Backend services: dep_parser, coral_client, risk_scorer, llm_summarizer, scan_store
- [x] Environment variable templates
- [x] .gitignore

### 🧑 YOU Need To Do Now:
- [ ] **Get GitHub Personal Access Token**: https://github.com/settings/tokens
  - Click "Generate new token (classic)"
  - Check scopes: `repo`, `read:org`
  - Copy the token
- [ ] **Get Google AI API Key**: https://aistudio.google.com/apikey
  - Create API key → copy it
- [ ] **Install Coral CLI (Windows)**:
  - Go to https://github.com/withcoral/coral/releases
  - Download `coral-x86_64-pc-windows-msvc.zip`
  - Extract and add to PATH
  - Run `coral onboard` to set up
- [ ] **Copy .env.example to .env** and fill in your tokens:
  ```
  cd backend
  copy .env.example .env
  # Edit .env with your tokens
  ```
- [ ] **Install Python deps**:
  ```
  cd backend
  pip install -r requirements.txt
  ```
- [ ] ⭐ Star https://github.com/withcoral/coral
- [ ] 💬 Join Coral Discord: https://withcoral.com/discord
- [ ] Register for hackathon if not done

---

## Phase 2: Coral Source Specs ✅ CODE WRITTEN
**Specs written, need Coral CLI to test**

- [x] `osv.yaml` source spec written
- [x] `npm.yaml` source spec written

### 🧑 YOU Test After Installing Coral:
- [ ] `coral source lint ./backend/coral_specs/osv.yaml`
- [ ] `coral source lint ./backend/coral_specs/npm.yaml`
- [ ] `coral source add github` (bundled — needs GitHub token)
- [ ] `coral source add --file ./backend/coral_specs/osv.yaml`
- [ ] `coral source add --file ./backend/coral_specs/npm.yaml`
- [ ] Test: `coral sql "SELECT * FROM osv.vulnerabilities WHERE package_name = 'lodash' AND ecosystem = 'npm' LIMIT 5"`

> **Note**: The backend has API fallbacks! It will work even WITHOUT Coral installed 
> by calling GitHub/OSV/npm APIs directly. But Coral makes the cross-source JOINs 
> possible and is required for the hackathon.

---

## Phase 3: Backend Testing
**Goal**: Verify the scan pipeline works end-to-end

### 🧑 YOU Test:
- [ ] Start backend: `cd backend && python main.py`
- [ ] Test health: `curl http://localhost:8000/api/health`
- [ ] Test scan: Open browser to `http://localhost:8000/docs` (FastAPI auto-docs)
- [ ] Try scanning a repo via the docs UI

---

## Phase 4: Frontend Testing
**Goal**: See the full app in action

### 🧑 YOU Test:
- [ ] Start frontend: `cd frontend && npm run dev`
- [ ] Open http://localhost:3000
- [ ] Paste a repo URL and scan
- [ ] Report any issues to me

---

## Phase 5: Polish + Human Edge (Day 4-5)
- [ ] Battle test with 10+ repos
- [ ] YOUR unique feature
- [ ] Error handling + edge cases
- [ ] Mobile responsive
- [ ] Animations tuning

---

## Phase 6: Submission (Day 6)
- [ ] Demo video (2-3 min)
- [ ] Blog post (Captain's Log bounty)
- [ ] README with screenshots
- [ ] Submit source specs to Coral Discord
- [ ] Submit to hackathon
