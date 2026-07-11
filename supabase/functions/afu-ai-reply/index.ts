import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const ENGAGERA_ENDPOINT = 'https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1/chat';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const ENGAGERA_API_KEY = Deno.env.get('ENGAGERA_API_KEY');
    if (!ENGAGERA_API_KEY) throw new Error('ENGAGERA_API_KEY not configured');

    const body = await req.json();

    if (body.audioUrl) {
      return new Response(JSON.stringify({ error: 'Audio transcription not supported — use transcribe-audio function' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { messages, max_tokens } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages array required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const reqBody: Record<string, any> = {
      model: 'auto',
      messages
    };
    if (max_tokens) reqBody.max_tokens = max_tokens;

    const response = await fetch(ENGAGERA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENGAGERA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reqBody)
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Engagera error:', response.status, err);
      if (response.status === 429) return new Response(JSON.stringify({ error: 'Rate limited, try again shortly' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
      throw new Error(`Engagera error: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.message?.content;
    if (!reply) throw new Error('Empty response from Engagera');

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('afu-ai-reply error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
