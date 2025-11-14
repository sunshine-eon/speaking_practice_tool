"""
Scrape Jackie Bavaro's Substack newsletter articles.
Extracts article titles, URLs, dates, and full content.
"""

import requests
from bs4 import BeautifulSoup
import json
import os
from datetime import datetime
import time

SUBSCRIPT_URL = "https://jackiebavaro.substack.com/"
OUTPUT_DIR = "scraped_content/jackie_newsletter"
ARTICLES_FILE = os.path.join(OUTPUT_DIR, "articles.json")

def create_output_dir():
    """Create output directory if it doesn't exist."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)

def get_article_list_page():
    """Get the main newsletter page to find article links."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        response = requests.get(SUBSCRIPT_URL, headers=headers, timeout=30)
        response.raise_for_status()
        return response.text
    except Exception as e:
        print(f"Error fetching main page: {e}")
        return None

def extract_article_links_from_rss():
    """Extract article URLs from RSS feed."""
    rss_url = f"{SUBSCRIPT_URL}feed"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        response = requests.get(rss_url, headers=headers, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'xml')
        
        article_links = []
        items = soup.find_all('item')
        
        for item in items:
            link_elem = item.find('link')
            if link_elem:
                article_links.append(link_elem.text.strip())
        
        return article_links
    except Exception as e:
        print(f"Error fetching RSS feed: {e}")
        return []

def extract_article_links(html_content):
    """Extract article URLs from the newsletter page (fallback method)."""
    # Try RSS feed first (more reliable)
    rss_links = extract_article_links_from_rss()
    if rss_links:
        return rss_links
    
    # Fallback: try to extract from HTML
    soup = BeautifulSoup(html_content, 'html.parser')
    article_links = []
    
    # Substack typically uses links with /p/ in the URL for posts
    links = soup.find_all('a', href=True)
    
    seen_urls = set()
    for link in links:
        href = link.get('href', '')
        if '/p/' in href:
            # Handle relative URLs
            if href.startswith('/'):
                full_url = f"https://jackiebavaro.substack.com{href}"
            elif href.startswith('http') and 'jackiebavaro.substack.com' in href:
                full_url = href
            else:
                continue
            
            if full_url not in seen_urls:
                seen_urls.add(full_url)
                article_links.append(full_url)
    
    return list(seen_urls)

def scrape_article(url):
    """Scrape a single article's content."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Extract title
        title_elem = soup.find('h1') or soup.find('title')
        title = title_elem.get_text(strip=True) if title_elem else "No title"
        
        # Extract date
        date_elem = soup.find('time') or soup.find(class_='publish-date')
        date = date_elem.get_text(strip=True) if date_elem else "No date"
        
        # Extract article content
        # Substack articles are typically in a div with class containing 'post' or 'article'
        content_elem = soup.find('div', class_=lambda x: x and ('post' in x.lower() or 'article' in x.lower() or 'entry' in x.lower()))
        if not content_elem:
            # Try alternative selectors
            content_elem = soup.find('article') or soup.find('div', {'data-testid': 'post-content'})
        
        if content_elem:
            # Remove script and style elements
            for script in content_elem(["script", "style"]):
                script.decompose()
            content = content_elem.get_text(separator='\n', strip=True)
        else:
            # Fallback: get all paragraph text
            paragraphs = soup.find_all('p')
            content = '\n'.join([p.get_text(strip=True) for p in paragraphs if p.get_text(strip=True)])
        
        return {
            'url': url,
            'title': title,
            'date': date,
            'content': content,
            'scraped_at': datetime.now().isoformat()
        }
    except Exception as e:
        print(f"Error scraping article {url}: {e}")
        return None

def main():
    """Main scraping function."""
    print("Starting newsletter scraping...")
    create_output_dir()
    
    # Get main page
    print(f"Fetching main page: {SUBSCRIPT_URL}")
    html_content = get_article_list_page()
    
    if not html_content:
        print("Failed to fetch main page")
        return
    
    # Extract article links
    print("Extracting article links...")
    article_urls = extract_article_links(html_content)
    print(f"Found {len(article_urls)} article URLs")
    
    if not article_urls:
        print("No articles found. The page structure might have changed.")
        print("Saving HTML for inspection...")
        with open(os.path.join(OUTPUT_DIR, "main_page.html"), 'w', encoding='utf-8') as f:
            f.write(html_content)
        return
    
    # Scrape each article
    articles = []
    for i, url in enumerate(article_urls, 1):
        print(f"Scraping article {i}/{len(article_urls)}: {url}")
        article = scrape_article(url)
        if article:
            articles.append(article)
        time.sleep(1)  # Be polite, wait 1 second between requests
    
    # Save articles
    print(f"\nSaving {len(articles)} articles...")
    with open(ARTICLES_FILE, 'w', encoding='utf-8') as f:
        json.dump(articles, f, indent=2, ensure_ascii=False)
    
    # Also save individual markdown files
    for article in articles:
        # Create filename from title
        filename = article['title'].replace('/', '-').replace('\\', '-')[:100]
        filename = ''.join(c for c in filename if c.isalnum() or c in (' ', '-', '_')).strip()
        filename = filename.replace(' ', '_') + '.md'
        filepath = os.path.join(OUTPUT_DIR, filename)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(f"# {article['title']}\n\n")
            f.write(f"**URL:** {article['url']}\n\n")
            f.write(f"**Date:** {article['date']}\n\n")
            f.write(f"**Scraped:** {article['scraped_at']}\n\n")
            f.write("---\n\n")
            f.write(article['content'])
    
    print(f"\nDone! Scraped {len(articles)} articles.")
    print(f"Articles saved to: {ARTICLES_FILE}")
    print(f"Individual files saved to: {OUTPUT_DIR}/")

if __name__ == "__main__":
    main()

