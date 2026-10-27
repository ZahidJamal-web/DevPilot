import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRight, ArrowUpRight, Bot, CalendarDays, Check,
  ChevronDown, CircleHelp, Code2, Command, FileCode2, Github,
  GitPullRequest, LayoutDashboard, ListTodo, LoaderCircle, LogOut,
  Menu, MessageSquareText, Plus, Search, ShieldCheck, Sparkles,
  Star, Trash2, X, Workflow, LockKeyhole, Zap, PanelsTopLeft,
  Folder, File, RefreshCw, Send, ExternalLink, GitBranch,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";
console.log("DevPilot API URL:", API);
const enc = (value) => encodeURIComponent(value);

async function request(path, options = {}) {
  let response;

 try {
  response = await fetch(`${API}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}), // Allows custom headers to override or add to defaults
    },
  });
} catch {
  throw new Error(
    `Cannot connect to backend at ${API}. Check that the server is running.`
  );
}

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

function getItems(data) {
  if (Array.isArray(data)) return data;
  return data.files || data.contents || data.items || [];
}

function decodeFileContent(data) {
  if (typeof data.content === "string") {
    if (data.encoding === "base64") {
      try {
        const binary = atob(data.content.replace(/\s/g, ""));
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
      } catch {
        return data.content;
      }
    }
    return data.content;
  }

  if (typeof data.file?.content === "string") {
    return data.file.content;
  }

  return "";
}

export default function App() {
  const [entered, setEntered] = useState(false);
  const [page, setPage] = useState("Overview");
  const [user, setUser] = useState(null);
  const [repos, setRepos] = useState([]);
  const [connected, setConnected] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  // Independent loading states: one section won't block another.
  const [accountLoading, setAccountLoading] = useState(false);
  const [pullsLoading, setPullsLoading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [taskLoading, setTaskLoading] = useState(false);

  // Shared workspace data.
  const [meetings, setMeetings] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [pulls, setPulls] = useState([]);
  const [selectedPR, setSelectedPR] = useState(null);

  // Meetings: independent notes, summary, repository, and saved meeting.
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingNotes, setMeetingNotes] = useState("");
  const [meetingSummary, setMeetingSummary] = useState("");
  const [meetingRepo, setMeetingRepo] = useState("");
  const [meetingId, setMeetingId] = useState(null);

  // Code Assistant: repository, file tree, selected file, and conversation.
  const [codeRepo, setCodeRepo] = useState("");
  const [currentPath, setCurrentPath] = useState("");
  const [fileTree, setFileTree] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState("");
  const [codeQuestion, setCodeQuestion] = useState("");
  const [codeAnswer, setCodeAnswer] = useState("");
  const [codeHistory, setCodeHistory] = useState([]);

  // Tasks.
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");

  // GitHub issue creation.
  const [issueTitle, setIssueTitle] = useState("");
  const [issueBody, setIssueBody] = useState("");
  const [issueRepo, setIssueRepo] = useState("");
  const [issueConfirmed, setIssueConfirmed] = useState(false);

  const nav = [
    {
      title: "Workspace",
      items: [
        { name: "Overview", icon: LayoutDashboard },
        { name: "Repositories", icon: Github },
        { name: "Pull requests", icon: GitPullRequest },
        { name: "Code assistant", icon: Bot },
      ],
    },
    {
      title: "Team",
      items: [
        { name: "Meetings", icon: CalendarDays },
        { name: "Tasks", icon: ListTodo },
        { name: "Activity", icon: Activity },
      ],
    },
  ];

  const pageIcon = {
    Overview: LayoutDashboard,
    Repositories: Github,
    "Pull requests": GitPullRequest,
    "Code assistant": Bot,
    Meetings: CalendarDays,
    Tasks: ListTodo,
    Activity,
  };

  const Icon = pageIcon[page] || LayoutDashboard;

  const filteredRepos = useMemo(
    () =>
      repos.filter((r) =>
        `${r.name} ${r.full_name} ${r.description || ""} ${r.language || ""}`
          .toLowerCase()
          .includes(query.toLowerCase())
      ),
    [repos, query]
  );

  const selectedRepo = codeRepo;
  const [codeOwner, codeRepoName] = (selectedRepo || "").split("/");
  const [meetingOwner, meetingRepoName] = (meetingRepo || "").split("/");
  const [issueOwner, issueRepoName] = (issueRepo || "").split("/");

  async function loadAccount() {
    setAccountLoading(true);
    try {
      const data = await request("/api/auth/me");
      console.log("OAuth account response:", {
        user: data.user?.login,
        connected: data.connected,
      });

      console.log("Current UI state:", {
        entered,
        connected,
        user: user?.login,
      });

      if (!data.user || !data.connected) {
        setUser(null);
        setConnected(false);
        setRepos([]);
        return;
      }

      setUser(data.user);
      setConnected(true);
      setEntered(true);
      console.log("Dashboard access enabled");

      let actualRepos = [];

      try {
        const list = await request("/api/github/repos");
        actualRepos = Array.isArray(list) ? list : list.repos || [];
      } catch (error) {
        console.error("Failed to load GitHub repositories:", error);
        setNotice(`GitHub connected, but repositories failed to load: ${error.message}`);
      }

      setRepos(actualRepos);

      const firstRepo = actualRepos[0]?.full_name || "";
      setCodeRepo((prev) => prev || firstRepo);
      setMeetingRepo((prev) => prev || firstRepo);
      setIssueRepo((prev) => prev || firstRepo);

      try {
        setMeetings(await request("/api/meetings"));
      } catch {
        setMeetings([]);
      }

      try {
        setTasks(await request("/api/tasks"));
      } catch {
        setTasks([]);
      }
    } catch (error) {
      if (!String(error.message).includes("Connect GitHub")) {
        setNotice(error.message);
      }
    } finally {
      setAccountLoading(false);
    }
  }

  useEffect(() => {
    loadAccount();
  }, []);

  async function connectGitHub() {
    try {
      await request("/api/health");
      window.location.href = `${API}/api/auth/github`;
    } catch {
      setNotice("Start the backend and check backend/.env before connecting GitHub.");
    }
  }

  async function disconnect() {
    try {
      await request("/api/auth/logout", { method: "POST" });
    } catch {
      // Clear local UI state even if the logout endpoint is unavailable.
    }

    setUser(null);
    setConnected(false);
    setRepos([]);
    setMeetings([]);
    setTasks([]);
    setPulls([]);
    setSelectedPR(null);
    setFileTree([]);
    setSelectedFile(null);
    setFileContent("");
    setCodeAnswer("");
    setCodeHistory([]);
    setNotice("GitHub disconnected.");
  }

  // PULL REQUESTS: real GitHub workflow only; no AI review.
  async function loadPulls() {
    if (!connected) {
      setNotice("Connect GitHub to load pull requests.");
      return;
    }

    if (!selectedPRRepo) {
      setNotice("Select a repository first.");
      return;
    }

    const [owner, repo] = selectedPRRepo.split("/");
    if (!owner || !repo) return;

    setPullsLoading(true);
    setNotice("");
    setSelectedPR(null);

    try {
      const data = await request(
        `/api/github/repos/${enc(owner)}/${enc(repo)}/pulls`
      );
      setPulls(Array.isArray(data) ? data : data.pulls || []);
    } catch (error) {
      setPulls([]);
      setNotice(error.message);
    } finally {
      setPullsLoading(false);
    }
  }

  const [selectedPRRepo, setSelectedPRRepo] = useState("");

  useEffect(() => {
    if (page === "Pull requests" && connected && selectedPRRepo) {
      loadPulls();
    }
  }, [page, selectedPRRepo, connected]);

  // CODE ASSISTANT: browse files from the selected real GitHub repository.
  async function loadFolder(path = "") {
    if (!connected) {
      setNotice("Connect GitHub before browsing repository files.");
      return;
    }

    if (!codeOwner || !codeRepoName) {
      setNotice("Select a repository first.");
      return;
    }

    setFilesLoading(true);
    setNotice("");
    setCurrentPath(path);
    setSelectedFile(null);
    setFileContent("");

    try {
      const data = await request(
        `/api/github/repos/${enc(codeOwner)}/${enc(codeRepoName)}/contents?path=${enc(path)}`
      );

      const items = getItems(data);
      setFileTree(items);
    } catch (error) {
      setFileTree([]);
      setNotice(
        `${error.message} Make sure your backend supports the repository contents endpoint.`
      );
    } finally {
      setFilesLoading(false);
    }
  }

  async function openFile(file) {
    if (file.type === "dir") {
      await loadFolder(file.path);
      return;
    }

    if (file.type && file.type !== "file") {
      setNotice("This item is not a regular source file.");
      return;
    }

    setFileLoading(true);
    setNotice("");
    setSelectedFile(file);
    setFileContent("");

    try {
      const data = await request(
        `/api/github/repos/${enc(codeOwner)}/${enc(codeRepoName)}/contents?path=${enc(file.path)}`
      );

      const content = decodeFileContent(data);

      if (!content) {
        setFileContent(
          "No readable text content was returned. Check the backend file endpoint response."
        );
      } else {
        setFileContent(content);
      }
    } catch (error) {
      setNotice(
        `${error.message} Make sure your backend supports the repository file endpoint.`
      );
    } finally {
      setFileLoading(false);
    }
  }

  async function askCodeAssistant(event) {
    event?.preventDefault();

    if (!connected) {
      setNotice("Connect GitHub before using repository context.");
      return;
    }

    if (!codeRepo || !selectedFile || !fileContent) {
      setNotice("Select a repository and open a source file first.");
      return;
    }

    if (!codeQuestion.trim()) {
      setNotice("Enter a question about the selected file.");
      return;
    }

    setCodeLoading(true);
    setNotice("");
    setCodeAnswer("");

    try {
      const data = await request("/api/ai/code-assistant", {
      method: "POST",
      body: JSON.stringify({
        owner: codeOwner,
        repo: codeRepoName,
        path: selectedFile.path,
        question: codeQuestion.trim(),
      }),
    });

      const answer = data.answer || data.response || data.message;

      if (!answer) {
        throw new Error("The code assistant returned no answer.");
      }

      setCodeAnswer(answer);
      setCodeHistory((prev) => [
        {
          question: codeQuestion.trim(),
          answer,
          path: selectedFile.path,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setCodeQuestion("");
    } catch (error) {
      setNotice(
        `${error.message} The /api/ai/code-assistant route must be implemented in your backend.`
      );
    } finally {
      setCodeLoading(false);
    }
  }

  // MEETINGS: notes and repository context, separate from Code Assistant.
  
  
  // MEETINGS: notes and repository context, separate from Code Assistant.
  async function summarizeMeeting() {
    if (meetingNotes.trim().length < 10) {
      setNotice("Enter at least 10 characters of meeting notes.");
      return;
    }

    if (meetingNotes.length > 20000) {
      setNotice("Meeting notes must be 20,000 characters or less.");
      return;
    }

    setMeetingLoading(true);
    setNotice("");
    setMeetingSummary("");

    try {
      const data = await request("/api/ai/meeting-summary", {
        method: "POST",
        body: JSON.stringify({
          title: meetingTitle.trim() || "Development meeting",
          notes: meetingNotes.trim(),
          repository: meetingRepo || "",
        }),
      });

      if (!data.summary) {
        throw new Error(
          data.error || data.message || "The meeting AI returned no summary."
        );
      }

      setMeetingSummary(data.summary);
      setNotice("Meeting summary generated successfully.");
    } catch (error) {
      console.error("Meeting summary error:", error);
      setNotice(
        error.message ||
          "Unable to generate the meeting summary. Check the backend."
      );
    } finally {
      setMeetingLoading(false);
    }
  }

  async function saveMeeting() {
    if (!connected) {
      setNotice("Connect GitHub before saving a meeting.");
      return;
    }

    if (!meetingTitle.trim() || meetingNotes.trim().length < 10) {
      setNotice("Enter a meeting title and at least 10 characters of notes.");
      return;
    }

    setMeetingLoading(true);
    setNotice("");

    try {
      const saved = await request("/api/meetings", {
        method: "POST",
        body: JSON.stringify({
          title: meetingTitle,
          notes: meetingNotes,
          summary: meetingSummary,
          repository: meetingRepo || null,
        }),
      });

      setMeetings((prev) => [saved, ...prev]);
      setMeetingId(saved._id);
      setNotice("Meeting notes saved.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setMeetingLoading(false);
    }
  }

  function loadMeeting(item) {
    setMeetingId(item._id);
    setMeetingTitle(item.title || "");
    setMeetingNotes(item.notes || "");
    setMeetingSummary(item.summary || "");
    setMeetingRepo(item.repository || "");
  }

  
  // TASKS.
  async function addTask(event) {
    event?.preventDefault();

    if (!connected) {
      setNotice("Connect GitHub before saving tasks.");
      return;
    }

    if (!taskTitle.trim()) {
      setNotice("Enter a task title.");
      return;
    }

    setTaskLoading(true);
    setNotice("");

    try {
      const task = await request("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: taskTitle,
          description: taskDescription,
        }),
      });

      setTasks((prev) => [task, ...prev]);
      setTaskTitle("");
      setTaskDescription("");
      setNotice("Task saved.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setTaskLoading(false);
    }
  }

  async function updateTask(task) {
    const status = task.status === "done" ? "todo" : "done";

    try {
      const updated = await request(`/api/tasks/${task._id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

      setTasks((prev) =>
        prev.map((item) => (item._id === updated._id ? updated : item))
      );
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function deleteTask(task) {
    try {
      await request(`/api/tasks/${task._id}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((item) => item._id !== task._id));
    } catch (error) {
      setNotice(error.message);
    }
  }

  // GITHUB ISSUES: require explicit user confirmation.
  async function createIssue() {
    if (!issueRepo || !issueTitle.trim()) {
      setNotice("Select a repository and enter an issue title.");
      return;
    }

    if (!issueConfirmed) {
      setNotice("Confirm before creating a GitHub issue.");
      return;
    }

    if (!connected || !issueOwner || !issueRepoName) {
      setNotice("Connect GitHub and select a valid repository.");
      return;
    }

    setTaskLoading(true);

    try {
      const issue = await request(
        `/api/github/repos/${enc(issueOwner)}/${enc(issueRepoName)}/issues`,
        {
          method: "POST",
          body: JSON.stringify({
            title: issueTitle,
            body: issueBody,
            confirmed: true,
          }),
        }
      );

      setNotice(`GitHub issue #${issue.number} created.`);
      if (issue.html_url) {
        window.open(issue.html_url, "_blank", "noopener,noreferrer");
      }

      setIssueTitle("");
      setIssueBody("");
      setIssueConfirmed(false);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setTaskLoading(false);
    }
  }

  const repoOptions = repos.map((repo) => (
    <option key={repo.id || repo.full_name} value={repo.full_name}>
      {repo.full_name}
    </option>
  ));

  function enterWorkspace() {
    setEntered(true);
  }

  if (!entered) {
    return (
      <div className="intro-page">
        <header className="intro-nav">
          <a
            className="intro-brand"
            href="#top"
            onClick={(event) => event.preventDefault()}
          >
            <span className="intro-brand-mark"><Command size={21} /></span>
            <span>
              DevPilot<span className="intro-brand-ai"> AI</span>
              <small>ENGINEERING WORKSPACE</small>
            </span>
          </a>
          <div className="intro-nav-right">
            <span className="intro-status"><i /> AI-powered team workspace</span>
            <button className="intro-nav-link" onClick={enterWorkspace}>
              Explore workspace <ArrowUpRight size={15} />
            </button>
          </div>
        </header>

        <main id="top" className="intro-main">
          <div className="intro-copy">
            <div className="intro-kicker">
              <span className="intro-kicker-line" />
              BUILT FOR TEAMS THAT SHIP
              <span className="intro-kicker-pill"><Sparkles size={12} /> AI WORKFLOW</span>
            </div>
            <h1>Great software is built <span>in sync.</span></h1>
            <p className="intro-lead">
              Bring your repositories, pull requests, meetings, and next steps
              into one calm, intelligent workspace.
            </p>
            <div className="intro-ctas">
              <button className="intro-primary" onClick={enterWorkspace}>
                Get started <ArrowRight size={17} />
              </button>
              <button
                className="intro-secondary"
                onClick={() => {
                  enterWorkspace();
                  connectGitHub();
                }}
              >
                <Github size={17} /> Connect GitHub
              </button>
            </div>
            <div className="intro-proof">
              <div className="intro-proof-icons">
                <span><Github size={15} /></span>
                <span><Bot size={15} /></span>
                <span><Workflow size={15} /></span>
              </div>
              <div>
                <strong>One workspace. Less context switching.</strong>
                <small>Designed for real engineering workflows.</small>
              </div>
            </div>
          </div>

          <div className="intro-visual" aria-label="DevPilot workspace preview">
            <div className="visual-glow" />
            <div className="preview-window">
              <div className="preview-top">
                <div className="preview-dots"><i /><i /><i /></div>
                <span><Command size={12} /> devpilot / workspace</span>
                <span className="preview-live"><i /> WORKSPACE</span>
              </div>
              <div className="preview-body">
                <aside className="preview-side">
                  <div className="preview-side-brand">
                    <span><Command size={13} /></span><b>DevPilot</b>
                  </div>
                  <div className="preview-side-item active"><PanelsTopLeft size={13} /> Overview</div>
                  <div className="preview-side-item"><Github size={13} /> Repositories</div>
                  <div className="preview-side-item"><GitPullRequest size={13} /> Pull requests</div>
                  <div className="preview-side-item"><Bot size={13} /> Code assistant</div>
                  <div className="preview-side-item"><CalendarDays size={13} /> Meetings</div>
                  <div className="preview-side-item"><ListTodo size={13} /> Tasks</div>
                  <div className="preview-side-bottom">
                    <span><LockKeyhole size={12} /> Private by design</span>
                  </div>
                </aside>
                <div className="preview-content">
                  <div className="preview-welcome">
                    <div>
                      <small>ENGINEERING WORKSPACE</small>
                      <h3>Good work starts here.</h3>
                      <p>Your team's work, connected.</p>
                    </div>
                    <span className="preview-avatar">DP</span>
                  </div>
                  <div className="preview-stats">
                    <div><span><Github size={13} /></span><small>Repositories</small><b>—</b><em>Connect GitHub</em></div>
                    <div><span><GitPullRequest size={13} /></span><small>Pull requests</small><b>—</b><em>Live GitHub data</em></div>
                    <div><span><Check size={13} /></span><small>Action items</small><b>—</b><em>Team tasks</em></div>
                  </div>
                  <div className="preview-lower">
                    <div className="preview-repo-card">
                      <div className="preview-card-head">
                        <strong>Workspace features</strong><span>DevPilot</span>
                      </div>
                      <div className="preview-repo-row">
                        <span className="preview-repo-icon"><Code2 size={13} /></span>
                        <div><b>Repository-aware assistant</b><small>Ask about selected files</small></div>
                      </div>
                      <div className="preview-repo-row">
                        <span className="preview-repo-icon blue"><CalendarDays size={13} /></span>
                        <div><b>Meeting intelligence</b><small>Decisions and action items</small></div>
                      </div>
                      <div className="preview-repo-row">
                        <span className="preview-repo-icon orange"><GitPullRequest size={13} /></span>
                        <div><b>Pull request workflow</b><small>Manage changes on GitHub</small></div>
                      </div>
                    </div>
                    <div className="preview-ai-card">
                      <span className="preview-ai-icon"><Sparkles size={15} /></span>
                      <small>DEVPILOT AI</small>
                      <strong>Context matters.</strong>
                      <p>Keep code questions and meeting discussions separate.</p>
                      <div className="preview-ai-bars"><i /><i /><i /><i /><i /><i /><i /><i /></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="intro-feature-strip">
            <div><span><GitPullRequest size={17} /></span><div><b>Pull requests</b><small>Work with real GitHub PRs</small></div></div>
            <div><span><Code2 size={17} /></span><div><b>Code with context</b><small>Ask about selected files</small></div></div>
            <div><span><MessageSquareText size={17} /></span><div><b>Meeting intelligence</b><small>Connect notes with a repo</small></div></div>
            <div><span><ShieldCheck size={17} /></span><div><b>Your workflow</b><small>GitHub-first collaboration</small></div></div>
          </div>
        </main>
        <footer className="intro-footer">
          <span>© 2026 DevPilot</span>
          <span><i /> Built for thoughtful engineering teams</span>
          <span>Code. Conversation. Clarity.</span>
        </footer>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Command size={20} /></div>
          <div><strong>DevPilot</strong><small>DEVELOPER WORKSPACE</small></div>
          <button className="icon-button close-nav" onClick={() => setMobileNav(false)}>
            <X size={18} />
          </button>
        </div>

        <button className="workspace-switch">
          <div className="workspace-avatar">D</div>
          <div className="workspace-name">
            <strong>DevPilot Workspace</strong>
            <small>{connected ? `@${user?.login}` : "Not connected"}</small>
          </div>
          <ChevronDown size={16} />
        </button>

        {nav.map((group) => (
          <div className="nav-group" key={group.title}>
            <div className="nav-label">{group.title}</div>
            {group.items.map((item) => (
              <button
                key={item.name}
                onClick={() => {
                  setPage(item.name);
                  setMobileNav(false);
                  setNotice("");
                }}
                className={`nav-item ${page === item.name ? "active" : ""}`}
              >
                <item.icon size={17} />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        ))}

        <div className="sidebar-bottom">
          <div className="usage-card">
            <div className="usage-top"><Sparkles size={15} /><strong>AI workspace</strong></div>
            <p>Code questions and meeting summaries use separate context.</p>
            <div className="usage-track"><span /></div>
            <small>{connected ? "GitHub connected" : "Connect GitHub to begin"}</small>
          </div>
          <button className="nav-item" onClick={() => setNotice("Configure MongoDB, GitHub OAuth, and OpenRouter in backend/.env.")}>
            <CircleHelp size={17} /><span>Setup help</span>
          </button>
          <div className="profile-row">
            {user?.avatar_url ? <img src={user.avatar_url} alt="GitHub avatar" /> : <div className="profile-avatar">D</div>}
            <div className="profile-info">
              <strong>{user?.name || user?.login || "DevPilot Member"}</strong>
              <small>{connected ? "GitHub connected" : "Not connected"}</small>
            </div>
            {connected && (
              <button title="Disconnect GitHub" className="icon-button" onClick={disconnect}>
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {mobileNav && <button className="scrim" aria-label="Close menu" onClick={() => setMobileNav(false)} />}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)}>
              <Menu size={20} />
            </button>
            <div className="breadcrumb">Workspace <span>/</span> <strong>{page}</strong></div>
          </div>
          <div className="topbar-actions">
            <div className="search-box">
              <Search size={16} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search repositories..." />
            </div>
            <div className="top-avatar">
              {user?.avatar_url ? <img src={user.avatar_url} alt="" /> : "D"}
            </div>
          </div>
        </header>

        <div className="content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow">
                <span className="live-dot" />
                {connected ? "GITHUB CONNECTED" : "YOUR ENGINEERING WORKSPACE"}
              </div>
              <h1>{page === "Overview" ? "Good to see you, developer." : page}</h1>
              <p>
                {page === "Overview" ? "Your code, meetings, and next steps — all in sync."
                  : page === "Meetings" ? "Summarize team discussions with optional repository context."
                  : page === "Pull requests" ? "Inspect real pull requests and manage changes on GitHub."
                  : page === "Code assistant" ? "Ask questions about selected files in your connected repository."
                  : page === "Tasks" ? "Track team action items in your workspace."
                  : page === "Repositories" ? "Browse repositories accessible to your GitHub account."
                  : "Recently updated repositories from GitHub."}
              </p>
            </div>
            <button className="primary-button" onClick={connected ? () => setPage("Repositories") : connectGitHub}>
              <Github size={17} />{connected ? "View repositories" : "Connect GitHub"}<ArrowUpRight size={16} />
            </button>
          </section>

          {notice && (
            <div className="notice">
              <CircleHelp size={17} /><span>{notice}</span>
              <button className="icon-button" onClick={() => setNotice("")}><X size={16} /></button>
            </div>
          )}

          {/* PULL REQUESTS: no AI review action or AI review panel. */}
          {page === "Pull requests" && (
            <section className="dashboard-grid milestone-grid">
              <div className="panel">
                <div className="panel-heading">
                  <div><h2>Open pull requests</h2><p>Choose a repository to view its live pull requests.</p></div>
                  <button className="secondary-button" disabled={pullsLoading} onClick={loadPulls}>
                    {pullsLoading ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} Refresh
                  </button>
                </div>
                <label className="field-label">Repository</label>
                <select className="field-control" value={selectedPRRepo} onChange={(e) => setSelectedPRRepo(e.target.value)}>
                  <option value="">Select repository</option>{repoOptions}
                </select>
                {!connected && <div className="empty-small">Connect GitHub to load live pull requests.</div>}
                {pullsLoading && <div className="loading-state"><LoaderCircle className="spin" /> Loading pull requests…</div>}
                {!pullsLoading && pulls.map((pr) => (
                  <button className={`pr-row ${selectedPR?.number === pr.number ? "selected" : ""}`} key={pr.id} onClick={() => setSelectedPR(pr)}>
                    <div className="pr-icon"><GitPullRequest size={17} /></div>
                    <div className="pr-info">
                      <strong>#{pr.number} {pr.title}</strong>
                      <small>{pr.user?.login} · {pr.head?.ref} → {pr.base?.ref}</small>
                      <div className="repo-meta">
                        <span>{pr.state || "open"}</span>
                        {pr.draft && <span>Draft</span>}
                      </div>
                    </div>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
                {!pullsLoading && connected && selectedPRRepo && pulls.length === 0 && (
                  <div className="empty-small">No open pull requests found for this repository.</div>
                )}
              </div>

              <div className="panel">
                <div className="panel-heading">
                  <div><h2>Pull request details</h2><p>Review the real PR on GitHub.</p></div>
                  <div className="panel-icon blue"><GitPullRequest size={18} /></div>
                </div>
                {selectedPR ? (
                  <>
                    <h3>#{selectedPR.number} {selectedPR.title}</h3>
                    <p>{selectedPR.body || "No description provided."}</p>
                    <div className="repo-meta">
                      <span>Author: {selectedPR.user?.login || "Unknown"}</span>
                      <span>Base: {selectedPR.base?.ref || "—"}</span>
                      <span>Head: {selectedPR.head?.ref || "—"}</span>
                    </div>
                    {selectedPR.html_url && (
                      <a className="primary-button" href={selectedPR.html_url} target="_blank" rel="noreferrer">
                        Open pull request on GitHub <ExternalLink size={15} />
                      </a>
                    )}
                  </>
                ) : (
                  <div className="empty-state">
                    <div className="empty-illustration"><GitPullRequest size={27} /></div>
                    <strong>Select a pull request</strong>
                    <span>View its title, description, branches, and open it on GitHub to review diffs and comments.</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* CODE ASSISTANT: selected real file + developer question. */}
          {page === "Code assistant" && (
            <section className="dashboard-grid milestone-grid">
              <div className="panel">
                <div className="panel-heading">
                  <div><h2>Repository explorer</h2><p>Select a repository and browse its actual files.</p></div>
                  <div className="panel-icon violet"><Github size={18} /></div>
                </div>
                <label className="field-label">Repository</label>
                <select
                  className="field-control"
                  value={codeRepo}
                  onChange={(e) => {
                    setCodeRepo(e.target.value);
                    setCurrentPath("");
                    setFileTree([]);
                    setSelectedFile(null);
                    setFileContent("");
                    setCodeAnswer("");
                  }}
                >
                  <option value="">Select repository</option>{repoOptions}
                </select>
                <div className="file-toolbar">
                  <span><GitBranch size={14} /> {codeRepo || "No repository selected"}</span>
                  <button className="secondary-button" disabled={filesLoading || !codeRepo} onClick={() => loadFolder(currentPath)}>
                    <RefreshCw size={14} /> Refresh
                  </button>
                </div>
                {currentPath && (
                  <button className="text-button" onClick={() => loadFolder(currentPath.split("/").slice(0, -1).join("/"))}>
                    ← Parent folder
                  </button>
                )}
                {connected && codeRepo && fileTree.length === 0 && !filesLoading && (
                  <div className="empty-small">Select Refresh to load repository contents.</div>
                )}
                {filesLoading && <div className="loading-state"><LoaderCircle className="spin" /> Loading files…</div>}
                <div className="file-tree">
                  {fileTree.map((item) => (
                    <button
                      key={item.path || item.name}
                      className={`file-tree-row ${selectedFile?.path === item.path ? "selected" : ""}`}
                      onClick={() => openFile(item)}
                    >
                      {item.type === "dir" ? <Folder size={16} /> : <File size={16} />}
                      <span>{item.name}</span>
                      {item.type === "dir" && <ChevronDown size={13} />}
                    </button>
                  ))}
                </div>
                {!connected && <div className="empty-small">Connect GitHub to browse your actual repository files.</div>}
              </div>

              <div className="panel">
                <div className="panel-heading">
                  <div><h2>Ask about your code</h2><p>Answers should use the file you selected.</p></div>
                  <div className="panel-icon blue"><Bot size={18} /></div>
                </div>
                {selectedFile ? (
                  <div className="selected-file-label"><FileCode2 size={15} /> {selectedFile.path}</div>
                ) : (
                  <div className="empty-small">Choose a source file from the repository explorer first.</div>
                )}
                {fileLoading ? (
                  <div className="loading-state"><LoaderCircle className="spin" /> Loading file content…</div>
                ) : selectedFile && (
                  <details className="file-preview">
                    <summary>View selected file content</summary>
                    <pre>{fileContent}</pre>
                  </details>
                )}
                <form onSubmit={askCodeAssistant}>
                  <label className="field-label">Your question</label>
                  <textarea
                    className="field-control"
                    value={codeQuestion}
                    onChange={(e) => setCodeQuestion(e.target.value)}
                    placeholder="For example: Explain this function, why does this API fail, or suggest a safer refactor…"
                    disabled={!selectedFile || codeLoading}
                  />
                  <div className="input-footer">
                    <span>Context: {selectedFile?.path || "No file selected"}</span>
                    <button className="primary-button" disabled={codeLoading || !selectedFile || !codeQuestion.trim()}>
                      {codeLoading ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
                      Ask AI
                    </button>
                  </div>
                </form>
                {codeAnswer && (
                  <div className="assistant-answer">
                    <h3><Sparkles size={16} /> Answer</h3>
                    <div className="markdown-output">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {codeAnswer}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
                {codeHistory.length > 0 && (
                  <div className="saved-meetings">
                    <strong>Recent questions</strong>
                    {codeHistory.map((item, index) => (
                      <button key={`${item.createdAt}-${index}`} onClick={() => {
                        setCodeQuestion(item.question);
                        setCodeAnswer(item.answer);
                      }}>
                        <MessageSquareText size={14} />
                        <span>{item.question}</span>
                        <small>{item.path.split("/").pop()}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* MEETINGS: independent state + optional repository context. */}
          {page === "Meetings" && (
            <section className="meeting-layout">
              <div className="panel meeting-input">
                <div className="panel-heading">
                  <div>
                    <div className="panel-icon violet"><MessageSquareText size={18} /></div>
                    <h2>Meeting notes</h2>
                    <p>Summarize the discussion and optionally connect a repository.</p>
                  </div>
                </div>
                <input className="field-control" value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} placeholder="Meeting title" />
                <label className="field-label">Repository being discussed (optional)</label>
                <select className="field-control" value={meetingRepo} onChange={(e) => setMeetingRepo(e.target.value)}>
                  <option value="">No repository context</option>{repoOptions}
                </select>
                <textarea
                  value={meetingNotes}
                  onChange={(e) => setMeetingNotes(e.target.value)}
                  placeholder={"Add the actual meeting notes or transcript here…\n\n- What did the team discuss?\n- What decisions were made?\n- What blockers remain?"}
                />
                <div className="input-footer">
                  <span>{meetingNotes.length.toLocaleString()} / 20,000</span>
                <button
                  className="primary-button"
                  disabled={
                    meetingLoading ||
                    meetingNotes.trim().length < 10 ||
                    meetingNotes.length > 20000
                  }
                  onClick={summarizeMeeting}
                >
                  {meetingLoading ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  {meetingLoading ? "Summarizing..." : "Summarize meeting"}
                </button>
                </div>
                <button className="secondary-button save-button" disabled={meetingLoading} onClick={saveMeeting}>
                  <Check size={15} /> Save meeting
                </button>
              </div>
              <div className="panel summary-panel">
                <div className="panel-heading">
                  <div>
                    <div className="panel-icon blue"><Bot size={18} /></div>
                    <h2>Meeting summary</h2>
                    <p>Decisions, action items, blockers, and open questions.</p>
                  </div>
                </div>
                {meetingSummary ? (
                  <div className="meeting-summary-content">
                    <ReactMarkdown>{meetingSummary}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-illustration"><Sparkles size={27} /></div>
                    <strong>Your meeting summary will appear here</strong>
                    <span>The meeting assistant uses notes and, when supported by the backend, relevant context from the selected repository.</span>
                  </div>
                )}
                <div className="saved-meetings">
                  <strong>Saved meetings</strong>
                  {meetings.map((meeting) => (
                    <button key={meeting._id} onClick={() => loadMeeting(meeting)}>
                      <CalendarDays size={14} />
                      <span>{meeting.title}</span>
                      <small>{meeting.updatedAt ? new Date(meeting.updatedAt).toLocaleDateString() : ""}</small>
                    </button>
                  ))}
                  {connected && meetings.length === 0 && <small>No saved meetings yet.</small>}
                </div>
              </div>
            </section>
          )}

          {/* TASKS */}
          {page === "Tasks" && (
            <section className="panel tasks-panel">
              <div className="panel-heading">
                <div><div className="panel-icon green"><ListTodo size={18} /></div><h2>Team tasks</h2><p>Tasks are stored in your workspace.</p></div>
              </div>
              <form className="task-create" onSubmit={addTask}>
                <input className="field-control" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="What needs to get done?" />
                <input className="field-control" value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} placeholder="Description (optional)" />
                <button className="primary-button" disabled={taskLoading}><Plus size={15} /> Add task</button>
              </form>
              {tasks.map((task) => (
                <div className="task-row" key={task._id}>
                  <button className={`task-check ${task.status === "done" ? "" : "pending"}`} onClick={() => updateTask(task)} aria-label="Toggle task">
                    {task.status === "done" && <Check size={14} />}
                  </button>
                  <div>
                    <strong className={task.status === "done" ? "task-done" : ""}>{task.title}</strong>
                    <small>{task.description || "No description"} · {task.source || "Workspace"}</small>
                  </div>
                  <span className={`status-pill ${task.status === "done" ? "done" : ""}`}>{(task.status || "todo").replace("_", " ")}</span>
                  <button className="icon-button" onClick={() => deleteTask(task)} title="Delete task"><Trash2 size={15} /></button>
                </div>
              ))}
              {!connected && <div className="empty-small">Connect GitHub to load and save your tasks.</div>}
              {connected && tasks.length === 0 && <div className="empty-small">No tasks yet. Create your first one above.</div>}
            </section>
          )}

          {/* REPOSITORIES */}
          {page === "Repositories" && (
            <section className="panel repo-panel">
              <div className="panel-heading">
                <div><h2>Repositories</h2><p>Repositories accessible to your connected GitHub account.</p></div>
                <button className="secondary-button" disabled={accountLoading} onClick={loadAccount}>
                  {accountLoading ? <LoaderCircle className="spin" size={15} /> : <Activity size={15} />} Refresh
                </button>
              </div>
              {filteredRepos.map((repo) => (
                <div className="repo-row" key={repo.id || repo.full_name}>
                  <div className="repo-icon"><FileCode2 size={18} /></div>
                  <div className="repo-main">
                    <div className="repo-title">
                      <strong>{repo.full_name}</strong>
                      {repo.private && <span className="private-tag">PRIVATE</span>}
                    </div>
                    <p>{repo.description || "No description provided."}</p>
                    <div className="repo-meta">
                      <span>{repo.language || "Unknown"}</span>
                      <span><Star size={13} />{repo.stargazers_count || 0}</span>
                      <span>{repo.open_issues_count || 0} issues</span>
                    </div>
                  </div>
                  <button className="text-button" onClick={() => {
                    setCodeRepo(repo.full_name);
                    setSelectedPRRepo(repo.full_name);
                    setMeetingRepo(repo.full_name);
                    setPage("Code assistant");
                    setFileTree([]);
                    setCurrentPath("");
                  }}>
                    Explore files <ArrowUpRight size={14} />
                  </button>
                </div>
              ))}
              {!connected && <div className="empty-small">Connect GitHub to load your real repositories. Sample repositories are not used as AI context.</div>}
              {connected && filteredRepos.length === 0 && <div className="empty-small">No repositories match your search.</div>}
            </section>
          )}

          {/* OVERVIEW */}
          {page === "Overview" && (
            <>
              <section className="stats-grid">
                <Stat icon={Github} label="Repositories" value={connected ? repos.length : "—"} caption={connected ? "Connected to GitHub" : "Connect GitHub to load data"} tone="violet" />
                <Stat icon={GitPullRequest} label="Open issues" value={connected ? repos.reduce((n, r) => n + (r.open_issues_count || 0), 0) : "—"} caption="Across listed repositories" tone="blue" />
                <Stat icon={CalendarDays} label="Saved meetings" value={connected ? meetings.length : "—"} caption="Persisted meeting notes" tone="orange" />
                <Stat icon={Check} label="Open tasks" value={connected ? tasks.filter((t) => t.status !== "done").length : "—"} caption="Action items to complete" tone="green" />
              </section>
              <section className="dashboard-grid">
                <div className="panel repo-panel">
                  <div className="panel-heading">
                    <div><h2>Repositories</h2><p>Your connected GitHub repositories.</p></div>
                    <button className="text-button" onClick={() => setPage("Repositories")}>View all <ArrowUpRight size={15} /></button>
                  </div>
                  {filteredRepos.slice(0, 5).map((repo) => (
                    <div className="repo-row" key={repo.id || repo.full_name}>
                      <div className="repo-icon"><FileCode2 size={18} /></div>
                      <div className="repo-main">
                        <div className="repo-title"><strong>{repo.full_name}</strong>{repo.private && <span className="private-tag">PRIVATE</span>}</div>
                        <p>{repo.description || "No description provided."}</p>
                        <div className="repo-meta">
                          <span>{repo.language || "Unknown"}</span>
                          <span><Star size={13} />{repo.stargazers_count || 0}</span>
                          <span>{repo.open_issues_count || 0} issues</span>
                        </div>
                      </div>
                      <button className="repo-link" onClick={() => {
                        setCodeRepo(repo.full_name);
                        setPage("Code assistant");
                        setFileTree([]);
                        setCurrentPath("");
                      }} title="Explore repository files"><Code2 size={17} /></button>
                    </div>
                  ))}
                  {!connected && (
                    <div className="demo-banner">
                      <div><Github size={16} /><span>Connect GitHub to load live repositories. No fake repositories are used.</span></div>
                      <button onClick={connectGitHub}>Connect <ArrowUpRight size={14} /></button>
                    </div>
                  )}
                  {connected && repos.length === 0 && <div className="empty-small">No repositories were returned by GitHub.</div>}
                </div>

                <div className="right-stack">
                  <div className="panel quick-panel">
                    <div className="panel-heading"><div><h2>Workspace sections</h2><p>Each section has its own purpose.</p></div><div className="panel-icon violet"><Sparkles size={17} /></div></div>
                    <Quick icon={GitPullRequest} title="Pull requests" sub="Inspect and manage GitHub PRs" onClick={() => setPage("Pull requests")} />
                    <Quick icon={Code2} title="Code assistant" sub="Ask questions about selected files" onClick={() => setPage("Code assistant")} />
                    <Quick icon={MessageSquareText} title="Meetings" sub="Summarize discussions with repo context" onClick={() => setPage("Meetings")} />
                    <Quick icon={ListTodo} title="Tasks" sub="Track team action items" onClick={() => setPage("Tasks")} />
                  </div>
                  <div className="assistant-card">
                    <div className="assistant-orb"><Bot size={24} /></div>
                    <div className="assistant-label"><span>DEVPILOT</span><span className="online-dot" /> WORKSPACE ASSISTANT</div>
                    <h3>Context before answers.</h3>
                    <p>Ask about selected repository files or summarize a meeting independently.</p>
                    <button onClick={() => setPage("Code assistant")}>Open Code Assistant <ArrowUpRight size={15} /></button>
                  </div>
                </div>
              </section>

              <section className="panel issue-builder">
                <div className="panel-heading">
                  <div><h2>Create a GitHub issue</h2><p>Review the draft and explicitly confirm before creating it.</p></div>
                  <div className="panel-icon blue"><Github size={18} /></div>
                </div>
                <div className="issue-form">
                  <label className="field-label">Repository
                    <select className="field-control" value={issueRepo} onChange={(e) => setIssueRepo(e.target.value)}>
                      <option value="">Select repository</option>{repoOptions}
                    </select>
                  </label>
                  <label className="field-label">Issue title
                    <input className="field-control" value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} placeholder="e.g. Add pagination to repositories endpoint" />
                  </label>
                  <label className="field-label">Description
                    <textarea className="field-control issue-textarea" value={issueBody} onChange={(e) => setIssueBody(e.target.value)} placeholder="Describe the task, context, and acceptance criteria." />
                  </label>
                  <label className="confirm-check">
                    <input type="checkbox" checked={issueConfirmed} onChange={(e) => setIssueConfirmed(e.target.checked)} />
                    I reviewed this draft and authorize DevPilot to create this issue in the selected GitHub repository.
                  </label>
                  <button className="primary-button" disabled={taskLoading || !connected || !issueConfirmed} onClick={createIssue}>
                    <Plus size={15} /> Create GitHub issue
                  </button>
                </div>
              </section>
            </>
          )}

          {/* ACTIVITY */}
          {page === "Activity" && (
            <section className="panel">
              <div className="panel-heading">
                <div><h2>Repository activity</h2><p>Recently updated repositories from your connected account.</p></div>
              </div>
              {repos.slice(0, 10).map((repo) => (
                <div className="activity-row" key={repo.id || repo.full_name}>
                  <div className="activity-icon"><Activity size={17} /></div>
                  <div><strong>{repo.full_name}</strong><small>Updated {repo.updated_at ? new Date(repo.updated_at).toLocaleDateString() : "recently"}</small></div>
                  {repo.html_url && <a href={repo.html_url} target="_blank" rel="noreferrer"><ArrowUpRight size={16} /></a>}
                </div>
              ))}
              {!connected && <div className="empty-small">Connect GitHub to see real repository activity.</div>}
            </section>
          )}

          <footer className="footer">
            <span>© 2026 DevPilot</span>
            <span><span className="live-dot" /> API health: /api/health</span>
            <span>Built for developers, with AI.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function Stat({ icon: Icon, label, value, caption, tone }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon size={18} /></div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-caption">{caption}</div>
    </div>
  );
}

function Quick({ icon: Icon, title, sub, onClick }) {
  return (
    <button className="quick-action" onClick={onClick}>
      <div className="quick-icon violet"><Icon size={17} /></div>
      <div><strong>{title}</strong><small>{sub}</small></div>
      <ArrowUpRight size={16} />
    </button>
  );
}