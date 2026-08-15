import re

with open('llms_full.txt', 'r') as f:
    content = f.read()

# Look for tables of scopes/permissions for each platform
import json

def find_scopes():
    platforms = ['Facebook', 'Instagram', 'TikTok', 'YouTube', 'Threads', 'X', 'LinkedIn', 'Pinterest', 'Snapchat', 'Google Business', 'WhatsApp', 'Reddit', 'Bluesky', 'Telegram', 'Discord', 'Slack']
    for p in platforms:
        print(f"--- {p} ---")
        match = re.search(r'# ' + p + r'\n(.*?)(?=\n# |\Z)', content, re.DOTALL | re.IGNORECASE)
        if match:
            text = match.group(1)
            # Find markdown tables containing "Scope"
            tables = re.findall(r'\| Scope \|.*?(?=\n\n|\Z)', text, re.DOTALL)
            for t in tables:
                print(t)
                print('-'*20)
            
            # find mentions of messaging or comments
            if 'comment' not in text.lower() and 'message' not in text.lower() and 'inbox' not in text.lower() and 'reply' not in text.lower():
                print("NO MESSAGES/COMMENTS MENTIONED")

find_scopes()
