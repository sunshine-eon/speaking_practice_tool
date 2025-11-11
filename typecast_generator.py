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


def create_silent_audio(duration=0.5, sample_rate=24000, channels=1, sample_width=2):
    """
    Generate silent audio as WAV bytes.
    
    Args:
        duration: Duration in seconds (default 0.5)
        sample_rate: Sample rate in Hz (default 24000, typical for TTS)
        channels: Number of audio channels (default 1 for mono)
        sample_width: Sample width in bytes (default 2 for 16-bit)
    
    Returns:
        WAV audio bytes containing silence
    """
    import wave
    import io
    import struct
    
    # Calculate number of frames
    num_frames = int(sample_rate * duration)
    
    # Create silent frames (all zeros)
    silent_frames = struct.pack('<' + ('h' * num_frames * channels), *([0] * num_frames * channels))
    
    # Create WAV file in memory
    output_buffer = io.BytesIO()
    with wave.open(output_buffer, 'wb') as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(sample_width)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(silent_frames)
    
    return output_buffer.getvalue()


def split_text_into_paragraphs(text, max_chars=1800):
    """
    Split text into paragraphs, respecting both paragraph boundaries and char limit.
    
    Args:
        text: The text to split
        max_chars: Maximum characters per chunk (default 1800)
    
    Returns:
        List of paragraph chunks. Each chunk respects paragraph boundaries when possible,
        but may split long paragraphs to stay under max_chars.
    """
    import re
    
    # Split by double newlines (paragraph boundaries)
    paragraphs = re.split(r'\n\n+', text)
    
    chunks = []
    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        
        # If paragraph is short enough, add it as-is
        if len(paragraph) <= max_chars:
            chunks.append(paragraph)
        else:
            # Paragraph is too long, split by sentences
            sub_chunks = split_text_into_chunks(paragraph, max_chars)
            chunks.extend(sub_chunks)
    
    return chunks


def create_silent_audio(duration=0.5, sample_rate=24000, channels=1, sample_width=2):
    """
    Create a silent WAV audio segment.
    
    Args:
        duration: Duration in seconds (default 0.5)
        sample_rate: Sample rate in Hz (default 24000, typical for TTS)
        channels: Number of audio channels (default 1 for mono)
        sample_width: Sample width in bytes (default 2 for 16-bit audio)
    
    Returns:
        bytes: WAV audio data containing silence
    """
    import wave
    import io
    import struct
    
    # Calculate number of frames
    num_frames = int(sample_rate * duration)
    
    # Create silent frames (all zeros)
    silent_frames = struct.pack('<' + ('h' * num_frames * channels), *([0] * num_frames * channels))
    
    # Create WAV file in memory
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(sample_width)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(silent_frames)
    
    return buffer.getvalue()


def split_text_into_paragraphs(text, max_chars=1800):
    """
    Split text into paragraphs, respecting both paragraph boundaries and character limits.
    
    Args:
        text: The text to split
        max_chars: Maximum characters per chunk (default 1800, leaving buffer below 2000)
    
    Returns:
        List of paragraph chunks (each paragraph may be split if too long)
    """
    import re
    
    # First try splitting by double newlines (paragraphs)
    paragraphs = re.split(r'\n\n+', text)
    
    # If no double newlines found, try splitting by single newlines
    if len(paragraphs) == 1 and '\n' in text:
        # Split by single newlines, but only if there are multiple lines
        lines = text.split('\n')
        if len(lines) > 1:
            # Group consecutive non-empty lines into paragraphs
            paragraphs = []
            current_paragraph = []
            for line in lines:
                line = line.strip()
                if line:
                    current_paragraph.append(line)
                else:
                    if current_paragraph:
                        paragraphs.append('\n'.join(current_paragraph))
                        current_paragraph = []
            if current_paragraph:
                paragraphs.append('\n'.join(current_paragraph))
    
    chunks = []
    
    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        if not paragraph:
            continue
            
        # If paragraph is within limit, add it as-is
        if len(paragraph) <= max_chars:
            chunks.append(paragraph)
        else:
            # Paragraph is too long, split it by sentences
            sub_chunks = split_text_into_chunks(paragraph, max_chars)
            chunks.extend(sub_chunks)
    
    return chunks


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


def _generate_single_chunk_audio(chunk_text, voice_id, model, speed, api_key):
    """
    Helper function to generate audio for a single chunk via Typecast API.
    This avoids recursion when processing multiple chunks.
    """
    tts_url = f"{TYPECAST_API_BASE}/text-to-speech"
    
    headers = {
        "X-API-KEY": api_key,
        "Content-Type": "application/json"
    }
    
    # Validate and normalize model parameter
    valid_models = ["ssfm-v21", "ssfm-v30"]
    if model not in valid_models:
        print(f"Invalid model '{model}', defaulting to 'ssfm-v21'")
        model = "ssfm-v21"
    
    # Normalize model name - ensure it matches API expectations
    # Some APIs might expect different formats, but Typecast uses "ssfm-v21" and "ssfm-v30"
    model_normalized = model.lower() if model else "ssfm-v21"
    
    # Prepare request body according to Typecast API format
    payload = {
        "voice_id": voice_id,
        "text": chunk_text,
        "model": model_normalized,
        "language": "eng",
        "prompt": {
            "emotion_preset": "normal",
            "emotion_intensity": 1
        },
        "output": {
            "volume": 100,
            "audio_pitch": 0,
            "audio_tempo": speed,
            "audio_format": "wav"
        }
    }
    
    # Make request to generate audio
    response = requests.post(tts_url, headers=headers, json=payload)
    
    if response.status_code == 200:
        return response.content
    else:
        error_text = response.text
        try:
            error_json = response.json()
            error_text = str(error_json)
        except:
            pass
        error_msg = f"Typecast API error ({response.status_code}): {error_text}"
        raise Exception(error_msg)


def generate_shadowing_audio(script_text, voice_id=None, output_path=None, speed=1.0, model="ssfm-v21", return_timestamps=False):
    """
    Generate audio from script text using Typecast.ai.
    Handles long scripts by splitting them into chunks (Typecast limit: 2000 chars).
    Automatically adds 0.5s pauses between paragraphs when text contains paragraph breaks.
    
    Args:
        script_text: The script text to convert to audio
        voice_id: Optional voice ID (if None, uses a default voice)
        output_path: Optional path to save audio file (if None, returns audio bytes)
        speed: Audio speed/tempo (default 1.0, range 0.5-2.0)
        model: Typecast model to use (default "ssfm-v21", options: "ssfm-v21", "ssfm-v30")
        return_timestamps: If True, returns tuple of (audio, paragraph_timestamps)
    
    Returns:
        If return_timestamps is True: tuple of (audio_path/bytes, paragraph_timestamps)
        Otherwise: audio_path or audio_bytes
        On error, returns None.
        
        paragraph_timestamps format: [{"paragraph_index": 0, "start_time": 0.0, "text": "..."}]
    """
    try:
        api_key = check_api_key()
        
        # If no voice_id provided, use Jennifer as the default voice
        if voice_id is None:
            voice_id = DEFAULT_VOICE_ID
        
        # Check if script contains paragraphs (double newlines or single newlines with multiple lines)
        # More robust detection: check for double newlines OR multiple single newlines indicating paragraphs
        has_paragraphs = '\n\n' in script_text or (script_text.count('\n') > 0 and len(script_text.split('\n')) > 1)
        
        # If text has paragraphs, split by paragraphs to add pauses
        # Or if text is too long, chunk it appropriately
        if has_paragraphs or len(script_text) > 1900:
            # Use paragraph-aware splitting if paragraphs exist
            if has_paragraphs:
                chunks = split_text_into_paragraphs(script_text, max_chars=1800)
            else:
                chunks = split_text_into_chunks(script_text, max_chars=1800)
            
            # Generate audio for each chunk and track timestamps
            audio_parts = []
            paragraph_timestamps = []
            current_time = 0.0
            
            for i, chunk in enumerate(chunks):
                # Record paragraph start time
                paragraph_timestamps.append({
                    "paragraph_index": i,
                    "start_time": current_time,
                    "text": chunk[:100] + "..." if len(chunk) > 100 else chunk
                })
                
                # Generate audio for this chunk directly via API (avoid recursion)
                chunk_audio = _generate_single_chunk_audio(chunk, voice_id, model, speed, api_key)
                if chunk_audio:
                    audio_parts.append(chunk_audio)
                    
                    # Estimate duration based on text length and speed
                    # Average speaking rate: ~125 words per minute
                    word_count = len(chunk.split())
                    duration_seconds = (word_count / 125.0) * 60.0 / speed
                    current_time += duration_seconds
                    
                    # Add pause duration if not the last chunk
                    if has_paragraphs and i < len(chunks) - 1:
                        current_time += 0.5  # 0.5 second pause
                else:
                    error_msg = f"Failed to generate audio for chunk {i+1}/{len(chunks)}"
                    raise Exception(error_msg)
            
            # Concatenate WAV audio parts properly
            # WAV files have headers, so we need to merge them correctly
            import wave
            import io
            
            # Get WAV parameters from first audio chunk to create matching silence
            first_audio_params = None
            with wave.open(io.BytesIO(audio_parts[0]), 'rb') as first_wav:
                first_audio_params = first_wav.getparams()
            
            # Create silence that matches the audio format
            silence_audio = None
            if has_paragraphs and first_audio_params:
                try:
                    silence_audio = create_silent_audio(
                        duration=0.5,
                        sample_rate=first_audio_params.framerate,
                        channels=first_audio_params.nchannels,
                        sample_width=first_audio_params.sampwidth
                    )
                except Exception as e:
                    silence_audio = None
            
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
                        
                        # Add silence after each paragraph (except the last one)
                        if has_paragraphs and silence_audio and i < len(audio_parts) - 1:
                            try:
                                with wave.open(io.BytesIO(silence_audio), 'rb') as silence_wav:
                                    output_wav.writeframes(silence_wav.readframes(silence_wav.getnframes()))
                            except Exception as e:
                                pass
                
                if return_timestamps:
                    return (output_path, paragraph_timestamps)
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
                        
                        # Add silence after each paragraph (except the last one)
                        if has_paragraphs and silence_audio and i < len(audio_parts) - 1:
                            try:
                                with wave.open(io.BytesIO(silence_audio), 'rb') as silence_wav:
                                    output_wav.writeframes(silence_wav.readframes(silence_wav.getnframes()))
                            except Exception as e:
                                pass
                
                if return_timestamps:
                    return (output_buffer.getvalue(), paragraph_timestamps)
                return output_buffer.getvalue()
        
        # For shorter scripts, generate directly
        tts_url = f"{TYPECAST_API_BASE}/text-to-speech"
        
        headers = {
            "X-API-KEY": api_key,
            "Content-Type": "application/json"
        }
        
        # Validate and normalize model parameter
        valid_models = ["ssfm-v21", "ssfm-v30"]
        if model not in valid_models:
            print(f"Invalid model '{model}', defaulting to 'ssfm-v21'")
            model = "ssfm-v21"
        
        # Normalize model name - ensure it matches API expectations
        model_normalized = model.lower() if model else "ssfm-v21"
        
        # Prepare request body according to Typecast API format
        payload = {
            "voice_id": voice_id,
            "text": script_text,
            "model": model_normalized,
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
            
            # For single paragraph, create timestamp at start
            if return_timestamps:
                paragraph_timestamps = [{
                    "paragraph_index": 0,
                    "start_time": 0.0,
                    "text": script_text[:100] + "..." if len(script_text) > 100 else script_text
                }]
            
            if output_path:
                # Save to file
                dir_path = os.path.dirname(output_path)
                if dir_path:  # Only create directory if path has a directory component
                    os.makedirs(dir_path, exist_ok=True)
                
                with open(output_path, 'wb') as f:
                    f.write(audio_bytes)
                
                if return_timestamps:
                    return (output_path, paragraph_timestamps)
                return output_path
            else:
                # Return bytes
                if return_timestamps:
                    return (audio_bytes, paragraph_timestamps)
                return audio_bytes
        else:
            error_text = response.text
            try:
                error_json = response.json()
                error_text = str(error_json)
            except:
                pass
            error_msg = f"Typecast API error ({response.status_code}): {error_text}"
            raise Exception(error_msg)
            
    except Exception as e:
        print(f"Error generating audio: {e}")
        import traceback
        traceback.print_exc()
        raise  # Re-raise the exception so it propagates to the caller


def generate_shadowing_audio_for_week(script_text, week_key, voice_id=None, speed=1.0, model="ssfm-v21", return_timestamps=False):
    """
    Generate audio file for a specific week and save it.
    
    Args:
        script_text: The script text to convert to audio
        week_key: Week key (e.g., '2024-W45')
        voice_id: Optional voice ID
        speed: Audio speed/tempo (default 1.0, range 0.5-2.0)
        model: Typecast model to use (default "ssfm-v21", options: "ssfm-v21", "ssfm-v30")
        return_timestamps: If True, returns tuple of (audio_url, paragraph_timestamps)
    
    Returns:
        If return_timestamps is True: tuple of (audio_url, paragraph_timestamps)
        Otherwise: Relative path to the audio file (e.g., 'audio/week_2024-W45_typecast.wav') or None on error
    """
    if not script_text or not script_text.strip():
        raise ValueError("No script text provided")
    
    # Create audio directory if it doesn't exist
    audio_dir = os.path.join('static', 'audio')
    os.makedirs(audio_dir, exist_ok=True)
    
    # Generate filename based on week (with typecast suffix to distinguish from OpenAI version)
    audio_filename = f"week_{week_key}_typecast.wav"
    output_path = os.path.join(audio_dir, audio_filename)
    
    # Generate audio with specified speed, model, and get timestamps
    result = generate_shadowing_audio(script_text, voice_id=voice_id, output_path=output_path, speed=speed, model=model, return_timestamps=return_timestamps)
    
    if result:
        if return_timestamps:
            # result is (output_path, paragraph_timestamps)
            audio_path, timestamps = result
            # Return relative path from static folder for serving
            return (f"audio/{audio_filename}", timestamps)
        else:
            # Return relative path from static folder for serving
            return f"audio/{audio_filename}"
    else:
        raise Exception("Failed to generate audio: generate_shadowing_audio returned None")
