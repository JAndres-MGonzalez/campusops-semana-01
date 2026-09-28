"""Comprueba una falla de sanitización y restaura exactamente el código original."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
LOGS = ROOT / 'evidence/week-04/logs'
NPM = 'npm.cmd' if os.name == 'nt' else 'npm'
COMMAND = [NPM, 'test', '--', '--ci', '--runInBand', 'course-tests/public/week-04.test.ts']


def run(name, expected, command=COMMAND):
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True,
                            encoding='utf-8', errors='replace', timeout=180,
                            env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
    output = result.stdout + result.stderr
    (LOGS / name).write_text(
        f'command: {" ".join(command)}\nstartedAt: {started}\nexitCode: {result.returncode}\n\n{output}',
        encoding='utf-8')
    if result.returncode != expected:
        raise RuntimeError(f'{name}: expected {expected}, received {result.returncode}')
    print(f'{name}: exit {result.returncode}', flush=True)
    return output


def main():
    LOGS.mkdir(parents=True, exist_ok=True)
    source = ROOT / 'src/infrastructure/telemetry/safe-telemetry.ts'
    original = source.read_bytes()
    needle = b"  'authorization',"
    if original.count(needle) != 1:
        raise RuntimeError('Expected exactly one authorization entry; no file was changed')
    protected = subprocess.check_output(
        ['git', 'ls-files', 'src', 'App.tsx', 'course-tests', 'tools', 'docs', '.github', 'Makefile',
         'package.json', 'package-lock.json', 'reports/week-01', 'reports/week-02',
         'reports/week-03', 'evidence/week-01', 'evidence/week-02', 'evidence/week-03'],
        cwd=ROOT, text=True, encoding='utf-8').splitlines()
    before = {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in protected}
    run('sanitization-initial.log', 0)
    try:
        source.write_bytes(original.replace(needle, b'', 1))
        failed = run('sanitization-failure.log', 1)
        if 'authorization' not in failed or 'FAIL' not in failed:
            raise RuntimeError('The failure does not identify the sanitization case')
    finally:
        source.write_bytes(original)
    run('sanitization-corrected.log', 0)
    scan_command = [sys.executable, '-c',
        "import sys; sys.path.insert(0, 'tools'); from pathlib import Path; "
        "import course_public_evaluator as e; hits=e.scan_secrets(Path('.')); "
        "print('hits='+str(hits)); sys.exit(1 if hits else 0)"]
    probe = ROOT / 'week04-synthetic-probe.tmp'
    if probe.exists():
        raise RuntimeError('Synthetic probe path already exists; it was not overwritten')
    try:
        probe.write_text('EXPO_PUBLIC_' + 'AUDIT_SECRET' + '=ficticio\n', encoding='utf-8')
        failed = run('secret-scan-failure.log', 1, scan_command)
        if 'week04-synthetic-probe.tmp:public_secret_name' not in failed:
            raise RuntimeError('The scanner did not identify the synthetic marker')
    finally:
        probe.unlink()
    run('secret-scan-corrected.log', 0, scan_command)
    after = {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in protected}
    if before != after:
        raise RuntimeError('A protected file was not restored')
    result = {
        'schemaVersion': 1, 'week': 4,
        'commitSha': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'command': ' '.join(COMMAND),
        'prediction': 'Sin authorization en la lista sensible, la prueba debe detectar el valor sin ocultar; al restaurar el archivo debe pasar.',
        'beforeExitCode': 1, 'afterExitCode': 0,
        'secretScanBeforeExitCode': 1, 'secretScanAfterExitCode': 0,
        'restored': True, 'beforeSha256': before, 'afterSha256': after,
    }
    (LOGS / 'restoration.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Falla detectada, corrección comprobada y archivos protegidos restaurados.', flush=True)


if __name__ == '__main__':
    main()
