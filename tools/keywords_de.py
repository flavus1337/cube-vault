"""German keyword labels, read from the German card texts on Scryfall.

Run with `python3 tools/keywords_de.py`. It walks every keyword Scryfall knows,
looks at a few German cards that carry it, and prints "Keyword -> Label" while
writing keywords_de.json next to it. Paste the result into web/src/CubePage.tsx.

A label is only taken when the card shows it plainly: a line that holds the
keyword ("Fliegend", "Abwehr {2}", "Stufe aufsteigen {2}{G}") or a reminder that
names the plain form ("(Um einen Drachen zu erblicken, …)"). Everything else
stays English, because guessing a rules term is worse than showing the English
one.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HEADERS = {'User-Agent': 'MtgScanner/0.1', 'Accept': 'application/json'}
CATALOGS = ['keyword-abilities', 'keyword-actions', 'ability-words']

# Umbrella terms that are never printed: cards say Islandwalk or Swampwalk,
# which the German cards call Inseltarnung and Sumpftarnung.
MANUAL = {'Landwalk': 'Landtarnung'}
# Labels that came out as the start of an instruction ("Gift a card" ->
# "Verschenke eine Karte"), not as the name of the keyword.
BAD = {'Champion', 'Gift', 'Fear', "Council's dilemma"}
SENTENCE_STARTERS = {
    'du', 'wenn', 'immer', 'diese', 'dieser', 'dieses', 'lege', 'schicke', 'ziehe', 'erzeuge',
    'bestimme', 'wähle', 'als', 'zu', 'bis', 'falls', 'solange', 'am', 'zum', 'wirf', 'das',
    'der', 'die', 'ein', 'eine', 'einen', 'es', 'sie', 'er', 'für', 'in', 'mit', 'nach', 'und',
}
TRAILING = {'des', 'der', 'die', 'das', 'für', 'vor', 'mit', 'von', 'im', 'zum', 'zur', 'und'}


def get(url):
    """One request, with a pause: Scryfall allows about two searches a second."""
    for _ in range(3):
        time.sleep(0.6)
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS)))
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            if error.code == 429:
                time.sleep(int(error.headers.get('Retry-After', 15)))
            else:
                raise
    return None


def cards_with(keyword):
    """The first page of German cards carrying the keyword."""
    query = urllib.parse.urlencode({'q': f'lang:de keyword:"{keyword}"', 'unique': 'cards'})
    page = get(f'https://api.scryfall.com/cards/search?{query}')
    return (page or {}).get('data', [])


def clean(text):
    text = text.strip().rstrip('.').strip()
    # A label is one to three words and never the start of a sentence.
    if not text or '(' in text or len(text) > 30 or len(text.split()) > 3:
        return None
    if text.split()[0].lower() in SENTENCE_STARTERS or text.split()[-1].lower() in TRAILING:
        return None
    return text


def label(english, german, keyword, abilities):
    en_lines, de_lines = english.split('\n'), german.split('\n')
    if len(en_lines) != len(de_lines):
        return None
    key = keyword.lower()
    words = len(keyword.split())

    for en, de in zip(en_lines, de_lines):
        en, de = en.strip(), de.split(' (')[0].strip()  # drop the reminder text
        low = en.lower()
        if re.fullmatch(re.escape(key) + r'(\s*(\{[^}]*\}|\d+|x))*\.?', low):
            return clean(re.split(r'\s\{|\s\d|\sX|—|:', de)[0])
        if re.fullmatch(re.escape(key) + r'—.*', low):
            return clean(de.split('—')[0])
        # "Affinity for artifacts", "Level up {2}{G}": the label starts the line
        # too, but only for abilities, not for actions used in a sentence.
        if key in abilities and low.startswith(key + ' '):
            return clean(' '.join(re.split(r'—|:|\{', de)[0].split()[:words]))
        parts_en = [part.strip().lower().rstrip('.') for part in en.split(',')]
        parts_de = [part.strip().rstrip('.') for part in de.split(',')]
        if len(parts_en) > 1 and len(parts_en) == len(parts_de) and key in parts_en:
            return clean(parts_de[parts_en.index(key)])

    # A keyword action only appears inside a sentence ("behold a Dragon"), but
    # its reminder names the plain form: "(To behold a Dragon, …)" is
    # "(Um einen Drachen zu erblicken, …)".
    en_notes = re.findall(r'\(([^)]*)\)', english)
    de_notes = re.findall(r'\(([^)]*)\)', german)
    if len(en_notes) == len(de_notes):
        for en_note, de_note in zip(en_notes, de_notes):
            if re.match(r'to ' + re.escape(key) + r'\b', en_note.strip(), re.I):
                plain = re.search(r'\bzu (\w+)[,.]', de_note)
                if plain:
                    return clean(plain.group(1).capitalize())
    return None


def main():
    # Lower case: the catalog writes "Level Up", the card "Level up".
    abilities = {
        word.lower()
        for catalog in ['keyword-abilities', 'ability-words']
        for word in get(f'https://api.scryfall.com/catalog/{catalog}')['data']
    }
    keywords = sorted(
        {word for catalog in CATALOGS for word in get(f'https://api.scryfall.com/catalog/{catalog}')['data']}
    )
    print(f'{len(keywords)} keywords', file=sys.stderr)

    labels = {}
    for keyword in keywords:
        votes = {}
        for card in cards_with(keyword)[:6]:
            english, german = card.get('oracle_text'), card.get('printed_text')
            if not english or not german:
                continue
            found = label(english, german, keyword, abilities)
            if found:
                votes[found] = votes.get(found, 0) + 1
        best = max(votes, key=votes.get) if votes else None
        if keyword in BAD:
            best = None
        best = MANUAL.get(keyword, best)
        labels[keyword] = best
        print(f'{keyword} -> {best}')
    json.dump(labels, open('keywords_de.json', 'w'), ensure_ascii=False, indent=1)


main()
