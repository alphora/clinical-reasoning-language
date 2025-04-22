# 🛠️ CPGL Transformation Requirements from FSH Action Trees

## ✅ General Logic

When transforming a PlanDefinition's `action[]` tree into CPGL `when` and `use/do` statements, follow the rules below.

---

## 1. 🌟 When to Use an Empty Identifier

### Rule:
If an action **does not** have a `condition`, its `when` block must use an **empty string** (`""`) as the identifier, and **include the action's title as a comment**.

### Example:

FSH:
~~~fsh
* action[+]
  * title = "Measles Supplementary Dose"
  * definitionCanonical = Canonical(IMMZD2DTMeaslesSupplementary)
~~~

CPGL:
~~~cpgl
//"Measles Supplementary Dose"
when "" then use "IMMZD2DTMeaslesSupplementary".
~~~

## 2. 🔁 Rolling Up Siblings with the Same Condition

### Rule:
If multiple sibling actions share the same condition expression (including the empty string), roll them into a single `when` block. Inside that, emit one line per `use` or `do`.

### Example:

FSH:
~~~fsh
* action[+]
  * title = "A"
  * definitionCanonical = Canonical(A1)
* action[+]
  * title = "B"
  * definitionCanonical = Canonical(B1)
~~~

CPGL:
~~~cpgl
//"A"
//"B"
when "" then:
    use "A1".
    use "B1".
done
~~~

## 3. 🧱 use vs do

### Rule:
If a leaf action has a `definitionCanonical`:

- If it refers to a **PlanDefinition**, emit `use`.
- If it refers to an **ActivityDefinition**, emit `do`.
- If the action does **not** have a `definitionCanonical`, emit `do` and construct an activity block.

### Example:

FSH:
~~~fsh
* title = "Evaluate Contraindications"
* definitionCanonical = Canonical(IMMZD5DTMeaslesCI)
~~~

CPGL:
~~~cpgl
//"Evaluate Contraindications"
when "" then use "IMMZD5DTMeaslesCI".
~~~

## 4. 🧱 CPGL Structural Example

Given this FSH fragment:

~~~fsh
* action[+]
  * title = "Check Immunizations"
  * action[+]
    * title = "Measles Dose 0"
    * definitionCanonical = Canonical(IMMZD2DTMeaslesDose0)
  * action[+]
    * title = "Measles Supplementary Dose"
    * definitionCanonical = Canonical(IMMZD2DTMeaslesSupplementary)
~~~

Generate the following CPGL:

~~~cpgl
decision "IMMZ.DT.Immunization Strategy":
    when "Check Immunizations":
        //"Measles Dose 0"
        //"Measles Supplementary Dose"
        when "" then:
            use "IMMZD2DTMeaslesDose0".
            use "IMMZD2DTMeaslesSupplementary".
        done
    done
done
~~~

## 5. 🧰 Combined Example

~~~fsh
Instance: IMMZDTImmunizationStrategy
InstanceOf: http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition
Title: "IMMZ.DT.Immunization Strategy"
Description: "Provide vaccinations according to the recommended schedule"
* action[+]
  * title = "Check Immunizations"
  * action[+]
    * title = "Measles Dose 0"
    * definitionCanonical = Canonical(IMMZD2DTMeaslesDose0)
  * action[+]
    * title = "Measles Routine Immunization"
    * definitionCanonical = Canonical(IMMZD2DTMeaslesOT)
  * action[+]
    * title = "Measles Supplementary Dose"
    * definitionCanonical = Canonical(IMMZD2DTMeaslesSupplementary)
  * action[+]
    * title = "Measles Contraindications"
    * definitionCanonical = Canonical(IMMZD5DTMeaslesCI)
~~~

Should result in:

~~~cpgl
decision "IMMZ.DT.Immunization Strategy":
    when "Check Immunizations":
        //"Measles Dose 0"
        //"Measles Routine Immunization"
        //"Measles Supplementary Dose"
        //"Measles Contraindications"
        when "" then:
            use "IMMZ.DT.Immunization Strategy".
            use "IMMZ.D2.DT.Measles Ongoing Transmission".
            use "IMMZ.D2.DT.Measles MCV Dose 0".
            use "IIMMZ.D5.DT.Measles.Contraindication".
        done
    done
done
~~~

## 6. 🧪 Verification & Implementation Notes

- ✅ Confirm `definitionCanonical` is being handled for both **PlanDefinition** ( → `use` ) and **ActivityDefinition** ( → `do` )
- ✅ Ensure fallback to `do` with activity creation when `definitionCanonical` is absent
- ✅ Check for identical sibling conditions and consolidate under one `when`
- ✅ Use `""` when no condition is present and insert the title as a comment
- ❌ Do **not** generate duplicate `when "" then` blocks when a single one would suffice

---

## 📌 Final Notes

These rules ensure structural clarity and compactness in the generated CPGL.

They improve output quality by removing unnecessary repetition and increasing semantic clarity.

Behavior should be unit tested for various nesting depths, condition presence, and canonical types.

