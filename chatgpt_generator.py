"""
ChatGPT integration for generating weekly content:
- 3 words for voice journaling
- 5-minute shadowing script
- Weekly speaking prompt with 5 words

Background Context:
This tool is part of a 24-month speaking practice roadmap designed to prepare the learner
for product management job interviews. The overall goal is to build English speaking fluency,
confidence, and the ability to articulate product management concepts clearly in interviews.

Phase 1: Daily Speaking Habits (0-6 months)
- Objective: Build consistency, real-time speaking flow, and natural delivery
- Focus: Establishing daily speaking habits and building foundational fluency

Activities:
1. Voice Journaling: Record 1 voice note per week (2-3 mins), using 3 generated words
2. Shadowing Practice: Daily practice with 5-minute audio scripts to improve pronunciation
   and natural speaking rhythm
3. Weekly Speaking Prompt: Practice speaking about PM concepts (3-5 mins), using 5 generated words

The learner is preparing for product management interviews in 24 months, so content should:
- Help build PM thinking and communication skills
- Focus on practical, useful vocabulary
- Progress appropriately over weeks/months
- Be engaging and motivating for daily practice
"""

import os
from config import OPENAI_API_KEY

# Load prompts from prompts.py if it exists, otherwise use defaults
try:
    from prompts import (
        BACKGROUND_CONTEXT,
        VOICE_JOURNALING_TOPICS_SYSTEM_PROMPT,
        VOICE_JOURNALING_TOPICS_USER_PROMPT,
        WEEKLY_PROMPT_WORDS_SYSTEM_PROMPT_EXTRA,
        WEEKLY_PROMPT_WORDS_USER_PROMPT,
        SHADOWING_SCRIPT_SYSTEM_PROMPT_EXTRA,
        SHADOWING_SCRIPT_USER_PROMPT,
        WEEKLY_PROMPT_SYSTEM_PROMPT_EXTRA,
        WEEKLY_PROMPT_USER_PROMPT,
    )
except ImportError:
    # Default prompts (used if prompts.py doesn't exist)
    BACKGROUND_CONTEXT = """You are helping a learner who is following a 24-month speaking practice roadmap to prepare for product management job interviews. 

Context:
- Goal: Prepare for PM job interviews in 24 months (currently in Phase 1: 0-6 months)
- Phase 1 Focus: Daily Speaking Habits - building consistency, real-time speaking flow, and natural delivery
- Learning approach: Progressive weekly practice with three main activities
- Target: Product management roles that require strong English communication skills

    The learner is committed to building speaking fluency and the ability to articulate PM concepts clearly. 
Content should be practical, engaging, and progressively challenging. Each week builds on previous practice."""
    
    # Default prompt components (can be customized in prompts.py)
    VOICE_JOURNALING_TOPICS_SYSTEM_PROMPT = """You are helping a learner practice daily voice journaling. Generate 7 unique topics (one for each day of the week) that are interesting, thought-provoking, and suitable for 2-3 minute voice recordings.

Topics should:
- Be natural, conversational prompts (not formal interview questions)
- Be engaging and relatable to everyday life
- Encourage personal reflection or storytelling
- Vary in type (memories, opinions, experiences, observations, hobbies, daily life, plans)
- Help build natural conversational fluency
- Feel universal and broadly relatable

AVOID: Formal interview-style questions, structured "Tell me about a time when..." prompts

Respond with a JSON object containing a 'topics' array with 7 topic strings."""
    
    VOICE_JOURNALING_TOPICS_USER_PROMPT = """Generate 7 unique daily topics for this week's voice journaling practice. Each topic should be interesting, natural, and help practice speaking spontaneously for 2-3 minutes about everyday life. Make them varied and engaging - not formal interview questions. Respond in JSON format: {"topics": ["topic 1", "topic 2", ..., "topic 7"]}"""
    
    WEEKLY_PROMPT_WORDS_SYSTEM_PROMPT_EXTRA = """You are generating 5 words for weekly speaking prompt practice focused on product management. These words will be used in a 3-5 minute speaking practice session where the learner discusses PM concepts, preparing for future job interviews.

IMPORTANT: Avoid words that have appeared in 3 or more consecutive recent weeks. It's fine if a word from 5 weeks ago comes back (that shows it's important), but avoid words that appeared week after week recently. The system will provide you with words that appeared 3+ consecutive weeks to avoid.

The words should be relevant to product management topics like: strategy, user experience, metrics, prioritization, problem-solving, stakeholder management, product development, user research, business analysis, or product launches.

For each word, provide: the word, its part of speech, and a brief context hint (one sentence) that helps the learner understand how to use it in PM contexts.
Respond with a JSON object containing a 'words' array, where each word is an object with 'word', 'part_of_speech', and 'hint' fields."""
    
    WEEKLY_PROMPT_WORDS_USER_PROMPT = """Generate 5 product management-related words for this week's speaking prompt practice. These words should help build PM vocabulary and can be naturally incorporated into a 3-5 minute speaking practice about PM concepts. Focus on practical PM terminology that will be useful in future interviews. Respond in JSON format: {"words": [{"word": "...", "part_of_speech": "...", "hint": "..."}, ...]}"""
    
    SHADOWING_SCRIPT_SYSTEM_PROMPT_EXTRA = """You are creating a 7-10 minute shadowing practice script in the style of a TED talk. This script will be converted to audio and used for daily shadowing practice to improve pronunciation, rhythm, and natural speaking flow.

CRITICAL LENGTH REQUIREMENT: The script MUST be approximately 875-1,250 words (spoken at ~125 words per minute = 7-10 minutes). This is essential - generate the full length script, not a summary.

IMPORTANT: Choose a DIFFERENT topic from previous weeks to avoid repetition and provide variety. The system will provide you with summaries of previous scripts' topics.

The script should be in TED talk style:
- Engaging, inspiring, and thought-provoking
- Educational content that teaches something interesting
- Clear structure with an introduction, main points, and conclusion
- Natural, conversational delivery style
- Varied sentence structures for engaging rhythm
- Topics can be: science, psychology, productivity, innovation, personal growth, technology, culture, history, creativity, or any inspiring educational content

The script should be interesting to speak aloud, have natural pauses, and help build speaking confidence through engaging content."""
    
    SHADOWING_SCRIPT_USER_PROMPT = """Generate a complete 7-10 minute shadowing practice script in TED talk style.

CRITICAL REQUIREMENTS:
1. The script MUST be 875-1,250 words (count your words to ensure this)
2. This is a FULL script, not a summary or outline
3. At 125 words per minute, 875-1,250 words = 7-10 minutes of speaking time
4. Write the complete script word-for-word as it would be spoken

SCRIPT STRUCTURE (write each section fully):
- Introduction (100-150 words): Hook the audience, introduce the topic
- Main Point 1 (200-250 words): First key idea with examples/stories
- Main Point 2 (200-250 words): Second key idea with examples/stories  
- Main Point 3 (200-250 words): Third key idea with examples/stories
- Main Point 4 (150-200 words): Fourth key idea with examples/stories (optional but encouraged for 10-minute talks)
- Conclusion (100-150 words): Summarize and leave with a thought

TED TALK STYLE:
- Inspiring, educational, engaging content
- Personal stories or examples to illustrate points
- Clear narrative flow
- Varied sentence lengths for natural rhythm
- Topic: Choose from science, psychology, productivity, innovation, personal growth, technology, culture, history, creativity

IMPORTANT: Count your words as you write. The final script MUST be between 875-1,250 words. Do not stop until you reach this word count. Write the full script now."""
    
    WEEKLY_PROMPT_SYSTEM_PROMPT_EXTRA = """You are creating a weekly speaking prompt for product management practice (3-5 minutes of speaking). This is part of a 24-month preparation journey where the learner is building PM thinking and communication skills.

IMPORTANT: Create a DIFFERENT prompt from previous weeks to avoid repetition and provide variety. The system will provide you with previous prompts to avoid.

The prompt should:
- Be related to product management (strategy, user experience, metrics, prioritization, problem-solving, stakeholder management, product development, etc.)
- Encourage 3-5 minutes of thoughtful speaking
- Help develop PM thinking and communication skills
- NOT be a job interview question, but rather a prompt that helps practice articulating PM concepts
- Be engaging, thought-provoking, and progressively challenging
- Help build confidence in speaking about PM topics
- Cover new PM topics or approaches that haven't been covered in recent weeks

The learner is in Phase 1 (0-6 months), focusing on building consistency and natural delivery, so the prompt should be approachable yet substantive."""
    
    WEEKLY_PROMPT_USER_PROMPT = """Generate a weekly speaking prompt for product management practice. The prompt should: 1) Be related to product management (e.g., strategy, user experience, metrics, prioritization, problem-solving, stakeholder management, product launches, user research), 2) Encourage 3-5 minutes of speaking, 3) Help develop PM thinking and communication skills for future interviews (in ~24 months), 4) NOT be a job interview question itself, but something that helps practice speaking about PM concepts in a natural way, 5) Be engaging and thought-provoking, appropriate for Phase 1 learning (building foundation and fluency). Make it something the learner can speak about naturally while incorporating PM vocabulary and concepts."""

try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    print("Warning: openai package not installed. Run: pip install openai")


def get_openai_client():
    """Get OpenAI client instance."""
    if not OPENAI_AVAILABLE:
        raise ImportError("openai package is not installed. Install it with: pip install openai")
    
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY is not set in environment variables or .env file")
    
    return OpenAI(api_key=OPENAI_API_KEY)


def generate_voice_journaling_topics(previous_topics=None, regenerate=False):
    """
    Generate 7 daily topics for voice journaling (one for each day of the week).
    
    Args:
        previous_topics: List of previous topics from past weeks to avoid repetition
        regenerate: If True, indicates this is a regeneration and should generate different content
    
    Returns:
        List of 7 daily topics (strings).
    """
    try:
        client = get_openai_client()
        
        user_prompt = VOICE_JOURNALING_TOPICS_USER_PROMPT
        
        if previous_topics:
            user_prompt += f"\n\nIMPORTANT: Avoid these topics from recent weeks: {', '.join(previous_topics[:20])}. Generate fresh, different topics."
        
        if regenerate:
            user_prompt += "\n\nNOTE: This is a regeneration - please generate COMPLETELY DIFFERENT topics from what was previously generated for this week."
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": VOICE_JOURNALING_TOPICS_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.9 if regenerate else 0.7,
            response_format={"type": "json_object"}
        )
        
        result = response.choices[0].message.content
        import json
        data = json.loads(result)
        
        if 'topics' in data and isinstance(data['topics'], list) and len(data['topics']) == 7:
            return data['topics']
        else:
            # Fallback topics
            return [
                "Describe your ideal weekend",
                "Talk about a recent challenge you overcame",
                "What motivates you to keep learning?",
                "Share a memorable experience from the past year",
                "Discuss a book, movie, or article that impacted you",
                "What are you grateful for today?",
                "Describe your goals for the next month"
            ]
    except Exception as e:
        print(f"Error generating voice journaling topics: {e}")
        return [
            "Describe your ideal weekend",
            "Talk about a recent challenge you overcame",
            "What motivates you to keep learning?",
            "Share a memorable experience from the past year",
            "Discuss a book, movie, or article that impacted you",
            "What are you grateful for today?",
            "Describe your goals for the next month"
        ]

def generate_weekly_prompt_words(previous_words=None, regenerate=False):
    """
    Generate 5 words to include in weekly speaking prompt practice.
    
    Args:
        previous_words: List of previous words from past weeks to avoid repetition
        regenerate: If True, indicates this is a regeneration and should generate different content
    
    Returns:
        List of 5 words with context/hints, focused on product management vocabulary.
    """
    try:
        client = get_openai_client()
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": f"""{BACKGROUND_CONTEXT}

{WEEKLY_PROMPT_WORDS_SYSTEM_PROMPT_EXTRA}"""
                },
                {
                    "role": "user",
                    "content": WEEKLY_PROMPT_WORDS_USER_PROMPT + (
                        f"\n\nIMPORTANT: Avoid these words that appeared in 3+ consecutive recent weeks: {previous_words}. "
                        f"It's fine if a word from 5+ weeks ago comes back (shows importance), but avoid words that appeared week after week recently."
                        if previous_words else ""
                    ) + (
                        "\n\nNOTE: This is a regeneration - please generate COMPLETELY DIFFERENT words from what was previously generated for this week."
                        if regenerate else ""
                    )
                }
            ],
            temperature=0.9 if regenerate else 0.7,  # Higher temperature for regeneration
            response_format={"type": "json_object"}
        )
        
        result = response.choices[0].message.content
        import json
        data = json.loads(result)
        
        # Extract words from the response
        if 'words' in data and isinstance(data['words'], list):
            return data['words']
        elif isinstance(data, list):
            return data
        else:
            # Fallback: try to find any array in the response
            for key in data:
                if isinstance(data[key], list):
                    return data[key]
            return []
            
    except Exception as e:
        print(f"Error generating weekly prompt words: {e}")
        # Return fallback words (5 PM-related words)
        return [
            {"word": "prioritize", "part_of_speech": "verb", "hint": "Decide what to focus on first"},
            {"word": "stakeholder", "part_of_speech": "noun", "hint": "Someone with interest in the product"},
            {"word": "metric", "part_of_speech": "noun", "hint": "A way to measure success"},
            {"word": "iterate", "part_of_speech": "verb", "hint": "Improve through repeated cycles"},
            {"word": "align", "part_of_speech": "verb", "hint": "Get everyone on the same page"}
        ]


def generate_shadowing_script(previous_scripts=None, regenerate=False):
    """
    Generate a 7-10 minute long shadowing practice script.
    
    Args:
        previous_scripts: List of previous script summaries/topics from past weeks to avoid repetition
        regenerate: If True, indicates this is a regeneration and should generate different content
    
    Returns:
        Script text approximately 7-10 minutes when spoken at normal pace.
    """
    try:
        client = get_openai_client()
        
        # Build regeneration-specific instructions
        regeneration_note = ""
        if regenerate and previous_scripts:
            # Get the current script that needs to be replaced
            current_script_summary = previous_scripts[0] if previous_scripts else ""
            regeneration_note = f"""

CRITICAL: This is a REGENERATION request. The current script for this week starts with:
"{current_script_summary[:200]}..."

You MUST generate a COMPLETELY DIFFERENT script with:
1. A DIFFERENT topic (not daily routines, productivity, or communication)
2. DIFFERENT opening (not "Welcome to today's shadowing practice")
3. DIFFERENT structure and content
4. A fresh, unique TED talk-style topic (science, psychology, innovation, culture, history, creativity, etc.)
5. Full 875-1,250 words with COMPLETELY NEW content

DO NOT use any part of the existing script. Create something entirely new."""
        elif regenerate:
            regeneration_note = "\n\nCRITICAL: This is a REGENERATION request. Generate a COMPLETELY NEW and DIFFERENT script. Do not reuse any previous content."
        
        # Try generating the script, with retry if too short
        max_retries = 2
        for attempt in range(max_retries + 1):
            user_prompt = (
                SHADOWING_SCRIPT_USER_PROMPT +
                (
                    f"\n\nIMPORTANT: Choose a DIFFERENT topic from previous weeks to avoid repetition. "
                    f"Previous scripts covered: {len(previous_scripts or [])} topics. "
                    f"Recent topics: {', '.join([s[:50] + '...' if len(s) > 50 else s for s in (previous_scripts or [])[:3]])}"
                    if previous_scripts else ""
                ) + 
                regeneration_note +
                ("" if attempt == 0 else "\n\nNOTE: The previous response was too short. Generate the COMPLETE 875-1,250 word script. Do not summarize - write every word that would be spoken in a 7-10 minute talk. Count your words to ensure you reach 875-1,250 words.")
            )
            
            response = client.chat.completions.create(
                model="gpt-4o",  # Using gpt-4o for better length compliance
                messages=[
                    {
                        "role": "system",
                        "content": f"""{BACKGROUND_CONTEXT}

{SHADOWING_SCRIPT_SYSTEM_PROMPT_EXTRA}"""
                    },
                    {
                        "role": "user",
                        "content": user_prompt
                    }
                ],
                temperature=0.95 if regenerate else 0.8,  # Even higher temperature for regeneration
                max_tokens=5000  # Increased for 7-10 minute scripts (875-1,250 words)
            )
            
            script = response.choices[0].message.content.strip()
            word_count = len(script.split())
            
            # Check if this is the fallback script (only during regeneration)
            # The fallback script has a specific signature: starts with "Welcome to today's shadowing practice"
            # and mentions "daily routines and productivity"
            is_fallback_script = (
                "Welcome to today's shadowing practice" in script[:100] and
                "daily routines and productivity" in script[:500]
            )
            
            if regenerate and is_fallback_script:
                print(f"[WARNING] Generated script matches fallback during regeneration. Word count: {word_count}")
                if attempt < max_retries:
                    print("[RETRY] Retrying with stronger regeneration instructions...")
                    regeneration_note = "\n\nCRITICAL REGENERATION: The previous response matched the fallback script. You MUST generate a COMPLETELY NEW script with:\n1. A DIFFERENT opening (NOT 'Welcome to today's shadowing practice')\n2. A DIFFERENT topic (NOT daily routines, productivity, or communication)\n3. A fresh TED talk topic (science, innovation, culture, psychology, history, etc.)\n4. Unique content throughout the entire script\n5. Full 875-1,250 words\n\nCreate something entirely original and different."
                    continue
                else:
                    print("[ERROR] Regeneration failed - fallback script generated. Raising exception...")
                    raise Exception("Failed to regenerate script - ChatGPT returned fallback content. Please try again.")
            
            # Also check if this matches the current script exactly during regeneration
            # Only check the first 100 characters to avoid false positives
            if regenerate and previous_scripts and len(previous_scripts) > 0:
                current_script_start = previous_scripts[0][:100] if previous_scripts[0] else ""
                generated_script_start = script[:100] if script else ""
                if current_script_start and generated_script_start and current_script_start.strip() == generated_script_start.strip():
                    print(f"[WARNING] Generated script matches current script exactly during regeneration.")
                    if attempt < max_retries:
                        print("[RETRY] Retrying with stronger regeneration instructions...")
                        regeneration_note = "\n\nCRITICAL REGENERATION: The previous response was IDENTICAL to the existing script. You MUST generate a COMPLETELY NEW and DIFFERENT script with different content, topic, and structure."
                        continue
                    else:
                        print("[ERROR] Regeneration failed - identical script generated. Raising exception...")
                        raise Exception("Failed to regenerate script - ChatGPT returned identical content. Please try again.")
            
            # If script is acceptable length (800+ words) or this is the last attempt, return it
            if word_count >= 800 or attempt >= max_retries:
                if word_count < 875:
                    print(f"Warning: Generated script is {word_count} words (target: 875-1,250 words). Consider regenerating.")
                elif word_count > 1250:
                    print(f"Warning: Generated script is {word_count} words (target: 875-1,250 words). It may be too long.")
                
                return script
            else:
                # Script too short - retrying
                retry_count += 1
                continue
        
        return script
        
    except Exception as e:
        print(f"Error generating shadowing script: {e}")
        import traceback
        traceback.print_exc()
        # Re-raise the exception instead of returning fallback during regeneration
        if regenerate:
            raise Exception(f"Failed to regenerate shadowing script: {str(e)}")
        # Return fallback script only for initial generation
        return """Welcome to today's shadowing practice. This script is designed to help you improve your English speaking skills through repetition and imitation.

Shadowing is a powerful technique where you listen to native speakers and try to imitate their rhythm, intonation, and pronunciation. Today, we'll practice with a script about daily routines and productivity.

Let's begin. First, let's talk about morning routines. Many successful people start their day with a clear plan. They wake up early, exercise, and set intentions for the day ahead. This helps them stay focused and motivated throughout the day.

Next, let's discuss the importance of communication. Good communication skills are essential in both personal and professional settings. When we express ourselves clearly, we build stronger relationships and achieve better results.

Finally, remember that practice makes perfect. The more you speak English, the more confident you'll become. Keep practicing daily, and you'll see significant improvement over time."""


def generate_weekly_prompt(previous_prompts=None, regenerate=False):
    """
    Generate a weekly speaking prompt for practice.
    
    Args:
        previous_prompts: List of previous prompts from past weeks to avoid repetition
        regenerate: If True, indicates this is a regeneration and should generate different content
    
    Returns:
        A prompt that encourages 3-5 minutes of speaking.
        Focused on product management topics to prepare for job interviews in 24 months.
    """
    try:
        client = get_openai_client()
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": f"""{BACKGROUND_CONTEXT}

{WEEKLY_PROMPT_SYSTEM_PROMPT_EXTRA}"""
                },
                {
                    "role": "user",
                    "content": WEEKLY_PROMPT_USER_PROMPT + (
                        f"\n\nIMPORTANT: Create a DIFFERENT prompt from previous weeks. "
                        f"Previous prompts ({len(previous_prompts or [])}): {', '.join([p[:80] + '...' if len(p) > 80 else p for p in (previous_prompts or [])[:3]])}. "
                        f"Choose a new PM topic or approach that hasn't been covered recently."
                        if previous_prompts else ""
                    ) + (
                        "\n\nNOTE: This is a regeneration - please generate a COMPLETELY DIFFERENT prompt from what was previously generated for this week."
                        if regenerate else ""
                    )
                }
            ],
            temperature=0.9 if regenerate else 0.8,  # Higher temperature for regeneration
            max_tokens=250
        )
        
        prompt = response.choices[0].message.content.strip()
        return prompt
        
    except Exception as e:
        print(f"Error generating weekly prompt: {e}")
        # Return fallback prompts related to product management
        fallback_prompts = [
            "Imagine you're a product manager launching a new feature. Walk through how you would gather user feedback and decide whether to iterate or pivot.",
            "Explain how you would balance user needs with business goals when making product decisions. Use a specific example to illustrate your thinking.",
            "Describe your approach to prioritizing features when resources are limited. What framework would you use and why?",
            "Talk about a product you use daily and analyze what makes it successful from a product management perspective.",
            "Imagine you're explaining a complex product decision to stakeholders with different priorities. How would you structure your explanation?"
        ]
        import random
        return random.choice(fallback_prompts)

