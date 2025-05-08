# Immunization for Measles

decision "IMMZ.D2.D5.Measles":

- when "Measles Routine Immunization Schedule Incomplete" then:
  - when "No Primary Series Doses Administered" then:
    - when "Client Age Less Than 12 Months" then recommend activity "Indicate".
    - when "Last Live Vaccine Administered has had in 4 Weeks" then use decision "Elderly Based".
  - end when
- end when
- when "Client Is Due For MCV12" then recommend activity "Vaccinate".
- when "One Primary Series Dose Administered" then:
  - when "Client Age Less Than 15 Months" then recommend activity "Indicate".
  - when "Last Live Vaccine Administered has had in 4 Weeks" then use decision "Elderly Based".
  - when "Client Is Due For MCV12" then recommend activity "Vaccinate".
- end when
- when "Two Primary Series Doses Administered" then recommend activity "Indicate".

decision "Elderly Based":

- when "Client Age Greater Than 60" then recommend activity "Indicate".
- when "Client Age Less Than 60" then:
  - recommend activity "Vaccinate".
  - recommend activity "another thing".
  - recommend activity "something else".
- end when
- when "Client Age Greater Than 60" then:
  - when "Most Recent BMI" then:
    - use decision "Some Other Decision".
    - use decision "Some Other Other Decision".
  - end when
- end when

activity "Vaccinate" request CPGImmunization.

activity "Indicate" request CPGProposeDiagnosis with "Colonoscopy".

activity "another thing" request CPGCommunication with `Do the thing` because `it's the right thing to do`.

terminology "BMI Range as a Condition" ``.

terminology "BMI as an Observation" valueset `BMI as an Observation`.

terminology "Height Valueset" valueset `height valueset`.

terminology "Weight Valueset" valueset `weight valueset`.

terminology "some terminology" ``.

terminology "Colonoscopy" system `http://snomed.info/sct` code `73761001`.

// comments go into the auto generated README and, CQL when applicable

concept "Most Recent BMI":

- type is Observation.
- valuetype is boolean.
- evidence is `It's some evidence`.
- inferred from "BMI" apply pattern `Most Recent(this, lookbackMonths)`.

concept "BMI":

- type is Observation.
- valuetype is Quantity.
- inferred from ("BMI Range as a Condition" or "BMI as an Observation" or "Calculated BMI").

concept "BMI Range as a Condition":

- type is Condition.
- valuetype is CodeableConcept.
- coded from "BMI Range as a Condition".

concept "BMI as an Observation":

- type is Observation.
- valuetype is Quantity.
- coded from "BMI as an Observation".

concept "Calculated BMI":

- type is Observation.
- valuetype is Quantity.

  //calculate using (weight/height^2)
- inferred from ("Patient Height" and "Patient Weight").

concept "Patient Height":

- type is Observation.
- valuetype is integer.
- coded from "Height Valueset".

concept "Patient Weight":

- type is Observation.
- valuetype is integer.
- coded from "Weight Valueset".

concept "Client Age Greater Than 60":

- type is Observation.
- valuetype is boolean.
- inferred from
    (
        (
            ("a" and "b")
            or (
                ("c" and "d")
                and not ("e" or "f")
            )
        )
        or (
            ("x" or "y")
            and "z"
        )
        or "k"
        or "l"
    ).
