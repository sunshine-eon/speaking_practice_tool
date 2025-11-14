"""Transcript searcher for finding specific text segments and their timestamps."""

import json
import logging
from pathlib import Path
from typing import List, Dict, Optional, Tuple

from .config import Config

logger = logging.getLogger(__name__)


class TranscriptSearcher:
    """Search and locate text in transcripts with timestamps."""
    
    def __init__(self, config: Config):
        """
        Initialize transcript searcher.
        
        Args:
            config: Configuration object
        """
        self.config = config
    
    def load_transcript(self, video_id: str) -> Optional[Dict]:
        """
        Load transcript for a video.
        
        Args:
            video_id: Video ID
            
        Returns:
            Transcript dictionary with segments, or None if not found
        """
        transcript_path = self.config.transcripts_dir / f"{video_id}.json"
        
        if not transcript_path.exists():
            logger.error(f"Transcript not found: {transcript_path}")
            return None
        
        try:
            with open(transcript_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading transcript: {e}", exc_info=True)
            return None
    
    def find_text(self, video_id: str, search_text: str, case_sensitive: bool = False) -> List[Dict]:
        """
        Find segments containing the search text.
        
        Args:
            video_id: Video ID
            search_text: Text to search for
            case_sensitive: Whether search is case sensitive
            
        Returns:
            List of matching segments with their timestamps
        """
        transcript = self.load_transcript(video_id)
        if not transcript:
            return []
        
        segments = transcript.get('segments', [])
        matches = []
        
        search_lower = search_text.lower() if not case_sensitive else search_text
        
        for segment in segments:
            text = segment.get('text', '')
            text_lower = text.lower() if not case_sensitive else text
            
            if search_lower in text_lower:
                matches.append({
                    'start': segment.get('start', 0.0),
                    'end': segment.get('end', 0.0),
                    'text': text,
                    'segment_id': segment.get('id', 0),
                })
        
        logger.info(f"Found {len(matches)} segments containing '{search_text}'")
        return matches
    
    def find_start_time(self, video_id: str, search_text: str) -> Optional[float]:
        """
        Find the start time of the first segment containing the search text.
        
        Args:
            video_id: Video ID
            search_text: Text to search for
            
        Returns:
            Start time in seconds, or None if not found
        """
        matches = self.find_text(video_id, search_text)
        if matches:
            return matches[0]['start']
        return None
    
    def find_text_range(self, video_id: str, start_text: str, end_text: Optional[str] = None,
                       duration: Optional[float] = None) -> Optional[Tuple[float, float]]:
        """
        Find time range based on text search.
        
        Args:
            video_id: Video ID
            start_text: Text to find start time
            end_text: Optional text to find end time. If None, uses duration.
            duration: Optional duration in seconds from start. Used if end_text is None.
            
        Returns:
            Tuple of (start_time, end_time) in seconds, or None if not found
        """
        start_time = self.find_start_time(video_id, start_text)
        if start_time is None:
            logger.error(f"Could not find start text: '{start_text}'")
            return None
        
        if end_text:
            # Find end time based on text
            end_time = self.find_start_time(video_id, end_text)
            if end_time is None:
                logger.error(f"Could not find end text: '{end_text}'")
                return None
            if end_time <= start_time:
                logger.error(f"End time {end_time} is before start time {start_time}")
                return None
        elif duration:
            # Use duration from start
            end_time = start_time + duration
        else:
            logger.error("Either end_text or duration must be provided")
            return None
        
        return (start_time, end_time)
    
    def get_segments_in_range(self, video_id: str, start_time: float, end_time: float) -> List[Dict]:
        """
        Get all transcript segments within a time range.
        
        Args:
            video_id: Video ID
            start_time: Start time in seconds
            end_time: End time in seconds
            
        Returns:
            List of segments within the range
        """
        transcript = self.load_transcript(video_id)
        if not transcript:
            return []
        
        segments = transcript.get('segments', [])
        result = []
        
        for segment in segments:
            seg_start = segment.get('start', 0.0)
            seg_end = segment.get('end', 0.0)
            
            # Check if segment overlaps with range
            if seg_start < end_time and seg_end > start_time:
                result.append({
                    'start': seg_start,
                    'end': seg_end,
                    'text': segment.get('text', ''),
                    'segment_id': segment.get('id', 0),
                })
        
        return result
    
    def _extract_keywords(self, text: str, min_length: int = 4) -> set:
        """Extract meaningful keywords from text."""
        import re
        # Remove common stop words
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
                     'of', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
                     'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
                     'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
                     'what', 'which', 'who', 'when', 'where', 'why', 'how', 'can', 'may', 'might',
                     'want', 'think', 'know', 'say', 'see', 'get', 'go', 'come', 'take', 'make',
                     'like', 'just', 'really', 'very', 'much', 'more', 'most', 'some', 'any', 'all'}
        
        # Extract words (alphanumeric, at least min_length chars)
        words = re.findall(r'\b[a-z]{' + str(min_length) + r',}\b', text.lower())
        # Filter out stop words and return unique words
        keywords = {w for w in words if w not in stop_words and len(w) >= min_length}
        return keywords
    
    def _extract_topic_keywords(self, text: str) -> set:
        """Extract topic-specific keywords (longer, more meaningful words)."""
        keywords = self._extract_keywords(text, min_length=5)  # Longer words are more topic-specific
        # Further filter: prefer nouns and important concepts
        # Words that appear multiple times or are longer are more likely to be topic keywords
        return keywords
    
    def _calculate_topic_similarity(self, keywords1: set, keywords2: set) -> float:
        """Calculate similarity between two sets of keywords (Jaccard similarity)."""
        if not keywords1 or not keywords2:
            return 0.0
        intersection = len(keywords1 & keywords2)
        union = len(keywords1 | keywords2)
        return intersection / union if union > 0 else 0.0
    
    def detect_topic_change(self, video_id: str, start_time: float, max_duration: float = None) -> Optional[float]:
        """
        Detect when topic changes after a starting point using keyword tracking and context analysis.
        
        Looks for:
        - Significant keyword/topic shift (low similarity with initial topic)
        - Strong topic transition phrases
        - Long pauses combined with topic shift
        
        Args:
            video_id: Video ID
            start_time: Start time in seconds
            max_duration: Optional maximum duration to search. If None, searches until topic change.
            
        Returns:
            End time when topic changes, or None if not found within max_duration
        """
        transcript = self.load_transcript(video_id)
        if not transcript:
            return None
        
        segments = transcript.get('segments', [])
        
        # Strong topic transition phrases (more specific, less false positives)
        strong_transition_phrases = [
            "let's talk", 'moving on', 'switching', 'another thing', 'different topic',
            'speaking of', 'talking about', 'on a different note', 'changing gears',
            'the next', 'one more thing', 'last thing', 'finally', 'to wrap up',
            'before we move on', 'let me shift', 'let me change', 'switching gears',
            'now let', 'so now', 'okay so', 'alright so'
        ]
        
        # Get initial topic keywords (first 20 seconds of content - shorter window)
        initial_keywords = set()
        initial_text = ""
        for segment in segments:
            seg_start = segment.get('start', 0.0)
            seg_end = segment.get('end', 0.0)
            if seg_start >= start_time and seg_end <= start_time + 20:
                initial_text += " " + segment.get('text', '')
        
        if initial_text:
            initial_keywords = self._extract_keywords(initial_text)
            initial_topic_keywords = self._extract_topic_keywords(initial_text)  # More specific topic words
            logger.info(f"Initial topic keywords: {list(initial_topic_keywords)[:10]}")
        
        prev_end = start_time
        window_keywords = set()  # Rolling window of recent keywords
        window_segments = []  # Recent segments for keyword tracking
        recent_keywords = set()  # Keywords from last 15 seconds (for sub-topic detection)
        
        for i, segment in enumerate(segments):
            seg_start = segment.get('start', 0.0)
            seg_end = segment.get('end', 0.0)
            text = segment.get('text', '').strip()
            
            # Skip segments before start_time
            if seg_end < start_time:
                prev_end = seg_end
                continue
            
            # Stop if we've exceeded max_duration (if specified)
            if max_duration and seg_start > start_time + max_duration:
                break
            
            # Need at least 20 seconds of content before checking for topic change
            if seg_start < start_time + 20:
                prev_end = seg_end
                window_segments.append(segment)
                continue
            
            gap = seg_start - prev_end
            text_lower = text.lower()
            text_start = text_lower[:100]
            
            # Update rolling window (last 20 seconds for main topic, 15 seconds for recent)
            window_segments.append(segment)
            # Remove segments older than 20 seconds from main window
            window_segments = [s for s in window_segments if s.get('start', 0) >= seg_start - 20]
            window_text = " ".join([s.get('text', '') for s in window_segments])
            window_keywords = self._extract_keywords(window_text)
            
            # Recent window for sub-topic detection (last 15 seconds)
            recent_segments = [s for s in window_segments if s.get('start', 0) >= seg_start - 15]
            recent_text = " ".join([s.get('text', '') for s in recent_segments])
            recent_keywords = self._extract_keywords(recent_text)
            
            # Calculate similarity with initial topic (using both general and topic-specific keywords)
            similarity = self._calculate_topic_similarity(initial_keywords, window_keywords)
            
            # Also check topic-specific keyword overlap (more reliable for topic detection)
            window_topic_keywords = self._extract_topic_keywords(window_text)
            topic_similarity = self._calculate_topic_similarity(initial_topic_keywords, window_topic_keywords)
            
            # Also check if recent keywords are shifting (sub-topic change)
            # Compare recent keywords with previous recent keywords
            if len(recent_keywords) > 5 and len(window_keywords) > 5:
                recent_similarity = self._calculate_topic_similarity(window_keywords, recent_keywords)
            else:
                recent_similarity = 1.0  # Not enough data
            
            # Check for strong transition phrase with long pause
            # Only check if phrase appears at the start of the text (not in the middle)
            if gap > 2.0 and prev_end > start_time + 10:
                for phrase in strong_transition_phrases:
                    # Check if phrase starts the text or appears very early (first 30 chars)
                    if text_start.startswith(phrase) or text_start[:30].startswith(phrase):
                        logger.info(f"Topic transition detected at {int(seg_start//60)}:{int(seg_start%60):02d} "
                                  f"(gap: {gap:.1f}s, strong phrase: '{phrase}')")
                        return seg_start
            
            # Check for significant topic shift (low similarity + some time has passed)
            # More sensitive detection - check for both main topic shift and sub-topic shift
            if seg_start > start_time + 30:  # At least 30 seconds after start
                # Main topic shift: both general and topic-specific similarity drop
                main_topic_shift = (similarity < 0.15 or topic_similarity < 0.20) and len(window_keywords) > 6
                # Topic-specific similarity is more reliable
                strong_topic_shift = topic_similarity < 0.15 and len(window_topic_keywords) > 3
                
                # Sub-topic shift: recent keywords diverge from window (new sub-topic within main topic)
                sub_topic_shift = recent_similarity < 0.25 and len(recent_keywords) > 5 and seg_start > start_time + 60
                
                # Check if there's a transition phrase at the start or long pause
                has_transition = any(text_start.startswith(phrase) or text_start[:30].startswith(phrase) 
                                   for phrase in strong_transition_phrases)
                has_long_pause = gap > 2.5
                
                # Also check next few segments to see if shift is sustained
                if i + 2 < len(segments):
                    next_segs = segments[i+1:i+3]
                    next_texts = [s.get('text', '').lower() for s in next_segs]
                    next_keywords = self._extract_keywords(" ".join(next_texts))
                    next_similarity = self._calculate_topic_similarity(initial_keywords, next_keywords)
                    
                    # Calculate next topic similarity too
                    next_topic_keywords = self._extract_topic_keywords(" ".join(next_texts))
                    next_topic_similarity = self._calculate_topic_similarity(initial_topic_keywords, next_topic_keywords)
                    
                    # Main topic change: topic-specific similarity drops + (transition OR long pause)
                    if strong_topic_shift and next_topic_similarity < 0.20 and (has_transition or (has_long_pause and gap > 3.0)):
                        logger.info(f"Main topic shift detected at {int(seg_start//60)}:{int(seg_start%60):02d} "
                                  f"(topic similarity: {topic_similarity:.2f}, next: {next_topic_similarity:.2f}, "
                                  f"transition: {has_transition}, pause: {has_long_pause})")
                        return seg_start
                    
                    # Or very long pause with low topic similarity (more reliable)
                    if strong_topic_shift and next_topic_similarity < 0.20 and has_long_pause and gap > 3.5:
                        logger.info(f"Main topic shift detected at {int(seg_start//60)}:{int(seg_start%60):02d} "
                                  f"(topic similarity: {topic_similarity:.2f}, very long pause: {gap:.1f}s)")
                        return seg_start
                    
                    # Sub-topic change: recent shift + transition phrase (after enough time)
                    if sub_topic_shift and has_transition and seg_start > start_time + 90:
                        logger.info(f"Sub-topic shift detected at {int(seg_start//60)}:{int(seg_start%60):02d} "
                                  f"(recent similarity: {recent_similarity:.2f}, transition: {has_transition})")
                        return seg_start
                    
                    # Very low similarity even without transition (clear topic change)
                    # But need to be more careful - check if it's just a metaphor/example within same topic
                    # Look for actual topic keywords in the text, not just low similarity
                    if similarity < 0.10 and next_similarity < 0.12 and seg_start > start_time + 90:
                        # Check if text contains completely different topic keywords
                        # Extract topic-related words from initial text
                        initial_topic_words = {w for w in initial_keywords if len(w) > 4}  # Longer words are more topic-specific
                        current_topic_words = {w for w in window_keywords if len(w) > 4}
                        
                        # If there's significant overlap in longer/topic-specific words, might still be same topic
                        topic_overlap = len(initial_topic_words & current_topic_words)
                        if topic_overlap < 2:  # Very few topic-specific words in common
                            logger.info(f"Clear topic shift detected at {int(seg_start//60)}:{int(seg_start%60):02d} "
                                      f"(very low similarity: {similarity:.2f}, topic overlap: {topic_overlap})")
                            return seg_start
            
            # Very long pause (> 4 seconds) combined with low similarity = likely topic change
            if gap > 4.0 and prev_end > start_time + 30:
                # Check if similarity is also low (not just a pause in same topic)
                if similarity < 0.2:
                    logger.info(f"Topic transition detected at {int(seg_start//60)}:{int(seg_start%60):02d} "
                              f"(very long pause: {gap:.1f}s, similarity: {similarity:.2f})")
                    return seg_start
            
            # Strong transition phrase even without long pause (after enough time has passed)
            # Only if phrase appears at the very start of the segment
            if seg_start > start_time + 45:  # At least 45 seconds after start
                for phrase in strong_transition_phrases:
                    # Only match if phrase starts the text (not in the middle)
                    if text_start.startswith(phrase) or text_start[:30].startswith(phrase):
                        logger.info(f"Topic transition phrase detected at {int(seg_start//60)}:{int(seg_start%60):02d}: "
                                  f"'{phrase}'")
                        return seg_start
            
            prev_end = seg_end
        
        # If max_duration specified and no topic change found, return max
        if max_duration:
            logger.info(f"No topic change detected within {max_duration}s")
            return start_time + max_duration
        
        # If no max_duration and no topic change found, return None (search entire video)
        logger.warning("No topic change detected in entire video")
        return None
    
    def find_text_with_topic_boundary(self, video_id: str, start_text: str, 
                                     max_duration: float = None,
                                     use_chapters: bool = True) -> Optional[Tuple[float, float]]:
        """
        Find time range starting from text, ending at topic change.
        Can use YouTube chapters if available, otherwise falls back to topic detection.
        
        Args:
            video_id: Video ID
            start_text: Text to find start time
            max_duration: Optional maximum duration in seconds. If None, searches until topic change.
            use_chapters: Whether to use YouTube chapters if available (default: True)
            
        Returns:
            Tuple of (start_time, end_time) in seconds, or None if not found
        """
        start_time = self.find_start_time(video_id, start_text)
        if start_time is None:
            logger.error(f"Could not find start text: '{start_text}'")
            return None
        
        # Try to use YouTube chapters first if available
        if use_chapters:
            end_time = self._find_topic_boundary_from_chapters(video_id, start_time)
            if end_time:
                logger.info(f"Found topic boundary from YouTube chapters: {end_time:.1f}s")
                return (start_time, end_time)
        
        # Fall back to topic detection algorithm
        end_time = self.detect_topic_change(video_id, start_time, max_duration)
        
        if end_time:
            return (start_time, end_time)
        
        return None
    
    def _find_topic_boundary_from_chapters(self, video_id: str, start_time: float) -> Optional[float]:
        """
        Find topic boundary using YouTube chapters.
        
        Args:
            video_id: Video ID
            start_time: Start time in seconds
            
        Returns:
            End time of the chapter containing start_time, or None if not found
        """
        try:
            from .playlist_handler import PlaylistHandler
            handler = PlaylistHandler(self.config)
            video_url = f"https://www.youtube.com/watch?v={video_id}"
            chapters = handler.get_video_chapters(video_url)
            
            if not chapters:
                logger.debug("No chapters found in video")
                return None
            
            # Find the chapter that contains start_time
            for i, chapter in enumerate(chapters):
                chapter_start = chapter.get('start_time', 0.0)
                chapter_end = chapter.get('end_time', 0.0)
                
                # Check if start_time is within this chapter
                if chapter_start <= start_time < chapter_end:
                    logger.info(f"Found chapter '{chapter.get('title', '')}' "
                              f"({int(chapter_start//60)}:{int(chapter_start%60):02d} - "
                              f"{int(chapter_end//60)}:{int(chapter_end%60):02d})")
                    # Return the end of this chapter as the topic boundary
                    return chapter_end
            
            logger.debug(f"Start time {start_time:.1f}s not found in any chapter")
            return None
            
        except Exception as e:
            logger.warning(f"Error getting chapters: {e}")
            return None
 