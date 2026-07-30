from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new, label):
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one {label} match in {path}, found {count}")
    path.write_text(text.replace(old, new, 1))


config = ROOT / "src" / "config.js"
replace_once(config, 'import { readFileSync } from "node:fs";\n', 'import { readFileSync } from "node:fs";\nimport path from "node:path";\n', "config path import")
replace_once(
    config,
    'const NOEMA_TIMEZONE = stringValue("NOEMA_TIMEZONE", "UTC");\n',
    'const NOEMA_TIMEZONE = stringValue("NOEMA_TIMEZONE", "UTC");\nconst DATA_DIR = path.resolve(stringValue("NOEMA_DATA_DIR", path.join(process.cwd(), "data")));\n',
    "data directory config",
)
replace_once(config, '  NOEMA_TIMEZONE,\n', '  NOEMA_TIMEZONE,\n  DATA_DIR,\n', "data directory export")

stores = [
    "todos.js",
    "notes.js",
    "documents.js",
    "links.js",
    "inspirations.js",
    "buildingsites.js",
    "crypto.js",
]
for name in stores:
    path = ROOT / "src" / "store" / name
    text = path.read_text()
    text = text.replace('import { fileURLToPath } from "node:url";\n', '')
    if 'import { config } from "../config.js";' not in text:
        anchor = 'import path from "node:path";\n'
        if anchor not in text:
            raise RuntimeError(f"Missing path import in {name}")
        text = text.replace(anchor, anchor + 'import { config } from "../config.js";\n', 1)
    old = 'const __dirname = path.dirname(fileURLToPath(import.meta.url));\nconst DATA_DIR = path.resolve(__dirname, "../../data");'
    if old not in text:
        raise RuntimeError(f"Missing legacy DATA_DIR block in {name}")
    text = text.replace(old, 'const DATA_DIR = config.DATA_DIR;', 1)
    path.write_text(text)

calendar = ROOT / "src" / "store" / "calendar.js"
calendar_text = calendar.read_text().replace('import { fileURLToPath } from "node:url";\n', '')
old_calendar = 'const __dirname = path.dirname(fileURLToPath(import.meta.url));\nconst DATA_DIR = path.resolve(__dirname, "../../data");'
if old_calendar not in calendar_text:
    raise RuntimeError("Missing Calendar DATA_DIR block")
calendar.write_text(calendar_text.replace(old_calendar, 'const DATA_DIR = config.DATA_DIR;', 1))

server = ROOT / "src" / "server.js"
server_text = server.read_text()
server_text = server_text.replace('path.resolve(process.cwd(), "data", ', 'path.resolve(config.DATA_DIR, ')
server_text = server_text.replace('path.join(process.cwd(), "data", ', 'path.join(config.DATA_DIR, ')
server_text = server_text.replace('const dataDir = path.join(process.cwd(), "data");', 'const dataDir = config.DATA_DIR;')
if 'process.cwd(), "data"' in server_text:
    raise RuntimeError("A process.cwd data path remains in server.js")
server.write_text(server_text)

integration = ROOT / "test" / "server-audit-fixes.test.js"
integration_text = integration.read_text()
needle = '      NOEMA_TIMEZONE: "UTC",\n'
if integration_text.count(needle) != 1:
    raise RuntimeError("Could not find integration test timezone env")
integration.write_text(integration_text.replace(needle, needle + '      NOEMA_DATA_DIR: path.join(cwd, "data"),\n', 1))

ci = ROOT / ".github" / "workflows" / "ci.yml"
ci_text = ci.read_text()
needle = '          export ENCRYPTION_KEY=ci-only-encryption-key\n'
if ci_text.count(needle) != 1:
    raise RuntimeError("Could not find CI encryption environment")
ci.write_text(ci_text.replace(needle, needle + '          export NOEMA_DATA_DIR="$smoke_dir/data"\n', 1))

env_example = ROOT / ".env.example"
env_text = env_example.read_text()
needle = 'NOEMA_TIMEZONE=UTC\n'
if env_text.count(needle) != 1:
    raise RuntimeError("Could not find .env timezone setting")
env_example.write_text(env_text.replace(needle, needle + '\n# Optional absolute or working-directory-relative persistent data location.\n# Defaults to ./data from the process working directory.\nNOEMA_DATA_DIR=\n', 1))

readme = ROOT / "README.md"
readme_text = readme.read_text()
needle = '| `NOEMA_TIMEZONE` | `UTC` | IANA timezone used for date boundaries |\n'
if readme_text.count(needle) != 1:
    raise RuntimeError("Could not find README timezone row")
readme.write_text(readme_text.replace(needle, needle + '| `NOEMA_DATA_DIR` | `./data` | Persistent data, uploads, snapshots, tokens, and local encryption-key directory |\n', 1))

# Remove the one-use migration and workflow.
Path(__file__).unlink()
(ROOT / ".github" / "workflows" / "unify-data-dir.yml").unlink()
