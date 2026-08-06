from pathlib import Path

script = Path(__file__).with_name('pr217-structured-semantic-fix.py')
text = script.read_text(encoding='utf-8')
old = 'updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)'
new = 'updated, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=flags)'
if old in text:
    script.write_text(text.replace(old, new, 1), encoding='utf-8')
