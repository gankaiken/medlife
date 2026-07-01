"""Grand Rounds — LiveKit voice agent (Patient persona, real-time).

Runs as a separate process from the FastAPI server. Joins every LiveKit
room created by the frontend and roleplays the patient over WebRTC:

    Browser mic → Deepgram Nova-3 STT → Claude Haiku 4.5 → Cartesia Sonic-2 TTS → Browser

The persona prompt and voice ID come from room metadata (set by the
backend `/voice/token` endpoint when the room is created), so this
worker has zero patient-specific knowledge — TS owns that.

Run:
    backend/.venv-voice/Scripts/python.exe backend/voice_agent.py dev
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import Agent, AgentSession, RoomInputOptions, WorkerOptions, cli
from livekit.plugins import anthropic, cartesia, deepgram, silero

# Load .env.local first (project convention), .env as fallback.
_BACKEND = Path(__file__).resolve().parent
load_dotenv(_BACKEND / ".env.local")
load_dotenv(_BACKEND / ".env")

logger = logging.getLogger("medkit.voice-agent")
logger.setLevel(logging.INFO)


# Cartesia Sonic-2 voice IDs — verified via /voices API (gender attr).
# 2 male + 2 female English voices, picked deterministically per case.
VOICE_IDS = {
    "M": [
        "d709a7e8-9495-4247-aef0-01b3207d11bf",  # Donny - Steady Presence
        "ea7c252f-6cb1-45f5-8be9-b4f6ac282242",  # Logan - Approachable Friend
    ],
    "F": [
        "cec7cae1-ac8b-4a59-9eac-ec48366f37ae",  # Haley - Engaging Friend
        "ea93f57f-7c71-4d79-aeaa-0a39b150f6ca",  # Diana - Gentle Mom
    ],
}

DEFAULT_VOICE = VOICE_IDS["M"][0]
DEFAULT_INSTRUCTIONS = (
    "You are a patient speaking to a doctor. Keep replies to 1-2 short spoken "
    "sentences. Output spoken dialogue only — no stage directions, no asterisks."
)
DEFAULT_INITIAL = "Hi doc."


def _hash_str(s: str) -> int:
    """FNV-1a, mirrors src/voice/patientPersona.ts so TS-side and Python-side
    pick the same voice slot for the same case ID if frontend chose to defer."""
    h = 0x811C9DC5
    for ch in s:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def pick_voice(case_id: str, gender: str) -> str:
    pool = VOICE_IDS.get(gender.upper()) or VOICE_IDS["M"]
    return pool[_hash_str(case_id) % len(pool)]


def parse_metadata(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("room metadata is not valid JSON: %r", raw[:120])
        return {}


async def entrypoint(ctx: agents.JobContext):
    await ctx.connect()

    meta = parse_metadata(ctx.room.metadata)
    case_id = meta.get("caseId") or meta.get("case_id") or "unknown"
    speaker_gender = (meta.get("voiceGender") or meta.get("gender") or "M").upper()
    system_prompt = meta.get("systemPrompt") or DEFAULT_INSTRUCTIONS
    initial_line = meta.get("initialLine") or DEFAULT_INITIAL

    voice_id = meta.get("voiceId") or pick_voice(case_id, speaker_gender)

    logger.info(
        "joining room=%s case=%s gender=%s voice=%s",
        ctx.room.name, case_id, speaker_gender, voice_id,
    )

    session = AgentSession(
        stt=deepgram.STT(model="nova-3", language="en"),
        llm=anthropic.LLM(model="claude-haiku-4-5-20251001", temperature=0.8),
        tts=cartesia.TTS(model="sonic-2", voice=voice_id),
        vad=silero.VAD.load(),
    )

    agent = Agent(instructions=system_prompt)

    await session.start(
        agent=agent,
        room=ctx.room,
        room_input_options=RoomInputOptions(),
    )

    # Frontend signals end-of-visit by publishing a small JSON payload to
    # the room data channel. We speak ONE short farewell out loud via
    # session.say (direct TTS — no LLM round-trip) so the patient actually
    # says goodbye before the room is torn down. Without this the audio
    # cuts mid-sentence on dispatch.
    FAREWELLS = [
        "Thank you, doctor. Take care.",
        "Okay, thanks doc. Goodbye.",
        "Thanks for your help. Bye.",
        "Alright, take care. Goodbye.",
    ]
    farewell_pick = FAREWELLS[_hash_str(case_id) % len(FAREWELLS)]

    # RPC method invoked by the doctor's browser when they click "Dispatch".
    # Speaks ONE short goodbye via direct TTS so the patient actually says
    # bye out loud before the room is torn down.
    @ctx.room.local_participant.register_rpc_method("farewell")
    async def _on_farewell(data: rtc.RpcInvocationData) -> str:
        logger.info("rpc farewell invoked by %s", data.caller_identity)
        try:
            session.say(farewell_pick)
            logger.info("farewell speaking: %r", farewell_pick)
        except Exception as e:
            logger.exception("session.say failed: %s", e)
            return "error"
        return "ok"

    # Patient blurts their chief complaint as soon as the doctor walks up.
    await session.generate_reply(
        instructions=(
            f'Stay strictly in character. Speak this opening line, naturally, '
            f'as the patient (or accompanying parent for pediatric cases) '
            f'arriving in the room: "{initial_line}". One short sentence only.'
        ),
    )


if __name__ == "__main__":
    # `agent_name="medkit-voice"` opts the worker out of automatic dispatch and
    # into explicit-by-name dispatch. Backend rooms are created with
    # `RoomAgentDispatch(agent_name="medkit-voice")` so this matches.
    cli.run_app(
        WorkerOptions(entrypoint_fnc=entrypoint, agent_name="medkit-voice")
    )
