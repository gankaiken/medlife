# Copy this file to `backend/.env.local` and fill in the values.
# The backend reads these at startup — restart the server after editing.
#
# WARNING: .env.local is gitignored. Never commit API keys.

# Anthropic API key for the Managed Agent (medkit-attending). Server-side only —
# never set this in a VITE_* variable and never return it to the browser.
ANTHROPIC_API_KEY=

# Cached IDs for the persistent Managed Agent + Environment.
# First run: leave these blank, start the server, POST /agent/bootstrap,
# then paste the returned `agent_id` / `environment_id` back here and
# restart. Subsequent runs are no-ops.
MEDKIT_AGENT_ID=
MEDKIT_ENV_ID=

# LiveKit Cloud — https://cloud.livekit.io. Used by the FastAPI server
# to mint room JWTs and by voice_agent.py to register as a worker.
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

# Deepgram — https://deepgram.com. Streaming STT inside the voice worker.
DEEPGRAM_API_KEY=

# Cartesia — https://cartesia.ai. Streaming TTS inside the voice worker.
CARTESIA_API_KEY=
