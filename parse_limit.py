import re
import json

with open('llms_full.txt', 'r') as f:
    lines = f.read().split('\n')

for i, line in enumerate(lines):
    l = line.lower()
    if 'does not support' in l or 'cannot reply' in l or 'no message' in l or 'only support' in l or 'publishing only' in l or 'inbox' in l or 'comment' in l:
        if ('support' in l and 'comment' in l) or ('support' in l and 'inbox' in l) or ('support' in l and 'message' in l):
            pass # print(line)

