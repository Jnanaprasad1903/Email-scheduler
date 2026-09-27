import { useState, useEffect } from 'react';
import { Search, ChevronDown, Clock, CheckCircle2, Star, Edit2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  slackTeamName?: string | null;
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'Scheduled' | 'Sent'>('Scheduled');

  // Fetch User & Emails
  useEffect(() => {
    // We expect the JWT cookie to handle auth seamlessly
    // Fetch user and emails
    Promise.all([
      axios.get('http://localhost:3000/api/auth/me', { withCredentials: true }),
      axios.get('http://localhost:3000/api/campaigns', { withCredentials: true }) // Adjust depending on actual API structure for listing emails
    ])
      .then(([userRes, campaignsRes]) => {
        setUser(userRes.data.user);

        // Map backend Campaign/Email data to UI format
        // Since the API returns campaigns, we might map campaigns, or if there's an /emails endpoint, use that.
        // Let's assume /campaigns returns the list of campaigns with status.
        const formattedEmails = campaignsRes.data.map((c: any) => ({
          id: c.id,
          to: c._count?.emails ? `${c._count.emails} recipient${c._count.emails > 1 ? 's' : ''}` : 'Unknown',
          subject: c.subject,
          status: c.status, // SCHEDULED, RUNNING, COMPLETED, etc.
          time: new Date(c.startAt).toLocaleString(),
          preview: c.body?.substring(0, 50) + '...',
          isStarred: false
        }));
        setEmails(formattedEmails);
      })
      .catch((err) => {
        console.error('Failed to load dashboard data', err);
        setError('Could not load data.');
        // if 401, window.location.href = '/login'
      })
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    axios.post('http://localhost:3000/api/auth/logout', {}, { withCredentials: true })
      .then(() => {
        window.location.href = '/login';
      })
      .catch(err => console.error(err));
  };

  const handleDisconnectSlack = () => {
    axios.post('http://localhost:3000/api/slack/disconnect', {}, { withCredentials: true })
      .then(() => {
        if (user) {
          setUser({ ...user, slackTeamName: null });
        }
      })
      .catch(err => console.error(err));
  };

  const filteredEmails = emails.filter(e => {
    if (view === 'Scheduled') return ['SCHEDULED', 'PROCESSING'].includes(e.status);
    return ['COMPLETED', 'FAILED'].includes(e.status);
  });

  const scheduledCount = emails.filter(e => ['SCHEDULED', 'PROCESSING'].includes(e.status)).length;
  const sentCount = emails.filter(e => ['COMPLETED', 'FAILED'].includes(e.status)).length;

  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      {/* Header */}
      <header className="h-16 border-b border-gray-100 flex items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-black tracking-tighter">ONB</h1>
        </div>

        <div className="flex-1 max-w-xl mx-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search"
              className="w-full bg-[#F5F7F5] rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={() => alert('No new notifications!')} className="text-gray-400 hover:text-gray-600" title="Notifications">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-64 border-r border-gray-100 p-4 flex flex-col">
          {/* User Profile */}
          <div className="flex flex-col gap-2 mb-6">
            <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
              <img
                src={user?.avatarUrl || "https://ui-avatars.com/api/?name=" + (user?.name || "User")}
                alt="Profile"
                className="w-8 h-8 rounded-full"
              />
              <div className="flex flex-col">
                <span className="text-sm font-semibold truncate w-32">{user?.name || 'User'}</span>
                <span className="text-xs text-gray-500 truncate w-32">{user?.email || ''}</span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-red-500 hover:bg-red-50 py-2 rounded-lg transition-colors w-full text-left px-3 border border-red-100"
            >
              Log out
            </button>
          </div>

          <Link
            to="/compose"
            className="w-full flex items-center justify-center gap-2 border border-primary text-primary font-medium py-2 rounded-lg mb-4 hover:bg-primary/5 transition-colors"
          >
            Compose
          </Link>

          {user?.slackTeamName ? (
            <button
              onClick={handleDisconnectSlack}
              className="w-full flex items-center justify-center gap-2 border border-[#4A154B] text-[#4A154B] font-medium py-2 rounded-lg mb-8 hover:bg-[#4A154B]/5 transition-colors text-sm"
            >
              Disconnect Slack ({user.slackTeamName})
            </button>
          ) : (
            <a
              href="http://localhost:3000/api/slack/connect"
              className="w-full flex items-center justify-center gap-2 bg-[#4A154B] text-white font-medium py-2 rounded-lg mb-8 hover:bg-[#4A154B]/90 transition-colors text-sm"
            >
              Connect Slack
            </a>
          )}

          <nav className="flex flex-col gap-1">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">Core</div>

            <button
              onClick={() => setView('Scheduled')}
              className={`flex items-center justify-between px-3 py-2 rounded-lg font-medium text-sm transition-colors ${view === 'Scheduled' ? 'bg-[#EEFDF4] text-primary' : 'text-gray-600 hover:bg-gray-50'
                }`}
            >
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4" />
                Scheduled
              </div>
              <span className={view === 'Scheduled' ? 'bg-white px-2 py-0.5 rounded-full text-xs text-primary' : 'text-gray-400 text-xs'}>
                {scheduledCount}
              </span>
            </button>

            <button
              onClick={() => setView('Sent')}
              className={`flex items-center justify-between px-3 py-2 rounded-lg font-medium text-sm transition-colors ${view === 'Sent' ? 'bg-[#EEFDF4] text-primary' : 'text-gray-600 hover:bg-gray-50'
                }`}
            >
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4" />
                Sent
              </div>
              <span className={view === 'Sent' ? 'bg-white px-2 py-0.5 rounded-full text-xs text-primary' : 'text-gray-400 text-xs'}>
                {sentCount}
              </span>
            </button>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          <div className="max-w-4xl mx-auto space-y-2">
            {loading ? (
              <div className="text-center py-20 text-gray-400">Loading emails...</div>
            ) : error ? (
              <div className="text-center py-20 text-red-500">{error}</div>
            ) : filteredEmails.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                No {view.toLowerCase()} emails found.
              </div>
            ) : (
              filteredEmails.map((email) => (
                <div
                  key={email.id}
                  onClick={() => navigate(`/campaign/${email.id}`)}
                  className="group flex items-center justify-between p-4 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-100 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-48 font-medium text-gray-900 truncate">
                      To: {email.to}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${['SCHEDULED', 'PROCESSING'].includes(email.status)
                        ? 'bg-[#FFF4ED] text-[#F97316]'
                        : 'bg-[#F1F5F9] text-gray-600'
                        }`}>
                        {['SCHEDULED', 'PROCESSING'].includes(email.status) ? <Clock className="w-3 h-3" /> : null}
                        {['SCHEDULED', 'PROCESSING'].includes(email.status) ? email.time : email.status}
                      </span>
                    </div>

                    <div className="text-sm text-gray-600 truncate flex-1 flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{email.subject}</span>
                      <span className="text-gray-400">-</span>
                      <span className="truncate">{email.preview}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="text-gray-400 hover:text-yellow-400">
                      <Star className={`w-4 h-4 ${email.isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
