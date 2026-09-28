import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Clock, Upload, Paperclip, AlignLeft, AlignCenter, AlignRight, List, ListOrdered, Quote, Link2, Image, Code } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

interface Sender {
  id: string;
  email: string;
}

export default function Compose() {
  const navigate = useNavigate();
  const [showSendLater, setShowSendLater] = useState(false);
  const [senders, setSenders] = useState<Sender[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [selectedSenderId, setSelectedSenderId] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [toInput, setToInput] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  const [activeFormats, setActiveFormats] = useState<string[]>([]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const formats = ['bold', 'italic', 'underline', 'justifyLeft', 'justifyCenter', 'justifyRight', 'insertUnorderedList', 'insertOrderedList'];
      const active = formats.filter(format => {
        try { return document.queryCommandState(format); } catch (e) { return false; }
      });
      try {
        const block = document.queryCommandValue('formatBlock');
        if (block?.toLowerCase() === 'h1') active.push('h1');
        if (block?.toLowerCase() === 'blockquote') active.push('blockquote');
      } catch (e) {}
      setActiveFormats(active);
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  const formatText = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      setBody(editorRef.current.innerHTML);
      editorRef.current.focus();
    }
  };

  const [customTime, setCustomTime] = useState('');
  const [delaySeconds, setDelaySeconds] = useState<string>('');
  const [hourlyLimit, setHourlyLimit] = useState<string>('');
  const [attachments, setAttachments] = useState<{ name: string, content: string }[]>([]);

  useEffect(() => {
    // Fetch senders from backend
    axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/senders`, { withCredentials: true })
      .then(res => {
        setSenders(res.data);
        if (res.data.length > 0) setSelectedSenderId(res.data[0].id);
      })
      .catch(err => console.error('Failed to fetch senders', err));
  }, []);

  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = (event.target?.result as string).split(',')[1];
        if (base64) {
          setAttachments(prev => [...prev, { name: file.name, content: base64 }]);
        }
      };
      reader.readAsDataURL(file); // get base64
    });
    e.target.value = '';
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      // Parse emails using a more robust regex
      const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];

      if (matches.length === 0) {
        alert('No valid email addresses found in the file!');
        return;
      }

      const uniqueEmails = Array.from(new Set([...recipients, ...matches]));
      setRecipients(uniqueEmails);
    };
    reader.readAsText(file);
    // reset input
    e.target.value = '';
  };

  const handleManualAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = toInput.trim().replace(',', '');
      if (val && /[\w.-]+@[\w.-]+\.\w+/.test(val) && !recipients.includes(val)) {
        setRecipients([...recipients, val]);
      }
      setToInput('');
    }
  };

  const removeRecipient = (email: string) => {
    setRecipients(recipients.filter(r => r !== email));
  };

  const handleSend = async (scheduleTime?: string) => {
    // If the user forgot to press Enter, parse whatever is currently in the To input box
    let finalRecipients = [...recipients];
    const pendingEmail = toInput.trim().replace(',', '');
    if (pendingEmail && /[\w.-]+@[\w.-]+\.\w+/.test(pendingEmail) && !finalRecipients.includes(pendingEmail)) {
      finalRecipients.push(pendingEmail);
      setRecipients(finalRecipients);
      setToInput('');
    }

    if (!selectedSenderId || finalRecipients.length === 0 || !subject || !body) {
      setError('Please fill in all required fields (Sender, Recipients, Subject, Body)');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/campaigns/schedule`, {
        senderId: selectedSenderId,
        recipients: finalRecipients,
        subject,
        body,
        delayMs: delaySeconds ? parseInt(delaySeconds) * 1000 : undefined,
        hourlyLimit: hourlyLimit ? parseInt(hourlyLimit) : undefined,
        startAt: scheduleTime || new Date().toISOString(),
        attachments: attachments.length > 0 ? attachments : undefined
      }, { withCredentials: true });
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to schedule emails');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col font-sans">
      <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="text-gray-500 hover:text-gray-800">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">Compose New Email</h1>
        </div>

        <div className="flex items-center gap-3">
          <label className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 cursor-pointer">
            <Paperclip className="w-5 h-5" />
            <input type="file" multiple onChange={handleAttachmentUpload} className="hidden" />
          </label>
          <button className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
            <Clock className="w-5 h-5" />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowSendLater(!showSendLater)}
              disabled={loading}
              className="flex items-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white px-4 py-2 rounded-full font-medium text-sm transition-colors"
            >
              {loading ? 'Scheduling...' : 'Send Later'}
            </button>

            {/* Send Later Modal */}
            {showSendLater && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-20">
                <div className="px-4 py-2 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-900">Send Later</h3>
                </div>
                <div className="p-2 space-y-1">
                  <label className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg flex flex-col gap-1 cursor-pointer">
                    <span className="font-medium text-gray-700 flex items-center justify-between">Pick custom time <Clock className="w-4 h-4" /></span>
                    <input
                      type="datetime-local"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      className="w-full bg-transparent outline-none cursor-pointer mt-1"
                    />
                  </label>
                  <div className="h-px bg-gray-100 my-1"></div>
                  <button onClick={() => handleSend(new Date(Date.now() + 3600000).toISOString())} className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Send Next Hour</button>
                  <button onClick={() => {
                    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); handleSend(d.toISOString());
                  }} className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Send Tomorrow, 10:00 AM</button>
                </div>
                <div className="p-2 border-t border-gray-100 flex gap-2">
                  <button onClick={() => setShowSendLater(false)} className="flex-1 py-2 text-sm text-gray-500 font-medium hover:bg-gray-50 rounded-lg">Cancel</button>
                  <button onClick={() => handleSend(customTime ? new Date(customTime).toISOString() : undefined)} className="flex-1 py-2 text-sm bg-[#EEFDF4] text-primary font-medium hover:bg-[#E0F8EA] rounded-lg">
                    {customTime ? 'Schedule' : 'Send Now'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 flex justify-center">
        <div className="w-full max-w-4xl bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 space-y-6 flex-1">

            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-500 w-20 text-left">From</label>
              <select
                value={selectedSenderId}
                onChange={(e) => setSelectedSenderId(e.target.value)}
                className="w-fit bg-[#F5F7F5] border-none rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary/30"
              >
                {senders.map(s => <option key={s.id} value={s.id}>{s.email}</option>)}
              </select>
            </div>

            <div className="flex items-start gap-4">
              <label className="text-sm font-medium text-gray-500 w-20 text-left mt-2">To</label>
              <div className="flex-1 flex flex-col gap-2">
                <div className="flex gap-2 border-b border-gray-200 pb-1 flex-wrap items-center max-h-32 overflow-y-auto">
                  {recipients.slice(0, 5).map(email => (
                    <span key={email} className="bg-[#E0F8EA] text-primary text-xs px-2 py-1 rounded-md flex items-center gap-1">
                      {email}
                      <button onClick={() => removeRecipient(email)} className="hover:text-primary-hover">&times;</button>
                    </span>
                  ))}
                  {recipients.length > 5 && (
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-md flex items-center gap-1 font-medium">
                      +{recipients.length - 5} more
                    </span>
                  )}
                  <input
                    type="text"
                    placeholder={recipients.length === 0 ? "recipient@example.com (press Enter)" : "Add more..."}
                    value={toInput}
                    onChange={(e) => setToInput(e.target.value)}
                    onKeyDown={handleManualAdd}
                    className="flex-1 bg-transparent min-w-[150px] px-1 py-1 text-sm text-gray-700 focus:outline-none placeholder-gray-300"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{recipients.length} recipient{recipients.length !== 1 && 's'} parsed</span>
                    {recipients.length > 0 && (
                      <button onClick={() => setRecipients([])} className="text-xs text-red-400 hover:text-red-500 font-medium">
                        Clear All
                      </button>
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-primary hover:text-primary-hover text-sm font-medium px-3 py-1 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    Upload List (CSV/TXT)
                    <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-500 w-20 text-left">Subject</label>
              <input
                type="text"
                placeholder="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="flex-1 bg-transparent border-b border-gray-200 px-1 py-1 text-sm text-gray-700 focus:outline-none focus:border-primary placeholder-gray-300"
              />
            </div>

            <div className="flex items-center gap-4">
              <div className="w-20"></div>
              <div className="flex-1 flex items-center gap-8 mt-2">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">Delay between 2 emails</label>
                  <input
                    type="number"
                    placeholder="00"
                    value={delaySeconds}
                    onChange={(e) => setDelaySeconds(e.target.value)}
                    className="w-16 bg-transparent border border-gray-200 rounded-md px-2 py-1 text-sm text-gray-700 focus:outline-none focus:border-primary text-center"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium text-gray-700">Hourly Limit</label>
                  <input
                    type="number"
                    placeholder="00"
                    value={hourlyLimit}
                    onChange={(e) => setHourlyLimit(e.target.value)}
                    className="w-16 bg-transparent border border-gray-200 rounded-md px-2 py-1 text-sm text-gray-700 focus:outline-none focus:border-primary text-center"
                  />
                </div>
              </div>
            </div>

            {error && <div className="text-red-500 text-sm">{error}</div>}

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4 px-4">
                {attachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-100 text-gray-700 text-xs px-3 py-1.5 rounded-full shadow-sm border border-gray-200">
                    <Paperclip className="w-3.5 h-3.5 text-gray-400" />
                    <span className="font-medium max-w-[200px] truncate">{att.name}</span>
                    <button
                      onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))}
                      className="ml-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-8 border border-gray-200 rounded-xl overflow-hidden flex flex-col min-h-[300px]">
              <div className="bg-[#F5F7F5] border-b border-gray-200 px-4 py-2 flex items-center gap-3 text-gray-600 overflow-x-auto">
                <div className="flex items-center gap-2 border-r border-gray-300 pr-3">
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('italic'); }} className={`hover:text-gray-900 transition-colors w-7 h-7 flex items-center justify-center rounded ${activeFormats.includes('italic') ? 'bg-gray-200 text-gray-900' : ''}`}><span className="font-serif italic font-bold">I</span></button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('underline'); }} className={`hover:text-gray-900 transition-colors w-7 h-7 flex items-center justify-center rounded ${activeFormats.includes('underline') ? 'bg-gray-200 text-gray-900' : ''}`}><span className="font-serif font-bold underline">U</span></button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('bold'); }} className={`hover:text-gray-900 transition-colors w-7 h-7 flex items-center justify-center rounded ${activeFormats.includes('bold') ? 'bg-gray-200 text-gray-900' : ''}`}><span className="font-serif font-bold">B</span></button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('formatBlock', 'H1'); }} className={`hover:text-gray-900 transition-colors w-7 h-7 flex items-center justify-center rounded text-sm font-medium ${activeFormats.includes('h1') ? 'bg-gray-200 text-gray-900' : ''}`}>Tt</button>
                </div>
                <div className="flex items-center gap-2 border-r border-gray-300 pr-3">
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('justifyLeft'); }} className={`hover:text-gray-900 transition-colors w-7 h-7 flex items-center justify-center rounded ${activeFormats.includes('justifyLeft') ? 'bg-gray-200 text-gray-900' : ''}`}><AlignLeft className="w-4 h-4" /></button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('justifyCenter'); }} className={`hover:text-gray-900 transition-colors w-7 h-7 flex items-center justify-center rounded ${activeFormats.includes('justifyCenter') ? 'bg-gray-200 text-gray-900' : ''}`}><AlignCenter className="w-4 h-4" /></button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('justifyRight'); }} className={`hover:text-gray-900 transition-colors w-7 h-7 flex items-center justify-center rounded ${activeFormats.includes('justifyRight') ? 'bg-gray-200 text-gray-900' : ''}`}><AlignRight className="w-4 h-4" /></button>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('insertUnorderedList'); }} className={`hover:text-gray-900 transition-colors w-7 h-7 flex items-center justify-center rounded ${activeFormats.includes('insertUnorderedList') ? 'bg-gray-200 text-gray-900' : ''}`}><List className="w-4 h-4" /></button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('insertOrderedList'); }} className={`hover:text-gray-900 transition-colors w-7 h-7 flex items-center justify-center rounded ${activeFormats.includes('insertOrderedList') ? 'bg-gray-200 text-gray-900' : ''}`}><ListOrdered className="w-4 h-4" /></button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); formatText('formatBlock', 'BLOCKQUOTE'); }} className={`hover:text-gray-900 transition-colors w-7 h-7 flex items-center justify-center rounded ${activeFormats.includes('blockquote') ? 'bg-gray-200 text-gray-900' : ''}`}><Quote className="w-4 h-4" /></button>
                  <button type="button" onMouseDown={(e) => { 
                    e.preventDefault(); 
                    // Save selection before prompt steals focus
                    const selection = window.getSelection();
                    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
                    
                    const url = prompt('Enter image URL:'); 
                    if (url) {
                      editorRef.current?.focus();
                      if (range && selection) {
                        selection.removeAllRanges();
                        selection.addRange(range);
                      }
                      document.execCommand('insertImage', false, url);
                      if (editorRef.current) setBody(editorRef.current.innerHTML);
                    }
                  }} className="hover:text-gray-900 transition-colors w-7 h-7 flex items-center justify-center rounded"><Image className="w-4 h-4" /></button>
                </div>
              </div>
              <div
                ref={editorRef}
                contentEditable
                onInput={(e) => setBody(e.currentTarget.innerHTML)}
                className="flex-1 w-full p-4 focus:outline-none text-gray-700 text-sm leading-relaxed overflow-y-auto editor-content"
                style={{ minHeight: '250px' }}
                data-placeholder="Type Your Reply (Visually Format Text)..."
              />
              <style>{`
                .editor-content ul { list-style-type: disc; margin-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5rem; }
                .editor-content ol { list-style-type: decimal; margin-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5rem; }
                .editor-content blockquote { border-left: 4px solid #e5e7eb; padding-left: 1rem; color: #6b7280; font-style: italic; }
                .editor-content img { max-width: 100%; height: auto; border-radius: 8px; margin: 10px 0; }
                .editor-content h1 { font-size: 1.5rem; font-weight: bold; margin-bottom: 0.5rem; }
                [contentEditable]:empty:before {
                  content: attr(data-placeholder);
                  color: #d1d5db;
                  pointer-events: none;
                  display: block;
                }
              `}</style>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
