"""Reproduce las fallas con datos ficticios y restaura exactamente la pantalla."""
import datetime
import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
REPORT = ROOT / 'reports/week-03'
LOGS = REPORT / 'logs'


def now():
    return datetime.datetime.now().astimezone().isoformat()


def run(command, log, expected):
    started = now()
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True,
                            encoding='utf-8', errors='replace', timeout=600)
    output = result.stdout + result.stderr
    (LOGS / log).write_text(
        f'command: {" ".join(command)}\nstartedAt: {started}\nfinishedAt: {now()}\n'
        f'exitCode: {result.returncode}\n\n{output}', encoding='utf-8')
    print(f'{log}: exit {result.returncode}', flush=True)
    if result.returncode != expected:
        raise RuntimeError(f'{log}: expected {expected}, received {result.returncode}; inspect the log')
    return output


def main():
    LOGS.mkdir(parents=True, exist_ok=True)
    screen = ROOT / 'src/ui/screens/IncidentListScreen.tsx'
    original = screen.read_bytes()
    paths = subprocess.check_output(['git', 'ls-files', 'src', 'App.tsx', 'course-tests',
        'tools', '.github', 'Makefile', 'package.json', 'package-lock.json', 'docs'],
        cwd=ROOT, text=True).splitlines()
    before = {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in paths}
    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    observations = {'schemaVersion': 1, 'week': 3, 'commitSha': sha,
        'generatedAt': now(), 'execution': 'Comprobaciones asistidas con Codex',
        'prediction': 'El import UI a infraestructura debe fallar. Una credencial ficticia debe hacer fallar secret_scan y Make. Al restaurar el archivo, ambos controles deben pasar.',
        'checks': []}
    report = REPORT / 'failure-observations.json'
    report.write_text(json.dumps(observations, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    run(['node', 'tools/check-boundaries.mjs'], 'boundaries-initial.log', 0)
    try:
        addon = "import type { InMemoryIncidentRepository } from '../../infrastructure/incidents/in-memory-incident-repository';\nconst _forbidden: typeof InMemoryIncidentRepository | null = null;\n"
        screen.write_bytes(addon.encode('utf-8') + original)
        diff = subprocess.check_output(['git', 'diff', '--', 'src/ui/screens/IncidentListScreen.tsx'], cwd=ROOT, text=True, encoding='utf-8')
        (LOGS / 'controlled-import.patch').write_text(diff, encoding='utf-8')
        output = run(['node', 'tools/check-boundaries.mjs'], 'boundaries-failure.log', 1)
        assert '(ui -> infrastructure)' in output
    finally:
        screen.write_bytes(original)
    run(['node', 'tools/check-boundaries.mjs'], 'boundaries-corrected.log', 0)
    try:
        # Marcador sin cuenta ni permisos; se construye para no publicar un literal detectable.
        marker = 'gh' + 'p_' + 'A' * 36
        screen.write_bytes(original + ('\n// CI synthetic probe: ' + marker + '\n').encode('utf-8'))
        run(['make', 'verify-week-03'], 'secret-failure.log', 2)
        data = json.loads((REPORT / 'verify.json').read_text(encoding='utf-8'))
        checks = {item['id']: item for item in data['checks']}
        assert checks['secret_scan']['status'] == 'fail'
        assert 'github_token' in checks['secret_scan']['detail']
        assert all(item['status'] == 'pass' for key, item in checks.items() if key != 'secret_scan')
        (LOGS / 'secret-failure.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    finally:
        screen.write_bytes(original)
        cache = ROOT / '.jest-cache'
        assert cache.resolve().is_relative_to(ROOT.resolve()), 'Cache outside repository'
        removed = []
        for path in cache.rglob('*'):
            if path.is_file() and marker.encode('ascii') in path.read_bytes():
                assert path.resolve().is_relative_to(cache.resolve()), 'Cache file outside cache'
                path.unlink()
                removed.append(path.relative_to(ROOT).as_posix())
    run(['make', 'verify-week-03'], 'secret-corrected.log', 0)
    after = {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in paths}
    assert before == after, 'A protected file changed during the experiment'
    for identifier, status, scenario, command, detail in [
        ('boundary-ui-infra-fail', 'fail', 'failure', 'node tools/check-boundaries.mjs', 'Código 1: dependencia ui -> infrastructure. logs/boundaries-failure.log y logs/controlled-import.patch.'),
        ('boundary-ui-infra-fixed', 'pass', 'nominal', 'node tools/check-boundaries.mjs', 'Código 0: 13 dependencias permitidas. logs/boundaries-corrected.log.'),
        ('synthetic-secret-detected', 'fail', 'failure', 'make verify-week-03', 'Make devolvió 2; el evaluador detectó github_token en la pantalla. Las otras comprobaciones pasaron. logs/secret-failure.log y logs/secret-failure.json.'),
        ('synthetic-secret-removed', 'pass', 'nominal', 'make verify-week-03', 'Código 0 al retirar el marcador ficticio de la pantalla y de la caché de Jest. logs/secret-corrected.log y verify.json; ningún secreto real utilizado.')]:
        observations['checks'].append({'id': identifier, 'status': status, 'scenarioType': scenario,
            'command': command, 'evidence': 'reports/week-03/: ' + detail})
    observations.update({'generatedAt': now(), 'restored': before == after, 'removedCacheArtifacts': removed,
                         'beforeSha256': before, 'afterSha256': after})
    report.write_text(json.dumps(observations, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Fallos detectados; controles corregidos; archivos restaurados.', flush=True)


if __name__ == '__main__':
    main()
