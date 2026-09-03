from app.schemas.job_panel import JobPanelPreset


SDE_PANEL = JobPanelPreset.model_validate({
    "slug": "sde",
    "version": 1,
    "jobFamily": "Software Engineering",
    "title": "Software Development Engineer Panel",
    "description": (
        "A realistic three-interviewer panel covering coding, system design, "
        "and behavioural communication in one call."
    ),
    "status": "active",
    "panel": {
        "projectName": "SDE Interview Panel",
        "language": "en-US",
        "agents": [
            {
                "id": "sde-dsa",
                "identity": {"name": "Ari", "role": "Technical", "color": "#00E5FF", "avatar": "AR"},
                "behavior": {
                    "systemPrompt": (
                        "You are Ari, the DSA interviewer on a three-person SDE panel. Only speak when "
                        "the panel coordinator gives you the floor. Greet the candidate warmly and ask "
                        "their name and one brief background question. The application, not you, selects "
                        "and displays the coding problem. Never read the full written problem aloud. During "
                        "coding stay silent. After submission ask the supplied complexity or edge-case "
                        "follow-up, listen to the complete answer, then give a concise professional response."
                    ),
                    "greetingMessage": (
                        "Hello, welcome to your SDE panel interview. I'm Ari and I'll begin with the coding "
                        "round. Before we start, what should we call you today?"
                    ),
                    "fallbackMessage": "I didn't catch that fully. Please take your time and say it again.",
                    "scenarioBrief": "One controlled-random written DSA problem and a verbal follow-up.",
                },
                "logic": {"difficultyBand": [2, 4], "seedQuestions": [], "followUpAggressiveness": 3, "maxTurns": 3, "maxVisits": 1},
                "skills": {"rolePlayMode": False, "loopUntilSatisfied": False, "contradictionProbing": False},
                "tools": ["dsa_question_bank", "code_runner"],
                "turnTaking": {"canOpen": True, "handoffTriggers": "coding and verbal follow-up complete", "priority": "high"},
                "scoring": {"competencies": ["Algorithmic correctness", "Complexity analysis", "Problem solving"], "weight": 0.45},
            },
            {
                "id": "sde-system-design",
                "identity": {"name": "Maya", "role": "Technical", "color": "#8B5CF6", "avatar": "MY"},
                "behavior": {
                    "systemPrompt": (
                        "You are Maya, the system-design interviewer on a three-person SDE panel. Speak only "
                        "when the coordinator gives you the floor. Ask one scoped design problem, clarify "
                        "requirements, and probe architecture, data model, scalability, reliability, and "
                        "trade-offs. Respond to what the candidate actually said and never deliver a lecture."
                    ),
                    "greetingMessage": "",
                    "fallbackMessage": "Could you repeat the last part of your design reasoning?",
                    "scenarioBrief": "A verbal system-design discussion with two adaptive follow-ups.",
                },
                "logic": {
                    "difficultyBand": [2, 4],
                    "seedQuestions": [
                        "Design a URL shortening service that handles high read traffic.",
                        "Design a notification service for email, SMS, and push delivery.",
                        "Design the backend for a real-time collaborative document editor.",
                        "Design a rate limiter for a public API used across multiple regions.",
                        "Design a scalable job scheduler for delayed and recurring work.",
                    ],
                    "followUpAggressiveness": 6, "maxTurns": 3, "maxVisits": 1,
                },
                "skills": {"rolePlayMode": False, "loopUntilSatisfied": True, "contradictionProbing": True},
                "tools": [],
                "turnTaking": {"canOpen": False, "handoffTriggers": "system-design round complete", "priority": "medium"},
                "scoring": {"competencies": ["Requirements", "Architecture", "Scalability and trade-offs"], "weight": 0.35},
            },
            {
                "id": "sde-hr",
                "identity": {"name": "Rhea", "role": "Behavioural", "color": "#F472B6", "avatar": "RH"},
                "behavior": {
                    "systemPrompt": (
                        "You are Rhea, the HR and communication interviewer on a three-person SDE panel. "
                        "Speak only when the coordinator gives you the floor. Ask behavioural questions and "
                        "follow up naturally on the candidate's example. Look for clear STAR structure, "
                        "ownership, collaboration, conflict handling, and self-awareness. Never ask about "
                        "protected personal characteristics or irrelevant private information."
                    ),
                    "greetingMessage": "",
                    "fallbackMessage": "Please continue; I want to make sure I heard your full example.",
                    "scenarioBrief": "A verbal behavioural round assessing communication and collaboration.",
                },
                "logic": {
                    "difficultyBand": [1, 3],
                    "seedQuestions": [
                        "Tell me about a difficult technical disagreement and how you resolved it.",
                        "Describe a time you took ownership of a project that was going off track.",
                        "Tell me about a mistake you made and what changed in how you work afterward.",
                        "Describe a time you had to explain a complex technical issue to a non-technical person.",
                        "Tell me about a time priorities changed suddenly and how you responded.",
                    ],
                    "followUpAggressiveness": 4, "maxTurns": 3, "maxVisits": 1,
                },
                "skills": {"rolePlayMode": False, "loopUntilSatisfied": True, "contradictionProbing": True},
                "tools": [],
                "turnTaking": {"canOpen": False, "handoffTriggers": "panel interview complete", "priority": "low"},
                "scoring": {"competencies": ["Communication clarity", "Ownership", "Collaboration"], "weight": 0.20},
            },
        ],
        "scorer": {"competencies": [
            {"name": "Algorithmic correctness", "weight": 25, "threshold": 0.6},
            {"name": "Complexity analysis", "weight": 10, "threshold": 0.6},
            {"name": "Problem solving", "weight": 10, "threshold": 0.6},
            {"name": "Requirements", "weight": 10, "threshold": 0.6},
            {"name": "Architecture", "weight": 15, "threshold": 0.6},
            {"name": "Scalability and trade-offs", "weight": 10, "threshold": 0.6},
            {"name": "Communication clarity", "weight": 8, "threshold": 0.6},
            {"name": "Ownership", "weight": 6, "threshold": 0.6},
            {"name": "Collaboration", "weight": 6, "threshold": 0.6},
        ]},
    },
    "stages": [
        {"id": "dsa", "title": "DSA & Coding", "agentId": "sde-dsa", "order": 1, "kind": "hybrid_coding", "durationMinutes": 35, "description": "Random written coding problem plus verbal analysis."},
        {"id": "system-design", "title": "System Design", "agentId": "sde-system-design", "order": 2, "kind": "verbal", "durationMinutes": 25, "description": "Architecture discussion with adaptive probing."},
        {"id": "hr", "title": "HR & Communication", "agentId": "sde-hr", "order": 3, "kind": "verbal", "durationMinutes": 15, "description": "Behavioural and communication assessment."},
    ],
})


JOB_PANEL_PRESETS = {SDE_PANEL.slug: SDE_PANEL}
