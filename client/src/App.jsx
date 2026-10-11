import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { 
  Users, Copy, Check, Film, MessageSquare, 
  BarChart3, Activity, Play, Sparkles, Send, Radio
} from 'lucide-react';

const socket = io('http://localhost:3001');

const params = new URLSearchParams(window.location.search);
const INITIAL_ROOM = params.get('room') || 'cinema-' + Math.floor(1000 + Math.random() * 9000);

// Curated streamable video catalog for Movie Discovery requirement
const CATALOGUE = [
  {
    id: 1,
    title: 'MDN Botanical Bloom',
    category: 'Nature',
    duration: '0:05',
    url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=500&auto=format&fit=crop&q=60'
  },
  {
    id: 2,
    title: 'Tears of Steel (VFX Sci-Fi)',
    category: 'Sci-Fi',
    duration: '12:14',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop&q=60'
  },
  {
    id: 3,
    title: 'Sintel - The Dragon Quest',
    category: 'Fantasy',
    duration: '15:20',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&auto=format&fit=crop&q=60'
  },
  {
    id: 4,
    title: 'For Bigger Blazes (Action)',
    category: 'Action',
    duration: '0:15',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&auto=format&fit=crop&q=60'
  }
];

export default function App() {
  const [roomId] = useState(INITIAL_ROOM);
  const [username] = useState('PartyUser_' + Math.floor(100 + Math.random() * 900));
  const [userCount, setUserCount] = useState(1);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'discover' | 'polls'

  // Video State
  const videoRef = useRef(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [customInputUrl, setCustomInputUrl] = useState('');
  const isRemoteAction = useRef(false);

  // Sync Diagnostics
  const [latency, setLatency] = useState(0);
  const [currentDrift, setCurrentDrift] = useState(0);
  const [driftStatus, setDriftStatus] = useState('Synchronized');

  // Chat & Reactions
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [reactions, setReactions] = useState([]);
  const chatBottomRef = useRef(null);

  // Movie Discovery Filters
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Group Poll State
  const [poll, setPoll] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);

  useEffect(() => {
    window.history.replaceState(null, '', `?room=${roomId}`);
    socket.emit('join-room', { roomId, username });

    socket.on('room-users-update', ({ count }) => setUserCount(count));

    socket.on('sync-state', ({ videoUrl, isPlaying, currentTime, poll: roomPoll }) => {
      setVideoUrl(videoUrl);
      if (roomPoll) setPoll(roomPoll);

      if (videoRef.current) {
        videoRef.current.currentTime = currentTime;
        if (isPlaying) {
          videoRef.current.play().catch(() => {
            videoRef.current.muted = true;
            videoRef.current.play();
          });
        } else {
          videoRef.current.pause();
        }
      }
    });

    socket.on('video-play', ({ currentTime }) => {
      if (!videoRef.current) return;
      isRemoteAction.current = true;
      videoRef.current.currentTime = currentTime;
      videoRef.current.play().finally(() => {
        isRemoteAction.current = false;
      });
    });

    socket.on('video-pause', ({ currentTime }) => {
      if (!videoRef.current) return;
      isRemoteAction.current = true;
      videoRef.current.currentTime = currentTime;
      videoRef.current.pause();
      isRemoteAction.current = false;
    });

    socket.on('video-seek', ({ currentTime }) => {
      if (!videoRef.current) return;
      isRemoteAction.current = true;
      videoRef.current.currentTime = currentTime;
      setTimeout(() => {
        isRemoteAction.current = false;
      }, 100);
    });

    socket.on('sync-heartbeat', ({ currentTime: serverTime }) => {
      if (!videoRef.current || videoRef.current.paused) return;
      const driftDiff = Math.abs(videoRef.current.currentTime - serverTime);
      const driftMs = Math.round(driftDiff * 1000);
      setCurrentDrift(driftMs);

      if (driftDiff > 0.5) {
        setDriftStatus(`Correcting (${driftMs}ms)`);
        videoRef.current.currentTime = serverTime;
        setTimeout(() => setDriftStatus('Synchronized'), 1000);
      } else {
        setDriftStatus('Synchronized');
      }
    });

    socket.on('chat-message', (msg) => {
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });

    socket.on('receive-reaction', (reaction) => {
      setReactions((prev) => [...prev, reaction]);
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== reaction.id));
      }, 2000);
    });

    socket.on('poll-updated', (updatedPoll) => {
      setPoll(updatedPoll);
    });

    const pingInterval = setInterval(() => {
      const start = performance.now();
      socket.emit('latency-ping', Date.now(), () => {
        setLatency(Math.round(performance.now() - start));
      });
    }, 2500);

    return () => {
      clearInterval(pingInterval);
      socket.off('room-users-update');
      socket.off('sync-state');
      socket.off('video-play');
      socket.off('video-pause');
      socket.off('video-seek');
      socket.off('sync-heartbeat');
      socket.off('chat-message');
      socket.off('receive-reaction');
      socket.off('poll-updated');
    };
  }, [roomId]);

  // Video playback triggers
  const handlePlay = () => {
    if (isRemoteAction.current || !videoRef.current) return;
    socket.emit('video-play', { roomId, currentTime: videoRef.current.currentTime });
  };

  const handlePause = () => {
    if (isRemoteAction.current || !videoRef.current) return;
    socket.emit('video-pause', { roomId, currentTime: videoRef.current.currentTime });
  };

  const handleSeeked = () => {
    if (isRemoteAction.current || !videoRef.current) return;
    socket.emit('video-seek', { roomId, currentTime: videoRef.current.currentTime });
  };

  const changeVideoSource = (url) => {
    socket.emit('change-video', { roomId, videoUrl: url });
  };

  const handleCustomUrlSubmit = (e) => {
    e.preventDefault();
    if (!customInputUrl.trim()) return;
    changeVideoSource(customInputUrl.trim());
    setCustomInputUrl('');
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('send-message', { roomId, message: chatInput.trim(), username });
    setChatInput('');
  };

  const triggerReaction = (emoji) => {
    socket.emit('send-reaction', { roomId, emoji });
  };

  const handleVote = (optionId) => {
    if (hasVoted) return;
    socket.emit('vote-poll', { roomId, optionId });
    setHasVoted(true);
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter catalogue by category & fuzzy title search
  const filteredCatalogue = CATALOGUE.filter((item) => {
    const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const totalPollVotes = poll?.options.reduce((sum, opt) => sum + opt.votes, 0) || 0;

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 50% -20%, #172554, #080b11 65%)', display: 'flex', flexDirection: 'column' }}>
      
      {/* Sleek Top Navigation Bar */}
      <nav style={{ height: '70px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem', backdropFilter: 'blur(16px)', background: 'rgba(8,11,17,0.75)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(59,130,246,0.5)' }}>
              <Film size={20} color="#fff" />
            </div>
            <span style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.5px', background: 'linear-gradient(to right, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              SyncSphere
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'rgba(30,41,59,0.7)', padding: '0.35rem 0.8rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Radio size={14} color="#10b981" />
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Room:</span>
            <code style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc' }}>{roomId}</code>
            <button
              onClick={copyInvite}
              title="Copy Room Link"
              style={{ background: 'transparent', border: 'none', color: copied ? '#10b981' : '#60a5fa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600, marginLeft: '4px' }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Invite'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(30,41,59,0.5)', padding: '0.35rem 0.75rem', borderRadius: '20px', fontSize: '0.8rem', color: '#cbd5e1' }}>
            <Users size={14} color="#38bdf8" />
            <span>{userCount} connected</span>
          </div>
        </div>

        {/* Real-time Telemetry / Benchmark HUD */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(15,23,42,0.85)', padding: '0.4rem 1rem', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Activity size={14} color="#38bdf8" />
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>RTT:</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: latency <= 250 ? '#34d399' : '#f87171' }}>{latency}ms</span>
          </div>
          <div style={{ height: '14px', width: '1px', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Drift:</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: currentDrift <= 500 ? '#34d399' : '#f87171' }}>{currentDrift}ms</span>
          </div>
          <div style={{ height: '14px', width: '1px', background: 'rgba(255,255,255,0.1)' }} />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#38bdf8' }}>{driftStatus}</span>
        </div>
      </nav>

      {/* Main Studio Viewport */}
      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', padding: '1.5rem 2rem', maxWidth: '1700px', margin: '0 auto', width: '100%' }}>
        
        {/* Left: Cinema Video Stage */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Direct URL Input Bar */}
          <form onSubmit={handleCustomUrlSubmit} style={{ display: 'flex', gap: '0.5rem', background: 'rgba(17,24,39,0.7)', padding: '0.4rem 0.6rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <input
              type="text"
              placeholder="Stream any custom video link (.mp4, direct web link)..."
              value={customInputUrl}
              onChange={(e) => setCustomInputUrl(e.target.value)}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '0.85rem', padding: '0.4rem 0.6rem' }}
            />
            <button
              type="submit"
              style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', border: 'none', borderRadius: '8px', padding: '0.45rem 1rem', color: '#fff', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Sparkles size={14} /> Stream
            </button>
          </form>

          {/* Player Container with Ambient Lighting */}
          <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', background: '#020408', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 50px -10px rgba(0,0,0,0.8)' }}>
            {videoUrl && (
              <video
                key={videoUrl}
                ref={videoRef}
                src={videoUrl}
                controls
                preload="auto"
                onPlay={handlePlay}
                onPause={handlePause}
                onSeeked={handleSeeked}
                style={{ width: '100%', maxHeight: '68vh', display: 'block', outline: 'none' }}
              />
            )}

            {/* Floating Reactions Overlay */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
              {reactions.map((r) => (
                <span
                  key={r.id}
                  className="reaction-bubble"
                  style={{
                    position: 'absolute',
                    bottom: '24px',
                    left: `${r.leftOffset}%`,
                    fontSize: '2.8rem',
                    filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.8))'
                  }}
                >
                  {r.emoji}
                </span>
              ))}
            </div>
          </div>

          {/* Quick Reaction Tray */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(15,23,42,0.6)', padding: '0.8rem 1.2rem', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8' }}>Live Reactions:</span>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              {['🍿', '🔥', '😂', '❤️', '😱', '🎉'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => triggerReaction(emoji)}
                  style={{ fontSize: '1.4rem', background: 'rgba(30,41,59,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.4rem 0.8rem', cursor: 'pointer', transition: 'all 0.15s ease' }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Right: Tabbed Social & Discovery Hub */}
        <aside style={{ background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(16px)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: '580px', overflow: 'hidden' }}>
          
          {/* Tab Selection */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(8,11,17,0.5)' }}>
            <button
              onClick={() => setActiveTab('chat')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0.9rem 0', background: 'transparent', border: 'none', color: activeTab === 'chat' ? '#60a5fa' : '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', borderBottom: activeTab === 'chat' ? '2px solid #3b82f6' : 'none' }}
            >
              <MessageSquare size={16} /> Chat
            </button>
            <button
              onClick={() => setActiveTab('discover')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0.9rem 0', background: 'transparent', border: 'none', color: activeTab === 'discover' ? '#60a5fa' : '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', borderBottom: activeTab === 'discover' ? '2px solid #3b82f6' : 'none' }}
            >
              <Film size={16} /> Discover
            </button>
            <button
              onClick={() => setActiveTab('polls')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0.9rem 0', background: 'transparent', border: 'none', color: activeTab === 'polls' ? '#60a5fa' : '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', borderBottom: activeTab === 'polls' ? '2px solid #3b82f6' : 'none' }}
            >
              <BarChart3 size={16} /> Polls
            </button>
          </div>

          {/* Tab 1: Live Chat Panel */}
          {activeTab === 'chat' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {messages.map((m) =>
                  m.system ? (
                    <div key={m.id} style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center', padding: '0.2rem 0' }}>
                      {m.text}
                    </div>
                  ) : (
                    <div key={m.id} style={{ background: 'rgba(30,41,59,0.5)', padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.2rem' }}>
                        <span style={{ fontWeight: 700, color: '#38bdf8' }}>{m.username}</span>
                        <span style={{ color: '#64748b' }}>{m.time}</span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: '#f1f5f9', wordBreak: 'break-word', lineHeight: 1.4 }}>{m.text}</p>
                    </div>
                  )
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Chat Send Form */}
              <form onSubmit={handleSendMessage} style={{ padding: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(8,11,17,0.5)', display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Chat with everyone..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  style={{ flex: 1, background: 'rgba(30,41,59,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '0.55rem 0.8rem', color: '#fff', fontSize: '0.85rem', outline: 'none' }}
                />
                <button
                  type="submit"
                  style={{ background: '#3b82f6', border: 'none', borderRadius: '8px', padding: '0 0.85rem', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Send size={15} />
                </button>
              </form>
            </div>
          )}

          {/* Tab 2: Movie Discovery Panel */}
          {activeTab === 'discover' && (
            <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              {/* Fuzzy Search */}
              <input
                type="text"
                placeholder="Search movies, genres..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', background: 'rgba(30,41,59,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '0.5rem 0.8rem', color: '#fff', fontSize: '0.82rem', outline: 'none' }}
              />

              {/* Category Filter Pills */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {['All', 'Sci-Fi', 'Fantasy', 'Action', 'Nature'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', borderRadius: '12px', border: 'none', cursor: 'pointer', background: selectedCategory === cat ? '#3b82f6' : 'rgba(30,41,59,0.6)', color: '#fff', fontWeight: 600 }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Movie Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.4rem' }}>
                {filteredCatalogue.map((movie) => (
                  <div key={movie.id} style={{ display: 'flex', gap: '0.75rem', background: 'rgba(30,41,59,0.4)', borderRadius: '10px', padding: '0.5rem', border: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                    <img src={movie.thumbnail} alt={movie.title} style={{ width: '70px', height: '48px', objectFit: 'cover', borderRadius: '6px' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#f8fafc' }}>{movie.title}</div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{movie.category} • {movie.duration}</div>
                    </div>
                    <button
                      onClick={() => changeVideoSource(movie.url)}
                      title="Play for everyone"
                      style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa', borderRadius: '8px', padding: '0.4rem 0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600 }}
                    >
                      <Play size={12} fill="#60a5fa" /> Play
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 3: Group Polls Panel */}
          {activeTab === 'polls' && (
            <div style={{ flex: 1, padding: '1.2rem', overflowY: 'auto' }}>
              {poll ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                    <BarChart3 size={16} /> ACTIVE ROOM POLL
                  </div>
                  <h3 style={{ fontSize: '0.95rem', color: '#fff', marginBottom: '1rem', lineHeight: 1.4 }}>{poll.question}</h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    {poll.options.map((option) => {
                      const percentage = totalPollVotes > 0 ? Math.round((option.votes / totalPollVotes) * 100) : 0;
                      return (
                        <div
                          key={option.id}
                          onClick={() => handleVote(option.id)}
                          style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.8rem', cursor: hasVoted ? 'default' : 'pointer', position: 'relative', overflow: 'hidden' }}
                        >
                          <div style={{ position: 'absolute', inset: 0, width: `${percentage}%`, background: 'rgba(59,130,246,0.2)', transition: 'width 0.4s ease' }} />
                          <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 600 }}>
                            <span>{option.text}</span>
                            <span style={{ color: '#60a5fa' }}>{percentage}% ({option.votes})</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p style={{ marginTop: '1.2rem', fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>
                    {hasVoted ? 'Vote recorded! Real-time results synced.' : 'Click any option above to cast your vote.'}
                  </p>
                </div>
              ) : (
                <div style={{ color: '#64748b', fontSize: '0.85rem', textAlign: 'center', marginTop: '2rem' }}>No active polls in this room.</div>
              )}
            </div>
          )}

        </aside>
      </main>
    </div>
  );
}