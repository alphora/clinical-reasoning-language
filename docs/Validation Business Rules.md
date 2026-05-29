# Business Rules

## Top Level Keywords

- decision
- concept
- activity
- terminology

Rules that should be enforced by the validator

1. different top level keywords can have the same name, but duplicates of same top level should create an error.

for example:

```psuedo-code
decision "blah":
<decision body>

decision "blah":
<decision body> 
```

```psuedo-code
activity "blah":
<activity body>

activity "blah":
<activity body> 
```

```psuedo-code
terminology "blah":
<terminology body>

terminology "blah":
<terminology body> 
```

```psuedo-code
concept "blah":
<concept body>

concept "blah":
<concept body> 
```

should all be errors.

But

```psuedo-code
decision "blah":
<decision body>

concept "blah":
<concept body>

activity "blah":
<activity body>

terminology "blah":
<terminology "blah":
 body>
```

should not be an error.

1. repeating use/dos within the same level should be an error.

for example:

```crl
decision "Elderly Based":
  when"Client Age Less Than 60"then:
    do"Vaccinate".
    do"another thing".
    do"Vaccinate".
  done
  when"Client Age Greater Than 60"then:
    when"Most Recent BMI"then:
      use"Some Other Decision".
      use"Some Other Other Decision".
      use"Some Other Decision".
  done
done
```

should be errors.

But

```crl
decision "Elderly Based":
  when"Client Age Less Than 60"then:
    do"Vaccinate".
    do"another thing".
    do"something else".
  done
  when"Client Age Greater Than 60"then:
    when"Most Recent BMI"then:
        do"Vaccinate".
        do"another thing".
        do"something else".
    done
  done
done
```

Should not be an error.


1. all other duplicate names should be a warning but not an error.



1. use clauses cannot create a cycle.

for example:

```psuedo-code
decision "blah":
when "whenblah" then use "blah".
done
```

and

```psuedo-code
decision "blah":
when "whenblah" then use "bling".
done

decision "bling":
when "whenbling" then use "blah".
done
```

should be errors.

But

```psuedo-code
decision "blah":
when "whenblah" then use "bling".
done

decision "bling":
when "whenbling" then use "blurp".
done

decision "blurp":
when "whenblurp" then do "thing".
done
```

should not be an error.

## Rules already enforced by the grammar (and should not be enforced in the validator)

1. a decision must have at least one when clause.

for example:

```psuedo-code
decision "blah":
```

should be an error.

But

```psuedo-code
decision "blah":
<decision body>
```

should not be an error.

1. when clauses must have at least one when or use or do clause.

1. when clauses can have multiple sub when clauses and they can be duplicates.

1. when clauses can have multiple use/do clauses and they can be duplicates.

1. termiology clauses must have either a valueset or a unknow or a system/code.

1. activity must have one and only one perform.

1. concept must have one and only one has type.

1. concept must have one and only one valuetype.

1. concept may have one and only one provenance.

1. concept must have either a coded by or a inferred by

## Metadata annotation rules (proposed — validator-enforced)

These apply to `@tag` annotations on ``- meta is `@tag: <body>`.`` lines (concept-only). No grammar change; the validator enforces them. Full spec: `docs/Validator Requirements.md` and `issues/crl/pending/crl-metadata-model/`.

1. a `meta` body starting with `@` but not matching `^@[a-z][a-z0-9-]*:` should be a **warning** (probable malformed tag).
2. a recognized-shape tag whose id is not in the registry should be a **warning** (unknown tag).
3. an external-ref tag (`@kg-concept`, `@reef-reference`) missing `ref`, or with `confidence` outside `[0,1]`, should be an **error** (value-shape).
4. exceeding a tag's cardinality (e.g. two `@description` on one concept) should be an **error**.
5. two distinct extraction `run` ids' family-C / candidate-ref exhaust coexisting on one concept should be a **warning** (stale pileup).
6. a `meta` body **not** starting with `@` is a valid untyped note — no diagnostic.
