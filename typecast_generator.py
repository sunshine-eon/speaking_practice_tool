"""
Typecast.ai API integration for text-to-speech generation.

API Documentation:
- Main API: https://typecast.ai/api/v1/text-to-speech (as mentioned in the user-provided docs)
- Voices endpoint: https://typecast.ai/api/v1/voices
- Authentication: Uses X-API-KEY header

Note: The /api/me endpoint (account info) returns 403 with current authentication method.
This doesn't affect TTS functionality which works correctly with X-API-KEY.
"""

import os
import requests
from config import TYPECAST_API_KEY

# Typecast.ai API endpoints
TYPECAST_API_BASE = "https://api.typecast.ai/v1"
TYPECAST_ACCOUNT_API_BASE = "https://typecast.ai/api"

# Default voice ID (Jennifer's voice)
DEFAULT_VOICE_ID = "tc_601944fb9089786f78c285ef"


def check_api_key():
    """Check if Typecast API key is configured."""
    if not TYPECAST_API_KEY:
        raise ValueError("TYPECAST_API_KEY is not set in config")
    return TYPECAST_API_KEY


def get_available_voices(language='eng'):
    """
    Get available voices from Typecast.ai API.
    
    Args:
        language: Language code - if 'eng', filters for English names only
    
    Returns:
        List of voice dictionaries with voice_id, voice_name, model, and emotions.
    """
    try:
        api_key = check_api_key()
        
        voices_url = f"{TYPECAST_API_BASE}/voices"
        api_headers = {
            'X-API-KEY': api_key
        }
        
        response = requests.get(voices_url, headers=api_headers)
        
        if response.status_code == 200:
            data = response.json()
            # API returns a list of voice objects directly
            voices = data if isinstance(data, list) else []
            
            # Filter for English voices if requested
            if language == 'eng':
                # Professional adult English voices (excluding kid, elderly, game/anime voices)
                # Selected for clear pronunciation suitable for language learning
                adult_professional_names = {
                    # Female voices - professional, clear, adult
                    'Rachel', 'Sarah', 'Emily', 'Jessica', 'Michelle', 
                    'Melissa', 'Sophia', 'Olivia', 'Charlotte', 'Elizabeth', 'Victoria',
                    'Kate', 'Lucy', 'Anna', 'Maria',
                    
                    # Male voices - professional, clear, adult
                    'Michael', 'David', 'James', 'Robert', 'Matthew', 'Andrew', 
                    'Kevin', 'Brian', 'George', 'Daniel', 
                    'Ryan', 'Justin', 'Henry', 'Joshua', 'Jack', 'Dylan'
                }
                
                voices = [v for v in voices if v.get('voice_name', '').split()[0] in adult_professional_names]
            
            # Format voices with 'name' key for consistency with frontend
            formatted_voices = []
            for v in voices:
                formatted_voices.append({
                    'voice_id': v.get('voice_id'),
                    'name': v.get('voice_name'),
                    'model': v.get('model'),
                    'emotions': v.get('emotions', [])
                })
            
            # Sort alphabetically by name
            formatted_voices.sort(key=lambda x: x.get('name', ''))
            
            return formatted_voices
        else:
            print(f"Error getting voices: {response.status_code} - {response.text}")
            return []
            
    except Exception as e:
        print(f"Error getting voices: {e}")
        import traceback
        traceback.print_exc()
        return []


def split_text_into_chunks(text, max_chars=1800):
    """
    Split text into chunks that respect sentence boundaries.
    Typecast.ai has a 2000 char limit, so we use 1800 to be safe.
    
    Args:
        text: The text to split
        max_chars: Maximum characters per chunk (default 1800, leaving buffer)
    
    Returns:
        List of text chunks
    """
    # Split by sentences (simple approach - split on ., !, ?)
    import re
    sentences = re.split(r'([.!?]\s+)', text)
    
    chunks = []
    current_chunk = ""
    
    for i in range(0, len(sentences), 2):
        sentence = sentences[i]
        separator = sentences[i + 1] if i + 1 < len(sentences) else ""
        full_sentence = sentence + separator
        
        # If adding this sentence would exceed the limit, start a new chunk
        if len(current_chunk) + len(full_sentence) > max_chars:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = full_sentence
        else:
            current_chunk += full_sentence
    
    # Add the last chunk
    if current_chunk:
        chunks.append(current_chunk.strip())
    
    return chunks


def generate_shadowing_audio(script_text, voice_id=None, output_path=None, speed=1.0):
    """
    Generate audio from script text using Typecast.ai.
    Handles long scripts by splitting them into chunks (Typecast limit: 2000 chars).
    
    Args:
        script_text: The script text to convert to audio
        voice_id: Optional voice ID (if None, uses a default voice)
        output_path: Optional path to save audio file (if None, returns audio bytes)
        speed: Audio speed/tempo (default 1.0, range 0.5-2.0)
    
    Returns:
        If output_path is provided, returns the path. Otherwise returns audio bytes.
        On error, returns None.
    """
    try:
        api_key = check_api_key()
        
        # If no voice_id provided, use Jennifer as the default voice
        if voice_id is None:
            voice_id = DEFAULT_VOICE_ID
        
        # Check if script is too long and needs to be chunked
        if len(script_text) > 1900:  # Leave buffer below 2000 char limit
            chunks = split_text_into_chunks(script_text, max_chars=1800)
            
            # Generate audio for each chunk
            audio_parts = []
            for i, chunk in enumerate(chunks):
                chunk_audio = generate_shadowing_audio(chunk, voice_id=voice_id, output_path=None, speed=speed)
                if chunk_audio:
                    audio_parts.append(chunk_audio)
                else:
                    print(f"Error: Failed to generate audio for chunk {i+1}/{len(chunks)}")
                    return None
            
            # Concatenate WAV audio parts properly
            # WAV files have headers, so we need to merge them correctly
            import wave
            import io
            
            if output_path:
                # Merge WAV files directly to output
                with wave.open(output_path, 'wb') as output_wav:
                    for i, audio_data in enumerate(audio_parts):
                        with wave.open(io.BytesIO(audio_data), 'rb') as input_wav:
                            if i == 0:
                                # Set parameters from first file
                                output_wav.setparams(input_wav.getparams())
                            # Write audio frames
                            output_wav.writeframes(input_wav.readframes(input_wav.getnframes()))
                return output_path
            else:
                # Return combined audio bytes
                output_buffer = io.BytesIO()
                with wave.open(output_buffer, 'wb') as output_wav:
                    for i, audio_data in enumerate(audio_parts):
                        with wave.open(io.BytesIO(audio_data), 'rb') as input_wav:
                            if i == 0:
                                # Set parameters from first file
                                output_wav.setparams(input_wav.getparams())
                            # Write audio frames
                            output_wav.writeframes(input_wav.readframes(input_wav.getnframes()))
                return output_buffer.getvalue()
        
        # For shorter scripts, generate directly
        tts_url = f"{TYPECAST_API_BASE}/text-to-speech"
        
        headers = {
            "X-API-KEY": api_key,
            "Content-Type": "application/json"
        }
        
        # Prepare request body according to Typecast API format
        payload = {
            "voice_id": voice_id,
            "text": script_text,
            "model": "ssfm-v21",
            "language": "eng",
            "prompt": {
                "emotion_preset": "normal",
                "emotion_intensity": 1
            },
            "output": {
                "volume": 100,
                "audio_pitch": 0,
                "audio_tempo": speed,  # Use the speed parameter
                "audio_format": "wav"
            }
        }
        
        # Make request to generate audio
        response = requests.post(tts_url, headers=headers, json=payload)
        
        if response.status_code == 200:
            # The response content should be the audio file bytes
            audio_bytes = response.content
            
            if output_path:
                # Save to file
                dir_path = os.path.dirname(output_path)
                if dir_path:  # Only create directory if path has a directory component
                    os.makedirs(dir_path, exist_ok=True)
                
                with open(output_path, 'wb') as f:
                    f.write(audio_bytes)
                return output_path
            else:
                # Return bytes
                return audio_bytes
        else:
            print(f"Failed to generate audio: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        print(f"Error generating audio: {e}")
        import traceback
        traceback.print_exc()
        return None


def generate_shadowing_audio_for_week(script_text, week_key, voice_id=None, speed=1.0):
    """
    Generate audio file for a specific week and save it.
    
    Args:
        script_text: The script text to convert to audio
        week_key: Week key (e.g., '2024-W45')
        voice_id: Optional voice ID
        speed: Audio speed/tempo (default 1.0, range 0.5-2.0)
    
    Returns:
        Relative path to the audio file (e.g., 'audio/week_2024-W45.wav') or None on error
    """
    if not script_text or not script_text.strip():
        print("No script text provided")
        return None
    
    # Create audio directory if it doesn't exist
    audio_dir = os.path.join('static', 'audio')
    os.makedirs(audio_dir, exist_ok=True)
    
    # Generate filename based on week
    audio_filename = f"week_{week_key}.wav"
    output_path = os.path.join(audio_dir, audio_filename)
    
    # Generate audio with specified speed
    result = generate_shadowing_audio(script_text, voice_id=voice_id, output_path=output_path, speed=speed)
    
    if result:
        # Return relative path from static folder for serving
        return f"audio/{audio_filename}"
    else:
        return None
