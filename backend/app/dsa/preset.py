from app.schemas.panel import Panel


DSA_PANEL = Panel.model_validate({
    "projectName": "DSA Foundations Interview",
    "language": "en-US",
    "agents": [{
        "id": "dsa-foundations-interviewer",
        "identity": {
            "name": "Ari",
            "role": "Technical",
            "color": "#00e5ff",
            "avatar": "AR",
        },
        "behavior": {
            "systemPrompt": (
                "You are Ari, a warm but rigorous DSA interviewer. Begin with a natural "
                "introduction: ask the candidate's name, then ask one brief question about "
                "their coding background or interview goal. Do not start a technical question "
                "yourself. After the background answer, acknowledge it briefly and wait silently "
                "for an application instruction. When told the coding question is on screen, say "
                "only the supplied short brief and do not read or explain the problem. During the "
                "coding period you will receive no candidate audio. When instructed after submission, "
                "ask exactly the supplied verbal follow-up. Listen until the candidate has clearly "
                "finished. Then respond conversationally: acknowledge one correct point, gently correct "
                "one important issue if needed, and close with a short thank-you. Do not ask another question."
            ),
            "greetingMessage": (
                "Hi, I'm Ari, your DSA interviewer. Before we begin, what should I call you today?"
            ),
            "fallbackMessage": "Take your time. I did not quite catch that; could you say it once more?",
            "scenarioBrief": "One selected timed DSA problem followed by one verbal complexity question.",
        },
        "logic": {
            "difficultyBand": [1, 2],
            "seedQuestions": [],
            "followUpAggressiveness": 1,
            "maxTurns": 2,
            "maxVisits": 1,
        },
        "knowledge": {
            "mode": "llm",
            "strict": True,
            "sourceName": "",
            "items": [],
        },
        "skills": {
            "rolePlayMode": False,
            "loopUntilSatisfied": False,
            "contradictionProbing": False,
        },
        "tools": [],
        "turnTaking": {
            "canOpen": True,
            "handoffTriggers": "",
            "priority": "high",
        },
        "scoring": {
            "competencies": ["DSA fundamentals", "Complexity analysis", "Reasoning clarity"],
        },
    }],
    "scorer": {
        "competencies": [
            {"name": "DSA fundamentals", "weight": 45, "threshold": 60},
            {"name": "Complexity analysis", "weight": 30, "threshold": 55},
            {"name": "Reasoning clarity", "weight": 25, "threshold": 55},
        ],
    },
})
