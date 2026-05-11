import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { messages, model = 'llama-3.3-70b-versatile' } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      throw new Error('Messages array is required');
    }

    const apiKey = Deno.env.get('GROQ_API_KEY');
    const tavilyKey = Deno.env.get('TAVILY_KEY');

    if (!apiKey || !tavilyKey) {
      throw new Error('API keys are not set');
    }

    const lastMessage = messages[messages.length - 1].content;
    
    // Call Tavily API
    const tavilyRes = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyKey,
        query: lastMessage,
        search_depth: 'advanced',
        include_answer: true
      })
    });
    
    const tavilyData = await tavilyRes.json();
    const sources = tavilyData.results.map((r: { url: string, title: string, content: string }) => ({
      url: r.url,
      title: r.title,
      snippet: r.content
    }));

    const systemPrompt = `You are a helpful AI assistant. Use the following search results to answer the user's question accurately. Cite sources inline.

Search Results:
${sources.map((s: { url: string, title: string, snippet: string }, i: number) => `[${i+1}] Source: ${s.url}\nTitle: ${s.title}\nSnippet: ${s.snippet}`).join('\n\n')}`;

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: { role: string, content: string }) => ({ role: m.role, content: m.content }))
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: errorText }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`));
        
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const parsed = JSON.parse(line.slice(6));
                const content = parsed.choices[0]?.delta?.content || '';
                if (content) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`));
              } catch (e) {
                console.error('Error parsing SSE chunk:', e);
              }
            }
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    });

    return new Response(stream, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});