import { useState, useEffect } from 'react';
import { ArrowLeft, Clock, CheckCircle2, AlertCircle, Calendar } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';

export default function CampaignDetails() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`http://localhost:3000/api/campaigns/${id}`, { withCredentials: true })
      .then(res => {
        setCampaign(res.data);
      })
      .catch(err => {
        console.error(err);
        setError('Failed to load campaign details');
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="text-gray-400">Loading campaign...</div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="text-red-500">{error || 'Campaign not found'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col font-sans">
      <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="text-gray-500 hover:text-gray-800">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-semibold text-gray-900 truncate max-w-xl">{campaign.subject}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
            ['SCHEDULED', 'PROCESSING'].includes(campaign.status) 
              ? 'bg-[#FFF4ED] text-[#F97316]' 
              : 'bg-[#F1F5F9] text-gray-600'
          }`}>
            {campaign.status}
          </span>
        </div>
      </header>

      <main className="flex-1 p-6 flex justify-center overflow-y-auto">
        <div className="w-full max-w-4xl space-y-6">
          
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Campaign Overview</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-gray-500 mb-1">From</p>
                <p className="text-sm font-medium text-gray-900">{campaign.sender?.email}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Started At</p>
                <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  {new Date(campaign.startAt).toLocaleString()}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-1">Email Body Preview</p>
                <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 whitespace-pre-wrap font-mono border border-gray-100">
                  {campaign.body}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
              <h2 className="text-sm font-semibold text-gray-900">Email Queue ({campaign.emails?.length})</h2>
            </div>
            
            <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
              {campaign.emails?.map((email: any, index: number) => (
                <div key={email.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-medium text-gray-400 w-6">#{index + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{email.recipient}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Scheduled: {new Date(email.scheduledAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {email.status === 'SENT' && (
                      <div className="flex items-center gap-2">
                        {email.previewUrl && (
                          <a href={email.previewUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md transition-colors">
                            View Email
                          </a>
                        )}
                        <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-md">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Sent
                        </span>
                      </div>
                    )}
                    {email.status === 'FAILED' && (
                      <div className="flex flex-col items-end">
                        <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-md">
                          <AlertCircle className="w-3.5 h-3.5" /> Failed
                        </span>
                        {email.lastError && <span className="text-[10px] text-red-400 mt-1 max-w-[200px] truncate" title={email.lastError}>{email.lastError}</span>}
                      </div>
                    )}
                    {['SCHEDULED', 'PROCESSING'].includes(email.status) && (
                      <span className="flex items-center gap-1 text-xs font-medium text-yellow-600 bg-yellow-50 px-2 py-1 rounded-md">
                        <Clock className="w-3.5 h-3.5" /> {email.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
