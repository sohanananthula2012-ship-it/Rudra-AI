# Plan: Implement Manual Web Search Trigger with Tavily Fallback

## Context
The current manual web search trigger is not working as expected when toggled. The user wants to:
1. Keep the manual toggle for web search.
2. Replace the current DuckDuckGo search implementation with Tavily API.
3. Ensure that when the search toggle is ON, the application uses Tavily to fetch search results and feeds them to the model.
4. The user will provide the `TAVILY_KEY` via the secret management tool.

## Implementation Steps

### 1. Update Search Edge Function (`supabase/functions/search/index.ts`)
- Replace the DuckDuckGo scraping logic with a call to the Tavily API (`https://api.tavily.com/search`).
- Use the `TAVILY_KEY` secret from `Deno.env.get('TAVILY_KEY')`.
- Ensure the function returns the search results in a format the frontend expects.

### 2. Update Frontend Logic (`src/pages/Index.tsx`)
- Verify that `handleSubmit` correctly routes to the `search` function when `useSearch` is true.
- Ensure the `sendMessage` function correctly handles the response from the `search` function.

### 3. Verification
- User will add `TAVILY_KEY` via the secret tool.
- Toggle search ON.
- Ask "Who is the current president of India?".
- Verify the search function is called, Tavily is used, and the model provides an accurate, grounded response.
