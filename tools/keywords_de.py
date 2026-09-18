"""German keyword labels, read from the German card texts on Scryfall.

Run with `python3 tools/keywords_de.py`. It prints "Keyword -> Label" for every
keyword on the cards of the sets below and writes keywords_de.json next to it.
Only lines that hold the keyword alone give a label; keyword actions inside a
sentence ("Mill four cards") are skipped and stay English in the filter.
"""
import json, re, sys, time, urllib.error, urllib.parse, urllib.request
H = {'User-Agent': 'MtgScanner/0.1', 'Accept': 'application/json'}
SETS = ['blb', 'dsk', 'fdn', 'tdm', 'rvr', 'dft', 'eoe', 'fin', 'blc', 'spg']
WHERE = '(' + ' or '.join(f'e:{s}' for s in SETS) + ')'

def get(url):
    for attempt in range(3):
        time.sleep(0.6)
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=H)))
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            if e.code == 429: time.sleep(int(e.headers.get('Retry-After', 15)))
            else: raise
    return None

def search(q, **kw):
    out, url = [], 'https://api.scryfall.com/cards/search?' + urllib.parse.urlencode({'q': q, **kw})
    while url:
        p = get(url)
        if not p: break
        out += p['data']; url = p.get('next_page') if p.get('has_more') else None
    return out

english = search(f'{WHERE} lang:en game:paper', unique='cards')
keywords = sorted({k for c in english for k in c.get('keywords', [])})
print(f'{len(keywords)} keywords in {len(english)} cards', file=sys.stderr)

def label(en_text, de_text, keyword):
    """German label for a keyword, taken from a line that is only that keyword.

    Card lines look like "Flying", "Ward {2}", "Kicker—{1}{R}" or
    "Flying, vigilance". Keyword actions inside a sentence ("Mill four cards")
    give no clean label, so they are skipped.
    """
    en_lines, de_lines = en_text.split('\n'), de_text.split('\n')
    if len(en_lines) != len(de_lines):
        return None
    key = keyword.lower()
    for en, de in zip(en_lines, de_lines):
        en, de = en.strip(), de.strip()
        de = de.split(' (')[0].strip()  # drop the reminder text
        if re.fullmatch(re.escape(key) + r'(\s*(\{[^}]*\}|\d+|x))*\.?', en.lower()):
            return clean(re.split(r'\s\{|\s\d|\sX|—|:', de)[0])
        if re.fullmatch(re.escape(key) + r'—.*', en.lower()):
            return clean(de.split('—')[0])
        parts_en = [x.strip().lower().rstrip('.') for x in en.split(',')]
        parts_de = [x.strip().rstrip('.') for x in de.split(',')]
        if len(parts_en) > 1 and len(parts_en) == len(parts_de) and key in parts_en:
            return clean(parts_de[parts_en.index(key)])
    return None

def clean(text):
    text = text.strip().rstrip('.').strip()
    # A label is one or two words; anything longer is sentence text.
    if not text or '(' in text or len(text) > 30 or len(text.split()) > 3:
        return None
    return text

out = {}
for keyword in keywords:
    cards = search(f'{WHERE} lang:de keyword:"{keyword}"', unique='cards')
    votes = {}
    for c in cards[:6]:
        en, de = c.get('oracle_text'), c.get('printed_text')
        if not en or not de: continue
        got = label(en, de, keyword)
        if got: votes[got] = votes.get(got, 0) + 1
    best = max(votes, key=votes.get) if votes else None
    out[keyword] = best
    print(f'{keyword} -> {best}   {votes if len(votes) > 1 else ""}')
json.dump(out, open('keywords_de.json', 'w'), ensure_ascii=False, indent=1)
