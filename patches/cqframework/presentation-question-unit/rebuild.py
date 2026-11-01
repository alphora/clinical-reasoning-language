"""Rebuild only three protocol-1 native classes against the exact released engine.

Usage: python rebuild.py <baseline-engine.jar> <patched-engine-source> <new-output-dir>
All existing dependencies and unrelated entries are retained byte-for-byte.
"""
import hashlib
import copy
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile

BASE = '99079b9cd0951e7a4001bbd8b17d84e91a1b108ef648a9461c160ef9aba101d2'
NAMES = ['PresentationQuestionUnitProcessor', 'ProcessAction', 'ApplyProcessor']
PACKAGE = 'org/opencds/cqf/fhir/cr/plandefinition/apply/'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def main():
    baseline, source, output = map(Path, sys.argv[1:])
    assert digest(baseline.read_bytes()) == BASE, 'Unexpected baseline engine bytes'
    output.mkdir(parents=True, exist_ok=False)
    libs, classes = output / 'libs', output / 'classes'
    libs.mkdir(); classes.mkdir()
    with zipfile.ZipFile(baseline) as boot:
        jars = [i for i in boot.infolist() if i.filename.startswith('BOOT-INF/lib/') and i.filename.endswith('.jar')]
        assert len(jars) == 132
        for entry in jars:
            (libs / Path(entry.filename).name).write_bytes(boot.read(entry))
        module = [i for i in jars if Path(i.filename).name.startswith('cqf-fhir-cr-') and not Path(i.filename).name.startswith('cqf-fhir-cr-cli-')]
        assert len(module) == 1
        sources = [source / 'cqf-fhir-cr/src/main/java' / PACKAGE / (name + '.java') for name in NAMES]
        javac = str(Path(os.environ['JAVA_HOME']) / 'bin/javac.exe') if os.name == 'nt' else 'javac'
        subprocess.run([javac, '--release', '17', '-cp', str(libs / '*'), '-d', str(classes), *map(str, sources)], check=True)
        replacements = {p.relative_to(classes).as_posix(): p.read_bytes() for p in classes.rglob('*.class')}
        assert set(replacements) == {PACKAGE + name + '.class' for name in [*NAMES, 'ApplyProcessor$1']}
        assert all(int.from_bytes(b[6:8], 'big') == 61 for b in replacements.values())
        nested = io.BytesIO()
        changed_classes = []
        with zipfile.ZipFile(io.BytesIO(boot.read(module[0]))) as original, zipfile.ZipFile(nested, 'w') as patched:
            for entry in original.infolist():
                data = original.read(entry)
                if entry.filename in replacements:
                    changed_classes.append({'entry': entry.filename, 'before': digest(data), 'after': digest(replacements[entry.filename])})
                    data = replacements.pop(entry.filename)
                patched.writestr(copy.copy(entry), data)
            for name, data in replacements.items():
                changed_classes.append({'entry': name, 'before': None, 'after': digest(data)})
                info = zipfile.ZipInfo(name, (2026, 11, 1, 0, 0, 0)); info.compress_type = zipfile.ZIP_DEFLATED
                patched.writestr(info, data)
        target = output / 'engine.jar'
        with zipfile.ZipFile(target, 'w') as result:
            for entry in boot.infolist():
                result.writestr(copy.copy(entry), nested.getvalue() if entry.filename == module[0].filename else boot.read(entry))
        with zipfile.ZipFile(target) as result:
            changed_entries = [i.filename for i in boot.infolist() if boot.read(i) != result.read(i.filename)]
            assert changed_entries == [module[0].filename]
            assert result.getinfo(module[0].filename).compress_type == zipfile.ZIP_STORED
            # The entire unchanged module inventory, not just the direct Maven dependencies.
            dependencies = [{'entry': i.filename, 'sha256': digest(result.read(i.filename))} for i in jars]
        receipt = {'baselineSha256': BASE, 'engineSha256': digest(target.read_bytes()), 'changedEntries': changed_entries,
                   'changedClasses': changed_classes, 'sources': [{'name': p.name, 'sha256': digest(p.read_bytes())} for p in sources],
                   'dependencies': dependencies, 'javaRelease': 17}
        (output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf8')
        print(json.dumps({'engine': str(target), 'sha256': receipt['engineSha256'], 'classes': len(changed_classes), 'unchangedLibraries': 131}))

if __name__ == '__main__':
    main()
