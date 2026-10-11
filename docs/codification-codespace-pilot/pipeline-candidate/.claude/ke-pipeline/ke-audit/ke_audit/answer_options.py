"""Exact coded-answer contracts shared by expectation validation and native association checks."""


def validate_option_codings(value):
    errors = []
    if not isinstance(value, dict):
        return ['questions.optionCodings must be an object']
    for concept, choices in value.items():
        if not isinstance(concept, str) or not concept.strip():
            errors.append('optionCodings needs a non-empty concept name')
        if not isinstance(choices, list) or not choices:
            errors.append(f'optionCodings[{concept}] needs a non-empty coding list')
            continue
        seen = set()
        for choice in choices:
            if (not isinstance(choice, dict) or set(choice) != {'system', 'code', 'display'}
                    or any(not isinstance(choice[k], str) or not choice[k].strip()
                           for k in ('system', 'code', 'display'))):
                errors.append(f'optionCodings[{concept}] needs exact non-empty system/code/display strings')
                continue
            identity = (choice['system'], choice['code'])
            if identity in seen:
                errors.append(f'optionCodings[{concept}] duplicates coding identity {identity}')
            seen.add(identity)
    return errors


def compare_option_codings(item, expected):
    """Return an error string or None; no terminology resolution or clinical inference."""
    if item.get('answerValueSet'):
        return 'unresolved answerValueSet: exact displayed alternatives were not observed'
    options = item.get('answerOption')
    if not isinstance(options, list) or not options:
        return 'answerOption missing or empty'
    actual = []
    for option in options:
        if not isinstance(option, dict) or not isinstance(option.get('valueCoding'), dict):
            return 'answerOption is not a Coding'
        coding = option['valueCoding']
        if 'version' in coding:
            return 'versioned coding outside the unversioned exact-triple contract'
        if any(not isinstance(coding.get(k), str) or not coding[k] for k in ('system', 'code', 'display')):
            return 'answerOption lacks system, code or display'
        actual.append(tuple(coding[k] for k in ('system', 'code', 'display')))
    if len({row[:2] for row in actual}) != len(actual):
        return 'duplicate answer coding identity'
    wanted = [tuple(c[k] for k in ('system', 'code', 'display')) for c in expected]
    if sorted(actual) != sorted(wanted):
        return 'answer coding system/code/display differs'
    return None
