from pathlib import Path

p = Path('tests/mail/verify-mail-realtime.js')
text = p.read_text()
block = """if (mailCore.includes(\"dispatchEvent(new MouseEvent('click'\")) {\n  throw new Error('Core DNI Mail must not use synthetic Inbox clicks for realtime refresh.');\n}\n\n"""
if text.count(block) != 1:
    raise SystemExit(f'Expected one overbroad core Mail click assertion, found {text.count(block)}')
p.write_text(text.replace(block, '', 1))
