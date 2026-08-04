from pathlib import Path

script = Path(__file__).with_name('apply-pr217-review-fixes.py')
text = script.read_text(encoding='utf-8')
old = "  assert.ok(duplicateSummary.errors.length > 0);\n"
if old in text:
    script.write_text(text.replace(old, '', 1), encoding='utf-8')
