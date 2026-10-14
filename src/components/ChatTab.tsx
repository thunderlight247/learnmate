'use client';

// Interactive Q&A panel. It sends the user's question and the raw lecture text to the chat API.
import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatTabProps {
  rawText: string | null;
}

export default function ChatTab({ rawText }: ChatTabProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || !rawText || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage,
          context: rawText,
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to get answer');

      setMessages((prev) => [...prev, { role: 'assistant', content: data.answer }]);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${errorMsg}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full justify-between">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 p-6">
            <Bot className="h-12 w-12 mb-2 text-blue-500 opacity-60"/>
            <p className="font-medium text-gray-600">Ask LearnMate anything about your document!</p>
            <p className="text-xs text-gray-400 mt-1">e.g. &ldquo;Explain topic X simply&rdquo; or &ldquo;What is key term Y?&rdquo;</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`flex items-start space-x-3 ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                  <Bot className="h-5 w-5"/>
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-gray-100 text-gray-800 rounded-tl-none border border-gray-200'
                }`}
              >
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0">
                  <User className="h-4 w-4"/>
                </div>
              )}
            </div>
          ))
        )}
        {loading && (
          <div className="flex items-center space-x-3 text-gray-500 text-sm">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
              <Loader2 className="h-4 w-4 animate-spin"/>
            </div>
            <span className="italic">LearnMate is thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <form onSubmit={handleSend} className="flex space-x-2 pt-2 border-t border-gray-100">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about the material..."
          disabled={loading || !rawText}
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim() || !rawText}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center space-x-1"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4"/>}
          <span>Send</span>
        </button>
      </form>
    </div>
  );
}