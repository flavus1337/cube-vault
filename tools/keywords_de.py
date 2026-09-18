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

# Scryfall knows which keywords are abilities and which are actions inside a
# sentence ("Mill four cards"). Only abilities carry a label at the line start.
ABILITIES = set(get('https://api.scryfall.com/catalog/keyword-abilities')['data']) | set(
    get('https://api.scryfall.com/catalog/ability-words')['data']
)

SENTENCE_STARTERS = {
    'du', 'wenn', 'immer', 'diese', 'dieser', 'dieses', 'lege', 'schicke', 'ziehe', 'erzeuge',
    'bestimme', 'wähle', 'als', 'zu', 'bis', 'falls', 'solange', 'am', 'zum', 'wirf', 'das',
    'der', 'die', 'ein', 'eine', 'einen', 'es', 'sie', 'er', 'für', 'in', 'mit', 'nach', 'und',
}

def label(en_text, de_text, keyword):
    """German label for a keyword, taken from the matching line of the card.

    Lines look like "Flying", "Ward {2}", "Kicker—{1}{R}", "Affinity for
    artifacts" or "Flying, vigilance". A keyword action inside a sentence gives
    no clean label and is skipped.
    """
    en_lines, de_lines = en_text.split('\n'), de_text.split('\n')
    if len(en_lines) != len(de_lines):
        return None
    key = keyword.lower()
    words = len(keyword.split())
    for en, de in zip(en_lines, de_lines):
        en, de = en.strip(), de.strip()
        de = de.split(' (')[0].strip()  # drop the reminder text
        low = en.lower()
        if re.fullmatch(re.escape(key) + r'(\s*(\{[^}]*\}|\d+|x))*\.?', low):
            return clean(re.split(r'\s\{|\s\d|\sX|—|:', de)[0])
        if re.fullmatch(re.escape(key) + r'—.*', low):
            return clean(de.split('—')[0])
        # "Affinity for artifacts", "Afterlife 1": the label starts the line too,
        # but only for keyword abilities, not for actions used in a sentence.
        if keyword in ABILITIES and low.startswith(key + ' '):
            first = re.split(r'—|:|\{', de)[0]
            return clean(' '.join(first.split()[:words]))
        parts_en = [x.strip().lower().rstrip('.') for x in en.split(',')]
        parts_de = [x.strip().rstrip('.') for x in de.split(',')]
        if len(parts_en) > 1 and len(parts_en) == len(parts_de) and key in parts_en:
            return clean(parts_de[parts_en.index(key)])
    return None

# Labels that came out as the start of an instruction ("Gift a card" ->
# "Verschenke eine Karte"), not as the name of the keyword.
BAD = {'Champion', 'Gift', 'Fear'}
TRAILING = {'des', 'der', 'die', 'das', 'für', 'vor', 'mit', 'von', 'im', 'zum', 'zur', 'und'}

def clean(text):
    text = text.strip().rstrip('.').strip()
    # A label is one to three words and never the start of a sentence.
    if not text or '(' in text or len(text) > 30 or len(text.split()) > 3:
        return None
    if text.split()[0].lower() in SENTENCE_STARTERS or text.split()[-1].lower() in TRAILING:
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
    if keyword in BAD:
        best = None
    out[keyword] = best
    print(f'{keyword} -> {best}   {votes if len(votes) > 1 else ""}')
json.dump(out, open('keywords_de.json', 'w'), ensure_ascii=False, indent=1)
