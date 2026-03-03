const questions = {
    "start": {
        "text": "What's your name?",
        "answers": [
            { "text": "James Dracup", "next": "james" },
            { "text": "It's not James Dracup", "next": "doing" }
        ]
    },
    "doing": {
        "text": "What are you doing?",
        "answers": [
            { "text": "Skiing", "next": "not-faff" },
            { "text": "Waiting at the bottom of a lift", "next": "bindings" },
            { "text": "Waiting at the top of a chairlift", "next": "bindings" },
            { "text": "On a chairlift", "next": "planning" },
            { "text": "Weeing", "next": "could-you" },
            { "text": "Fiddling with my boots", "next": "could-you" },
            { "text": "In the chalet", "next": "ready-for-next" }
        ]
    },
    "bindings": {
        "text": "Do you need a wee / to do up your boots / piss about with your binding?",
        "answers": [
            { "text": "Yes", "next": "now" },
            { "text": "No", "next": "planning" }
        ]
    },
    "now": {
        "text": "Could you do that now?",
        "answers": [
            { "text": "I could but...", "next": "non-parallel-faff" },
            { "text": "Yes", "next": "and-youre-going-to" },
            { "text": "No", "next": "not-faff" }
        ]
    },
    "and-youre-going-to": {
        "text": "And you're going to?",
        "answers": [
            { "text": "Yes", "next": "faff-avoidance" },
            { "text": "No", "next": "faff" }
        ]
    },
    "could-you": {
        "text": "Could you have done it earlier?",
        "answers": [
            { "text": "Yes", "next": "faff" },
            { "text": "No", "next": "essential" }
        ]
    },
    "essential": {
        "text": "Is it utterly essential?",
        "answers": [
            { "text": "Yes", "next": "are-you-sure" },
            { "text": "No", "next": "you-know" }
        ]
    },
    "are-you-sure": {
        "text": "Are you sure?",
        "answers": [
            { "text": "Yes", "next": "planned" },
            { "text": "No", "next": "faff" }
        ]
    },
    "planned": {
        "text": "Did you plan this to reduce faff?",
        "answers": [
            { "text": "Yes", "next": "not-faff" },
            { "text": "No", "next": "faff" }
        ]
    },
    "planning": {
        "text": "Are you planning the next run?",
        "answers": [
            { "text": "Yes", "next": "not-faff" },
            { "text": "No", "next": "not-team" }
        ]
    },
    "ready-for-next": {
        "text": "Are you ready for the next activity?",
        "answers": [
            { "text": "Yes", "next": "not-faff" },
            { "text": "No", "next": "potential" }
        ]
    },
    "james": {
        "text": "You are Lord of all faff",
        "answer": "You're faffing",
        "type": "danger"
    },
    "faff-avoidance": {
        "text": "This is the true path to enlightenment",
        "answer": "You're avoiding faff",
        "type": "success"
    },
    "non-parallel-faff": {
        "text": "Faff costs lives",
        "answer": "You are faffing",
        "type": "danger"
    },
    "not-faff": {
        "text": "Great work.",
        "answer": "That's not faff!",
        "type": "success"
    },
    "you-know": {
        "text": "You know what you did",
        "answer": "You're faffing",
        "type": "danger"
    },
    "not-team": {
        "text": "You're just not a team player",
        "answer": "You're faffing",
        "type": "danger"
    },
    "faff": {
        "text": "Classic faff.",
        "answer": "You're faffing",
        "type": "danger"
    },
    "potential": {
        "text": "Just watch it right?",
        "answer": "Erm...",
        "type": "warning"
    }
};
