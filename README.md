
# 🚀 DevPilot AI

### Your AI-Powered Engineering Workspace

DevPilot AI is an AI-powered engineering workspace that brings GitHub integration, code assistance, pull request management, meeting summaries, and team task tracking into one unified platform.

## ✨ Features

- 🤖 **AI Code Assistant** — Ask questions about selected files from your GitHub repositories.
- 🐙 **GitHub Integration** — Connect your GitHub account and browse repositories and source files.
- 🔀 **Pull Request Management** — View pull requests and inspect their details and changed files.
- 📝 **Meeting Summaries** — Summarize meeting notes, capture decisions, and identify action items.
- ✅ **Team Task Management** — Create, track, and manage development tasks.
- 🔗 **Issue Creation** — Create GitHub issues from your workspace with confirmation.
- 🎨 **Modern Dashboard** — A responsive engineering workspace designed for developer productivity.

## 🛠️ Tech Stack

**Frontend**
- React
- Vite
- JavaScript
- CSS

**Backend**
- Node.js
- Express.js
- GitHub REST API
- OpenRouter AI API

**Integrations**
- GitHub OAuth
- GitHub Repositories and Pull Requests
- AI-powered code assistance and summarization

## 📁 Project Structure

```text
DevPilot-AI/
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
├── backend/
│   ├── server.js
│   ├── package.json
│   └── .env
├── .gitignore
└── README.md
```

*Update the structure above to match your actual repository folders.*

## ⚙️ Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/DevPilot-AI.git
cd DevPilot-AI
```

### 2. Install Dependencies

Install frontend dependencies:

```bash
cd frontend
npm install
```

Install backend dependencies:

```bash
cd ../backend
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the backend directory.

```env
PORT=5000
FRONTEND_URL=http://localhost:5173

GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

OPENROUTER_API_KEY=your_openrouter_api_key
SESSION_SECRET=your_secure_random_secret
```

Configure any additional variables required by your backend code. Never commit real API keys, OAuth secrets, or session secrets to GitHub.

### 4. Configure GitHub OAuth

1. Open GitHub Settings.
2. Navigate to Developer settings → OAuth Apps.
3. Create an OAuth application.
4. Set the homepage URL to your frontend URL.
5. Set the authorization callback URL to the callback endpoint configured in your backend.
6. Add the generated credentials to your backend `.env` file.

### 5. Start the Backend

```bash
cd backend
npm run dev
```

### 6. Start the Frontend

In a separate terminal:

```bash
cd frontend
npm run dev
```

Open the local URL displayed by Vite, usually:

http://localhost:5173

## 🔐 Security

- Keep environment variables and API credentials private.
- Use secure session cookies in production.
- Configure allowed frontend origins explicitly.
- Grant only the GitHub permissions the application needs.
- Never expose GitHub OAuth client secrets in frontend code.

## 🗺️ Roadmap

- [ ] Improve AI code assistance and response formatting
- [ ] Enhance repository file browsing
- [ ] Expand meeting-to-task workflows
- [ ] Improve task organization and progress tracking
- [ ] Strengthen automated testing and error handling
- [ ] Refine production deployment and security

## 🤝 Contributing

Contributions, ideas, and bug reports are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Commit your changes.
4. Open a pull request describing your improvements.

## 📄 License

Choose a license for your project before distributing it. For open-source projects, consider the MIT License if its terms fit your needs.

---

**Built to help developers code, collaborate, and ship with confidence.** ⚡
