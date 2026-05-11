import React, { useState, useRef, useEffect } from 'react';
import { Menu, Paperclip, ArrowUp, Copy, ThumbsUp, ThumbsDown, RotateCcw, Check, Moon, Sun, Trash2, ChevronDown, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const SUPABASE_PUBLISHABLE_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsInJlZiI6InNwYi10NG54bzBoMTdlNHd5MDB3IiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzY3NjUwOTMsImV4cCI6MjA5MjM0MTA5M30.EoxZPFynj5epiekMvddnEcvuQfsQZ6-WUCdUntCw4-8";

type Message = {
  id: string;
  role: 'user' | 'ai';
  content: string;
  isStreaming?: boolean;
  isThinking?: boolean;
  isSearching?: boolean;
  sources?: { title: string; url: string; snippet: string }[];
  thinking?: string; // Added thinking field
};

const SUGGESTIONS = [
  "Explain quantum computing in simple terms",
  "Write a python script to scrape a website",
  "How do I center a div in Tailwind?",
  "Draft an email to decline a meeting"
];

const HISTORY = [
  { id: '1', title: 'React Performance Tips', date: 'Today' },
  { id: '2', title: 'Database Schema Design', date: 'Today' },
  { id: '3', title: 'Explain Monads', date: 'Yesterday' },
  { id: '4', title: 'CSS Grid Layouts', date: 'Earlier' },
];

const MODELS = [
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 (70B)' },
  { id: 'qwen/qwen3-32b', name: 'Qwen 3 (32B)' },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 (8B)' },
  { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 (70B)' }
];

const Index = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isDark, setIsDark] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollPill, setShowScrollPill] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Theme toggle
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  // Scroll handling
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    
    setAutoScroll(isAtBottom);
    setShowScrollPill(!isAtBottom && messages.length > 0);
  };

  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages, autoScroll]);

  const scrollToBottom = () => {
    setAutoScroll(true);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (userContent: string, withSearch = false) => {
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userContent };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputValue('');
    setAutoScroll(true);
    setIsGenerating(true);

    const aiMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { 
      id: aiMsgId, role: 'ai', content: '', isThinking: true, isSearching: withSearch 
    }]);

    const apiMessages = updatedMessages.map(m => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.content
    }));

    const token = SUPABASE_PUBLISHABLE_KEY;
    const supabaseUrl = "https://spb-t4nxo0h17e4wy00w.supabase.opentrust.net";

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/${withSearch ? 'search' : 'chat'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ messages: apiMessages, model: selectedModel.id })
      });

      if (!response.ok) {
        const errorText = await response.text();
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { 
          ...m, isThinking: false, isSearching: false, isStreaming: false, content: errorText
        } : m));
        setIsGenerating(false);
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        const errMsg = data.error ? `${data.error}${data.details ? '\n\n' + data.details : ''}` : null;
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { 
          ...m, isThinking: false, isSearching: false, isStreaming: false, 
          content: errMsg || data.choices?.[0]?.message?.content || 'No response.'
        } : m));
        setIsGenerating(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'sources') {
                setMessages(prev => prev.map(m => m.id === aiMsgId ? { 
                  ...m, sources: data.sources, isSearching: false 
                } : m));
              } else if (data.type === 'chunk') {
                fullText += data.content;

                // Extract thinking block if present (e.g., <think>...</think>)
                const thinkMatch = fullText.match(/<think>([\s\S]*?)<\/think>/);
                const thinking = thinkMatch ? thinkMatch[1] : undefined;
                const content = fullText.replace(/<think>[\s\S]*?<\/think>/, '').trim();

                setMessages(prev => prev.map(m => m.id === aiMsgId ? { 
                  ...m, content, thinking, isThinking: false, isSearching: false, isStreaming: true 
                } : m));
              }
            } catch (e) {
              // ignore incomplete SSE chunks
            }
          } else if (line === 'data: [DONE]') {
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, isStreaming: false } : m));
            setIsGenerating(false);
          }
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { 
        ...m, isThinking: false, isStreaming: false, content: `Connection failed: ${errMsg}` 
      } : m));
      setIsGenerating(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isGenerating) return;
    sendMessage(inputValue.trim(), useSearch);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">
      
      {/* Top Progress Bar */}
      <div className={cn(
        "fixed top-0 left-0 h-0.5 bg-foreground z-50 transition-all duration-500 ease-out",
        isGenerating ? "animate-progress" : "w-full opacity-0"
      )} />

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-background/20 backdrop-blur-sm transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div 
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-background border-r border-border transform transition-transform duration-300 ease-in-out flex flex-col",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-4 flex items-center justify-between">
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-2 hover:bg-muted rounded-md transition-colors"
          >
            <Menu className="w-5 h-5 text-muted-foreground" />
          </button>
          <button 
            onClick={() => setIsDark(!isDark)}
            className="p-2 hover:bg-muted rounded-md transition-colors"
          >
            {isDark ? <Sun className="w-4 h-4 text-muted-foreground" /> : <Moon className="w-4 h-4 text-muted-foreground" />}
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-6">
          {['Today', 'Yesterday', 'Earlier'].map(group => (
            <div key={group}>
              <div className="text-xs font-medium text-muted-foreground px-3 mb-2">{group}</div>
              <div className="space-y-0.5">
                {HISTORY.filter(h => h.date === group).map(item => (
                  <div 
                    key={item.id}
                    className="group flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-muted cursor-pointer transition-colors"
                  >
                    <span className="truncate pr-4">{item.title}</span>
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative min-w-0">
        {/* Header */}
        <header className="absolute top-0 left-0 right-0 p-4 flex items-center z-10">
          {!isSidebarOpen && (
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-muted rounded-md transition-colors"
            >
              <Menu className="w-5 h-5 text-muted-foreground" />
            </button>
          )}
        </header>

        {/* Chat Area */}
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto pt-16 pb-32 px-4"
        >
          <div className="max-w-3xl mx-auto w-full flex flex-col justify-end min-h-full">
            {messages.length === 0 ? (
              <div className={cn(
                "flex flex-col items-center justify-center flex-1 pb-20 transition-opacity duration-300",
                inputValue.trim() ? "opacity-0 pointer-events-none" : "opacity-100"
              )}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                  {SUGGESTIONS.map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setInputValue(suggestion);
                        setTimeout(() => textareaRef.current?.focus(), 0);
                      }}
                      className="text-left p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors text-sm text-muted-foreground hover:text-foreground"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-10 pb-10">
                {messages.map((msg) => (
                  <MessageRow key={msg.id} message={msg} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Scroll Pill */}
        {showScrollPill && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20">
            <button 
              onClick={scrollToBottom}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-background border border-border shadow-sm text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowUp className="w-3 h-3 rotate-180" />
              New response
            </button>
          </div>
        )}

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background to-transparent pt-10 pb-6 px-4">
          <div className="max-w-3xl mx-auto relative">
            
            {/* Model Selector */}
            <div className="absolute -top-10 left-2 flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                    {selectedModel.name}
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1" align="start">
                  <div className="flex flex-col">
                    {MODELS.map(model => (
                      <button 
                        key={model.id}
                        onClick={() => setSelectedModel(model)}
                        className="flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors text-left"
                      >
                        <span className={selectedModel.id === model.id ? "text-foreground" : "text-muted-foreground"}>
                          {model.name}
                        </span>
                        {selectedModel.id === model.id && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <button 
                onClick={() => setUseSearch(!useSearch)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  useSearch 
                    ? "bg-primary/10 text-primary hover:bg-primary/20" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Globe className="w-3.5 h-3.5" />
                Search
              </button>
            </div>

            <div className="relative flex items-end bg-background border border-border rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_10px_-4px_rgba(0,0,0,0.2)] overflow-hidden focus-within:ring-1 focus-within:ring-border transition-shadow">
              <button className="p-3.5 text-muted-foreground hover:text-foreground transition-colors shrink-0">
                <Paperclip className="w-5 h-5" />
              </button>
              
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything."
                disabled={isGenerating}
                className="w-full max-h-[120px] py-3.5 px-2 bg-transparent border-none focus:outline-none resize-none text-base placeholder:text-muted-foreground/60 disabled:opacity-50"
                rows={1}
              />
              
              <div className="p-2 shrink-0">
                <button 
                  onClick={handleSubmit}
                  disabled={!inputValue.trim() || isGenerating}
                  className={cn(
                    "p-2 rounded-xl transition-all duration-200 flex items-center justify-center",
                    inputValue.trim() && !isGenerating
                      ? "bg-primary text-primary-foreground opacity-100 translate-y-0" 
                      : "bg-transparent text-muted-foreground opacity-0 translate-y-2 pointer-events-none"
                  )}
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="text-center mt-2 text-[11px] text-muted-foreground/50">
              AI can make mistakes. Consider verifying important information.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MessageRow = ({ message }: { message: Message }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const textArea = document.createElement("textarea");
    textArea.value = message.content;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Fallback copy failed', err);
    }
    document.body.removeChild(textArea);
  };

  if (message.role === 'user') {
    return (
      <div className="flex justify-end w-full group">
        <div className="max-w-[80%] text-[15px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full group relative">
      <div className="w-full text-[15px] leading-relaxed text-foreground">
        {message.isThinking ? (
          <div className="flex items-center h-6 gap-3 text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 dot-1" />
              <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 dot-2" />
              <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 dot-3" />
            </div>
            <span className="text-sm font-medium">{message.isSearching ? 'Searching the web...' : 'Thinking...'}</span>
          </div>
        ) : (
          <div className="relative">
            {message.thinking && (
              <details className="mb-4 group">
                <summary className="text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors flex items-center gap-2">
                  <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                  Thinking Process
                </summary>
                <div className="mt-2 p-4 rounded-xl bg-muted/30 text-sm text-muted-foreground border border-border/50 whitespace-pre-wrap">
                  {message.thinking}
                </div>
              </details>
            )}
            {message.sources && message.sources.length > 0 && (
              <div className="flex flex-col gap-2 mb-4 w-full">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sources</div>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide w-full">
                  {message.sources.map((src, i) => (
                    <a key={i} href={src.url} target="_blank" rel="noreferrer" 
                       className="flex-shrink-0 w-64 p-3 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors flex flex-col gap-1.5 text-left animate-in fade-in slide-in-from-right-4"
                       style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'both' }}>
                      <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 truncate">
                        <Globe className="w-3 h-3 shrink-0" />
                        <span className="truncate">{new URL(src.url).hostname.replace('www.', '')}</span>
                      </div>
                      <div className="text-sm font-medium line-clamp-2 text-foreground">{src.title}</div>
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div className="prose prose-neutral dark:prose-invert max-w-none">
              {/* Simple markdown rendering simulation for the demo */}
              {message.content.split('```').map((part, i) => {
                if (i % 2 === 1) {
                  const [lang, ...code] = part.split('\n');
                  const codeContent = code.join('\n');
                  return (
                    <div key={i} className="relative my-4 rounded-lg bg-zinc-950 dark:bg-zinc-900 border border-zinc-800 overflow-hidden group/code">
                      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/50 border-b border-zinc-800">
                        <span className="text-xs font-mono text-zinc-400">{lang || 'text'}</span>
                        <button 
                          onClick={() => {
                            const textArea = document.createElement("textarea");
                            textArea.value = codeContent;
                            document.body.appendChild(textArea);
                            textArea.select();
                            try {
                              document.execCommand('copy');
                            } catch (err) {
                              console.error('Fallback copy failed', err);
                            }
                            document.body.removeChild(textArea);
                          }}
                          className="text-zinc-400 hover:text-zinc-100 opacity-0 group-hover/code:opacity-100 transition-opacity"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <pre className="p-4 overflow-x-auto text-sm font-mono text-zinc-100 m-0 bg-transparent">
                        <code>{codeContent}</code>
                      </pre>
                    </div>
                  );
                }
                return (
                  <span key={i} className="whitespace-pre-wrap">
                    {part}
                  </span>
                );
              })}
              {message.isStreaming && (
                <span className="inline-block w-[2px] h-[1em] bg-foreground ml-1 align-middle animate-breathe" />
              )}
            </div>

            {/* Action Bar */}
            {!message.isStreaming && !message.isThinking && (
              <div className="absolute -bottom-8 left-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={handleCopy} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors">
                  <ThumbsUp className="w-3.5 h-3.5" />
                </button>
                <button className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors">
                  <ThumbsDown className="w-3.5 h-3.5" />
                </button>
                <button className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors ml-2">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;