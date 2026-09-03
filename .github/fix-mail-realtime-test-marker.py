from pathlib import Path

p = Path('tests/mail/verify-mail-realtime.js')
text = p.read_text()
old = "  \"['sync', 'new-mail', 'thread-update', 'state-update', 'delete']\",\n"
new = "  \"source.addEventListener('sync'\",\n  \"['new-mail', 'thread-update', 'state-update', 'delete']\",\n"
if text.count(old) != 1:
    raise SystemExit(f'Expected one legacy SSE marker, found {text.count(old)}')
p.write_text(text.replace(old, new, 1))
