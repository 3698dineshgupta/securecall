# SecureCall — E2E Encrypted Voice & Video Calling Platform

A production-ready, end-to-end encrypted communication platform built with WebRTC, Node.js, React, and PostgreSQL.

---

## 🔒 Security Architecture

```
┌─────────────┐         WebSocket (SDP/ICE only)        ┌──────────────────┐
│   Browser A │ ──────────────────────────────────────► │ Signaling Server │
│             │ ◄────────────────────────────────────── │ (JWT protected)  │
└─────┬───────┘                                         └──────────────────┘
      │                                                           │
      │   DTLS-SRTP Encrypted P2P Media Stream                   │
      │   (Server NEVER sees this)                               │
      │                                                           │
      ▼                                                           ▼
┌─────────────┐                                         ┌─────────────────┐
│   Browser B │◄── Audio/Video (E2E Encrypted) ────────►│  Browser B (P2P)│
└─────────────┘                                         └─────────────────┘
```

### Encryption Flow:
1. **Authentication**: JWT (RS256/HS256) — secures all API + WebSocket connections
2. **Signaling**: TLS 1.3 WebSocket — only SDP metadata and ICE candidates pass through
3. **Media**: DTLS-SRTP — automatically negotiated by WebRTC, all audio/video is P2P encrypted
4. **Passwords**: bcrypt (rounds=12) — never stored in plaintext
5. **Database**: No call media stored — only metadata (duration, type, status)

---

## 📁 Project Structure

```
securecall/
├── backend/                    # Express.js REST API
│   ├── src/
│   │   ├── index.js            # Server entry + middleware
│   │   ├── config/
│   │   │   └── database.js     # PostgreSQL connection pool
│   │   ├── migrations/
│   │   │   └── schema.js       # DB schema (users, contacts, calls, tokens)
│   │   ├── middleware/
│   │   │   └── auth.js         # JWT verify + token generation
│   │   └── routes/
│   │       ├── auth.js         # /api/auth - signup, login, refresh, logout
│   │       ├── users.js        # /api/users - search, contacts CRUD
│   │       └── calls.js        # /api/calls - history, record
│   ├── Dockerfile
│   └── package.json
│
├── signaling/                  # Socket.IO WebRTC Signaling Server
│   ├── server.js               # JWT auth + call orchestration + SDP/ICE relay
│   ├── Dockerfile
│   └── package.json
│
├── frontend/                   # React SPA
│   ├── src/
│   │   ├── App.jsx             # Router + global providers
│   │   ├── index.css           # Design system (CSS variables)
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── SignupPage.jsx
│   │   │   └── DashboardPage.jsx  # Contacts + call history + search
│   │   ├── components/
│   │   │   ├── call/
│   │   │   │   ├── ActiveCall.jsx      # Video/audio call UI
│   │   │   │   └── IncomingCallModal.jsx
│   │   │   └── ui/
│   │   │       └── NotificationBar.jsx
│   │   ├── hooks/
│   │   │   └── useCall.js      # WebRTC + signaling orchestration
│   │   ├── services/
│   │   │   ├── api.js          # Axios + JWT refresh interceptors
│   │   │   ├── webrtc.js       # RTCPeerConnection + DTLS management
│   │   │   └── signaling.js    # Socket.IO client
│   │   └── store/
│   │       └── index.js        # Zustand stores (auth, call, contacts)
│   ├── Dockerfile
│   └── package.json
│
├── nginx/
│   └── nginx.conf              # Reverse proxy + SSL + WebSocket support
├── docker-compose.yml
└── .env.example
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- npm or yarn

### 1. Database Setup

```bash
# Create PostgreSQL database
psql -U postgres
CREATE DATABASE securecall;
CREATE USER securecall_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE securecall TO securecall_user;
\q
```

### 2. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your values:
# DB_USER, DB_PASSWORD, JWT_SECRET (min 32 chars), JWT_REFRESH_SECRET

npm install
npm run dev    # Starts on port 3001 + runs migrations
```

### 3. Signaling Server Setup

```bash
cd signaling
# Create .env with JWT_SECRET (same as backend) and FRONTEND_URL
echo "JWT_SECRET=your_secret_here
FRONTEND_URL=http://localhost:3000
SIGNALING_PORT=3002" > .env

npm install
npm run dev    # Starts on port 3002
```

### 4. Frontend Setup

```bash
cd frontend
# Create .env.local
echo "REACT_APP_API_URL=http://localhost:3001/api
REACT_APP_SIGNALING_URL=http://localhost:3002" > .env.local

npm install
npm start      # Starts on port 3000
```

---

## 🐳 Docker Deployment (Production)

### 1. Prepare Environment

```bash
git clone <your-repo>
cd securecall
cp .env.example .env

# Generate secrets
echo "JWT_SECRET=$(openssl rand -hex 64)"
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 64)"
echo "DB_PASSWORD=$(openssl rand -hex 32)"

# Edit .env with your domain and generated secrets
nano .env
```

### 2. SSL Certificate (Let's Encrypt)

```bash
# Point your domain's A record to your server IP first, then:
docker compose --profile ssl run certbot

# Set up auto-renewal
echo "0 12 * * * root docker compose run --rm certbot renew --quiet" | sudo tee /etc/cron.d/certbot
```

### 3. Update Nginx Config

Edit `nginx/nginx.conf` — replace `your-domain.com` with your actual domain.

### 4. Deploy

```bash
docker compose up -d

# View logs
docker compose logs -f

# Check status
docker compose ps
```

---

## ☁️ Cloud Deployment

### AWS (Recommended for production)

#### Option A: EC2 + RDS

```bash
# 1. Launch EC2 instance (t3.medium minimum for video calling)
# 2. Create RDS PostgreSQL instance (keep in private subnet)
# 3. Set DATABASE_URL in .env to RDS endpoint
# 4. Deploy with Docker Compose

# Security Group rules needed:
# Inbound: 80 (HTTP), 443 (HTTPS), 22 (SSH from your IP only)
# Outbound: All (for STUN/ICE traversal)
```

#### Option B: ECS Fargate

```bash
# Build and push images
aws ecr create-repository --repository-name securecall-backend
aws ecr create-repository --repository-name securecall-signaling
aws ecr create-repository --repository-name securecall-frontend

docker build -t securecall-backend ./backend
docker tag securecall-backend:latest <account>.dkr.ecr.<region>.amazonaws.com/securecall-backend
aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
docker push <account>.dkr.ecr.<region>.amazonaws.com/securecall-backend

# Create ECS task definitions for each service
# Use ALB with WebSocket support for signaling
# Use RDS for PostgreSQL
```

### DigitalOcean

```bash
# 1. Create Droplet (minimum: 2GB RAM for video)
# 2. Install Docker: https://docs.docker.com/engine/install/ubuntu/
# 3. Create Managed PostgreSQL database
# 4. Deploy:
git clone <your-repo>
cd securecall
cp .env.example .env && nano .env
docker compose up -d
```

### TURN Server (Required for production behind NAT)

For users behind symmetric NAT, a TURN server is needed:

```bash
# Install coturn
apt-get install coturn

# /etc/turnserver.conf
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
user=username:password
realm=yourdomain.com
cert=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
pkey=/etc/letsencrypt/live/yourdomain.com/privkey.pem
```

Then update `frontend/src/services/webrtc.js`:
```javascript
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: 'turn:yourdomain.com:3478',
    username: 'username',
    credential: 'password'
  }
];
```

---

## 🗃️ Database Schema

```sql
users          -- id, username, email, password_hash, avatar_url, is_online, last_seen, created_at
contacts       -- id, user_id, contact_id, status, created_at
call_history   -- id, caller_id, callee_id, call_type, status, started_at, ended_at, duration_seconds
refresh_tokens -- id, user_id, token_hash, expires_at
migrations     -- id, name, executed_at
```

---

## 🔌 API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/signup | Create account |
| POST | /api/auth/login | Get JWT tokens |
| POST | /api/auth/refresh | Rotate refresh token |
| POST | /api/auth/logout | Invalidate tokens |
| GET | /api/auth/me | Get current user |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/users/search?q= | Search users |
| GET | /api/users/contacts | Get my contacts |
| POST | /api/users/contacts | Add contact |
| DELETE | /api/users/contacts/:id | Remove contact |

### Calls
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/calls/history | Get call history |
| POST | /api/calls/record | Record completed call |

### WebSocket Events (Signaling)
| Event | Direction | Description |
|-------|-----------|-------------|
| call:initiate | Client→Server | Start a call |
| call:accept | Client→Server | Accept incoming |
| call:reject | Client→Server | Decline call |
| call:end | Client→Server | End active call |
| webrtc:offer | Client→Server→Client | Relay SDP offer |
| webrtc:answer | Client→Server→Client | Relay SDP answer |
| webrtc:ice-candidate | Client→Server→Client | Relay ICE |
| call:incoming | Server→Client | Notify of incoming call |
| call:accepted | Server→Client | Call was accepted |
| user:status | Server→Client | Presence update |

---

## 🔐 Security Checklist

- [x] bcrypt password hashing (rounds=12)
- [x] JWT with short expiry (15min) + refresh token rotation
- [x] Refresh token stored as SHA-256 hash, not plaintext
- [x] WebRTC DTLS-SRTP E2E encryption (automatic)
- [x] Signaling server never accesses media content
- [x] Rate limiting on auth endpoints
- [x] Helmet.js security headers
- [x] CORS restricted to known origins
- [x] SQL injection protection via parameterized queries
- [x] Input validation via express-validator
- [x] Non-root Docker containers
- [x] HTTPS/WSS enforced in production
- [x] Request body size limits (10KB max)

---

## 📄 License

MIT License — see LICENSE file for details.
