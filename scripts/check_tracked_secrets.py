"""Small release guard; complements provider secret scanning."""
from pathlib import PurePosixPath
import subprocess
import sys

paths = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")
issues = []
for path in filter(None, paths):
    name = PurePosixPath(path).name
    if (name in {".env", ".preview-secret"} or name.startswith(".env.") and name != ".env.example"
            or PurePosixPath(path).suffix.lower() in {".db", ".sqlite", ".sqlite3", ".pem", ".key"}):
        issues.append(path + ": sensitive file type")
scan = subprocess.run(["git", "grep", "--cached", "-IlE", "-e",
    "-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[A-Z0-9]{16}|ghp_[A-Za-z0-9]{36}"],
    capture_output=True, text=True)
if scan.returncode not in {0, 1}:
    sys.exit("Unable to scan the Git index.")
issues.extend(path + ": possible credential (value withheld)" for path in scan.stdout.splitlines())
if issues:
    print("\n".join(issues))
    sys.exit(1)
print("No tracked secret-file or common credential signatures found.")
